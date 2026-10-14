# Piloto Sarah — cierre técnico en local (15/10/2026)

**Estado:** pruebas locales ampliadas; nada aplicado en alojado. Rama `test/sarah-capture-idempotency-20261015`, base `main@506ea91`. Sin datos reales de Sarah, sin claves HMAC reales, sin proveedores (MCP simulado), sin cambios en Vercel ni en flags.

## 4.1 Migración `20261012130000_google_recovery_state`

| Comprobación | Resultado |
|---|---|
| Presente en `supabase/migrations`, aplicada en el stack local | Sí (17/17 versiones en `supabase_migrations.schema_migrations`) |
| Dependencias | Solo lee `public.projects`, `private.openseo_project_connections` (20261009120000), `private.openseo_google_properties` (20261010160000) y `private.google_captures` (20261012120000): las tres ya están entre las 16 aplicadas en alojado |
| Naturaleza | Dos funciones nuevas (`private` DEFINER `stable` + envoltorio `public` INVOKER), `revoke` a `public/anon/authenticated` y `grant` a `authenticated`. Sin DDL de tablas ni cambios de datos |
| Ensayo sobre estado «tipo alojado» | En una transacción con `rollback` sobre la base local: se eliminaron las dos funciones (estado anterior), se aplicó el fichero con `ON_ERROR_STOP`, y quedó `anon` sin `EXECUTE`, `authenticated` con `EXECUTE`, `search_path=""` en ambas y DEFINER solo en la privada. Rollback verificado (las dos funciones siguen presentes) |
| pgTAP | `google_recovery_state.test.sql` dentro de la suite completa: **518/518** en esta rama (532/532 con la PR #85) |
| Reversión | `drop function public.google_recovery_state(uuid); drop function private.google_recovery_state(uuid);` — sin pérdida de datos |

**Aplicación alojada: NO realizada. Requiere al propietario** con el flujo de `docs/SETUP-SUPABASE.md`.

## 4.2 Exportación verificable

Cobertura existente revisada (no se duplica): paginación con cursor estable y recuento antes/después (`project-export-pagination.test.ts`, 1001 filas a 100 por respuesta), verificación offline recomputando cadena y firmas (`recovery.test.ts`, `verify-export-cli.test.ts`), restauración sin duplicados, dos veces, con IDs/hashes/firmas idénticos (`restore.integration.test.ts`), fichero manipulado rechazado antes de generar SQL, mezcla de proyectos rechazada, firma auténtica copiada a otro proyecto rechazada.

**Hueco encontrado — completitud no demostrable.** La verificación offline prueba la *autenticidad* de lo que contiene el fichero, no que esté *completo*:

- quitar los últimos eventos de `audit.rows` deja un prefijo de cadena válido;
- quitar un elemento de `results` o de `imports` no rompe nada verificable;
- las filas de `imports` no llevan firma: su contenido no se puede verificar offline.

Un fichero recortado o con importaciones alteradas pasa `verify:export` y el plan de restauración. Propuesta (PR separada): un **manifiesto firmado** en la exportación (recuentos, cabeza de la cadena y resumen de IDs/hashes de resultados e importaciones) que el verificador y el plan de restauración comprueben; los ficheros antiguos se seguirían leyendo con la completitud marcada como «no demostrada».

## 4.3 Reintento idempotente de captura

Ya existía: reintento secuencial con la misma clave → mismo `resultId`, sin llamada al proveedor. **Añadido** en `tests/integration/google-capture.integration.test.ts`:

1. **Dos sesiones HTTP del mismo owner** reintentan la misma clave a la vez (doble clic, dos pestañas): la segunda recibe `IN_PROGRESS` sin llamar al proveedor; al terminar la primera, la segunda reproduce el mismo resultado. Total: **1 llamada al proveedor, 1 resultado**.
2. **Fallo del proveedor:** la clave se libera, no se guarda nada; el reintento lee una vez y guarda exactamente un resultado; un tercer intento reproduce sin llamar.

Riesgo residual documentado: una reserva abandonada más de 5 minutos puede ser retomada. Si la petición original seguía viva (lectura del proveedor > 5 min), habría **dos lecturas del proveedor** pero un solo resultado guardado (la segunda `store` falla). Consecuencia: posible coste duplicado, no duplicación de datos.

## 4.4 Modo OpenSEO por proyecto (`legacy → project`)

Revisado `src/lib/openseo/target.ts`: `legacy` por defecto (solo el literal `"project"` lo activa); en `project` se exige el registro de jobs, se lee la conexión ACTIVE por RPC owner-only y se **sobrescriben** `OPENSEO_PROJECT_ID` y `OPENSEO_AUDIT_ALLOWED_HOSTS`. Los jobs registran su `connectionId` y el seguimiento rechaza jobs de otra conexión (`JOB_CONNECTION_MISMATCH`). La base de datos limita los hosts al dominio del proyecto y su variante `www`.

**Añadido** en `tests/integration/openseo-connections.integration.test.ts`, contra la base local real (antes solo había pruebas unitarias con cliente simulado):

- el owner de A resuelve su conexión y los IDs globales ficticios **no sobreviven** en el entorno resultante;
- el owner de B sobre el UUID real de A → `CONNECTION_FORBIDDEN`, sin petición al proveedor;
- B en su propio proyecto obtiene sus IDs, nunca los de A;
- sin registro de jobs → `CONNECTIONS_REQUIRE_JOBS` incluso para el owner;
- sin la variable, `legacy` ignora las conexiones;
- tras revocar → `PROJECT_NOT_CONNECTED`.

**Producción sigue en `legacy`. No se ha tocado ninguna variable de Vercel.** Activar `project` requiere decisión del propietario, conexión creada para Sarah y `OPENSEO_PROJECT_JOBS_ENABLED=true`.

## Evidencia

| Comando (Windows, Supabase local 2.118.0) | Resultado |
|---|---|
| `npm run test:integration` | **60/60** (57 de `main` + 3 nuevas) |
| `npm run verify` | exit 0 · Core pin `2aaf127` · secretos · lint · TS · **374/374** · build |
| `supabase test db` | **518/518** |

GitHub Actions sigue bloqueado por facturación: sin CI.
