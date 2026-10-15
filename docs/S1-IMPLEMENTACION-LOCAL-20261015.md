# N1-03 / S1 — implementación local en curso

**15/10/2026, 15:18 UTC.** Rama `codex/s1-trusted-audit-writer-20261015`, worktree `test-results/s1-writer`, base `main@520e4119bafe8a9ce4b2293faad2e54b8e6d81d8`. U01 autoriza desarrollo local; este corte no autoriza una migración alojada ni credenciales reales. La PR de producto todavía no está publicada.

## Gate de transporte

El prototipo `scripts/prototype-audit-transport.mjs` pasó contra el stack Supabase **aislado** `rubik-s1-writer-20261015` en 127.0.0.1:56321/56322: conexión PostgreSQL desde Node, reutilización de pool, BEGIN/COMMIT/ROLLBACK, timeout, terminación de conexión con rollback, privilegios efectivos y revocación de INSERT. Utilizó un rol y tabla ficticios que eliminó al terminar. Esto **no prueba** el transaction pooler alojado ni el comportamiento de Vercel; ambos requieren ensayo posterior autorizado en un entorno Preview aislado.

## Cambio local

- La migración `20261015145025_s1_trusted_audit_writer.sql` revoca INSERT de `audit_events` a JWT ordinarios, añade un rol SQL `NOLOGIN` de privilegio mínimo, autorización SQL de membresía, recibos de idempotencia y un outbox privado generado por trigger dentro de la retirada de membresía. El rol solo recibe LOGIN con contraseña **ficticia** en el stack local; la migración no contiene secretos.
- `appendTrustedAudit` comprueba el usuario con Auth, revalida proyecto, organización, rol y membresía en la transacción SQL, serializa por proyecto mediante advisory lock, verifica la cadena previa con el keyring del servidor y firma con el Core canónico. Los consumidores existentes entran por `appendAudit`; ningún endpoint nuevo acepta eventos arbitrarios.
- El retiro de membresía entrega un ID de recibo. La baja se confirma aunque falle la firma; `processAuditOutbox` reintenta y completa de forma idempotente. La prueba de integración reproduce un keyring incorrecto y después un reintento válido.

## Evidencia local de este corte

- `node scripts/prototype-audit-transport.mjs`: PASS.
- `npm run verify`: PASS, 403 tests unitarios, lint, typecheck y build.
- `npm run test:integration` con stack S1 y credencial ficticia: PASS, 85/85.
- `supabase test db` con los 20 archivos de tests copiados al workdir aislado S1: PASS, 582/582.
- `npm run test:e2e`: en ejecución al redactar este corte; registrar resultado final en el checkpoint.

## Pendiente antes de Draft PR apta para auditoría

1. Completar negativos de INSERT/UPSERT/RPC, permisos por columna, JWT caducado y revocado, suplantación de organización/proyecto, cadena truncada, clave ausente/rotada y pérdida de conexión en el escritor real. El prototipo cubre parte del transporte; no reemplaza ensayos del flujo completo.
2. Diseñar y probar un mecanismo operativo de drenaje de outbox y alertas de pendientes. `drainAuditOutbox` existe, pero aún no hay scheduler ni comando de operador. La retirada de proyecto en cascada elimina recibos ligados al proyecto: decidir conservación/retención antes de llamar el outbox completo.
3. Verificar atomicidad de todos los consumidores: importación, borrado, exportación, Google/OpenSEO, restauración y denegaciones. La firma posterior a llamadas externas nunca debe repetir proveedores para reparar auditoría.
4. `provider_results` sigue permitiendo INSERT con HMAC falso desde `authenticated`. Es un subbloque explícito pendiente: revocar el INSERT directo por tabla y columna, trasladar el almacenamiento a una operación confiable con autorización actual, firma en servidor e idempotencia, y probar falso HMAC/replay/aislamiento. Si requiere una segunda PR de producto, abrirla solo después de la primera S1 y mantener S1 abierto hasta su integración.
5. Preparar rollback de despliegue y ensayo local; validar exportación/restauración con el nuevo escritor; repetir suite E2E y actualizar evidencias. La migración alojada, credenciales reales, Preview/Production y fusión requieren autorizaciones separadas.

**Recuperación:** entrar en `test-results/s1-writer`, consultar `git status`, `git log -1`, `gh pr list`, leer este archivo y `CODEX-AUTONOMIA-ESTADO.md`. El stack local S1 usa 56321/56322, se selecciona mediante `SUPABASE_CLI='npx --yes supabase@2.118.0 --workdir test-results/s1-stack'` y `RUBIK_TEST_S1_STACK=1`; el escritor exige `RUBIK_AUDIT_DATABASE_URL` de ese mismo stack con credencial ficticia local. No usar el stack compartido ni datos alojados.
