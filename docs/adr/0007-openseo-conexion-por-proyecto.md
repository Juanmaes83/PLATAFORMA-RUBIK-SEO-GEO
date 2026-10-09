# ADR 0007 · OpenSEO multiempresa: conexión por proyecto

**Estado:** fase 1 implementada en rama (sin cablear ni aplicar en alojado). Fases 2–7 propuestas.
**Fecha:** 09/10/2026.
**Depende de:** ADR 0003 (tenancy), ADR 0004 (provenance), ADR 0006 (puente OpenSEO), migración de jobs `20261009071705`. Core: `PLATFORM-SPEC` §2.2 y §7 (`connectors`, `secret_refs`, `consents`), `platform-contracts` (`CONNECTORS`, `secretRef`, `consentRecord`, `hasConsent`).

## Contexto

- `OPENSEO_PROJECT_ID` y `OPENSEO_AUDIT_ALLOWED_HOSTS` son globales del servidor. Cualquier proyecto Rubik autorizado lanza auditorías en el mismo proyecto OpenSEO. La plataforma **no es multicliente para OpenSEO**.
- Lo que sabemos del proveedor ([OPENSEO-API-CAPABILITIES](../OPENSEO-API-CAPABILITIES.md), fork en `0ffff93`): cada herramienta recibe `projectId` y comprueba que el usuario de la clave pertenece a ese proyecto. Por tanto, **una clave `oseo_` puede servir a varios proyectos OpenSEO de la misma cuenta**. Es contrato de código del fork, no del servicio alojado.
- **No verificado:** si la clave alojada puede limitarse a un proyecto, si existen scopes por clave, cuotas por proyecto o un saldo separado por proyecto. El saldo es de la cuenta OpenSEO. No se ha llamado a la API para averiguarlo.
- El Core define el modelo lógico (`connectors(project_id, connector, secret_ref, status, verified_at)`, `consents`) y exige que los secretos solo existan como `secretRef`, resueltos en servidor. El catálogo marca `openseo-mcp` con consentimiento `provider-connection`. El contrato basta para la fase 1; no hace falta cambiar el Core.

## Decisión

Separar dos cosas que hoy van juntas:

1. **Mapeo** (fase 1): qué proyecto OpenSEO y qué hosts pertenecen a cada proyecto Rubik. No es secreto, pero tampoco sale al navegador.
2. **Credencial** (fase 2): con qué clave se llama. Mientras no haya almacén de secretos decidido, solo existe `credential_mode = 'platform'`: la clave `OPENSEO_API_KEY` de la cuenta Rubik, en servidor.

Con una clave compartida, el aislamiento depende del mapeo. Por eso la fase 1 impone que **un proyecto OpenSEO solo puede tener un proyecto Rubik activo**. Si no, dos clientes verían las auditorías del otro.

## Fases

| Fase | Entrega | Pruebas de aceptación | Bloqueo / dependencia |
|---|---|---|---|
| **1 — Modelo de conexión** (esta rama) | `private.openseo_project_connections` + RPC `openseo_connection(get/connect/revoke)`; módulo `src/lib/openseo/connections.ts`. Sin cablear | pgTAP: RLS, sin privilegios directos, consentimiento obligatorio, hosts limitados al dominio del proyecto y su compañero www/apex, unicidad del proyecto OpenSEO, revocación con historial, revocación bloqueada si hay job activo, otro cliente y un analista reciben `42501`. Unit tests del módulo. Integración con la Data API en CI | Ninguno. No requiere llamadas de pago ni datos live |
| 2 — Credencial por cliente | `credential_mode = 'project-secret'` con `secret_ref` (formato Core `tenant/provider/name`), valor en un almacén de secretos que solo resuelve el servidor | Ningún valor en tablas, logs, estado de proyecto ni respuestas; rotación sin perder la verificación del historial | **Decisión del propietario:** almacén de secretos (Supabase Vault, KMS u otro). La app solo usa la clave publicable: Vault exige diseñar una RPC de servidor sin exponer el secreto a `authenticated`. Además, confirmar con OpenSEO si existen claves limitadas por proyecto |
| 3 — Conectar, probar, revocar y rotar | Pantalla de owner: conectar con consentimiento explícito, prueba (`whoami` + salud, sin auditoría), revocar, rotar = revocar + conectar. Errores visibles y honestos | e2e a 360 px; estados vacíos; ningún identificador del proveedor en el HTML | Fase 1. `whoami` no prueba acceso al proyecto: comprobar el proyecto sin gastar créditos solo si OpenSEO ofrece una herramienta de lectura gratuita (por validar) |
| 4 — Run/follow por conexión | Resolver de servidor: con `OPENSEO_PROJECT_CONNECTIONS_MODE=project`, run/follow leen la conexión ACTIVE del proyecto autenticado antes de MCP; sin conexión → `NOT_CONNECTED`. Modo `legacy` por defecto mantiene el comportamiento actual. El job guarda `connection_id` (migración nueva) | Unit: nunca se usa `OPENSEO_PROJECT_ID` en modo project; follow usa el `openseoProjectId` del job, no el actual | Fase 1 |
| 5 — Pruebas negativas | Usuario/proyecto A no puede leer, lanzar, guardar ni consultar jobs/resultados de B, ni con el `auditId` de B | Integración Data API + pgTAP con dos organizaciones | Fases 1 y 4 |
| 6 — Migración de proyectos existentes | Script/instrucción del propietario: crear la conexión de Sarah con los valores actuales; activar `project` solo tras comprobarlo | Dry-run local; rollback = volver a `legacy` (flag) sin borrar filas | Fase 4. Lo aplica el propietario |
| 7 — Prueba alojada | Dos cuentas y dos proyectos autorizados; prueba de conexión y negativas | Solo IDs/estados en la evidencia | Aprobación expresa; sin auditorías de pago salvo autorización concreta |

## Límites de secretos y RLS

- La tabla vive en `private` (no expuesta), con RLS activado, sin políticas y sin privilegios para `anon`/`authenticated`. Mismo patrón y mismo INFO esperado del Security Advisor que el ledger de jobs: no abrir políticas para silenciarlo.
- La RPC es `SECURITY DEFINER`, `search_path` vacío, comprueba owner antes de leer y comparte el lock por proyecto con `openseo_job`.
- No hay columna de clave, token ni secreto (lo comprueba pgTAP). El `openseoProjectId` solo se devuelve al owner y el módulo lo marca como dato de servidor.
- Los hosts se validan dos veces: en TypeScript (`isAuditableHostname`, rechaza IP, localhost y previews) y en la base de datos (solo el dominio del proyecto y su compañero www/apex, máximo dos).

## Migración y rollback

- Fase 1 es aditiva: nadie lee la tabla y el puente sigue usando la configuración global. Rollback: no aplicarla, o eliminar tabla y funciones con una migración nueva.
- La conexión global de Sarah **no cambia** hasta que la fase 4 esté probada y el propietario cree su conexión (fase 6). El paso a `project` es un flag reversible.
- Las migraciones alojadas las aplica el propietario ([SETUP-SUPABASE](../SETUP-SUPABASE.md), [OPENSEO-ACTIVATION](../OPENSEO-ACTIVATION.md)). Esta rama no aplica nada en el proyecto alojado.

## Consecuencias

- Revocar con un job STARTING/SYNCING se rechaza: antes hay que reconciliar el trabajo. Así un rastreo en curso no queda sin forma de recuperar sus resultados.
- Hasta la fase 2, todos los clientes consumen el saldo de la cuenta OpenSEO de Rubik. El presupuesto y el registro de gasto por cliente (spend ledger del Core) siguen siendo necesarios antes de abrir herramientas de pago.
- El consentimiento queda registrado como `granted_by/granted_at` y `revoked_by/revoked_at` en la propia conexión. Si después se crea una tabla general `consents` (Core §7), se migra a ella.
