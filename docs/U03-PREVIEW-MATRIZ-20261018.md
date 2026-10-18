# U03 · matriz alojada de Preview · 18/10/2026

Destino único: `rhnnplewqsekrnaousyl`. PR #129, rama `codex/u02-preview-isolation-20261017`. Despliegue seleccionado `dpl_FBKLAT2rYQeHVEs735eNhPR6RnQt`, SHA `ac5a5ff6d92f1ebd5304ad7fea9b91a8fa617138`, host `plataforma-rubik-seo-7v2wmueoy-juanma-espinosas-projects.vercel.app`, READY. No usar otro despliegue por alias implícito.

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

Los ledgers del preflight y la submatriz están bajo `test-results/u03-hosted/` (ignorado por Git) y registran solo UTC, run ID, SHA, ref, nombre del control, estado, HTTP e IDs de fixtures propios. No registran claves, tokens, cookies ni correos. Todavía no existe ledger de fixtures porque ninguno se creó. La submatriz planifica cada alta antes de llamar a Admin/Auth o Data API, registra el ID devuelto y limpia exclusivamente esos IDs; cualquier alta ambigua detiene la aceptación y preserva el ledger. Los casos restantes de ocho actores, consentimiento y Playwright no se marcan PASS por esta primera submatriz.

**U03 global: BLOCKED.** Ningún caso alojado con JWT real ni Playwright ha pasado. H1/H2 permanecen bloqueados.
