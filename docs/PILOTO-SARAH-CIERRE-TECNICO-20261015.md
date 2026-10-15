# Piloto Sarah — validación técnica local (15/10/2026)

**Estado: VALIDADO EN LOCAL · PILOTO NO CERRADO · PR #86 DRAFT.** Rama `test/sarah-capture-idempotency-20261015`. Incorporado primero `main@2e6a7a7` mediante merge `dc92dcd`, sin conflictos. Antes del push, main avanzó con #85 y #93; se incorporó también `main@e7adc51` mediante un segundo merge, sin reescribir historial. Sus conflictos en ROADMAP/HANDOFF eran inserciones al inicio: se conservaron el enlace al control canónico y la evidencia de esta PR. Se conservan el manifiesto firmado de #87, el bloqueo de sesiones Preview de #88 y la matriz local de #85; los archivos de producto y migraciones coinciden con el main actual.

Supabase local confirmado mediante `localSupabaseEnv()`: **`http://127.0.0.1:54321`**. Se usan cuentas ficticias, claves HMAC aleatorias y MCP simulado. Esta revalidación no accedió a Supabase alojado, no aplicó migraciones, no cambió Vercel ni flags y no llamó a proveedores reales.

## 4.1 Migración `20261012130000_google_recovery_state`

Revisión del fichero y consultas de solo lectura mediante `supabase db query --local`:

| Comprobación local | Resultado |
|---|---|
| Historial local | 17 versiones; `20261012130000` presente |
| Dependencias | `public.projects`, `private.openseo_project_connections`, `private.openseo_google_properties` y `private.google_captures` |
| Función privada | `SECURITY DEFINER`, `STABLE`, `search_path=""`; comprueba `auth.uid()` y rol owner del proyecto antes de devolver datos |
| Envoltorio público | `SECURITY INVOKER`, `STABLE`, `search_path=""` |
| Privilegios efectivos de ambas funciones | `anon` sin EXECUTE; `authenticated` con EXECUTE, sujeto al control de owner dentro de la función |
| Datos exportados | Conexiones y asociaciones del proyecto, incluido historial revocado; solo capturas `STORED`; sin claves del proveedor |
| pgTAP | Suite completa **532/532**, incluidos los negativos de analyst/otra cuenta y la exclusión de otro proyecto |

El ensayo de retirar y recrear las dos funciones dentro de una transacción con rollback fue evidencia de la ejecución original de la rama; **no se repitió en esta revalidación**. Aquí solo se inspeccionó el SQL y el estado local existente, sin reset ni DDL.

La aplicación alojada continúa pendiente según el relevo; no se consultó ni modificó su estado. Requiere operación del propietario con respaldo y el procedimiento de `docs/SETUP-SUPABASE.md`.

## 4.2 Exportación verificable: corrección #87 conservada

La carencia histórica de completitud **está corregida en main** mediante #87 (`ccdf104a`). El servidor añade un manifiesto HMAC al cuerpo final de la exportación: recuento y cabeza de auditoría, digest de todas las columnas de resultados e importaciones y digest del estado operativo. La verificación recomputa esos valores; `planRestore` rechaza `UNPROVEN` e `INCOMPLETE` con `TAMPERED`.

Se conserva la cobertura de eliminación de eventos/resultados/importaciones, modificación de importaciones, manifiesto alterado o ausente, mezcla de proyectos y restauración idempotente. Las suites de aplicación e integración de esta rama incorporan esas pruebas de main y pasan. Esto no acredita una exportación o restauración de los datos reales de Sarah.

## 4.3 Reintento idempotente de captura

`tests/integration/google-capture.integration.test.ts` usa la Data API local y un MCP simulado:

1. Dos sesiones del mismo owner usan la misma clave. La primera queda esperando en el proveedor simulado; la segunda recibe `IN_PROGRESS` y ni siquiera construye el cliente MCP. Tras terminar la primera, el reintento reproduce exactamente su `resultId` sin llamar al proveedor.
2. El inventario y la RPC de recuperación comprueban **una sola entrada de captura**, en `STORED`, vinculada al único resultado nuevo. Total del caso concurrente: **1 llamada simulada, 1 captura y 1 resultado**.
3. El fallo simulado devuelve `PROVIDER_STATUS` / `ERROR`, sin guardar resultados. El reintento inmediato reutiliza la entrada, llama una vez y guarda un resultado. El siguiente reenvío devuelve exactamente ese `resultId` sin nueva llamada.
4. El bloqueo del proveedor simulado se libera en `finally` y se espera la petición pendiente antes de limpiar fixtures, incluso si una aserción falla.

La primera ejecución de la suite tras reforzar las aserciones dio 59 PASS / 1 FAIL porque la nueva expectativa de error usaba `UNAVAILABLE`. El Core normaliza esa excepción como resultado `ERROR`; se corrigió la expectativa a `PROVIDER_STATUS` / `ERROR` y se repitió la suite completa: **60/60 PASS**. Tras incorporar también #85/#93, la suite completa volvió a ejecutarse: **74/74 PASS**. No fue necesario cambiar código de producto.

**Riesgo residual:** una reserva de más de cinco minutos puede retomarse mientras la petición original siga viva. Puede haber lecturas duplicadas del proveedor. La exclusión por clave y el guardado transaccional evitan resultados duplicados en los casos comprobados; esta validación no acredita ejecución exactamente una vez ante una reserva expirada.

## 4.4 Modo OpenSEO por proyecto

Revisado `src/lib/openseo/target.ts` y ejecutado `tests/integration/openseo-connections.integration.test.ts` con la base local:

- `legacy` sigue siendo el valor por defecto; solo `OPENSEO_PROJECT_CONNECTIONS_MODE=project` selecciona el modo por proyecto.
- Se exige `OPENSEO_PROJECT_JOBS_ENABLED=true` antes de resolver la conexión: sin registro de jobs, `CONNECTIONS_REQUIRE_JOBS`.
- El owner recibe solo su conexión ACTIVE; sus IDs y hosts sobrescriben los valores globales ficticios.
- La cuenta B sobre el UUID de A recibe `CONNECTION_FORBIDDEN`; en su propio proyecto recibe los IDs de B.
- Una conexión revocada produce `PROJECT_NOT_CONNECTED`.
- Los casos existentes rechazan un `connectionId` ajeno al adquirir jobs y mover un job/audit entre proyectos del mismo owner. No se llama a OpenSEO.

La activación alojada de `project` sigue siendo una decisión y operación separada del propietario. No se modificó configuración de producción.

## Evidencia de la revalidación sobre main incorporado

| Comando | Resultado local |
|---|---|
| `npm run verify` | Exit 0: Core pin `2aaf127`, secretos, lint, TypeScript, **385/385** en 41 archivos y build |
| `npm run test:integration` | Exit 0: **74/74**, 11 archivos; incluye 6 casos de captura y 4 de conexiones OpenSEO |
| `npm run test:db` | Exit 0: **532/532**, 19 archivos |
| `git diff --check` | Correcto |
| Suite Playwright | **NO EJECUTADA / BLOQUEADA**: `e2e/global-setup.ts` elimina todos los usuarios `@ejemplo.test`; una consulta local posterior a las suites detectó 6 usuarios fuera de sus cinco cuentas explícitas. Ejecutarla afectaría fixtures ajenos. Requiere aislar el stack o limitar y revisar la limpieza antes de lanzarla |

Las cifras originales 374/60/518 correspondían a la base histórica `main@506ea91`. La primera revalidación de esta sesión sobre `2e6a7a7` pasó 385/60/518. Después main incorporó #85 y #93; las cifras finales **385/74/532** proceden de nuevas ejecuciones en esta rama con esa matriz incluida (71 pruebas de integración de main + 3 del piloto). #85 ya está fusionada; #86 sigue Draft. GitHub Actions está bloqueado por facturación: no hay CI aprobada.

## Riesgos y decisiones pendientes

- Revisar esta PR en Draft; el piloto Sarah no se declara cerrado.
- Ejecutar navegador en un entorno aislado o tras corregir el alcance de su limpieza, sin borrar fixtures ajenos.
- Propietario: aplicación alojada de recuperación, exportación/verificación real con el anillo y decisión/ensayo de `project`.
- Aislamiento alojado con dos cuentas y limpieza supervisada pendiente.
- S1/S2 de `docs/SECURITY-AUDIT-MEMBERSHIP-HMAC-20261015.md` siguen abiertos: contaminación del historial de auditoría y altas sin consentimiento; #90 es diseño, no mitigación implementada.
