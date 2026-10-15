# N1-04 · diagnóstico de CI y separación de entornos

> **Actualización 15/10/2026, 16:04 UTC:** `npm run verify:s1-local` se ejecutó completo dos veces: sobre `976f354` (405/87/598 y Playwright 145 PASS/44 SKIP) y sobre el cambio local posterior de `provider_results` (405/88/603 y Playwright 145 PASS/44 SKIP), con limpieza de fixtures propios en ambas. El runner limpia el selector S1 para las unitarias y conserva el stack aislado para integración/SQL/E2E. Actions permanece bloqueada antes de arrancar jobs; esta evidencia es local, no CI verde alojada.

> **Actualización 15/10/2026, 15:36 UTC:** en PR Draft [#104](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/104), run Actions `38760330927`, los tres jobs vuelven a mostrar `steps: []` y la anotación confirma bloqueo de facturación antes de iniciar. No se usa como resultado de pruebas. Alternativa operativa local: `npm run verify:s1-local` valida API 56321 y DB 56322 del stack S1 antes de encadenar verify, integración, pgTAP y Playwright; `--check` pasó y las cuatro suites se ejecutaron por separado (405/405, 86/86, 594/594, 145 PASS/44 SKIP). El wrapper completo todavía no se ejecutó. Es una verificación manual reproducible, no un sustituto de CI alojada ni un mecanismo programado. Se conservó un ledger antiguo ambiguo del primer run E2E; la segunda ejecución limpió solo sus fixtures propios. U02 y entornos alojados siguen pendientes.

**Estado:** investigación y plan, sin cambios alojados. Corte 15/10/2026. `main@3eba9d014a339dabdabff28f42e27209695b0bf9` es una referencia de base; confirmar SHA remoto antes de ejecutar. La PR #100 sigue abierta en Draft al preparar este documento.

## CI: evidencia y ruta sin activar gasto

El run de la PR #100 `38734352934` marca FAILURE para verify Node 22/24 y E2E. Los tres jobs tienen `steps: []`; la anotación del primer check dice: **“The job was not started because your account is locked due to a billing issue.”** No existe resultado de test de GitHub Actions para ese HEAD. `.github/workflows/ci.yml` usa `ubuntu-latest`, matriz Node 22/24, y un stack Supabase Docker local para pgTAP, integración y Playwright. No incluye secretos alojados ni despliegue. Las pruebas locales de S2 están registradas por separado en la PR.

El repositorio es PUBLIC, pero el bloqueo observado afecta a la cuenta antes del arranque. No cambiar `runs-on` ni reintentar a ciegas: no arregla una cuenta bloqueada y podría crear un runner inseguro. Ruta de recuperación sin activar facturación: el propietario revisa Billing and licensing y el estado de la cuenta; si no hay cargo o suscripción que resolver, solicita revisión a GitHub Support. Tras restauración, ejecutar el workflow en un commit verificable y contrastar cada job. Mientras tanto, usar `npm ci`, `npm run verify`, `npm run test:integration`, `npm run test:db` y E2E en stack propio local, guardando SHA, versiones, puertos y logs; esto es **evidencia local**, no CI verde. Evaluar runner propio solo en máquina efímera y aislada, sin secretos ni acceso a otros proyectos, y tras confirmar que GitHub acepta jobs; no habilitarlo en este ciclo.

Referencias oficiales: [bloqueo de cuenta](https://docs.github.com/en/billing/how-tos/troubleshooting/locked-account), [configuración de Actions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository), [facturación de Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Matriz de entornos propuesta

| Entorno | Datos/Auth | Sesión y pruebas | Regla actual / paso siguiente |
|---|---|---|---|
| Development | Supabase local propio o demo sin persistencia | Flujos de desarrollo; nunca usar URL alojada de cliente | Confirmar puerto, proyecto y ledgers antes de limpiar. |
| Testing | Stack local desechable de CI o worktree aislado | pgTAP, Data API con JWT ficticios, integración y Playwright 360/390/1280 | La CI alojada está bloqueada; reproducir localmente y preservar fixtures ajenos. |
| Preview | Vercel Preview; según ADR existente comparte variables de Supabase Production | `VERCEL_ENV=preview` fuerza `preview-locked`, `persistence:none`; no hay sesión para matriz JWT | Mantener bloqueo hasta proyecto Supabase Preview separado, variables y clave propias, y cambio de código revisado. |
| Production | Supabase alojado con datos reales y claves del propietario | Solo operación autorizada; no usar como banco de pruebas | Migraciones, cuentas y pruebas reales requieren respaldo y autorización puntual. |

Las variables relevantes identificadas **por nombre en código**, sin leer valores: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `VERCEL_ENV`, `PROVENANCE_SIGNING_KEYS`, `PROVENANCE_ACTIVE_KEY_ID` y configuración OpenSEO/Google de servidor. El código rechaza una clave secreta en `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y bloquea sesión Preview de forma incondicional. No se consultaron valores Vercel; por tanto la coincidencia actual de URL/clave entre Preview y Production se considera **riesgo documentado previamente, pendiente de inventario actual por el propietario**. Comparar solo nombres, ámbitos y proyecto de destino mediante metadatos; nunca descargar secretos al worktree.

La CLI `vercel whoami` confirmó `juanmaes83` y equipo `juanma-espinosas-projects`. `vercel list plataforma-rubik-seo-geo --meta githubCommitSha=1d933be2...` devolvió una Preview **Ready** para ese SHA; GitHub también informa Vercel SUCCESS. Esta observación prueba build/deploy, no sesión, RLS ni independencia de datos. El worktree no está vinculado mediante `.vercel/project.json`; no se ejecutó `vercel link`, `env pull`, deploy ni cambio de variables. `vercel curl` requería configurar/vincular el directorio y no se continuó para evitar mutación incidental.

## Preview aislada y validación

Reusar la opción de segundo proyecto Supabase del documento `DECISIONES-ADR0010-Y-PREVIEW.md`, **sujeta a U02 y a comprobar plan/coste actuales**. El propietario crea el proyecto vacío sin datos reales, custodia sus claves y configura variables solo para Preview. Mantener la ruta de Production exacta y separada; comprobar identificador de proyecto Supabase, URL, ámbitos Vercel y anillo de firma distintos antes de desbloquear. No copiar datos de cliente ni usar un clon de Production.

La habilitación de sesión Preview será una PR de producto posterior, revisada por SHA y con guardas que comprueben un proyecto Preview permitido, no una bandera booleana. Ensayar con dos cuentas ficticias: login/logout/cookie refresh, JWT ausente/caducado/ajeno, A1/A2/B1 en org/proyectos, RLS y RPC negativos, retirada de acceso, no revelación de existencia, limpieza por recibos propios y ausencia de llamadas a proveedores. Verificar que una URL o clave de Production en Preview bloquea el arranque de Auth. Un Preview Ready sin estas pruebas no satisface N1-04.

Referencias de Vercel para la verificación posterior: [listado de despliegues por SHA](https://vercel.com/docs/cli/list) y [variables por entorno](https://vercel.com/docs/environment-variables/manage-across-environments).

En UI, repetir escritorio y 360/390 px para login, invitaciones, navegación y errores; medir overflow y accesibilidad automática, y completar revisión visual humana. Las 44 pruebas E2E marcadas SKIP en S2 no cuentan como PASS. La revisión móvil y a11y de release pertenece también a N1-08.

**Pendientes U02:** diagnóstico/resolución de la cuenta GitHub; elección y coste del Supabase Preview separado; metadatos de variables por ámbito y proyecto; autorización de configuración alojada y cuentas ficticias. Hasta entonces N1-04 está preparado, no validado.
