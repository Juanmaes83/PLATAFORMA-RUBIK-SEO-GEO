# Auditoría S1 · drenaje de outbox sin falsos éxitos ni inanición

**Base de revisión:** PR #104, `41512756ac1ce80934692d1722fd41bd95993933`. **Estado:** corrección propuesta en rama independiente; requiere tests locales antes de integrar.

## Hallazgos

1. **Éxito falso de operador:** `drainAuditOutbox()` devolvía `{pending:0,completed:0,failed:0}` tanto si el writer no estaba configurado como si el límite era inválido. La ruta `POST /api/operaciones/auditoria/pendientes` interpretaba ese objeto como HTTP 200 aunque no se hubiese conectado a PostgreSQL.
2. **Inanición de recibos:** la selección `ORDER BY created_at,id LIMIT 25` escogía de forma indefinida las mismas filas antiguas que fallaban de manera persistente. La tabla ya cuenta con `attempts`, que se incrementa tras fallo; los recibos nuevos podían quedar sin oportunidad de firmarse.

## Corrección

En `src/lib/provenance/outbox.ts`:

- Sin conexión del escritor se lanza `WRITER_NOT_CONFIGURED`, y la ruta de operador existente lo convierte en un error HTTP 503 (sin modificar el endpoint).
- Límite fuera de 1..100 entero lanza `INVALID_DRAIN_LIMIT` en lugar de devolver éxito.
- Drenaje ordenado `ORDER BY attempts, created_at, id`: se atiende primero a quienes se han intentado menos veces. Tras un fallo, el incremento de `attempts` permite que otros recibos pendientes avancen en la siguiente petición del operador. Dentro de cada cohorte se mantiene el orden de antigüedad.

`tests/audit-outbox-drain.test.ts` incluye tres pruebas unitarias: ausencia de pool, límite inválido y dos recibos donde el primero falla y el segundo debe seleccionarse en el siguiente lote.

## Alcance / riesgos residuales

- **Sin ejecución aquí de Vitest ni PostgreSQL:** este cambio está publicado y listo para pruebas; no existe evidencia local de PASS atribuible a este HEAD.
- `attempts` sirve para equidad, no para programar reintentos automáticos. Un fallo permanente sigue requiriendo diagnóstico y alerta; el endpoint de operador no está programado ni habilitado en alojado.
- La contención tras falla total de PostgreSQL depende de que el incremento de `attempts` pueda persistir. La pérdida completa de DB continúa informándose como error; no se propone simular éxito.
- Con múltiples operadores simultáneos puede seleccionarse una misma fila, aunque el bloqueo en `processAuditOutbox` evita firmarla dos veces. La política de reintentos, backoff y alertas sigue siendo un gate S1 separado.
- `pending` de `drainAuditOutbox()` continúa significando **número de recibos seleccionados en el lote**, no tamaño global de cola; el GET del operador proporciona la cuenta total actual.

## Gate de integración para Claude tras N1-04

1. Verificar la rama y el SHA de #104 antes de actuar; el agente de N1-04 debe publicar su checkpoint y detener escritura.
2. En un worktree S1 propio, traer esta PR y ejecutar `npm run verify` y las nuevas pruebas dirigidas.
3. En stack S1 local **aislado**, añadir ensayo de 26+ recibos con uno permanentemente fallido y confirmar que el resto progresa, sin borrar fixtures ajenos ni usar el stack de Codex si conserva ownership ambiguo.
4. Ejecutar `verify:s1-local` y comprobar operativamente los códigos HTTP 503/200 en entorno local.
5. Tras validar, integrar en rama S1 y actualizar la descripción de #104; no fusionar `main` ni aplicar migraciones alojadas sin auditoría.
