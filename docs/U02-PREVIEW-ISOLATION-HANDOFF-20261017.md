# U02 Preview aislada · preparación verificable · 17/10/2026

## Continuidad B-4 · 19/10/2026

La rama #129 incorpora un wrapper de campaña: `scripts/u03-preview-b4-owner.ps1`. Con `vercel.cmd env run -e preview`, pide solo Admin/Auth y publishable key por prompts sin eco. Crea usuarios y ámbitos ficticios bajo un runId, ejecuta Data API y Playwright en el deployment fijado, limpia en `finally` y verifica inventario/outbox con SQL de solo lectura. No requiere cuentas, contraseñas o rutas precreadas. No usa Production, Funding OS, Sarah, proveedores, escritor ni migraciones.

Comando único desde la raíz del worktree: `vercel.cmd env run -e preview -- powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/u03-preview-b4-owner.ps1`. En Windows se debe invocar `vercel.cmd`: el shim `vercel` de PowerShell consumía/interpretaba `--` y no entregaba el comando. El `.cmd` real ya se probó con `node -v` y un comando PowerShell inocuo. Antes de escrituras exige rama/repositorio/enlace Vercel exactos, `VERCEL_OIDC_TOKEN`, deployment `dpl_6fqataMxfkGFSZJKVGk5xJe8snXq`, aplicación SHA `06c2b4270fc74d88ef3e3560bb5d07d8aeb948e2`, host/protección, signup cerrado, centinela/ref Preview, 27 migraciones N1, escritor bloqueado y cero inventario inicial. Falla el preflight: `BLOCKED_NO_WRITES`.

Campaña alojada de esta iteración: **pendiente/no ejecutada** hasta introducir las dos claves en terminal seguro. Las capturas requieren revisión manual antes de un PASS visual. Los artefactos locales ignorados quedan en `test-results/u03-hosted/<runId>/`. U03, H1 y H2 siguen abiertos.

Checkpoint publicado: SHA funcional `af54488bb74f32078ad5765ba086ee1472b00347`; HEAD documental `61116fc2dfa180fdbbf9bf66e94378b644527ae8`. `npm run test:u03-b4` 20/20 PASS con Chromium Playwright 1.63.0/Chrome for Testing 153.0.8010.12; `npm run verify` 607 PASS/1 SKIP, secret scan 692 archivos, lint sin avisos y build PASS. El único intento de campaña llegó al prompt Admin/Auth, pero no se pudo mostrar su terminal interactivo; se canceló antes de introducir una clave. Una consulta SQL read-only posterior confirmó cero Auth, organizaciones, proyectos, membresías, auditoría y outbox. El preflight alojado no llegó a ejecutarse.

Preparación del comando del propietario: el checkout `C:\Users\temp123\Documents\ChatGPT\rubik-u02-preview` estaba limpio, pero atrasado en `661f47d` y sin vínculo Vercel. Se adelantó por fast-forward y se añadió el archivo local ignorado `.vercel/project.json`, fijado al proyecto/equipo Rubik correctos. Tras el checkpoint final, verifica que esa carpeta quede en el HEAD requerido que se indique en la entrega. Ejecutar desde esa carpeta en el PowerShell visible del mismo usuario Windows:

```powershell
vercel.cmd env run -e preview -- powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/u03-preview-b4-owner.ps1
```

El propietario debe introducir solo las claves Admin/Auth y publishable de `rhnnplewqsekrnaousyl` en los dos prompts sin eco y compartir luego la salida sanitizada. No mandar claves por chat. Esperar esa salida antes de atribuir resultados alojados.

## Actualización de estado · reconciliación de #129 · 19/10/2026

- #129 comenzó en `74bbba7de6d3ca15c3ffda44ad4e17777d19354d` sobre `main@b99893e8fbc59f265ce61f40dbdc2baab071f69a`; main `f39620e347756e980192aac8fe93b9a2e8db6376` quedó integrado en merge `d62704a98f9ab487fdd898285dae4e39dbabf9c2`. El conflicto documental en continuidad está resuelto y el gate H1/H2 de #136 preservado.
- Deployment B-4 exacto sigue READY: `dpl_6fqataMxfkGFSZJKVGk5xJe8snXq`, SHA aplicación `06c2b4270fc74d88ef3e3560bb5d07d8aeb948e2`, host `plataforma-rubik-seo-bdzqlpg6z-juanma-espinosas-projects.vercel.app`, proyecto `prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook`. Cambios de main son documentales, por lo que el pin funcional no se infiere a otro deployment.
- Lectura de solo lectura en Supabase `rhnnplewqsekrnaousyl`: ACTIVE_HEALTHY, centinela `preview` con ref exacto, 27 migraciones N1 hasta `20261015210000`, rol escritor sin LOGIN/SUPERUSER/BYPASSRLS; conteos de Auth, organizaciones, proyectos, membresías, audit_events y outbox en cero al 19/10. Sin altas ni borrados. Registro público cerrado y flags proveedor no revalidados.
- Vercel CLI 54.6.1 enlazada localmente al proyecto/equipo exactos. `vercel env run` entregó OIDC al proceso hijo (**PRESENTE**, valor no mostrado ni persistido); host/deployment fijados: anónimo 302 a Vercel SSO, OIDC 200, `/api/salud` devuelve `auth=preview-isolated` y ref Preview correcto. La función de inspección del runner confirmó el deployment exacto vía CLI; se corrigió su invocación de `vercel.cmd` en Windows. Un intento directo de `--preflight` desde Vercel CLI fue interpretado como opción CLI y no abrió navegador. B-4 alojado **NO EJECUTADO**; fixtures **NO EJECUTADOS**. Falta confirmar estado actual de signup y obtener localmente cuentas ficticias autorizadas/rutas A1/A2/B1.
- Gate integral H1/H2 de #136: dos pasadas obligatorias, ensayo ficticio alojado y aceptación U04/Sarah. U03 esencial va antes; no se reejecuta la matriz Data API previa 12/12 salvo que el cambio afecte esos controles. No activar escritor/firma en Preview para conseguir una pasada continua.

## Continuación B-4 · 18/10/2026 · arnés local preparado, ejecución alojada pendiente

- #129 OPEN/Draft, rama `codex/u02-preview-isolation-20261017`. HEAD publicado al iniciar: `b68244f752bbfc38993c5b0d8b8f95b085a73872`; base `main@b99893e8fbc59f265ce61f40dbdc2baab071f69a`. `b99893e` es el checkpoint documental posterior a `42e8bcf`, no una discrepancia.
- Vercel read-only actualizado: deployment `dpl_6fqataMxfkGFSZJKVGk5xJe8snXq`, READY, SHA de aplicación `06c2b4270fc74d88ef3e3560bb5d07d8aeb948e2`, host exacto `plataforma-rubik-seo-bdzqlpg6z-juanma-espinosas-projects.vercel.app`, proyecto `prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook`; SSO habilitado. Trusted Sources no está expuesto en metadata y queda sin verificar. El pin B-4 coincide exactamente.
- Arnés B-4 implementado en `scripts/u03-preview-b4-runner.mjs`, pruebas `scripts/u03-preview-b4.test.mjs`, comando de propietario `scripts/u03-preview-b4-owner.ps1`. Pin inmutable de deployment/host/SHA/proyecto/rama; inspección API y salud protegida se validan antes de Chromium. Token OIDC no se adjunta globalmente: Playwright hace fetch del origen permitido con redirects desactivados, bloquea Location externo antes de que Chromium pueda reenviar el encabezado, y pasa requests externos sin token.
- **13/13 pruebas locales PASS** en Chromium Playwright 1.63.0; incluyen redirect externo y prueba de no filtración. Ninguna conexión alojada usada por la suite; no se abrieron navegadores contra Preview y no se crearon fixtures.
- Bloqueo del único comando propuesto: docs oficiales `vercel env run` no acreditan emisión de `VERCEL_OIDC_TOKEN`; describen inyección de variables de proyecto. `vercel env pull` sí obtiene token local, pero lo escribe a archivo, incompatible con el requisito de memoria únicamente. El wrapper aborta sin token (`VERCEL_ENV_RUN_DID_NOT_PROVIDE_OIDC_TOKEN`). No se usa bypass. Esta sesión carece de CLI/vínculo local.
- No hay cuentas/proyectos ficticios presentes según último conteo aportado por el propietario (cero tras limpieza); no se recrearon. Las cuentas/rutas deben ser existentes, ficticias y custodiadas antes de ejecutar. El usuario opcional ya revocado solo acredita denegación posterior; revocación efectiva con JWT aún válido sigue pendiente y no se realiza porque requiere modificar membresía/escritor.
- **Estados:** B-4 local harness PASS; B-4 alojado NOT RUN / BLOCKED porque `vercel env run` no acredita emisión de OIDC en memoria, Trusted Sources no está verificado y no hay cuentas/rutas ficticias autorizadas disponibles. El deployment sí está READY y coincide con el pin, por lo que ya no bloquea. U03 global BLOCKED; H1 y H2 BLOCKED. Sin escrituras alojadas, Production, Funding OS, Sarah, proveedores ni escritor SQL.

Fuentes Vercel consultadas: [CLI env](https://vercel.com/docs/cli/env), [OIDC](https://vercel.com/docs/oidc), [deployment protection](https://vercel.com/docs/deployment-protection). Playwright: [Route.fetch y maxRedirects=0](https://playwright.dev/docs/api/class-route).

## Corte U03 · 18/10/2026 · registro anterior al arnés B-4

La API viva de GitHub confirmó #129 OPEN/Draft, HEAD `661f47d20bb90c95fac058aeec4bdc32cf07029f` y base `main@b99893e8fbc59f265ce61f40dbdc2baab071f69a`. El `origin/main` local estaba atrasado; no se usó como autoridad. La cita `42e8bcf` del Roadmap es un checkpoint documental anterior a `b99893e`; no hay discrepancia de base.

El propietario reporta que ejecutó la matriz Data API en `661f47d`: **12 controles RLS/RPC/JWT PASS** para owner A, owner B y usuario sin membresía; limpieza de tres proyectos, dos organizaciones y tres usuarios; verificación de solo lectura final sin esos datos y con 27 migraciones N1. El ledger `test-results/u03-hosted/c21cbbf5-e50a-4bb3-9500-41c8ded8c51f.jsonl` fue citado, pero no está presente en los worktrees accesibles. Se conserva como evidencia aportada por el propietario, sin reproducir UUID. El detalle está en [matriz U03](U03-PREVIEW-MATRIZ-20261018.md); esto sustituye las notas históricas que decían U03 no iniciado.

**U03 sigue parcial.** Faltan account-manager, analyst, viewer, client-approver, viewer A2, invitación/consentimiento/retirada y JWT caducado/revocado o de otro emisor. Escritor, firma, HMAC, outbox, exportación y recuperación permanecen vetados en Preview. B-4 de navegador está pendiente. El protocolo contempla un cierre limitado a Data API/RPC si se excluye B-4, pero el propietario no ha elegido ese alcance para declarar U03 completo. H1/H2 siguen bloqueados por exportación/restauración y operación.

Vercel confirmó READY para el deployment protegido fijado por B-4: `dpl_6fqataMxfkGFSZJKVGk5xJe8snXq`, SHA de aplicación `06c2b4270fc74d88ef3e3560bb5d07d8aeb948e2`, host `plataforma-rubik-seo-bdzqlpg6z-juanma-espinosas-projects.vercel.app`. El commit de configuración/documentación que registra este pin no cambia el código de aplicación. La suite alojada no se ejecutó.

En `661f47d` se ejecutaron localmente los tests U03 dirigidos (**16/16 PASS**) y `npm run verify` (**607 PASS / 1 SKIP**, pin/secrets/lint/tipos/build PASS). `git diff --check` PASS. No se ejecutó Playwright local porque no cambió ese flujo; tampoco se repitieron pruebas alojadas ni se crearon fixtures. GitHub Actions no ejecutó jobs por el bloqueo de facturación.

## Continuación U03 · 18/10/2026 15:02 UTC · sin fixtures

La copia local se avanzó linealmente de `47ba939` al HEAD remoto `ac5a5ff` de #129, sin trabajo ajeno sobrescrito. #129 continúa OPEN/Draft; `main@b99893e`. El despliegue seleccionado para ese HEAD es `dpl_FBKLAT2rYQeHVEs735eNhPR6RnQt`, READY, host `plataforma-rubik-seo-7v2wmueoy-juanma-espinosas-projects.vercel.app`. PowerShell recibió `401` de Auth Supabase sin clave y `302` de Vercel Authentication en ese host: conectividad acreditada, sin `CONNECT 403` del proxy. El endpoint protegido no se leyó sin bypass.

El conector autorizado del ref Preview listó 27 migraciones N1 hasta `20261015210000`; catálogo: centinela y RPC presentes, fila `preview`/`rhnnplewqsekrnaousyl`, y conteos 0 para Auth, organizaciones, proyectos, membresías, auditoría y outbox. Escritor `NOLOGIN`/`NOBYPASSRLS`. El registro público cerrado sigue basado en la confirmación previa del propietario; la lectura actual queda en el preflight con clave publicable. Se preparó una entrada PowerShell sin eco ni persistencia de claves y un ledger de preflight sin secretos en `scripts/u03-preview-credential-entry.ps1`; no se introdujeron claves en chat ni se crearon fixtures. La separación de casos y bloqueos está en [U03-PREVIEW-MATRIZ-20261018.md](U03-PREVIEW-MATRIZ-20261018.md). U03 global sigue **BLOCKED**.

## Revalidación U03 · 2026-10-18T10:42:17Z · bloqueado antes de fixtures

La rama de #129 está en `35f54cfdc8c702f94b2e71973ea370b02c144cea`, OPEN/Draft, sobre `main@b99893e8fbc59f265ce61f40dbdc2baab071f69a`; el árbol Windows está limpio. El despliegue Preview funcional documentado sigue siendo `e4ca611`/`dpl_Hgc4kffcgixek8KNRiX4jS1N1DGx`, con `/api/salud` previamente acreditado como `auth=preview-isolated` y ref `rhnnplewqsekrnaousyl`. La inspección Vercel read-only de esta sesión encontró despliegues Preview más recientes, pero el endpoint protegido no pudo revalidarse sin bypass; no se ha usado ningún bypass ni se ha cambiado protección.

Lectura actual, solo catálogo/conteos, mediante el conector autorizado de `rhnnplewqsekrnaousyl`: `migration_count=27`, máximo `20261015210000`, centinela `private.environment_identity` presente, función `public.preview_environment_identity()` presente, `rubik_audit_writer` y `private.audit_outbox` presentes, `auth.users=0`, `organizations=0`, `projects=0`, `audit_outbox=0`. `list_migrations` devuelve las 27 versiones N1 en orden. Esto acredita esquema y ausencia de fixtures en el instante de lectura, no una matriz de actores ni registro Auth cerrado.

La sesión Windows no tiene variables de entorno ni credenciales locales identificables para una clave Admin/Auth limitada a Preview o para Vercel Protection Bypass. El Credential Manager solo muestra entradas genéricas, sin exponer valores; no se intentó extraerlas. El registro público cerrado fue confirmado previamente por el propietario, pero no se ha reabierto. U03 queda **BLOCKED antes de crear fixtures**: no se puede crear/borrar Auth Admin, obtener JWT reales ni ejecutar Playwright protegido de forma legítima. No se usó `service_role` en navegador, no se insertó en `auth.users`, no se consultó Production/Funding OS y no se crearon residuos.

Acción única necesaria para reanudar: cargar en esta máquina, mediante el gestor seguro local y sin pegar valores en chat, una credencial Admin/Auth exclusiva de `rhnnplewqsekrnaousyl` (o crear manualmente los alias ficticios documentados y entregar sus secretos solo al arnés local) y, si se exige la revisión visual, el secreto de Vercel Protection Bypass para automatización. Después comprobar presencia booleana, ejecutar U03 con ledger y limpiar por IDs. Si no se proporciona bypass, los casos Playwright siguen BLOCKED aunque la matriz Data API/RPC pueda ejecutarse.

## U03 · intento 18/10/2026 10:25 UTC (Claude) · **BLOQUEADO antes de crear fixtures**

**Estado de partida comprobado:**
- #129 OPEN/Draft, HEAD `3ec989b`; `main@b99893e`.
- SHA funcional desplegado: `e4ca611` (`dpl_Hgc4kffcgixek8KNRiX4jS1N1DGx`, READY, Preview). El último despliegue Preview de la rama (`dpl_E5tG8RW3XZLcQBgCkKoS7Db22PDm`) corresponde al commit documental `3ec989b`, con el mismo código.

**Precomprobaciones (PASS):**
- `/api/salud` por la Vercel Authentication del conector: 200, `auth: "preview-isolated"`, `supabaseProjectRef: "rhnnplewqsekrnaousyl"`. Ninguna referencia a Production ni a Funding OS.
- `ssoProtection` sigue siendo `all_except_custom_domains`.
- El ámbito Preview conserva solo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: sin escritor ni proveedores.
- **Registro público de Preview desactivado** («Allow new users to sign up» apagado), según confirmación del propietario. No se reactivó ni se probó a abrir.

**Bloqueos (U03 = BLOCKED; ningún caso se marca PASS):**

| # | Bloqueo | Evidencia | Qué necesita U03 |
|---|---|---|---|
| B-1 | Red del entorno Claude | `curl` a `https://rhnnplewqsekrnaousyl.supabase.co/auth/v1/health` y al despliegue `*.vercel.app` termina en `CONNECT tunnel failed, response 403` (proxy de egress) | Iniciar sesión con las cuentas ficticias, llamar a Data API y RPC con JWT reales y ejecutar Playwright |
| B-2 | No hay una vía administrativa segura para dar de alta y retirar usuarios | El conector Supabase de esta sesión responde `You do not have permission` para `rhnnplewqsekrnaousyl`. No hay clave administrativa de Preview en el entorno. El registro público está cerrado. Insertar en `auth.users` está prohibido | Alta y baja de los usuarios ficticios A/B |
| B-3 | Sin lectura de verificación de Preview desde esta sesión | El mismo permiso denegado impide revisar las 27 migraciones, los usuarios Auth y los recibos antes y después | Acreditar «sin cambios inesperados» y la limpieza a cero |
| B-4 | Navegador protegido | Playwright no puede pasar Vercel Authentication sin sesión de Vercel. Se excluyen los enlaces públicos de bypass | Sesión, navegación y rechazo tras revocación en el navegador |

**Nada escrito en Preview:** 0 usuarios, 0 organizaciones, 0 proyectos y 0 recibos creados por este intento. Ledger vacío; no hay limpieza que hacer. No se usó Production, Funding OS, Sarah ni proveedores.

**Acción manual mínima del propietario para desbloquear:**
1. **Red (B-1):** en *Network access* del entorno, añadir a *Allowed domains* `rhnnplewqsekrnaousyl.supabase.co` y el host del despliegue Preview (o `*.vercel.app`). Pasos: https://code.claude.com/docs/en/cloud-environments#network-access
2. **Usuarios (B-2), una de dos:**
   - (a) Guardar la clave secreta **solo de Preview** como secreto del entorno, nunca en chat ni en Git, autorizando expresamente el alta y la baja por la API de administración de Auth y solo de usuarios del namespace del run.
   - (b) Crear a mano en el Dashboard de `rubik-preview` (Authentication → Add user, confirmado) los 8 usuarios ficticios: ownerA, ownerB, account-manager, analyst, viewer, client-approver, a2-viewer y sin-membresía. Guardar sus contraseñas como secretos del entorno y borrarlos al terminar.
3. **Verificación (B-3):** dar al conector Supabase de esta sesión acceso de solo lectura al ref, o que el propietario repita la consulta de solo lectura antes y después. Con (a), los recuentos de Auth se pueden leer por la API de administración.
4. **Navegador (B-4):** decidir si se permite un *Protection Bypass for Automation* guardado como secreto del entorno (no es un enlace público). Si no, las pruebas de navegador quedan BLOCKED y U03 se cierra solo con Data API y RPC.

**Matriz U03 preparada (sin ejecutar en Preview).** Corresponde a las suites locales ya existentes:
- `isolation-matrix`: anónimo; propietarios; account-manager, analyst, viewer y client-approver de A1; viewer de A2; sin membresía; RPC expuestas; A1/A2/B1 cruzados; metadata falsificada; bearer falsificado o caducado; GraphQL; esquema privado.
- `membership-consent`: altas ilegítimas; consentimiento; retirada.
- `s1-writer-negatives`: actor falsificado; JWT aún válido tras la retirada.
- `tenancy`.

Para Preview hace falta ejecutarlas con el ref fijo `rhnnplewqsekrnaousyl` y guardas que rechacen `yvdgmklgwlshizzgefpv` y `jlrppmpopaodpxtqtwmn`. Quedan fuera los casos que usan `docker exec`/psql locales, el escritor o el token caducado firmado localmente. El rechazo de un JWT de otro proyecto necesita un token auténtico de un proyecto ajeno no sensible, no de Production.

**H1/H2:** siguen abiertos. U03 no sustituye la exportación HTTP, la restauración ficticia ni las obligaciones comerciales y operativas.

## Corte Preview desplegada · 18/10/2026 (Claude)

**Base:** HEAD inicial de #129 `47ba939`, comprobado en remoto antes de cambiar nada; `main@b99893e`, ya integrado en la rama. **SHA funcional y desplegado:** `e4ca611e88b67570166c3e3a6a79a0aeb2bd5c93`.

**Código:**
- El ref aprobado ya era `rhnnplewqsekrnaousyl`; se audita y se mantiene.
- `previewIdentityMatches` acepta solo `https://rhnnplewqsekrnaousyl.supabase.co`, con origen exacto. Rechaza el ref de Production aunque se pase como aprobado, y cualquier otro ref.
- El proxy, el cliente SSR, `requestAuthMode` y `currentUser` exigen la lectura real de `public.preview_environment_identity()` con la clave publicable, con exactamente una fila `preview`/`rhnnplewqsekrnaousyl`. Además, el emisor del JWT debe ser `https://rhnnplewqsekrnaousyl.supabase.co/auth/v1`.
- **Nuevo en este corte:**
  - `readOpenSeoConfig` y `readOpenSeoMcpConfig` devuelven no disponible en `VERCEL_ENV=preview`. OpenSEO y Google quedan apagados aunque Preview herede variables, también con la identidad aprobada.
  - El escritor SQL sigue sin pool en Preview con la identidad aprobada (prueba añadida).

**Pruebas locales en `e4ca611`:**
- `npm run verify`: 607 PASS, 1 SKIP (prueba legacy preexistente); build limpio sin caché, lint, tipos y secretos PASS.
- Suites dirigidas de identidad (`preview-approved-identity`, `preview-identity`, `audit-writer-preview`, `preview-providers-off`, `preview-session-boundary`, `preview-fail-closed`, `preview-data-paths`): **39/39 PASS**. Cubren:
  - ref aprobado: sesión abierta solo con el centinela exacto; fetch solo a la RPC con `apikey` publicable;
  - JWT emitido por Production: no es usuario;
  - centinela ausente (PostgREST 404 `PGRST202`): todo cerrado;
  - errores de lectura (500, 401, JSON inválido, red, timeout) y respuestas inesperadas: todo cerrado;
  - ref de Production y refs parecidos (`…ousym`, `…ousy`, `…ousyl1`, `x…`, `…ous-l`): cerrados **sin ninguna petición de red**;
  - clave secreta en la variable pública: rechazada.
- **Comprobación de mutación:** quitar el control del centinela en el proxy hace fallar 3 pruebas; quitar el bloqueo de OpenSEO hace fallar 1. Restaurados.

**Vercel:**
- Despliegue Git automático de la rama de #129: `dpl_Hgc4kffcgixek8KNRiX4jS1N1DGx` (`plataforma-rubik-seo-pfk2ibcs5-juanma-espinosas-projects.vercel.app`), READY, `target` Preview, `githubCommitSha=e4ca611`. No se promocionó a Production.
- Protección: `ssoProtection.deploymentType=all_except_custom_domains` (Vercel Authentication) sigue activa. Desde este contenedor la política de red no permite `vercel.app`, así que el acceso anónimo no se pudo comprobar aquí; la lectura se hizo con el enlace temporal autenticado de Vercel.
- Variables en el ámbito Preview: **solo** `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Sensitive, comentario U02). Sin escritor, OpenSEO ni claves de firma en Preview. No se leyeron valores.

**`/api/salud` del despliegue:** HTTP 200, `auth: "preview-isolated"`, `persistence: "supabase"`, `supabaseProjectRef: "rhnnplewqsekrnaousyl"`, Core `2aaf127`. Ninguna referencia a `yvdgmklgwlshizzgefpv` ni a `jlrppmpopaodpxtqtwmn`.
- `preview-isolated` solo se concede si el servidor leyó por la Data API real de Preview, con su clave publicable, exactamente `[{"environment":"preview","project_ref":"rhnnplewqsekrnaousyl"}]`.
- El ref publicado sale de la URL configurada; si apuntara a Production o a un ref parecido, la configuración quedaría bloqueada y el campo sería `null`.
- **Límite:** este contenedor no alcanza `*.supabase.co`, así que la llamada a la Data API no se repitió desde aquí. La evidencia es la del servidor desplegado, sin exponer la clave. No se usó service-role ni SQL.

**Navegación:** `/panel` sin sesión responde con `/acceso` (`x-matched-path: /acceso`), con el aviso «Acceso con Supabase Auth de Preview aislada». No se crearon usuarios ni fixtures; U03 no se ejecutó.

**Rechazo de Production y centinela ausente en el entorno desplegado:** probarlos ahí exigiría cambiar variables Preview o el SQL del centinela, y esta tarea lo excluye. Quedan acreditados por las pruebas locales anteriores sobre el mismo SHA, no por el despliegue.

**Riesgo antes de U03 (resuelto el 18/10/2026 por el propietario: registro público de Preview desactivado):** con la identidad acreditada, el formulario de **registro público** de Preview estaba activo. Cualquier persona que pase la protección de Vercel podría crear cuentas en el Auth de Preview. Antes de U03 hay que cerrar el registro público en el Auth de Preview (configuración del propietario) o confirmar que Vercel Authentication basta. No se cambió ninguna configuración.

**Más límites:**
- Cada petición en Preview hace varias lecturas del centinela (proxy, cliente y modo), con un timeout de 3 s. Si fallan, la sesión se cierra (fail-closed). El coste de latencia queda pendiente de medir.
- No se aplicó SQL ni se ejecutaron migraciones. Production, Sarah, Google/OpenSEO y Funding OS no se tocaron.
- GitHub Actions no arranca jobs por facturación.

**Siguiente gate:** decidir el registro público de Preview; después, U03 con los alias A/B del propietario y JWT reales cruzados (Preview frente a Production).

## Corte de acceso CLI · 18/10/2026 08:35 UTC

Rama `codex/u02-preview-isolation-20261017`, HEAD inicial `c41ecea88318bb99ed5ee987ba1a0d2348fe3ff5`; `main@b99893e8fbc59f265ce61f40dbdc2baab071f69a`, #129 OPEN/Draft. CLI fijada: `supabase@2.118.0`. `projects list` y `whoami` muestran autenticación, pero el perfil actual ve Production y **no** `rhnnplewqsekrnaousyl`; no es una identidad operativa válida para el dry run de Preview. El conector autorizado «RUBIK SOTA — Supabase nuevo» confirmó de nuevo el ref exacto, historial `[]` y ausencia de `supabase_migrations.schema_migrations` y `public.organizations` por SQL solo lectura. Esa lectura no sustituye una conexión PostgreSQL autenticada para la CLI. No se consultaron Production ni Funding OS por SQL y **no se ejecutó `db push --dry-run`** con credenciales ambiguas.

El paquete regenerado desde este checkout cotejó las 27 N1 por nombre y SHA-256 contra Git `f5afc09833eee77ab605abda3a2ec9d4a1e80a92`; hash SHA-256 del `manifest.json`: `B6DE026068083AE1CAC06B3F6D86D16F67386E6DE043DE6DBDF6A63BC87DD169`. Comprobación independiente: 27 hashes de archivos coincidentes, cero migraciones extra, `[db.seed] enabled = false`, sin archivos seed/Vault/roles. Las seis migraciones posteriores quedan excluidas. La CLI 2.118.0 admite `migration list --db-url` y `db push --db-url --dry-run --skip-vault`; la URL deberá venir del Session pooler oficial de Preview, puerto 5432 y usuario con el ref Preview, custodiada fuera de Git/chat/logs. La documentación Supabase recomienda obtener host y usuario del botón Connect, sin construir el host por región.

| Versión esperada | Archivo canónico | SHA-256 (prefijo) | Observado por dry run |
|---|---|---|---|
+| `20260928120000` | `20260928120000_core_9_1_tenancy.sql` | `29c5d22eaf36…` | Sin dry run |
| `20260928150000` | `20260928150000_rls_auto_enable_privileges.sql` | `595da99feeab…` | Sin dry run |
| `20261007120000` | `20261007120000_core_9_2_audit_and_provenance.sql` | `d27393868d69…` | Sin dry run |
| `20261007150000` | `20261007150000_core_9_3_manual_imports.sql` | `aa4982c79dd8…` | Sin dry run |
| `20261009071705` | `20261009071705_openseo_project_jobs.sql` | `3d40d8d7b5c1…` | Sin dry run |
| `20261009120000` | `20261009120000_openseo_project_connections.sql` | `14318d446a67…` | Sin dry run |
| `20261009150000` | `20261009150000_openseo_job_connection.sql` | `e6af173c5439…` | Sin dry run |
| `20261009170000` | `20261009170000_openseo_active_job.sql` | `41be589e6769…` | Sin dry run |
| `20261009180000` | `20261009180000_webmaster_properties.sql` | `e460642848f2…` | Sin dry run |
| `20261010090000` | `20261010090000_provider_budget_ledger.sql` | `aab9235ac569…` | Sin dry run |
| `20261010150000` | `20261010150000_provider_spend_controls.sql` | `63864b4875ae…` | Sin dry run |
| `20261010160000` | `20261010160000_openseo_google_properties.sql` | `503608c046e7…` | Sin dry run |
| `20261012090000` | `20261012090000_project_invitations.sql` | `fdab674359fa…` | Sin dry run |
| `20261012100000` | `20261012100000_project_people_and_inventory.sql` | `5dda46774638…` | Sin dry run |
| `20261012110000` | `20261012110000_inventory_google_properties.sql` | `aaabc51f3264…` | Sin dry run |
| `20261012120000` | `20261012120000_google_captures.sql` | `f951be234cf7…` | Sin dry run |
| `20261012130000` | `20261012130000_google_recovery_state.sql` | `f8a8b3382f09…` | Sin dry run |
| `20261015115750` | `20261015115750_membership_consent.sql` | `dd8702856747…` | Sin dry run |
| `20261015145025` | `20261015145025_s1_trusted_audit_writer.sql` | `cb792e2b403b…` | Sin dry run |
| `20261015170000` | `20261015170000_s1_import_audit_outbox.sql` | `732016f4190e…` | Sin dry run |
| `20261015171000` | `20261015171000_s1_import_restore_boundary.sql` | `2748b42ab1e6…` | Sin dry run |
| `20261015172000` | `20261015172000_s1_import_receipt_identity.sql` | `a627c075704a…` | Sin dry run |
| `20261015180000` | `20261015180000_s1_trusted_provider_results.sql` | `e53857168b09…` | Sin dry run |
| `20261015183000` | `20261015183000_s1_provider_erase_outbox.sql` | `4a0e25d7fd26…` | Sin dry run |
| `20261015190000` | `20261015190000_s1_provider_rpc_boundary.sql` | `878df3d4a158…` | Sin dry run |
| `20261015201500` | `20261015201500_s1_pending_receipt_delete_guard.sql` | `9853e3b6749b…` | Sin dry run |
| `20261015210000` | `20261015210000_s1_provider_capture_receipts.sql` | `98270b2d46bc…` | Sin dry run |

**Resultado:** paquete local 27/27; historial remoto observado por conector 0; dry run **BLOQUEADO**, sin salida ni código de salida de `db push`; comparación esperadas/observadas pendiente. Acción única del propietario: autenticar esta CLI con la cuenta que administra `rhnnplewqsekrnaousyl` y facilitar en su terminal/gestor, sin publicarlos, el host/usuario/contraseña del Session pooler oficial de ese ref. Revalidar cuenta/ref/catálogo antes del primer intento; detener antes de aplicar cualquier SQL y presentar la salida saneada a Juanma y ChatGPT.

Ruta de reanudación: usar el perfil CLI Rubik Sota que liste el ref Preview, copiar el host del botón **Connect → Session pooler** del proyecto exacto y comprobar puerto `5432` y usuario `postgres.rhnnplewqsekrnaousyl`. Cargar la contraseña exclusivamente como `SUPABASE_DB_PASSWORD` temporal en la terminal, sin ponerla en `--db-url`; [Supabase documenta esa variable](https://supabase.com/docs/guides/troubleshooting/supabase-cli-failed-sasl-auth-or-invalid-scram-server-final-message) y la [ruta IPv4 de Session pooler](https://supabase.com/docs/guides/database/connecting-to-postgres). Desde `test-results/u02-n1-preview-package`, ejecutar primero `migration list --db-url <URL_SIN_PASSWORD>` y después `db push --dry-run --skip-vault --db-url <MISMA_URL_SIN_PASSWORD>`, ambos con CLI `2.118.0` y el perfil correcto. La URL se arma con **el host oficial**, `postgres.rhnnplewqsekrnaousyl`, puerto `5432`, base `postgres` y TLS; nunca con un host calculado por región. Comparar línea por línea con la tabla anterior y repetir `migration list`; borrar la variable de entorno al terminar. No ejecutar `db push` sin `--dry-run` en esta tanda.

## Último corte · 18/10/2026 · main N2-14 incorporado

`main@b99893e8fbc59f265ce61f40dbdc2baab071f69a` integró N2-14 mientras se cerraba esta PR. Se fusionó en #129 sin conflictos ni cambios de diseño U02; merge local `3598eeb929c9e1f6fd24ce2dbaccb755dcd31370`. `npm run verify` sobre ese código combinado: **597 PASS, 1 SKIP**, secret scan, lint, TypeScript y build PASS. Los ensayos específicos U02 previos (13/13 unitarias, 121/121 pgTAP y Data API/RPC local) siguen asociados a la misma implementación de U02, que no cambió en la fusión. El SHA final publicado y la base efectiva deben comprobarse en GitHub antes de cualquier despliegue. U02 continúa **BLOQUEADO antes del SQL alojado** por la ruta CLI de dry run; U03 **NO INICIADO**. El stack Docker propio se detuvo sin backup y ningún fixture remoto fue creado.

## Corte vigente · 18/10/2026 · #129 reconciliada con main

**U02 PARCIAL/BLOQUEADO antes del SQL alojado; U03 NO INICIADO.** La rama de #129 se reconcilió con `main@a1aebb55a682c4b140dfc7bb77a3cf9b3324ec43` sin conflictos. Production READY (`dpl_A9oqTQKqrX3s7wAaxQ8cTALkUtdW`) publica ese SHA y `/api/salud` declara `yvdgmklgwlshizzgefpv`. Esta prueba solo acredita el despliegue y su ref, no los gates funcionales H1/H2.

El conector Supabase autorizado para Rubik confirmó el ref exacto `rhnnplewqsekrnaousyl`, `rubik-preview`, `ACTIVE_HEALTHY`, historial de migraciones vacío y cero tablas públicas Rubik, usuarios Auth y objetos Storage. No se consultaron filas de clientes. La CLI de este perfil no obtuvo acceso operativo: el `db push --dry-run` falló por IPv6 y el intento alternativo de `link` falló al consultar el estado del proyecto. Se detuvieron los intentos; **no se aplicó SQL ni se crearon fixtures alojados**. La próxima operación es dotar a la CLI de Rubik de acceso al ref exacto por una ruta IPv4/pooler autenticada y repetir el dry run con `--project-ref rhnnplewqsekrnaousyl`. No usar una conexión por defecto ni otro proyecto.

El paquete local compara **nombre y SHA-256 de cada una de las 27 migraciones N1** con los blobs de Git de `f5afc09833eee77ab605abda3a2ec9d4a1e80a92`, preserva las plantillas Auth aprobadas y desactiva seed. Generó 27 versiones desde `20260928120000` hasta `20261015210000` y excluyó las **seis** migraciones posteriores presentes en este checkout. El ensayo en Docker propio `rubik-u02-n1-local-20261018` aplicó esas 27 migraciones sin seed, verificó historial y ausencia de usuarios/organizaciones. Un primer centinela público falló el pgTAP de RLS porque añadía una política anónima; se corrigió antes de publicar: la tabla queda en `private`, sin permisos de tabla para anon, y solo una RPC de lectura sin parámetros queda expuesta. El ensayo final comprobó la lectura exacta por Data API, el rechazo de URL Production antes de fetch y los permisos mínimos. El centinela alojado sigue pendiente del dry run y de aplicar N1 únicamente en Preview.

Vercel ya separó las dos variables Supabase públicas por ámbito conservando los IDs y valores ocultos de las entradas Production: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` originales ahora son solo Production; nuevas entradas Sensitive son solo Preview y apuntan al proyecto aislado. La comprobación posterior confirmó los cuatro nombres/ámbitos y que el despliegue Production siguió READY con el mismo ID/SHA. No se leyeron ni registraron valores Sensitive. Google/OpenSEO no se configuraron en Preview. El código de #129 aprueba el ref aislado pero **mantiene sesiones cerradas si la lectura real del centinela falla**; el veto al escritor SQL Preview permanece.

Pruebas locales sobre el árbol funcional de #129 tras reconciliación: `npm run verify` **585 PASS, 1 SKIP**, lint, tipos, build y escaneo de secretos PASS; pruebas dirigidas de identidad/Auth **13/13 PASS**; ensayo Docker del paquete N1 y centinela PASS; pgTAP dirigido de membresía, escritor S1 y RLS **121/121 PASS** después de corregir el centinela. GitHub Actions no ejecuta jobs por facturación. No se ejecutaron Playwright alojado, U03, pruebas JWT cruzadas ni limpieza remota porque U02 aún no tiene esquema/centinela desplegados; esos casos son **BLOCKED_BY_U02**, no PASS. Ningún fixture remoto fue creado. El resultado final de cada suite se ligará al SHA del commit de esta entrega en el cuerpo de #129; los ensayos anteriores son evidencia del mismo árbol funcional antes del commit documental.

Secuencia restante: (1) recuperar conexión CLI de Rubik al ref Preview exacto; `migration list`, dry run de las 27, aplicar solo si la lista coincide y verificar catálogos; (2) instalar el centinela con ref explícito, verificar Auth y desplegar #129 como Preview protegido; (3) probar JWT Preview legítimo, JWT de Production rechazado en Preview y viceversa, más navegación/cookies; (4) obtener alias ficticios controlados y ejecutar U03 por capas con ledger. Los casos de retirada/outbox dependientes de escritor propio quedan `BLOCKED_BY_PREVIEW_WRITER` hasta diseño y aprobación de credencial/clave exclusivas de Preview. H1/H2 siguen abiertos.

## Corte vigente · 17/10/2026 · nuevo proyecto Preview

**U02 BLOQUEADO antes de migraciones y variables; U03 no iniciado.** Juanma comunicó y autorizó el nuevo proyecto aislado `rubik-preview`, ref `rhnnplewqsekrnaousyl`, ACTIVE_HEALTHY en `eu-west-3`, con historial inicial vacío y cotización de USD 0/mes. Estos datos proceden del propietario; **la CLI autenticada en esta sesión no pudo acreditarlos de forma independiente**: `projects list` mostró Production pero no el nuevo ref, y `migration list --project-ref rhnnplewqsekrnaousyl` terminó en `DbConfigIpv6Error` antes de leer el historial. Por tanto, el supuesto historial vacío no es un resultado de la CLI. No se ejecutaron `db push`, dry run, SQL alojado, creación de usuarios, fixtures ni llamadas a proveedores. El ref aprobado en código permanece `null` y Preview sigue cerrado.

GitHub: `main@f5afc09833eee77ab605abda3a2ec9d4a1e80a92`; #129 seguía OPEN/Draft con HEAD `313205976f0c59cd54e5200f0f2497c99c3b5871` al inicio de este corte. Los otros worktrees no se modificaron. El paquete local N1 exige 27 migraciones exactas hasta `20261015210000`, excluye cuatro posteriores y desactiva seed; **su dry run remoto sigue pendiente**. La CLI mostró `previewVisible=false`, `productionVisible=true` y siete proyectos visibles, sin consultar los otros refs. No se imprimieron secretos.

**Siguiente acción ejecutable:** habilitar en la cuenta/perfil CLI de Rubik acceso de lectura y operación al ref exacto `rhnnplewqsekrnaousyl` (o autenticar esta terminal con la cuenta que lo creó), manteniendo Production y Funding OS fuera del destino. Después verificar que `projects list` incluye el ref, resolver la conexión IPv4/pooler para ese ref, ejecutar `migration list --project-ref rhnnplewqsekrnaousyl` y una lectura de catálogo sin filas de usuarios; solo si todo coincide, ejecutar el dry run del paquete N1 y aplicar exclusivamente las 27 migraciones. Hasta entonces no se puede separar con seguridad la clave publicable de Vercel ni crear cuentas A/B. Juanma debe confirmar además dos alias ficticios A/B bajo su control por un canal que no publique contraseñas; no se requieren esos alias para el inventario de migraciones.

La comprobación de metadatos de Vercel desde este worktree sin vínculo creó inesperadamente un proyecto vacío `u02-preview-isolation-20261017`. Se eliminó inmediatamente por nombre exacto y se retiró el vínculo local `.vercel`; no era el proyecto Vercel de Rubik y no se cambiaron sus variables ni despliegues. No repetir `vercel project inspect` o `vercel env ls` desde un worktree sin vínculo explícito al proyecto Rubik. Este hecho no acredita ni afecta U02.

Preparación de código en este corte: `currentUser()` comprueba que el `iss` de las claims ya verificadas por Supabase coincida exactamente con el Auth del ref aprobado cuando `VERCEL_ENV=preview`. El test dirigido rechaza emisor de Production, origen parecido y ausencia de issuer. Como el ref aprobado sigue `null`, esto **no abre sesiones** ni sustituye el centinela de base, la separación de variables o la prueba de JWT reales. `npm run verify` terminó con 539 PASS, 1 SKIP, lint, tipos y build PASS; las dos suites dirigidas sumaron 7 PASS. Estas pruebas son locales sobre el árbol de esta rama antes del commit de checkpoint, sin validación alojada. GitHub Actions sigue bloqueado por facturación.

## Corte histórico previo a la creación del proyecto

Estado al corte anterior: **BLOQUEADO antes de crear proyecto, cuentas o fixtures alojados**. Esta rama parte de `main@f5afc09833eee77ab605abda3a2ec9d4a1e80a92`; el SHA de la rama y de las pruebas se registra en la PR. No cambia Production ni aplica SQL alojado.

## Inventario observado, sin secretos

- Production Vercel: `f5afc09833eee77ab605abda3a2ec9d4a1e80a92`, READY; `/api/salud` confirmó `yvdgmklgwlshizzgefpv`. La organización Supabase «Rubik Sota» contiene ese proyecto activo en `eu-west-3` y otro proyecto inactivo; no aparece un proyecto Preview inequívoco. No se consultaron filas ni configuraciones del otro proyecto.
- La cuenta CLI ve **2 proyectos activos y 5 inactivos** entre sus organizaciones. El listado no expone el plan de facturación. La [política vigente de Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase) da dos plazas Free activas en total entre organizaciones administradas por la cuenta; las pausadas no cuentan. Por tanto, no se ha acreditado una plaza Free libre. [Precio público](https://supabase.com/pricing): Pro desde **USD 25/mes**, con USD 10/mes en créditos de cómputo; un segundo Micro añade **USD 10/mes** de cómputo. Si «Rubik Sota» aún es Free, dos Micro activos en Pro supondrían aproximadamente **USD 35/mes**, más uso/add-ons; si ya es Pro, el segundo Micro incrementaría aproximadamente USD 10/mes. El importe y plan de la cuenta deben confirmarse antes de crear.
- Vercel lista `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con ámbito **Production y Preview**; sus valores no se leyeron. No aparecen variables de proveedor o escritor en el ámbito Preview. El proyecto tiene `ssoProtection.deploymentType=all_except_custom_domains`; existen despliegues Preview READY de ramas N2, pero ninguno acredita un Supabase aislado ni una sesión U03. El bloqueo de `src/lib/auth/mode.ts` sigue activo.
- PR #128 es documental y Draft. Las PR N2 #119, #116, #117 y #118 permanecen abiertas; no se modificaron.

## Cambio de código preparado en esta PR U02

`previewIdentityMatches` exige un ref de veinte caracteres **aprobado en código**, una URL HTTPS de origen exacto y un ref distinto del de Production. El ref aprobado sigue `null`: **ninguna Preview se desbloquea hoy**, incluso si un operador define banderas o reutiliza variables de Production. `writerPool()` conserva un veto explícito a Preview independiente del bloqueo de sesiones, para impedir que una URL del escritor heredada abra Postgres. Los tests incluyen colisión con Production, host similar, puerto, ruta, consulta, credenciales URL y entorno incorrecto.

Esta PR permanece Draft hasta insertar el ref del nuevo proyecto y verificar además la identidad de la base/issuer. El helper de URL por sí solo no acredita un centinela de BD ni el emisor de un JWT real. No fusionar ni desplegar como «U02 completado» con el ref `null`.

## Secuencia exacta tras la decisión U02

1. Confirmar plan y cargo incremental de «Rubik Sota» y designar **dos alias de prueba A/B bajo control del propietario**. No pausar ni reutilizar el proyecto inactivo sin inventario y decisión separados. Si se aprueba coste, crear `rubik-preview` vacío en `eu-west-3`, sin clonar Production ni importar Sarah. Registrar el nuevo ref; detener si coincide con `yvdgmklgwlshizzgefpv` o aparecen datos previos.
2. En checkout limpio del SHA de `main` aprobado, ejecutar `node scripts/u02-n1-preview-package.mjs`. El comando es **solo local**: crea `test-results/u02-n1-preview-package/` con manifiesto SHA-256, configuración sin seed y **solo las 27 migraciones N1 hasta `20261015210000`**; falla si cambia el inventario. No ejecutar `db push` desde el checkout completo: contiene cuatro migraciones posteriores. Desde el paquete, usar `npx --yes supabase@2.118.0 db push --dry-run --skip-vault --project-ref <REF_PREVIEW>`, comprobar que lista exactamente esas 27 y que `<REF_PREVIEW>` no es Production; luego, únicamente en la ventana aprobada, `db push --skip-vault --project-ref <REF_PREVIEW>` sin `--include-seed`. Verificar historia y catálogos/RLS/grants; no aplicar migraciones N2 alojadas. Si cambia `main`, regenerar y revisar el paquete; no reutilizar el manifest anterior.
3. Configurar Auth exclusivamente en Preview: registro público cerrado, A/B confirmados, contraseñas en gestor del propietario, JWT y refresh propios, redirect solo al alias protegido. No copiar usuarios, claves, anillo HMAC ni conexión SQL de Production. Configurar credencial publicable de Preview y URL nueva en variables **solo Preview**; separar primero las dos entradas que hoy abarcan Production+Preview, sin imprimir valores. Mantener OpenSEO/Google sin configurar. Verificar Vercel Authentication para el alias usado.
4. Incorporar el ref nuevo a la constante revisada en esta PR y completar el centinela de identidad de BD y la comprobación del issuer JWT del plan U02 antes de habilitar sesiones. Confirmar que cualquier camino SQL Preview usa exclusivamente una identidad propia o permanece cerrado. Ejecutar `npm run verify` y las pruebas de rechazo, revisar HEAD, desplegar Preview y exigir `/api/salud` con modo/ref aislado. Token de Production contra Auth/Data API Preview debe fallar. Un ref igual a Production, centinela ausente, clave ajena o ausencia de protección detiene la apertura.
5. Crear un respaldo lógico del Preview vacío/esquematizado y ensayar restauración aislada antes de U03. Rollback: retirar solo variables Preview, volver a la guarda incondicional y redesplegar; conservar Production intacta. No borrar el proyecto ni usuarios hasta completar el inventario y el protocolo de limpieza.

## Arnés U03 alojado separado del E2E local

El futuro arnés recibe ref Preview aprobado, deployment ID/SHA y credenciales A/B desde custodia segura; **rechaza** el ref de Production y cualquier URL cuyo `/api/salud` no coincida. No importa `e2e/fixtures.ts`, no usa su admin local y no acepta un ref por defecto. Primero verifica ausencia de variables de proveedor en el ámbito Preview y un control positivo de Auth. Cada caso produce solo `UTC | SHA | ref | actor genérico | caso | HTTP/RPC | PASS/FAIL/SKIP` sin JWT, cookie, contraseña o correo.

Antes de cada alta, persiste en un ledger local ignorado por Git el namespace de ejecución y el ID previsto; después anota el ID confirmado. Ejecuta A1/A2/B1 por interfaz/cliente con JWT reales de Auth Preview, sin SQL privilegiado para simular actores. Compara positivos y negativos; incluye lectura cruzada, roles, RPC, HMAC falso, invitación/revocación y JWT ajeno. Para expiración auténtica, espera el `exp` de un access token real sin alterar firma/claims; si el tiempo o la política impiden esperar, marcar SKIP/BLOQUEADO, no PASS. No llama rutas Google/OpenSEO. Detiene todo ante una denegación fallida o señal de Production.

Limpieza: las cuentas propietarias eliminan solo sus objetos mediante rutas soportadas; la administración Preview elimina solo los usuarios del ledger. Consulta read-only confirma cero organizaciones, proyectos, usuarios y recibos **propios** y cero outbox pendiente propio. Un recibo retenido se documenta como residuo y bloquea la aceptación. No se detienen stacks compartidos ni se toca Production. El arnés actual E2E conserva su protección local y nunca apunta a alojado.

## Gates y siguiente decisión

U02 **BLOQUEADO** por capacidad/coste de Supabase no aprobados y ausencia de proyecto/ref/identidades. U03 **SKIP**, cero fixtures creados. H1 sigue parcial por exportación HTTP, restauración ficticia y U04/R1; H2 sigue bloqueado por U02/U03 y aceptación operativa/comercial. GitHub Actions no se declara verde; la evidencia de esta rama es local por SHA.

Decisión concreta del propietario: aprobar **un segundo proyecto aislado de Rubik Sota** y confirmar el plan/cargo mostrado en su facturación (estimación pública condicional: Pro total ~USD 35/mes para dos Micro si Free no admite otra plaza), junto con dos alias A/B bajo su control; o mantener U02/U03 alojados bloqueados sin gasto. Ninguna operación de pago o reutilización de otro proyecto se inicia por inferencia.

## Incidencia AUTH_SETTINGS_READ_FAILED · 19/10/2026

El propietario reportó el intento `BLOCKED_NO_WRITES`, previo a fixtures, con ledger `ed1a8f3b-77bf-4305-9959-f5510c060b6b.jsonl` y código `AUTH_SETTINGS_READ_FAILED`. La evidencia guardada no permite saber si falló DNS, TLS, timeout, HTTP o JSON. Un 401 de `curl.exe` sin clave confirma que esa petición de curl alcanzó Auth; no prueba la respuesta autenticada de Node.

Causa probable: el wrapper eliminaba las variables de proxy del entorno antes de iniciar Node; `curl.exe` y Node `fetch` podían, por tanto, usar rutas distintas. Ahora preserva proxies y `NO_PROXY` para el proceso de red, habilita `NODE_USE_ENV_PROXY=1` si existe proxy y activa la CA del sistema para respetar el almacén Windows. No deshabilita la validación TLS y no pasa proxy ni sus credenciales a Chromium. El error de Auth Settings queda clasificado con códigos seguros DNS/TLS/TIMEOUT/HTTP/JSON, sin guardar mensajes, URL, cabeceras, cuerpos o secretos. La categoría concreta del fallo anterior sigue desconocida.

Verificación local: `npm run test:u03-b4` 22/22 PASS, parse PowerShell PASS, `git diff --check` PASS; `npm run verify` PASS en este HEAD funcional (607 PASS, 1 SKIP, secret scan 692 archivos, lint, tipos y build). No se volvió a ejecutar la campaña alojada ni se crearon fixtures. Esperar el resultado sanitizado del comando del propietario para confirmar la categoría real. Mantener #129 OPEN/Draft y U03/H1/H2 abiertos.

## Salida real de Supabase CLI y preflight sin claves · 19/10/2026

Se verificó CLI **2.118.0** con `db query --help`; la llamada real `--linked --project-ref rhnnplewqsekrnaousyl --output json --file <SQL>` devolvió inicio del CLI y un objeto `{ boundary, rows, warning }`, con una fila en `rows`. `--output-format json` en la misma versión también produjo ese sobre. El parser acepta ambos formatos (sobre y array simple) para mantener compatibilidad con el array reportado en el ensayo previo. La función escribe exclusivamente SELECT a un archivo temporal, usa `--file`, fija el ref permitido y elimina el archivo en `finally`. Se corrigió además el lanzamiento del shim `npx.cmd` desde Node cuando la ruta tiene espacios.

Consulta alojada de solo lectura a través del código actualizado, sin claves Admin/Auth: `environment=preview`, ref `rhnnplewqsekrnaousyl`, 27 migraciones (última `20261015210000`), todos los conteos de Auth/org/proyectos/membresías/auditoría/outbox en cero y escritor bloqueado. La comprobación final devolvió inventario/outbox/capacidades seguros. El wrapper se ejecutó como `-ReadOnlyPreflightOnly`: validó el deployment protegido y el SQL, imprimió PASS con ref/migraciones/inventario/escritor y salió sin prompts. No creó fixtures ni accedió a otro proyecto. Pruebas `npm run test:u03-b4`: 26/26 PASS; incluye parsing de ambos formatos, restricción de SELECT/ref, eliminación del archivo temporal, orden de prompts y pruebas de cleanup.

Próximo comando completo del propietario, solo después de actualizar este checkout al HEAD publicado y cuando autorice crear fixtures: `vercel.cmd env run -e preview -- powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/u03-preview-b4-owner.ps1`. Las claves se solicitan después de completar el preflight sin claves. La categoría del intento anterior `AUTH_SETTINGS_READ_FAILED` sigue sin determinarse; campaña con fixtures no ejecutada y U03/H1/H2 abiertos.
