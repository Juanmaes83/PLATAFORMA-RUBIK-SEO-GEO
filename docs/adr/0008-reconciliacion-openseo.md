# ADR 0008 · Reconciliar un lanzamiento OpenSEO incierto

**Estado actualizado (09/10/2026):** implementado e integrado mediante PR #36; migración `20261009170000` aplicada en alojado. El job real de Sarah terminó sin necesitar reconciliación. Producción continúa en `legacy`.
**Fecha:** 09/10/2026.
**Depende de:** ADR 0006 (puente OpenSEO), migración de jobs `20261009071705` y ADR 0007 (conexión por proyecto).

## Contexto

`startProjectAudit` reserva el trabajo (STARTING) **antes** de llamar a OpenSEO. Si la respuesta se pierde (timeout, red o respuesta ambigua), la reserva se conserva a propósito: el rastreo pudo crearse y consumir créditos, y relanzarlo podría duplicarlo. Hasta ahora no había forma de salir de ese estado: el proyecto quedaba bloqueado con `START_IN_PROGRESS` y solo se resolvía editando la base de datos.

## Decisión

El owner resuelve la reserva desde la página de Auditoría técnica, **tras comprobarlo en OpenSEO**. La plataforma no llama a OpenSEO para esto.

1. **Vincular:** el owner introduce el identificador de auditoría que ve en OpenSEO. Se usa el comando `bind` existente, que solo vincula un STARTING sin `auditId`. Si ese `auditId` ya pertenece a cualquier trabajo, la base de datos lo rechaza (`23505`). La consulta posterior vuelve a filtrar las URL al dominio del proyecto. En modo `project` además usa el proyecto OpenSEO de la conexión.
2. **Liberar:** el owner confirma que OpenSEO no creó ningún rastreo. La nueva RPC `openseo_release_starting_job` pasa la reserva a FAILED solo si **sigue** en STARTING sin `auditId`, bajo el mismo lock por proyecto. Si otra sesión la vinculó entretanto, no libera nada. El `fail` genérico no se usa aquí, porque también terminaría un trabajo SYNCING vivo.
3. **Lectura:** la nueva RPC `openseo_active_job`, solo para el owner, muestra el trabajo activo sin crear una reserva (`acquire` sí la crearía).

En modo `project`, una reserva de otra conexión no se toca (`JOB_CONNECTION_MISMATCH`).

## Consecuencias y límites

- La plataforma **no puede verificar** lo que declara el owner. Si libera una reserva cuyo rastreo sí existía, ese rastreo queda huérfano en OpenSEO y no se vincula. Por eso la confirmación es explícita y el texto explica el riesgo de duplicar el gasto.
- Un trabajo SYNCING atascado no se reconcilia aquí: su consulta normal ya pasa a FAILED cuando OpenSEO informa del fallo.
- No hay caducidad automática de reservas (decisión mantenida de la migración de jobs).
- Trazabilidad: cada reconciliación, conexión y revocación correcta añade un evento firmado a `audit_events` (`openseo.job.reconcile`, `openseo.connection.connect`, `openseo.connection.revoke`). Los detalles no llevan identificadores de OpenSEO. El cambio y el evento son escrituras separadas: si el registro falla, la interfaz lo dice en lugar de darlo por auditado.

## Pruebas

- pgTAP `openseo_active_job` 15/15: lectura sin crear reserva, vincular, una liberación tardía que no descarta un rastreo vinculado, doble liberación rechazada, otro cliente y anon sin acceso.
- Unit: sin llamadas a OpenSEO; liberar usa solo la RPC atómica; rechazos sin falsos éxitos; conexión distinta.
- e2e (CI): liberar y vincular desde la interfaz; un analista no ve el panel. El flag de jobs se activa solo en el entorno local de Playwright.
