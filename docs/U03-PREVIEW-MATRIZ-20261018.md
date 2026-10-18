# U03 · matriz alojada de Preview · 18/10/2026

Destino único: `rhnnplewqsekrnaousyl`. PR #129, rama `codex/u02-preview-isolation-20261017`. Despliegue protegido consultado en Vercel: `dpl_FBKLAT2rYQeHVEs735eNhPR6RnQt`, SHA desplegado `ac5a5ff6d92f1ebd5304ad7fea9b91a8fa617138`, host `plataforma-rubik-seo-7v2wmueoy-juanma-espinosas-projects.vercel.app`, READY. No usar otro despliegue por alias implícito.

## Actualización · matriz Data API parcial · 18/10/2026

El propietario ejecutó la matriz alojada con el código de #129 en `661f47d20bb90c95fac058aeec4bdc32cf07029f`. Reporta **12/12 controles RLS/RPC/JWT PASS** con tres identidades ficticias autenticadas (propietario de A, propietario de B y usuario sin membresía). El ledger citado es `test-results/u03-hosted/c21cbbf5-e50a-4bb3-9500-41c8ded8c51f.jsonl`; no está presente en los worktrees accesibles de esta sesión, por lo que sus resultados se registran como evidencia aportada por el propietario, sin reimprimirlo ni sus UUID.

Los 12 controles reportados corresponden a los casos del arnés en `scripts/u03-preview-data-api.mjs`:

1. Lectura positiva del propietario A sobre A1/A2.
2. Lectura positiva del propietario B sobre B1.
3. Lectura vacía para el actor sin membresía.
4. Lectura anónima vacía o denegada.
5. Lectura cruzada de A1 por B sin filas.
6. Lectura cruzada de la organización A por B sin filas.
7. Metadata de usuario falsificada seguida de refresh, sin acceso adicional.
8. INSERT directo de membresía denegado.
9. INSERT directo de `audit_events` denegado.
10. RPC de inventario de A1 por B denegada.
11. RPC de inventario de A1 por el propietario A aceptada.
12. Bearer inválido rechazado con HTTP 401.

Los tres usuarios iniciaron sesión con credenciales Auth ficticias y JWT emitidos por Preview. Esto acredita esos actores y sus rutas Data API concretas; no acredita roles de account-manager, analyst, viewer o client-approver. Tampoco acredita un JWT firmado falsamente, expirado, revocado o emitido por otro proyecto. El caso de metadata falsificada modifica metadata de un usuario legítimo y no equivale a falsificar la firma de un JWT.

El propietario informa que el arnés recuperó y limpió los IDs de tres proyectos, dos organizaciones y tres usuarios. Una consulta independiente de solo lectura al mismo ref confirmó después 27 migraciones N1 hasta `20261015210000` y cero usuarios, organizaciones, proyectos, membresías, eventos y recibos pendientes. No se volvió a ejecutar la matriz ni se consultaron otros proyectos. La lectura final es evidencia reportada por el propietario; el ledger no quedó disponible en este checkout para inspección independiente.

## Casos aún pendientes y alcance de B-4

| Grupo | Estado actual |
|---|---|
| Auth/RLS/RPC por roles | Faltan account-manager, analyst, viewer y client-approver; viewer de A2; casos completos de A1/A2/B1 y accesos sin membresía por cada superficie. |
| Membresía y sesión | Faltan altas ilegítimas mediante las rutas soportadas, consentimiento/invitación/retirada, revocación efectiva con JWT aún válido y JWT auténtico expirado/revocado. El bearer inválido ya tiene un control negativo. |
| Token de otro emisor | Sigue fuera de alcance usar Production o Funding OS. Un segundo emisor ficticio controlado requeriría una identidad Preview separada y autorización; no se marca PASS. |
| Eventos y escritor | Evento/HMAC falsificado, cadena, recibos/outbox, drenaje, exportación y restauración dependientes del escritor siguen `BLOCKED_BY_PREVIEW_WRITER`. El rol, pool, anillo y claves de firma permanecen vetados en Preview. |
| Navegador protegido B-4 | `BLOCKED`: el bypass/credencial de automatización no está disponible en esta sesión. El control B-4 cubre login/cookies, navegación A1/A2/B1, logout, revocación y escritorio/móvil. El handoff permite un cierre acotado solo a Data API/RPC si se excluye B-4; no existe una decisión de alcance que autorice omitirlo para declarar cerrado el U03 completo. |

### Acceso protegido investigado

Vercel confirmó que el despliegue exacto sigue READY en el SHA antiguo `ac5a5ff`; esto no prueba el flujo de navegador de la cabeza de #129. En este entorno no hay Vercel CLI, `.vercel/project.json` ni `VERCEL_OIDC_TOKEN` en el proceso. El arnés actual (`scripts/u03-preview-preflight.mjs`) solo consume `U03_VERCEL_BYPASS`; no implementa el encabezado OIDC de navegador ni una suite Playwright alojada dedicada.

La ruta preferida de Vercel para automatización local es un `VERCEL_OIDC_TOKEN` efímero proporcionado por la CLI vinculada al proyecto, enviado como `x-vercel-trusted-oidc-idp-token` únicamente al host de despliegue fijado. No requiere publicar el Preview ni crear un enlace permanente. Antes de usarla, Codex debe añadir y probar soporte explícito en el arnés y limitar el encabezado al host exacto. Después, el propietario puede ejecutar esa suite desde su PowerShell autenticado y vinculado al proyecto mediante `vercel env run -- ...`; el token permanece en el entorno del proceso y no se copia a chat, ledger o Git. No ejecutar ese paso hasta que el arnés acepte OIDC de forma acotada.

**Estado:** U03 Data API **PARTIAL_PASS (12/12 reportados por el propietario)**; U03 global **BLOCKED** por roles/rutas pendientes y por el B-4 aún no ejecutado dentro del alcance completo. La opción de cerrar solo Data API/RPC está descrita en el handoff, pero no se ha elegido como cierre del gate completo. H1 y H2 siguen bloqueados.

## Registro previo a la matriz

Los puntos siguientes describen el preflight y la preparación anteriores al run, no el estado posterior. La actualización de arriba los sustituye donde indiquen que no se había ejecutado ningún caso alojado.

## Precondiciones observadas

- 27 migraciones N1, de `20260928120000` a `20261015210000`, cotejadas con `list_migrations` y catálogo del ref exacto.
- `private.environment_identity` y `public.preview_environment_identity()` presentes; fila única `preview`/`rhnnplewqsekrnaousyl`.
- Antes de fixtures: 0 usuarios Auth, organizaciones, proyectos, membresías de proyecto, eventos de auditoría y filas de outbox.
- `rubik_audit_writer` existe pero tiene `NOLOGIN` y `NOBYPASSRLS`; el veto en el código Preview permanece. Ninguna clave de firma ni URL del escritor se activa.
- PowerShell llegó al host Supabase (`401` de Auth sin clave) y al host exacto Vercel (`302` de Vercel Authentication). Ninguna respuesta fue un bloqueo `CONNECT 403` del proxy.
- El propietario confirmó antes que el registro público estaba cerrado. **Falta una lectura actual independiente** de esa opción. `scripts/u03-preview-credential-entry.ps1` la comprueba con `/auth/v1/settings` antes de cualquier fixture, además del acceso Admin/Auth y, si se facilita, `/api/salud` protegido. Las claves se leen sin eco, quedan solo en memoria del proceso y no se guardan en el ledger. Si pasan las precondiciones Auth, ejecuta una primera submatriz Data API de tres JWT reales y limpia por IDs; el bypass ausente deja Playwright bloqueado sin impedir esa submatriz.

## Separación de casos

| Grupo | Casos alojados | Estado |
|---|---|---|
| Auth/Data API, sin escritor | Alta Admin de identidades ficticias A/B; login y JWT reales; anónimo, claims falsificadas, RLS A1/A2/B1, roles, tablas y RPC de solo lectura; INSERT directo denegado en membresías y `audit_events`; invitación/consentimiento/retirada y acceso con JWT aún válido; limpieza por IDs de usuario, organización y proyecto. | **BLOCKED por credenciales locales y registro cerrado aún no revalidado**. Son ejecutables con Auth/Data API una vez pasen esas precondiciones; no requieren activar el escritor. |
| Preview protegido con navegador | Login/cookies, rutas A1/A2/B1, salida, revocación, escritorio y móvil con Playwright. | **BLOCKED por bypass/sesión de Vercel aún no disponible**. La respuesta `302` solo acredita conectividad/protección. |
| Escritor SQL, firma y outbox | Evento firmado, cadena/HMAC, idempotencia, retirada con recibo y drenaje, exportación firmada y restauración que dependa de ese escritor. | **BLOCKED_BY_PREVIEW_WRITER**. No se activa el rol, el pool, el anillo ni claves de firma para U03. |
| Token auténtico de otro proyecto | JWT de otro emisor contra Preview y viceversa. | **BLOCKED**: el veto a Production/Funding OS impide usar esas identidades; un origen ficticio separado requeriría autorización y custodia propias. Las pruebas unitarias del rechazo de issuer son evidencia local, no caso alojado. |

Los ledgers del preflight y la submatriz se guardan bajo `test-results/u03-hosted/` (ignorado por Git) y registran solo UTC, run ID, SHA, ref, nombre del control, estado, HTTP e IDs de fixtures propios; no deben incluir claves, tokens, cookies ni correos. En el corte previo de esta sección aún no se había creado un ledger de fixtures; después, el propietario generó el run citado en la actualización superior, pero su JSONL no está disponible en este checkout. El arnés planifica cada alta antes de llamar a Admin/Auth o Data API, registra el ID devuelto y limpia exclusivamente esos IDs; cualquier alta ambigua detiene la aceptación y preserva el ledger. Los roles y casos restantes se enumeran arriba y no se marcan PASS.

**Estado previo al run (histórico):** U03 global estaba bloqueado antes de que el propietario ejecutara la submatriz. No usar esta línea como estado actual; consultar la actualización de arriba.
