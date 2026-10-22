# Recuperación acotada H1-A — f7ee4d0a

Estado: **BLOCKED hasta ejecutar y verificar la recuperación alojada**. Este documento no atribuye un PASS a H1-A.

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
