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
- `npm run test:e2e`: segunda ejecución completa **PASS**, 145 PASS / 44 SKIP / 0 FAIL en 3,7 minutos; teardown limpió exactamente sus 11 usuarios y 2 organizaciones propios. La primera ejecución dio 143 PASS / 44 SKIP / 2 FAIL: la búsqueda por asunto del correo de recuperación fallaba por codificación, corregida para buscar por destinatario y tipo de enlace; el caso de invitación pasó al repetirlo. El primer ledger `aeb1e0784829daee81d23916a376a0c3` sigue preservado porque una cuenta ficticia no obtuvo recibo final; no adoptar ni borrar ese registro sin auditoría. La repetición no borró fixtures ajenos.
- Rollback de contención `supabase/rollbacks/20261015145025_s1_trusted_audit_writer.sql` ejecutado **solo en el stack S1 local**: dejó LOGIN, INSERT de auditoría y UPDATE de outbox en `false` (`f|f|f`). La recuperación local restauró esos tres permisos (`t|t|t`) con contraseña ficticia. No reabrió INSERT a `authenticated`.
- Ruta de operador ensayada en Next local puerto 3218 con token/keyring ficticios y DB S1: GET sin token **401**, GET con token **200** y `pending=0`, POST con token **200** y cero recibos. El ensayo acredita transporte y control de acceso para cola vacía; la recuperación de un recibo pendiente ya está probada a nivel de integración en `processAuditOutbox`, pero falta un E2E de la ruta con cola no vacía.

## Pendiente antes de Draft PR apta para auditoría

1. Completar negativos de INSERT/UPSERT/RPC, permisos por columna, JWT caducado y revocado, suplantación de organización/proyecto, cadena truncada, clave ausente/rotada y pérdida de conexión en el escritor real. El prototipo cubre parte del transporte; no reemplaza ensayos del flujo completo.
2. Ensayar la ruta de operador con cola no vacía y definir alerta/retención de pendientes; no hay scheduler autorizado. La retirada de proyecto en cascada elimina recibos ligados al proyecto: decidir conservación/retención antes de llamar el outbox completo.
3. Verificar atomicidad de todos los consumidores: importación, borrado, exportación, Google/OpenSEO, restauración y denegaciones. La firma posterior a llamadas externas nunca debe repetir proveedores para reparar auditoría.
4. `provider_results` sigue permitiendo INSERT con HMAC falso desde `authenticated`. Es un subbloque explícito pendiente: revocar el INSERT directo por tabla y columna, trasladar el almacenamiento a una operación confiable con autorización actual, firma en servidor e idempotencia, y probar falso HMAC/replay/aislamiento. Si requiere una segunda PR de producto, abrirla solo después de la primera S1 y mantener S1 abierto hasta su integración.
5. Preparar secuencia operativa de despliegue/rollback/reaplicación, validar exportación/restauración con el nuevo escritor y resolver el ledger antiguo conservado. La migración alojada, credenciales reales, Preview/Production y fusión requieren autorizaciones separadas.

## Subbloque `provider_results` — contrato pendiente

La migración Core `20261007120000_core_9_2_audit_and_provenance.sql` concede `INSERT` por columnas a `authenticated` y permite a `owner`, `account-manager` y `analyst` almacenar filas con firma elegida por el cliente. El verificador marca una firma falsa como `UNTRUSTED` al leer, pero la fila persistida sigue contaminando historial, exportaciones y decisiones que se apoyen en el estado almacenado. La corrección debe coordinarse con el escritor S1 antes de declarar el bloque completo.

1. Revocar `INSERT` de **tabla y todas las columnas** de `provider_results` a `PUBLIC`, `anon` y `authenticated`; retirar la política de inserción JWT. Mantener solo SELECT de membresía y DELETE de propietario según el contrato de borrado.
2. El servidor recibe un resultado tipado de Core/Google/OpenSEO, verifica `getUser()` y revalida en SQL el proyecto, organización y rol autorizado. Calcula la firma con el keyring del servidor y persiste con el rol dedicado. No acepta una firma, `key_id`, `created_by` o scope enviado por navegador. La operación lleva un ID estable o digest de resultado para reintento idempotente; una llamada externa ya completada nunca se repite para reparar la escritura.
3. Si un resultado y su evento de auditoría representan una única acción SQL, ambos se insertan en la misma transacción por proyecto. Si la llamada externa termina antes de la transacción, el recibo de captura persiste su referencia y permite reintento del guardado/firma sin invocar otra vez al proveedor.
4. Pruebas de aceptación: INSERT/UPSERT/RPC con JWT ordinario y HMAC falso rechazados por ACL y RLS; `created_by`, actor, org y proyecto falsos rechazados; resultados legítimos verifican firma tras concurrencia, idempotencia y rotación; exportación/restauración conservan la marca de confianza; fallo entre llamada externa y commit deja un recibo reintentable, sin doble coste.

Por tamaño y aislamiento de riesgo, preparar **una segunda PR de producto secuencial**, solo después de cerrar/fusionar la primera PR S1. Mientras tanto esta PR es Draft y S1 permanece **abierto**. El despliegue coordinado no puede afirmar mitigación completa de HMAC arbitrario hasta cerrar ambas vías.

**Recuperación:** entrar en `test-results/s1-writer`, consultar `git status`, `git log -1`, `gh pr list`, leer este archivo y `CODEX-AUTONOMIA-ESTADO.md`. El stack local S1 usa 56321/56322, se selecciona mediante `SUPABASE_CLI='npx --yes supabase@2.118.0 --workdir test-results/s1-stack'` y `RUBIK_TEST_S1_STACK=1`; el escritor exige `RUBIK_AUDIT_DATABASE_URL` de ese mismo stack con credencial ficticia local. No usar el stack compartido ni datos alojados.

## Estado GitHub y CI

PR Draft [#104](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/104), OPEN/MERGEABLE al HEAD `382d8a27c9a47871d5cba8b375486b71e791f514`, base `main@520e4119bafe8a9ce4b2293faad2e54b8e6d81d8` al 15/10/2026 15:27 UTC. Los tres checks de Actions aparecen FAILURE pero el run `38760330927` tiene `steps: []`: la anotación de GitHub indica literalmente que los jobs no arrancaron por bloqueo de facturación de la cuenta. No son tests ejecutados y fallidos. Vercel Preview SUCCESS solo acredita build/deploy de Preview, no aislamiento de datos ni seguridad alojada. No se hizo ninguna modificación en Vercel.

**Alternativa temporal a Actions:** `npm run verify:s1-local` ejecuta en serie `verify`, integración, pgTAP y Playwright; antes verifica que API y DB sean el stack S1 de 56321/56322 y copia solo los tests SQL al workdir aislado. Es manual, no un scheduler, y deja un JSON de resultados ignorado por Git. `node scripts/verify-s1-local.mjs --check` pasó; las cuatro suites se ejecutaron separadamente con los resultados anteriores, no mediante el wrapper completo. Para invocarlo hay que definir `SUPABASE_CLI` apuntando a `test-results/s1-stack`, `RUBIK_TEST_S1_STACK=1` y `RUBIK_AUDIT_DATABASE_URL` ficticia de 127.0.0.1:56322. No configurar credenciales alojadas en ese comando.
