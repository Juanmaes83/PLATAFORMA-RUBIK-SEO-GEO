# U01 aprobada · S1 escritor confiable de auditoría

**Fecha de aprobación:** 15/10/2026. **Aprobación explícita del propietario** en conversación de dirección técnica: «Sí» a la propuesta de arquitecturar un escritor SQL dedicado de permisos mínimos, firma exclusivamente en servidor y transacciones por proyecto, outbox de retirada y tratamiento independiente de `provider_results`. **Vigencia:** desarrollo, prototipos y pruebas LOCALES. Esta decisión no constituye autorización de migración alojada, uso de secretos reales, cambios de Vercel Production ni gasto.

**Documentos vinculantes:** [ROADMAP MAESTRO](ROADMAP-MAESTRO-2026.md), [CONTROL PROYECTO](CONTROL-PROYECTO.md), [ADR S1](ADR-S1-ESCRITOR-CONFIABLE-U01-20261015.md), [PLAN S1](S1-PLAN-ESCRITOR-CONFIABLE-20261015.md). Esta decisión sustituye únicamente la condición «U01 pendiente» del corte anterior; no implica que S1 esté implementado o probado.

## Decisiones aprobadas

1. **Identidad del escritor:** componente estrictamente de servidor, con rol **SQL dedicado** de privilegios mínimos; sin `BYPASSRLS`, sin administración de Auth, sin acceso público a firmas por RPC y **nunca** usar `service_role` global como identidad normal del escritor. Validar sesión y actor, y **revalidar** pertenencia, rol, proyecto y revocación bajo la transacción. El navegador nunca ve la identidad SQL ni el anillo HMAC.
2. **Transacciones e integridad:** operación tipada, alcance autorizado y serialización por proyecto; verificación del extremo anterior antes de firmar; usar canonicalización existente del Core y keyring solo servidor. Para operaciones SQL, efecto y evento deben ser atómicos cuando corresponda; errores de secuencia, HMAC, expiración o permisos deben fallar cerrados. Evitar locks globales, eventos duplicados y reintentos no idempotentes.
3. **Viabilidad técnica previa:** probar localmente PostgreSQL, transporte, pooling, timeouts, transacciones y comportamiento de fallos en el runtime relevante de Next.js/Vercel. Si el rol dedicado no puede sostener transacciones seguras, documentar y **solicitar nueva decisión** sobre escritor aislado; no degradar a múltiples llamadas Data API `read→sign→insert`.
4. **Revocaciones de acceso:** retirar el acceso de forma prioritaria. Registrar en la misma transacción un **recibo/outbox duradero**, idempotente y restringido; el writer emitirá el evento verificable sin restaurar acceso mientras la auditoría esté pendiente. Documentar reconciliación, reintentos y alerta operativa.
5. **Proveedores externos:** nunca repetir llamadas Google/OpenSEO con coste para «reparar» auditoría. Diseñar recibos y outbox transaccionales vinculados al resultado persistido. Conservar comportamiento de exportación, manifestos y restauración con firmas verificables.
6. **`provider_results`:** riesgo conexo de firmas falsas **incluido en el programa S1** como subbloque explícito de diseño/pruebas y remediación coordinada. Puede requerir una PR separada, secuencial y con gates propios: ninguna afirmación de «S1 completado» debe ocultar un camino de inyección equivalente.

## Lo que Codex puede ejecutar autónomamente

- Inspeccionar arquitectura y permisos; implementar prototipo de transporte/SQL y rol restringido **solo en Supabase local aislado**.
- Implementar y refactorizar writer, esquema/migraciones locales, firmas, outbox, llamadas existentes, negativas RLS/Data API, concurrencia, recuperación, rollback y documentación; usar bucles de autocorrección hasta completar criterios.
- Usar GitHub, Vercel y Supabase en **modo inspección** para identificar contratos y dependencias; publicar una PR Draft de producto desde main actualizado y checkpoints recuperables.
- Preparar pruebas de Vercel sobre runtime simulado/local sin conectar Preview a Production. Documentar costes y requisitos alojados, sin activar servicios.
- Tratar `provider_results` como siguiente subbloque revisable si la primera PR tiene tamaño o riesgo excesivo. No crear PRs de producto solapadas ni fusionarlas automáticamente.

## Decisiones reservadas y no autorizadas

- No crear ni rotar credenciales reales, modificar `PROVENANCE_SIGNING_KEYS`, descargar secretos, alterar variables Production, migrar Supabase alojado, escribir/limpiar datos de cliente, activar servicios de pago o desbloquear sesiones Preview.
- **Custodia real y entrega de credenciales:** el propietario conserva claves; Codex puede diseñar un procedimiento de secretos locales ficticios, transporte y rotación, pero la configuración alojada necesita aprobación específica.
- **Denegaciones sin membresía:** Codex preparará una propuesta de almacenamiento, retención y roles para el registro de seguridad separado; no activar almacenamiento alojado sin política del propietario.
- **Atomicidad entre operaciones externas y SQL:** definir límites concretos de consistencia, failure modes e idempotencia; si el diseño altera semántica comercial o pierde trazabilidad, requerir revisión.
- **Aplicación alojada de S2:** migración `20261015115750_membership_consent` y validación RLS alojada siguen pendientes de permiso independiente. Integrar código #100 no lo aplica.

## Salida exigida de N1-03 / S1

- Inventario completo de actores/escritores, ACL/políticas y llamadas actuales.
- Prueba local de transacciones/transportes; permisos SQL efectivos y ningún bypass de rol.
- Todos los escritores legítimos migrados, firmas válidas, secuencia estricta, concurrencia y revocación; exportación/restauración verificables, outbox con reintento.
- Negativos de INSERT/UPSERT/RPC de `audit_events` (tabla **y columnas**) para roles ordinarios; no falsificación de actor, proyecto o HMAC.
- `npm run verify`, integración, pgTAP, Playwright, rollback/reaplicación y pruebas de fallo del escritor, con resultados por SHA y entorno real. Cuando no se puedan ejecutar, declarar el bloqueo.
- PR Draft sin fusionar, separación de secretos, protocolo de despliegue coordinado y plan de reversión sin reabrir la vulnerabilidad. Checklist específico de `provider_results` y decisión de sub-PR si procede.
- Estado preciso **PROBADO LOCAL** vs **MIGRADO ALOJADO**; no declarar piloto Sarah ni H2 cerrado.

**Orden siguiente:** N1-03/S1 es el bloque activo de desarrollo. N1-04/U02 continúa como investigación independiente; no se ha aprobado gasto ni configuración alojada.
