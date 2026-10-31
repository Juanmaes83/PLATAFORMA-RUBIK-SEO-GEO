# Recuperación acotada H1-A — f7ee4d0a

Estado de recuperación: **PASS**. H1-A alojado sigue **BLOCKED**; el run original no acredita exportación ni restauración.

## Fallo anterior al prompt y corrección

El primer `-H1ARecoveryOnly` terminó con `H1A_RECOVERY_BRANCH_BATCH_MISMATCH` antes del prompt y de cualquier SQL. El diagnóstico real con Windows PowerShell 5.1 y `vercel env run -e preview --git-branch codex/h1a-integral-20261022` confirmó: metadatos `sensitive/preview/rama` correctos para los ocho nombres; vault DPAPI del mismo usuario legible y ligado al run; los ocho valores entregados por `env run` al proceso eran `EMPTY`. Por eso la comparación estricta del wrapper anterior no podía pasar. Una lista de nombres no acreditaba la entrega de bytes.

El wrapper conserva la validación de metadatos y ref/rama/SHA/run. Clasifica cada nombre como `ABSENT`, `EMPTY`, `PRESENT_MATCH` o `PRESENT_MISMATCH`, sin mostrar bytes, hashes ni longitudes. `PRESENT_MISMATCH` detiene la operación. Ante `EMPTY` o `ABSENT`, carga el lote DPAPI local, lo entrega explícitamente al hijo y exige la atestación HMAC contra el deployment protegido y fijado antes del prompt. El modo `-H1ARecoveryTransportOnly` ejecutó esta secuencia real sin contraseña ni SQL: ocho metadatos correctos, ocho `EMPTY` de CLI, ocho coincidencias tras DPAPI, ocho controles en el hijo y `U03_WINDOW_BATCH_ATTESTATION PASS`. No se rotaron variables ni se redeplegó.

## Fuente inmutable

- `test-results/u03-hosted-window/f7ee4d0a-edb4-4276-88fc-03bbab570a19.jsonl`: SHA-256 `1f36744b31b875413956359fa667a8327b7afee20a150581e064111c987dd192`.
- `test-results/u03-hosted/f7ee4d0a-edb4-4276-88fc-03bbab570a19.jsonl`: SHA-256 `94034ffcd1fa21ed4f159e35a0049079b6d37940861713d33a4ca4f24effb144`.

El operador exige ambos hashes y compara los ocho UUID `CREATED` con las entradas `RECOVERED` del mismo run. Los UUID no se publican en el expediente.

## Lectura independiente anterior al borrado

Preview `rhnnplewqsekrnaousyl`: tres usuarios, dos organizaciones, tres proyectos, dos membresías de organización, tres membresías de proyecto, tres eventos, un resultado, un import, una invitación y un registro de idempotencia. Las tablas ligadas a proyecto no tienen filas ajenas a los tres proyectos del run. Hay dos recibos completados y vinculados a eventos, ninguno pendiente. El rol temporal conserva la marca del run y `NOLOGIN`; tiene cero sesiones y cuatro políticas. La guarda temporal conserva la marca del run. El escritor general está en `NOLOGIN`.

Esta lectura no constituye limpieza. La limpieza solo se acredita con el ledger nuevo de recuperación y una lectura administrativa independiente posterior.

## Secuencia de recuperación

`-H1ARecoveryOnly` usa una sola entrada oculta de la Database password existente de Preview. Antes de borrar, verifica identidad, 27 migraciones, TLS, propiedad del rol, NOLOGIN, sesiones, políticas exactas, guarda, namespace/IDs y recibos completados. En una transacción serializable elimina solo los proyectos y organizaciones propios; las cascadas retiran las filas ligadas a ellos. Relee inventario y outbox antes del commit. Después elimina solo los tres usuarios del ledger por Auth Admin, ejecuta el rollback idempotente de guarda, grants, políticas y rol y comprueba por una conexión independiente inventario/outbox, rol/políticas/sesiones, guarda y escritor general. Solo después retira las ocho variables de rama, el deployment temporal y el vault DPAPI.

El ledger nuevo se escribe en `test-results/u03-hosted-recovery/`. Si falla una comprobación, conserva el contexto y deja H1-A BLOCKED. Una escritura parcial requiere relectura y reanudación acotada; nunca se borra un recibo pendiente por SQL.

## Diagnóstico retrospectivo

El ledger original acredita vistas protegidas y logout antes de `H1A_EXTERNAL_NAVIGATION_BLOCKED`. No registra el destino o tipo de petición que causó esa clasificación. La causa histórica exacta no es reconstruible desde él. Una reproducción local muestra que un recurso secundario redirigido fuera del host podía incrementar el contador global de navegación y producir ese código; esa reproducción demuestra un defecto del arnés, no que fuera la causa histórica del run.

## Resultado de recuperación y reproducción posterior

El ledger separado `test-results/u03-hosted-recovery/f7ee4d0a-edb4-4276-88fc-03bbab570a19-recovery.jsonl` acredita borrado atribuible, retirada de Auth, rollback y lectura independiente final. Una segunda lectura de Preview confirmó cero usuarios, organizaciones, proyectos, membresías, auditoría, resultados, imports, invitaciones, idempotencia y outbox total/pending; rol, políticas y sesiones temporales cero; guarda original restaurada y escritor general `NOLOGIN`. Las ocho variables de rama, el deployment temporal y el vault quedaron retirados. Los dos ledgers originales y sus hashes anteriores se conservaron.

En Chromium local, una respuesta 302 de un recurso secundario hacia otro origen queda bloqueada sin producir un falso fallo de navegación principal. Una redirección 302 del documento principal sigue bloqueada y produce la categoría fatal. El diagnóstico nuevo guarda solo fase y clases cerradas de petición, destino, redirección y estado HTTP. Un error de interceptación del host fijado tiene ahora su propio código y no se atribuye a navegación externa.

El run local `b4ad78fa-6791-42fa-961d-51cd3fccf088` pasó con dos stacks N1 desechables: Auth real, vistas de medición e informe en escritorio y móvil, exportación por socket HTTP, firma y manifiesto completos, rechazo de una copia manipulada, restauración doble con contenido/hash conservados, logout y denegación posterior, recibos resueltos y limpieza independiente de ambos destinos. El test conserva la separación entre este resultado **local** y el próximo ensayo **alojado**. El intento local anterior `69173e61-43c9-4d87-8969-9eea646a3b6f` recibió HTTP 500 porque el test cerró sesión antes de exportar; se corrigió el orden y se conserva su salida de fallo. El operador alojado ahora exporta antes del logout.
