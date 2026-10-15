# N1-03 / S1 — implementación local en curso

**15/10/2026, 15:25 UTC.** Rama `codex/s1-trusted-audit-writer-20261015`, worktree `test-results/s1-writer`, base `main@520e4119bafe8a9ce4b2293faad2e54b8e6d81d8`. U01 autoriza desarrollo local; este corte no autoriza una migración alojada ni credenciales reales. Primer commit publicado: `0a4127b074e79f428ffae53182a427f1b6cc8114`; consultar el último HEAD para avances posteriores.

## Gate de transporte

El prototipo `scripts/prototype-audit-transport.mjs` pasó contra el stack Supabase **aislado** `rubik-s1-writer-20261015` en 127.0.0.1:56321/56322: conexión PostgreSQL desde Node, reutilización de pool, BEGIN/COMMIT/ROLLBACK, timeout, terminación de conexión con rollback, privilegios efectivos y revocación de INSERT. Utilizó un rol y tabla ficticios que eliminó al terminar. Esto **no prueba** el transaction pooler alojado ni el comportamiento de Vercel; ambos requieren ensayo posterior autorizado en un entorno Preview aislado.

## Cambio local

- La migración `20261015145025_s1_trusted_audit_writer.sql` revoca INSERT de `audit_events` a JWT ordinarios, añade un rol SQL `NOLOGIN` de privilegio mínimo, autorización SQL de membresía, recibos de idempotencia y un outbox privado generado por trigger dentro de la retirada de membresía. El rol solo recibe LOGIN con contraseña **ficticia** en el stack local; la migración no contiene secretos.
- `appendTrustedAudit` comprueba el usuario con Auth, revalida proyecto, organización, rol y membresía en la transacción SQL, serializa por proyecto mediante advisory lock, verifica la cadena previa con el keyring del servidor y firma con el Core canónico. Los consumidores existentes entran por `appendAudit`; ningún endpoint nuevo acepta eventos arbitrarios.
- El retiro de membresía entrega un ID de recibo. La baja se confirma aunque falle la firma; `processAuditOutbox` reintenta y completa de forma idempotente. La prueba de integración reproduce un keyring incorrecto y después un reintento válido.
- La ruta Node `/api/operaciones/auditoria/pendientes` solo se habilita con un token de operador de 32 caracteres o más, guardado exclusivamente en el servidor: GET muestra número y antigüedad de recibos pendientes; POST intenta procesar hasta 25 recibos ya creados por la base. No acepta datos de eventos del cliente ni programa una tarea automática. La configuración de un token real y cualquier programación alojada quedan fuera del permiso actual. La ruta responde 404 sin configuración y 401 sin token correcto.

## Evidencia local de este corte

- `node scripts/prototype-audit-transport.mjs`: PASS.
- `npm run verify`: PASS, 405 tests unitarios, lint, typecheck y build.
- `npm run test:integration` con stack S1 y credencial ficticia: PASS, 86/86.
- `supabase test db` con los 21 archivos de tests copiados al workdir aislado S1: PASS, 594/594, incluso con datos E2E preexistentes en el stack.
- `npm run test:e2e`: **NO PASA**, 143 PASS, 44 SKIP, 2 FAIL (correo de recuperación no llegó dentro del timeout; confirmación de invitación acabó en `/acceso?error=enlace`). El teardown protegió los fixtures: un usuario ficticio no obtuvo recibo final y la limpieza se negó a borrar. Ledger y datos se conservaron en el stack S1; investigar antes de limpiar o reintentar. No hubo borrado de fixtures ajenos.
- Rollback de contención `supabase/rollbacks/20261015145025_s1_trusted_audit_writer.sql` ejecutado **solo en el stack S1 local**: dejó LOGIN, INSERT de auditoría y UPDATE de outbox en `false` (`f|f|f`). La recuperación local restauró esos tres permisos (`t|t|t`) con contraseña ficticia. No reabrió INSERT a `authenticated`.

## Pendiente antes de Draft PR apta para auditoría

1. Completar negativos de INSERT/UPSERT/RPC, permisos por columna, JWT caducado y revocado, suplantación de organización/proyecto, cadena truncada, clave ausente/rotada y pérdida de conexión en el escritor real. El prototipo cubre parte del transporte; no reemplaza ensayos del flujo completo.
2. Ensayar end-to-end la ruta de operador con un token ficticio y definir alerta/retención de pendientes; no hay scheduler autorizado. La retirada de proyecto en cascada elimina recibos ligados al proyecto: decidir conservación/retención antes de llamar el outbox completo.
3. Verificar atomicidad de todos los consumidores: importación, borrado, exportación, Google/OpenSEO, restauración y denegaciones. La firma posterior a llamadas externas nunca debe repetir proveedores para reparar auditoría.
4. `provider_results` sigue permitiendo INSERT con HMAC falso desde `authenticated`. Es un subbloque explícito pendiente: revocar el INSERT directo por tabla y columna, trasladar el almacenamiento a una operación confiable con autorización actual, firma en servidor e idempotencia, y probar falso HMAC/replay/aislamiento. Si requiere una segunda PR de producto, abrirla solo después de la primera S1 y mantener S1 abierto hasta su integración.
5. Preparar secuencia operativa de despliegue/rollback/reaplicación, validar exportación/restauración con el nuevo escritor y resolver las dos fallas E2E y el ledger conservado. La migración alojada, credenciales reales, Preview/Production y fusión requieren autorizaciones separadas.

**Recuperación:** entrar en `test-results/s1-writer`, consultar `git status`, `git log -1`, `gh pr list`, leer este archivo y `CODEX-AUTONOMIA-ESTADO.md`. El stack local S1 usa 56321/56322, se selecciona mediante `SUPABASE_CLI='npx --yes supabase@2.118.0 --workdir test-results/s1-stack'` y `RUBIK_TEST_S1_STACK=1`; el escritor exige `RUBIK_AUDIT_DATABASE_URL` de ese mismo stack con credencial ficticia local. No usar el stack compartido ni datos alojados.
