# U03 · matriz alojada de Preview · 18/10/2026

## Reconciliación de #129 con main · 19/10/2026

- Inicio comprobado en #129 `74bbba7de6d3ca15c3ffda44ad4e17777d19354d`, base `main@b99893e8fbc59f265ce61f40dbdc2baab071f69a`; main `f39620e347756e980192aac8fe93b9a2e8db6376` integrado en merge `d62704a98f9ab487fdd898285dae4e39dbabf9c2`. Se resolvió el único conflicto documental en `docs/CODEX-AUTONOMIA-ESTADO.md`. Los seis cambios de main eran documentales e incluyen el gate #136.
- El gate define dos pasadas obligatorias H1/H2: ensayo ficticio alojado y aceptación de Sarah/U04. U03 esencial precede el ensayo; la exportación firmada/restauración no se habilitan en Preview para conveniencia. Ningún PASS parcial cierra H1/H2.
- Deployment B-4 exacto sigue READY según lectura Vercel: `dpl_6fqataMxfkGFSZJKVGk5xJe8snXq`, SHA de aplicación `06c2b4270fc74d88ef3e3560bb5d07d8aeb948e2`, host `plataforma-rubik-seo-bdzqlpg6z-juanma-espinosas-projects.vercel.app`, proyecto `prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook`. No se sustituye por el deployment Production más reciente ni por un alias. El merge contiene documentos; se revalidará el pin y código en el HEAD final.
- Supabase Preview verificada en lectura con la cuenta RUBIK SOTA: `rhnnplewqsekrnaousyl`, estado `ACTIVE_HEALTHY`, identidad `preview`/ref exacto, 27 migraciones hasta `20261015210000`, centinela presente; escritor `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`. Conteos al 19/10: Auth 0, organizations 0, projects 0, organization_members 0, project_members 0, audit_events 0, outbox total 0. No se crearon ni borraron fixtures. El registro público cerrado y las banderas de proveedores no se revalidaron en esta lectura.
- Preflight por componentes: **PASS**. Enlace local al proyecto/equipo correctos; `vercel env run` entregó OIDC al hijo (PRESENTE, valor no mostrado); anónimo 302 a Vercel SSO; petición OIDC al mismo host 200; `/api/salud` devolvió `auth=preview-isolated`, ref `rhnnplewqsekrnaousyl`. La función `inspectPinnedDeployment()` vía la CLI real confirmó deployment/proyecto/host/SHA/rama/READY exactos. No se persiste el token. La invocación directa de la CLI consumió `--preflight`, no abrió Chromium; se corrigió la invocación de `.cmd` del wrapper Windows. Aún no se ejecutó el wrapper completo ni el navegador alojado.
- Árbol funcional verificado antes del checkpoint documental: `npm run test:u03-b4` 13/13 PASS con Chromium Playwright `1.63.0`; tras el ajuste de invocación Windows, se repitió: 13/13 PASS. `npm run verify` PASS: core pin, secret scan 690 archivos, lint, typecheck, Vitest 71 archivos (607 PASS/1 SKIP), build. `inspectPinnedDeployment()` confirmó el pin exacto a través de Vercel CLI. `git diff --check` PASS antes del commit. El SHA funcional fijado/desplegado sigue siendo `06c2b4270fc74d88ef3e3560bb5d07d8aeb948e2`; la prueba local no equivale a B-4 alojado. Suite alojada y fixtures **NO EJECUTADOS**. U03 permanece parcial/bloqueado; H1/H2 siguen abiertos.
- Acción de Juanma: confirmar localmente que signup sigue cerrado y preparar credenciales/rutas de las cuentas ficticias autorizadas A1/A2/B1 para el wrapper de PowerShell. No enviar secretos por chat. Supabase lectura: ACTIVE_HEALTHY, 27 migraciones hasta `20261015210000`, identidad Preview correcta, escritor no privilegiado y conteos Auth/org/proyectos/membresías/auditoría/outbox a cero al 19/10. Sin escrituras.

## B-4 · arnés local · 18/10/2026

HEAD de #129 comprobado al iniciar este trabajo: `b68244f752bbfc38993c5b0d8b8f95b085a73872`; base efectiva `main@b99893e8fbc59f265ce61f40dbdc2baab071f69a`. `b99893e` es el checkpoint documental posterior a `42e8bcf`; no hay discrepancia de base. #129 sigue OPEN/Draft. El código funcional del arnés se publicó en `06c2b4270fc74d88ef3e3560bb5d07d8aeb948e2`; el commit posterior de pin/documentación conserva el mismo código de aplicación.

El deployment B-4 observado en Vercel está READY: `dpl_6fqataMxfkGFSZJKVGk5xJe8snXq`, SHA `06c2b4270fc74d88ef3e3560bb5d07d8aeb948e2`, host `plataforma-rubik-seo-bdzqlpg6z-juanma-espinosas-projects.vercel.app`, proyecto `prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook`. SSO/Deployment Protection está habilitado (`all_except_custom_domains`). La metadata no expone Trusted Sources ni permite afirmar que esté configurado; la aceptación de OIDC solo quedaría demostrada por `/api/salud` protegido con el token válido.

Se añadió un arnés separado de la E2E local que inspecciona el ID de deployment por la API Vercel y exige ID, proyecto, host, SHA, rama y estado exactos antes de navegador. El pin está explícito en `scripts/u03-preview-b4-runner.mjs`. El preflight compara la identidad Preview (`auth=preview-isolated`, ref exacto) antes de lanzar Chromium. El navegador envía OIDC únicamente desde un interceptor del request al origen exacto. Playwright `route.fetch({ maxRedirects: 0 })` permite inspeccionar el `Location`: redirects HTTP fuera del origen se sustituyen por 502; navegaciones externas directas se bloquean. Requests a Supabase y otros hosts siguen sin el encabezado. No hay `extraHTTPHeaders` global.

La prueba local descubrió y corrigió una fuga real del primer diseño: Chromium conservó el encabezado personalizado al seguir un 302 externo, y el callback de ruta no vio ese segundo request. El diseño actual evita que Chromium siga el redirect: obtiene el response sin seguir redirects y lo bloquea antes de entregarlo al navegador. Test de Chromium local fijado por Playwright `1.63.0`: **13/13 PASS**, incluyendo host permitido/parecido, alias y Production, SHA incorrecto, token ausente, OIDC rechazado antes de abrir navegador, redirect externo, encabezado en destino externo, errores/ledger sin token y ausencia de trazas/capturas. Comando: `npm run test:u03-b4`. Esto prueba el arnés con servidores locales; no es Playwright alojado.

En el mismo árbol: `npm run verify` **PASS** — core pin, secret scan (688 archivos), ESLint sin warnings, TypeScript, Vitest **607 PASS / 1 SKIP** y build Next.js PASS. `git diff --check` y parse de PowerShell PASS. `npm ci` no se necesitó; dependencias fijadas existentes (`@playwright/test`/Chromium 1.63.0). GitHub Actions sigue sin ejecutar jobs por facturación; no se cuenta como CI verde.

El wrapper de propietario es `scripts/u03-preview-b4-owner.ps1`; comando único previsto desde la raíz del worktree: `vercel env run -e preview -- powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/u03-preview-b4-owner.ps1`. Comprueba vínculo de proyecto/branch, inspecciona deployment y `/api/salud` (anónimo protegido + OIDC autorizado), y solo entonces pide credenciales ficticias existentes y rutas. No pide claves Supabase, bypass, ni crea fixtures. Limpia del entorno hijo las variables Preview ajenas antes de iniciar Node; el token permanece en memoria y no se registra.

**Bloqueo concreto del comando:** la documentación oficial describe `vercel env run` como inyección de variables de entorno de proyecto en el comando hijo; no dice que emita `VERCEL_OIDC_TOKEN`. Describe que `vercel env pull` obtiene el token OIDC local, pero lo escribe a un archivo. No se usará ese archivo porque el requisito exige token solo en memoria. El wrapper aborta con `VERCEL_ENV_RUN_DID_NOT_PROVIDE_OIDC_TOKEN` si no está presente, sin fallback ni bypass. Este entorno tampoco tiene CLI ni vínculo local. Trusted Sources no se confirmó. La suite alojada **NO EJECUTADA**.

El último conteo aportado por el propietario fue cero usuarios, organizaciones y proyectos tras la limpieza de la matriz previa; no se recrearon. Por ello no se verificaron cuentas/proyectos A1/A2/B1 en esta tarea. El wrapper solo acepta las cuentas ficticias ya custodiadas que ingrese el propietario; la cuenta opcional con membresía retirada solo prueba denegación posterior y no demuestra retirada en vivo con JWT aún válido. Esa revocación sigue pendiente porque no se autoriza modificar membresías ni habilitar escritor. Escritor, firmas, proveedores y demás filas de outbox no se tocaron.

Destino único: `rhnnplewqsekrnaousyl`. PR #129, rama `codex/u02-preview-isolation-20261017`. Deployment fijado: `dpl_6fqataMxfkGFSZJKVGk5xJe8snXq`, SHA desplegado `06c2b4270fc74d88ef3e3560bb5d07d8aeb948e2`, host `plataforma-rubik-seo-bdzqlpg6z-juanma-espinosas-projects.vercel.app`, READY. No usar otro despliegue por alias implícito.

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

### Acceso protegido investigado · estado histórico, actualizado arriba

Vercel confirmó que el despliegue exacto sigue READY en el SHA antiguo `ac5a5ff`; esto no prueba el flujo de navegador de la cabeza de #129. En este entorno no hay Vercel CLI, `.vercel/project.json` ni `VERCEL_OIDC_TOKEN` en el proceso. El arnés actual (`scripts/u03-preview-preflight.mjs`) solo consume `U03_VERCEL_BYPASS`; no implementa el encabezado OIDC de navegador ni una suite Playwright alojada dedicada.

La recomendación anterior sobre `vercel env run` como fuente de OIDC quedó corregida por la documentación vigente. Consultar el bloqueo y el wrapper en la actualización B-4 superior. El bypass de automatización sigue excluido.

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
