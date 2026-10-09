# ADR 0007 · OpenSEO multiempresa: conexión por proyecto

**Estado actualizado (09/10/2026):** fases 1, 3, 4 y 5, más reconciliación, integradas en `main`; migraciones de conexión/jobs aplicadas en alojado. El guardado real de Sarah se verificó en modo `legacy` para el auditId registrado en [HANDOFF](../HANDOFF.md). No hay conexión por proyecto activa y producción sigue en `legacy`. La fase 2 (credencial propia) y la activación/prueba alojada de `project` siguen pendientes.
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
| **3 — Conectar, probar, revocar y rotar** (implementada en rama) | Panel solo para el owner en Auditoría técnica (`OpenSeoConnectionPanel`):

- conectar con consentimiento obligatorio;
- hosts limitados a los dos posibles del dominio, sin texto libre;
- revocar con confirmación;
- rotar = revocar + conectar.

La prueba (`whoami` + salud) usa la acción existente, que en modo `project` exige la conexión. Indica si el servidor está en `legacy` o `project`. Del identificador de OpenSEO solo se muestran los 4 últimos caracteres. Errores con texto en español y código solo como diagnóstico | e2e en CI: flujo conectar → activa → revocar; el identificador completo no aparece en el HTML; un analista no ve el panel; axe y sin scroll horizontal. Capturas 20/21 en el artefacto de CI | Fase 1. `whoami` no prueba acceso al proyecto: comprobar el proyecto sin gastar créditos solo si OpenSEO ofrece una herramienta de lectura gratuita (por validar) |
| **4 — Run/follow por conexión** (implementada en rama) | `src/lib/openseo/target.ts`. Con `OPENSEO_PROJECT_CONNECTIONS_MODE=project`, probar, lanzar y consultar leen la conexión ACTIVE del proyecto antes de MCP. El entorno del puente se construye **sobrescribiendo** `OPENSEO_PROJECT_ID` y `OPENSEO_AUDIT_ALLOWED_HOSTS`, así que los valores globales nunca se usan. Sin conexión → `PROJECT_NOT_CONNECTED`, sin red. Requiere el ledger de jobs activo (`CONNECTIONS_REQUIRE_JOBS`). Migración `20261009150000`: el job guarda `connection_id` y `acquire` solo acepta la conexión ACTIVE del proyecto. Lanzar y consultar exigen que la conexión del job sea la conexión activa actual. Como cambiar de conexión obliga a revocar y crear una nueva (otro id), un job nunca se consulta con otro proyecto OpenSEO | pgTAP 14/14 (conexión ajena, malformada, desconocida o revocada; job con conexión; legacy con null). Unit: el MCP recibe solo el `projectId` de la conexión aunque exista uno global; hosts de la conexión; legacy/project; fallos cerrados; jobs de otra conexión o legacy rechazados en ambos sentidos. Integración Data API en CI | Fase 1 |
| **5 — Pruebas negativas** (implementada en rama) | `supabase/tests/openseo_isolation.test.sql` + integración Data API. Matriz: mismo owner con dos proyectos, otra organización, viewer y account-manager de la misma organización, y anon | pgTAP 25/25. Ninguna conexión, `auditId`, job ni fila firmada pasa de un proyecto a otro, ni con el mismo owner. Los rechazos de filas se comprueban por su mensaje exacto (`OpenSEO result identity mismatch`) y hay un control positivo que guarda las filas correctas. Las lecturas cruzadas de `provider_results` ya estaban cubiertas en `audit_provenance` y en provenance.integration | Fases 1 y 4 |
| 6 — Migración de proyectos existentes | Script/instrucción del propietario: crear la conexión de Sarah con los valores actuales; activar `project` solo tras comprobarlo | Dry-run local; rollback = volver a `legacy` (flag) sin borrar filas | Fase 4. Lo aplica el propietario |
| 7 — Prueba alojada | Dos cuentas y dos proyectos autorizados; prueba de conexión y negativas | Solo IDs/estados en la evidencia | Aprobación expresa; sin auditorías de pago salvo autorización concreta |

## Orden de ejecución (decisión del 09/10/2026)

Las fases se ejecutan en este orden: **1 → 4 → 5 → 3**. La 2 queda bloqueada por decisión y la 6 y la 7 son acciones del propietario.

- La fase 2 está bloqueada: falta decidir el almacén de secretos.
- La fase 3 se retrasa por una dependencia técnica comprobada en Vercel (solo nombres de variables). El entorno Preview comparte el Supabase de producción y no tiene variables de OpenSEO. Una interfaz que llama a `openseo_connection` fallaría en preview hasta que el propietario aplique la migración de la fase 1 en alojado. Además, cualquier conexión creada en preview quedaría en la base de datos de producción.
- La fase 4 no tiene interfaz ni depende del alojado. Por defecto mantiene el comportamiento actual (`legacy`) y se valida entera en CI. La fase 5 se apoya en ella.

## Límites de secretos y RLS

- La tabla vive en `private` (no expuesta), con RLS activado, sin políticas y sin privilegios para `anon`/`authenticated`. Mismo patrón y mismo INFO esperado del Security Advisor que el ledger de jobs: no abrir políticas para silenciarlo.
- La RPC es `SECURITY DEFINER`, `search_path` vacío, comprueba owner antes de leer y comparte el lock por proyecto con `openseo_job`.
- No hay columna de clave, token ni secreto (lo comprueba pgTAP). El `openseoProjectId` solo se devuelve al owner y el módulo lo marca como dato de servidor.
- Los hosts se validan dos veces: en TypeScript (`isAuditableHostname`, rechaza IP, localhost y previews) y en la base de datos (solo el dominio del proyecto y su compañero www/apex, máximo dos).

## Migración y rollback

- **Cambio de modo:** solo sin jobs STARTING/SYNCING. Un job legacy (`connection_id` nulo) no se consulta en modo `project`, y un job con conexión no se consulta en modo `legacy`: en ambos casos se rechaza antes de llamar a OpenSEO, para no consultarlo con otro proyecto. Rollback de la fase 4: `OPENSEO_PROJECT_CONNECTIONS_MODE` ausente o `legacy`, y redeploy. La columna `connection_id` es aditiva y anulable.

- Fase 1 es aditiva: nadie lee la tabla y el puente sigue usando la configuración global. Rollback: no aplicarla, o eliminar tabla y funciones con una migración nueva.
- La conexión global de Sarah **no cambia** hasta que la fase 4 esté probada y el propietario cree su conexión (fase 6). El paso a `project` es un flag reversible.
- Las migraciones alojadas las aplica el propietario ([SETUP-SUPABASE](../SETUP-SUPABASE.md), [OPENSEO-ACTIVATION](../OPENSEO-ACTIVATION.md)). Esta rama no aplica nada en el proyecto alojado.

## Consecuencias

- Revocar con un job STARTING/SYNCING se rechaza: antes hay que reconciliar el trabajo. Así un rastreo en curso no queda sin forma de recuperar sus resultados.
- Hasta la fase 2, todos los clientes consumen el saldo de la cuenta OpenSEO de Rubik. El presupuesto y el registro de gasto por cliente (spend ledger del Core) siguen siendo necesarios antes de abrir herramientas de pago.
- El consentimiento queda registrado como `granted_by/granted_at` y `revoked_by/revoked_at` en la propia conexión. Si después se crea una tabla general `consents` (Core §7), se migra a ella.
