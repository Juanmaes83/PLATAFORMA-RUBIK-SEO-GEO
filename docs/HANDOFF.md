# Handoff

## Sesión 1 — CORE-9.0, base local (28/09/2026)

**Punto de partida verificado:**

- El repositorio estaba vacío: sin commits, ramas ni PRs.
- En el Core, `main@20e4f4e1be3e8cc95c06589f60cb3ea591a3608a`, con los PRs #12–#17 ya fusionados. `npm run verify` en el Core daba 314 pruebas (312 pasan, 2 se omiten en Windows).

**Hecho:**

- Commit mínimo en `main` (`7e87f1f`, solo README) para tener una base revisable.
- Rama `feat/core-9-0-bootstrap` con:
  - Next.js 16.3.6, React 19.2.8 y TypeScript 5, generado con `create-next-app@16.3.6` y adaptado;
  - el Core como dependencia `git+https` fijada al commit `20e4f4e1be3e8cc95c06589f60cb3ea591a3608a` y cargado como `serverExternalPackages`;
  - autenticación **mock** (usuarios ficticios, cookie sin firma), sin Supabase;
  - rutas `/`, `/acceso`, `/proyectos`, `/proyectos/[tenantId]/[projectId]` y `/api/salud`;
  - permisos calculados con `authorize`/`MATRIX` del Core;
  - `.env.example` con solo nombres;
  - checks del pin y de secretos;
  - Vitest y CI con Node 22/24, incluido un smoke contra el servidor local.
- **Documentación:** [ADR 0001](adr/0001-stack-y-dependencia-core.md), [ARCHITECTURE](ARCHITECTURE.md), [ENVIRONMENT](ENVIRONMENT.md), [SETUP-SUPABASE](SETUP-SUPABASE.md), [HOSTING](HOSTING.md) y [ROADMAP](ROADMAP.md).

**Validación local** (Windows, Node 24.14.1, npm 11.14.1):

- `npm run verify`:
  - `check:core-pin` y `check:secrets` correctos;
  - ESLint sin incidencias;
  - `tsc` sin errores;
  - Vitest con 5 ficheros y 19 pruebas, todas pasan;
  - `next build` correcto, con las 6 rutas dinámicas.
- Servidor local con `AUTH_MODE=mock`:
  - `/api/salud` devuelve `status: ok` y `auth: mock` con el commit del Core;
  - `/proyectos` sin sesión da 307 a `/acceso`;
  - con la sesión de analista, 200 en su proyecto y 404 en otro tenant o en un proyecto inexistente;
  - con una cookie de usuario desconocido, 307.
- `GIT_SSH_COMMAND=false npm ci` con la caché vacía instala el Core por HTTPS.

**CI:** PR [#1](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/1), [run 36411911462](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36411911462) del HEAD `728ac7d` en verde. Jobs Node 22.23.2 y 24.21.0: instalación con `npm ci` (el Core se instala por HTTPS), pin, secretos, lint, typecheck, 19/19 pruebas, build y smoke de `/api/salud`, 307 y 404.

**Límites:**

- La autenticación es de demostración y no es segura.
- No hay persistencia, RLS, conectores, IA ni despliegue.
- Los tipos del Core son declaraciones locales (se propone que el Core publique `.d.ts`).
- Según los términos vigentes de Vercel, Hobby no sirve para este uso comercial ([HOSTING](HOSTING.md)).

**Tareas del propietario:**

1. Revisar el PR, la ADR 0001 y el aspecto visual (descripción en el PR).
2. Preparar Supabase según [SETUP-SUPABASE](SETUP-SUPABASE.md): proyecto de prueba, región, plan, MFA y métodos de Auth. Sin compartir la secret/service-role key.
3. Decidir el hosting de validación a la vista de [HOSTING](HOSTING.md), o seguir en local.

**Siguiente bloque: CORE-9.1**

- **Qué:** Supabase Auth real (`@supabase/ssr`), tablas de tenants, proyectos y pertenencias con RLS, y los roles del Core aplicados en servidor y en Postgres.
- **Criterios:**
  - pruebas negativas entre tenants y proyectos;
  - pruebas RLS contra Supabase local o el proyecto de prueba aislado;
  - sesiones y errores seguros;
  - sin credenciales en el repositorio.
- **Bloqueo:** tareas 2 y 3 del propietario.

## Sesión 2 — D-27 aplicada en el PR #1 (28/09/2026)

**Punto de partida:** PR #1 abierto, con HEAD `14d88b6` y CI en verde, sin comentarios. En el Core, `main@f276837`: D-27 (dirección UX mobile-first) añadida después de fijar el Core. Es un cambio solo de documentación, así que el pin sigue en `20e4f4e`.

**Hecho:**

- **Estructura visual D-27** ([ADR 0002](adr/0002-ux-mobile-first.md)):
  - tokens neutros reemplazables (propuesta, sin marca);
  - mobile-first desde 360 px: menú `<details>` en móvil y barra lateral desde 1024 px;
  - panel con proyectos, pendientes, actividad y última observación, con estados vacíos honestos;
  - arquitectura de navegación completa, con las áreas no construidas como «No disponible todavía»;
  - distintivo «Demo · ficticio» en todos los fixtures;
  - usuario cliente ficticio;
  - tablas que en móvil pasan a filas apiladas, sin scroll horizontal.
- **`AUTH_MODE=mock` solo en desarrollo:**
  - en producción queda siempre desactivado;
  - `build` y `start` se niegan;
  - `src/instrumentation.ts` sale con código 1 si `next start` se lanza directamente con `AUTH_MODE=mock`.
- **Node 20:** fecha de fin de vida cambiada al 24/03/2026 en la ADR 0001. *Corregido en la sesión 3: el EOL es el 30/04/2026 según el calendario de releases; el 24/03/2026 es la fecha «Last updated».*
- **CI:**
  - el job `verify` (Node 22/24) hace el smoke de producción sin sesión posible y prueba que `AUTH_MODE=mock` se rechaza en build, start y arranque directo;
  - el nuevo job `ui` ejecuta Playwright con Chromium y sube las capturas como artefacto.

**Validación local** (Windows, Node 24.14.1):

- `npm run verify` en verde: pin, secretos (99 ficheros), lint, `tsc`, 20/20 pruebas unitarias y build con 13 rutas dinámicas.
- `npm run test:e2e`: 42/42. Son 10 vistas × 3 anchos, más navegación, login, estados vacíos y una autoprueba del detector de desbordamiento.
- `AUTH_MODE=mock`:
  - `node scripts/run-next.mjs start` sale con 2;
  - `next start` directo sale con 1 y el mensaje «prohibido en producción»;
  - `run-next build` sale con 2.
- Capturas en [docs/visual](visual/README.md).

**CI:** [run 36414209120](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36414209120) del HEAD `f947e53` en verde.

- `verify` en Node 22.23.2 y 24.21.0:
  - el smoke de producción da `auth: disabled` y 307 con una cookie de demo;
  - `AUTH_MODE=mock` queda rechazado en build (código 2), en start (código 2) y en el arranque directo (código 1, «prohibido en producción»).
- `ui` en Node 22.23.2: 42/42, con el artefacto `capturas-core-9-0` (3,3 MB).

**Tareas del propietario:**

1. Revisar la dirección visual con las capturas (D-27): tokens, densidad, textos y navegación.
2. Revisar la ADR 0001 y la ADR 0002.
3. Las tareas de Supabase y hosting siguen igual (sesión 1).

**Siguiente bloque:** CORE-9.1, tras la revisión y aprobación del PR #1.

## Sesión 3 — auditoría de contenido y usabilidad del PR #1 (28/09/2026)

**Punto de partida:** PR #1, con HEAD `5f67c05` y CI en verde, sin cambios remotos nuevos.

**Correcciones de la auditoría:**

1. **Permisos frente a disponibilidad** (`src/lib/permissions.ts`, `PermissionTable`): cada fila separa lo que permite el rol (la decisión del Core, sin cambios) de si la función existe ya.
   - Tres estados: «Disponible», «Permitido, aún no disponible» (con su etapa y «Hoy no se puede usar») y «No permitido».
   - Un resumen con los recuentos va encima de la tabla.
   - Una función no construida nunca aparece como utilizable.
2. **Motivos comprensibles:** los 10 códigos que puede devolver `authorize` en el Core fijado tienen su explicación en español, por ejemplo «El rol Analista no incluye esta acción», o, para ejecutar, «la ejecución la hará el sistema, y solo tras una aprobación humana registrada».
   - El código técnico queda solo como «Código de diagnóstico».
   - En `/proyectos`, `NOT_A_MEMBER_OF_SCOPE` ya no aparece en el texto.
3. **Conectores** (`src/lib/connectors.ts`):
   - nombres y categorías en español, con qué aportará cada uno, desarrollo y etapa, coste y autorización necesaria;
   - todos muestran «No conectado»;
   - la página dice explícitamente que no pide ni guarda credenciales, y no tiene formularios.
4. **Estados vacíos:** cada área no construida, el panel, el resumen del proyecto y la lista de proyectos indican «Qué necesitará» y «Cuando esté disponible». No hay botones sin acción.
5. **ADR 0001:** el EOL de Node 20 es el **30/04/2026** según el calendario de releases; el 24/03/2026 es la fecha «Last updated» de la tabla de nodejs.org.

**Pruebas:**

- **Vitest:** 28/28. Las nuevas cubren:
  - que cada acción del Core tiene una función asociada;
  - que cada código de denegación de `authorize`, leído del código fuente del Core fijado, tiene explicación sin jerga;
  - que nada se muestra como disponible sin serlo;
  - los textos de conectores y consentimientos, y que todos los conectores figuran como «No conectado».
- **Playwright:** 51/51, con estas comprobaciones nuevas en todas las vistas y anchos:
  - ningún control sin acción;
  - ningún campo de entrada visible;
  - ningún código técnico fuera de un detalle de diagnóstico.

  Además, pruebas específicas de permisos, conectores y estados vacíos.
- `npm run verify` en verde: 102 ficheros revisados por el guard de secretos, y build correcto.
- Capturas regeneradas en [docs/visual](visual/README.md).

**Nota local:** el puerto 3217 estaba ocupado por otro servidor de desarrollo lanzado desde otra copia del repositorio (`C:\Users\temp123\PLATAFORMA-RUBIK-SEO-GEO`), probablemente del propietario o de otro agente. No se detuvo: Playwright se ejecutó con `E2E_PORT=3227`.

**Pendiente de revisión visual:** en móvil la lista de permisos es larga (13 bloques). Se puede compactar si el propietario lo pide.

**CI:** [run 36418239963](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36418239963) del HEAD `de4c3da` en verde: `verify` en Node 22.23.2 y 24.21.0, y `ui` 51/51 con el artefacto de capturas. El commit siguiente solo registra este run en la documentación; su CI consta en el PR.

## Sesión 4 — remates de revisión del PR #1 (28/09/2026)

**Punto de partida verificado:** HEAD remoto `d6e55b9`, igual al local, con el PR #1 abierto. Su CI, [run 36418555762](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36418555762), está **en verde**: `verify` en Node 22 y 24, y `ui` 51/51.

**Hecho:**

1. **Resumen del proyecto:** el texto principal del estado vacío de mediciones queda en «Desconocido · Este proyecto aún no tiene observaciones.». Las etapas (CORE-9.3, 9.4 y 9.5) solo aparecen en «Qué necesitará», y «Cuando esté disponible» se mantiene.
2. **`/proyectos`:** `NOT_A_MEMBER_OF_SCOPE` ya no está en el texto dirigido al usuario. Queda como «Información técnica», un `<details>` plegado y secundario debajo de la explicación.
3. **Pruebas e2e nuevas:**
   - en `/proyectos` el código está oculto por defecto y solo dentro de `details.tech`;
   - el estado vacío de mediciones no repite las etapas.

   El control plegable se añadió a la comprobación de objetivos táctiles.
4. Capturas regeneradas en [docs/visual](visual/README.md): cambian las vistas 04, 05 y 06, en los tres anchos.

**Pruebas locales** (Windows, Node 24.14.1):

- `npm run verify` en verde: pin, secretos (102 ficheros), lint, `tsc`, 28/28 pruebas unitarias y build.
- `npm run visual:evidence` (Playwright): 57/57, las 51 anteriores más 2 nuevas en cada uno de los 3 anchos.

### Historial de CI del PR #1 (commit → run)

| Commit | Contenido | Run | Resultado |
|---|---|---|---|
| `728ac7d` | Base CORE-9.0 | [36411911462](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36411911462) | Verde (verify Node 22/24) |
| `14d88b6` | Documentación: CI de `728ac7d` | [36412082623](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36412082623) | Verde |
| `f947e53` | D-27, demo solo en desarrollo, CI visual | [36414209120](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36414209120) | Verde (verify Node 22/24, ui 42/42) |
| `5f67c05` | Documentación: CI de `f947e53` | [36414491097](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36414491097) | Verde |
| `de4c3da` | Auditoría de contenido y usabilidad | [36418239963](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36418239963) | Verde (verify Node 22/24, ui 51/51) |
| `d6e55b9` | Documentación: CI de `de4c3da` | [36418555762](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36418555762) | Verde (verify Node 22/24, ui 51/51) |
| `5f17674` | Remates de revisión de contenido/usabilidad y documentación de sesión 4 | [36427600943](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36427600943) | Verde (verify Node 22/24, ui 57/57) |

El commit `159e12e` actualiza ROADMAP para registrar este checkpoint. Esta actualización del HANDOFF conserva el historial por commit; los checks de los commits documentales quedan visibles en la pestaña Checks del PR.

Sin merge ni despliegue.

**Cierre de CORE-9.0 (registrado en la sesión 5):** el propietario fusionó el PR #1 en `main` con el merge `a34746ee1e0605eaeca3de817f7badd6a0c998d1`. La CI del push a `main`, [run 36432091098](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36432091098), está en verde: `verify` en Node 22 y 24, y `ui`.

## Sesión 5 — CORE-9.1: Supabase Auth, organizaciones y aislamiento (28/09/2026)

**Punto de partida verificado:**

- `main` en `a34746e` (merge del PR #1), con la CI [36432091098](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36432091098) en verde. No había otros PRs abiertos.
- Rama `feat/core-9-1-supabase-auth-tenancy` creada desde ese commit.
- **Proyecto Supabase alojado:** lo creó el propietario (`plataforma-rubik-seo-geo-dev`, organización `Rubik Sota`, plan Free, West EU / eu-west-3, saludable).
  - Tiene la Data API activada, la exposición automática de tablas desactivada y la activación automática de RLS configurada.
  - Sin migraciones ni datos, y sin conexión con GitHub.
  - No consta que Auth, MFA ni migraciones estén configurados. Esta sesión **no lo ha tocado**.
- **Versiones comprobadas antes de implementar:** `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.117.2 y Supabase CLI 2.118.0.
  - Se siguió la guía de Supabase para Next.js: `proxy.ts`, `getClaims()`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y confirmación con `verifyOtp`.
  - También la documentación de Next 16 incluida en `node_modules/next/dist/docs`. Detalle en la [ADR 0003](adr/0003-auth-supabase-y-tenancy.md).

**Hecho:**

- **Autenticación real en el servidor:**
  - Supabase Auth con correo y contraseña: registro con confirmación de correo, inicio y cierre de sesión, y `/auth/confirm` con `verifyOtp`.
  - `src/proxy.ts` refresca la sesión; cada página protegida la verifica con `getClaims()` (`requireSession()`).
  - Solo se usa la clave publicable. Ninguna clave secreta está en el código ni en `NEXT_PUBLIC_*`, y el build y el servidor se niegan a arrancar si aparece una.
- **Demo eliminada:**
  - Se borraron los fixtures, la cookie `rubik_demo_session` y el selector de usuarios ficticios.
  - `AUTH_MODE=mock` sigue prohibido en producción (build, start e instrumentación) y ya no activa nada en desarrollo.
- **Modelo y RLS** (`supabase/migrations/20260928120000_core_9_1_tenancy.sql`):
  - Tablas `organizations`, `organization_members`, `projects` y `project_members`.
  - FK compuestas para la coherencia de tenant.
  - Privilegios explícitos, por columna en `UPDATE`.
  - Políticas solo para `authenticated`, con `USING` y `WITH CHECK`.
  - Funciones auxiliares `SECURITY DEFINER` en el esquema no expuesto `private`.
  - Triggers de titular inicial y de último titular.
  - Roles de proyecto = roles humanos del Core; la organización solo tiene `owner`/`member`, con el mapeo documentado en la ADR 0003.
- **Autorización:**
  - RLS filtra cada consulta y mutación por organización.
  - El Core (`authorize`/`MATRIX`) decide las acciones con el rol guardado en `project_members`.
  - Otro tenant, un proyecto inexistente o un scope mal formado dan el mismo 404.
- **Interfaz:**
  - `/acceso` (inicio de sesión), `/registro`, y `/organizaciones` para crear organizaciones y, si eres titular, proyectos.
  - Panel y proyectos leen la base de datos.
  - «Equipo» y «Miembros» siguen como «No disponible todavía»: las invitaciones envían correos y requieren decisión del propietario.
- **Supabase local:**
  - `supabase/config.toml` con solo Auth, Postgres, API y Mailpit; confirmación de correo activada y contraseña de 12+ caracteres con letras y números.
  - Plantilla de confirmación y `seed.sql` vacío.
  - Scripts `db:start`, `db:stop`, `db:reset`, `test:db` y `test:integration`.
  - `scripts/supabase-test-env.mjs` lee las claves locales en tiempo de ejecución y rechaza hosts no locales.
- **CI:**
  - `verify` (Node 22/24) comprueba sin Supabase: sin inicio de sesión, cookies falsificadas dan 307, y se rechazan `AUTH_MODE=mock` y una clave secreta en `NEXT_PUBLIC_*`.
  - El nuevo job `e2e` levanta un stack local de Supabase y ejecuta pgTAP, un chequeo de tipos frente a las migraciones, integración, un build de producción conectado y Playwright.
- **Documentación:** [ADR 0003](adr/0003-auth-supabase-y-tenancy.md), [SETUP-SUPABASE](SETUP-SUPABASE.md) (estado real, pruebas locales y lo que falta para el proyecto alojado), [ENVIRONMENT](ENVIRONMENT.md), [ARCHITECTURE](ARCHITECTURE.md), README, CLAUDE.md, ROADMAP y capturas nuevas en [docs/visual](visual/README.md).

**Pruebas locales** (Windows, Node 24.14.1, Docker 29.2.0, Supabase CLI 2.118.0):

- `npm run verify`: en verde.
  - Pin del Core.
  - Guard de secretos (139 ficheros).
  - ESLint y `tsc` sin incidencias.
  - Vitest: 7 ficheros, 39/39.
  - `next build`: 16 rutas dinámicas y el proxy.
- `npm run test:db` (pgTAP): 52/52.
- `npm run test:integration`: 9/9.
  - Registro con confirmación real vía Mailpit.
  - Inicio y cierre de sesión, con el refresh token revocado.
  - Contraseñas erróneas o débiles.
  - Peticiones anónimas.
  - Lecturas y escrituras entre tenants, y manipulación de IDs.
  - Usuario sin pertenencia con `user_metadata` falsificado.
  - Roles.
  - Esquema `private` no expuesto.
- `E2E_PORT=3227 npm run visual:evidence` (Playwright): 71 pasan y 16 se omiten.
  - Los 8 flujos de navegador de `auth-tenancy.spec.ts` se ejecutan una vez, en escritorio, y se omiten en los dos anchos móviles.
  - 13 vistas × 3 anchos.
- **Mutación de comprobación:** con la política de lectura de `projects` cambiada a `using (true)`, fallan 4 aserciones pgTAP y 4 pruebas de integración. Restaurada y comprobada de nuevo (52/52).
- **Smoke manual de producción:**
  - Sin variables: `auth: not-configured`, y 307 en rutas protegidas incluso con cookies falsificadas.
  - Con una clave `sb_secret_…` en `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: el build sale con 2 y `next start` con 1.
  - Con `AUTH_MODE=mock`, `next start` sale con 1.
  - Build conectado al stack local: `auth: supabase` y `/panel` → 307 a `/acceso`.

**PR y CI:** [PR #2](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/2), abierto contra `main`, sin merge.

| Commit | Contenido | Run | Resultado |
|---|---|---|---|
| `5db5932` | CORE-9.1 completo | [36437771145](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36437771145) | ❌ No llegó a ejecutarse: YAML inválido (nombre del job `e2e` con `: ` sin comillas) |
| `bb8e22b` | Corrige las comillas del nombre del job | [36437992335](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36437992335) | ✅ Verde. `verify` en Node 22.23.2 y 24.21.0: Vitest 39/39, build y smoke. `e2e`: pgTAP 52/52, tipos iguales a las migraciones, integración 9/9, build conectado, Playwright 71 pasan y 16 se omiten |
| `019fe4b` | Documentación: registra el PR #2 y sus runs | [36438699451](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36438699451) | ✅ Verde (verify Node 22/24, e2e) |
| `120a89c` | Sesión 5b: error genérico al crear, método aprobado, flujo CLI de migración, decisiones propuestas | [36440853359](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36440853359) | ✅ Verde. `verify` en Node 22 y 24: Vitest 41/41, build y smoke. `e2e`: pgTAP 52/52, integración 9/9, Playwright 72 pasan y 18 se omiten |

Los commits que solo registran runs en ROADMAP y HANDOFF tienen su CI en la pestaña Checks del PR.

**Límites:**

- Nada está aplicado ni probado contra el proyecto alojado.
- No hay gestión de miembros desde la interfaz (invitaciones), ni recuperación de contraseña, MFA ni auditoría (CORE-9.2).
- No hay OAuth, IA, conectores, datos de clientes ni despliegue.

**Decisiones y tareas del propietario:**

*Actualizadas en la sesión 5b; ver debajo.*

**Siguiente bloque:** CORE-9.2 (persistencia, auditoría y provenance), tras la revisión de CORE-9.1.

## Sesión 5b — ajustes de revisión del PR #2 (28/09/2026)

**Punto de partida verificado:**

- PR #2 abierto, con HEAD local y remoto en `019fe4b` y su CI [36438699451](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36438699451) en verde.
- `main` sigue en `a34746e`.

**Decisión del propietario registrada:** **correo y contraseña es el método inicial de acceso** (aprobado). Sale de la lista de decisiones pendientes en la ADR 0003, SETUP-SUPABASE, ROADMAP, este HANDOFF y la descripción del PR #2.

**Hecho:**

1. **Error genérico al crear.**
   - Si falla la creación de una organización o de un proyecto, el formulario muestra siempre «No se ha podido crear. Revisa los datos o prueba con otro identificador.» (código `no-creado`).
   - Se eliminó el mensaje «Ese identificador ya está en uso», de modo que no se confirma si un `slug` existe.
   - Pruebas nuevas:
     - `tests/security-static.test.ts`: la acción no distingue códigos de error, y ningún mensaje dice que un identificador esté ocupado;
     - e2e «a taken organization identifier gets a generic error that does not confirm it exists»: una cuenta sin organizaciones intenta usar el identificador de otro tenant.
   - El riesgo residual (se puede sospechar, pero no confirmar) queda documentado en la ADR 0003.
2. **SETUP-SUPABASE §3:**
   - Eliminada la opción de aplicar la migración pegándola en el SQL Editor.
   - Documentado el flujo versionado con la CLI fijada: `link`, `migration list --linked`, inspección de `db push --dry-run`, aplicación explícita con `db push` por el propietario y comprobación posterior.
   - Claude **no** ha ejecutado `db push` ni ha accedido al proyecto alojado.
3. **Decisiones propuestas** registradas en la ADR 0003 §1 y §5 y en SETUP-SUPABASE:
   - registro abierto solo para las pruebas iniciales, cerrado antes de exponer la plataforma a clientes;
   - roles de organización `owner`/`member`;
   - solo el rol de proyecto `owner` edita el proyecto.

   No se implementan invitaciones, MFA de usuarios ni recuperación de contraseña en esta fase.

**Pruebas locales** (Windows, Node 24.14.1, stack local de Supabase):

- `npm run verify`: en verde, con Vitest 7 ficheros y 41/41.
- `npm run test:db`: 52/52.
- `npm run test:integration`: 9/9.
- `E2E_PORT=3227 npx playwright test`: 72 pasan y 18 se omiten. Los 9 flujos de navegador se ejecutan una vez, en escritorio.

**PR y CI:** en la tabla del PR #2 (sesión 5). `120a89c` → [run 36440853359](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36440853359), en verde. La descripción del PR #2 está actualizada. Sin merge ni despliegue.

*Tareas actualizadas en la sesión 5c; ver debajo.*

**Tareas anteriores (sustituidas):**

1. ~~Revisar el PR #2 y la ADR 0003: confirmar las decisiones propuestas.~~ Aprobadas en la sesión 5c.
2. Tras el merge, configurar Auth en el proyecto alojado y aplicar la migración él mismo con el flujo de la CLI y `--dry-run` ([SETUP-SUPABASE §3](SETUP-SUPABASE.md)). Incluye: MFA de la cuenta, confirmación de correo, URLs de redirección, plantilla de confirmación y SMTP si hace falta.
3. Cerrar el registro abierto antes de exponer la plataforma a clientes.
4. En fases posteriores: invitaciones, MFA de usuarios y recuperación de contraseña (requiere SMTP propio).
5. Las tareas de hosting siguen igual ([HOSTING](HOSTING.md)).

## Sesión 5c — decisiones aprobadas y URLs de Auth (28/09/2026)

**Punto de partida verificado:**

- PR #2 abierto, con HEAD local y remoto en `a20ef0f` y su CI [36441560553](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36441560553) en verde.
- `main` sigue en `a34746e`.

**Decisiones aprobadas por el propietario** (registradas en ADR 0003, SETUP-SUPABASE, ROADMAP y la descripción del PR #2):

1. Registro abierto solo durante las pruebas iniciales; debe cerrarse antes de dar acceso a clientes.
2. Roles de organización `owner`/`member`.
3. Solo el rol `owner` del proyecto puede editar sus datos descriptivos.
4. Se acepta el riesgo residual de que pueda deducirse si un identificador global está ocupado. Se mantienen el modelo actual y el mensaje genérico.

Junto con el método correo y contraseña (sesión 5b), ya no queda ninguna decisión de CORE-9.1 pendiente del propietario.

**SETUP-SUPABASE §3 corregido:**

- **Site URL:** `http://localhost:3000`.
- **Redirect URL permitida** para la confirmación: `http://localhost:3000/auth/confirm`, como URL exacta.
- **Comprobación contra la documentación vigente:** [Supabase · Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), consultada el 28/09/2026.
  - La Site URL es la redirección por defecto cuando no hay `redirectTo`.
  - La lista de Redirect URLs admite URLs exactas o patrones glob, y `redirectTo` debe coincidir con ella.
- **Coherencia con el código:** la aplicación envía `emailRedirectTo = <origen>/auth/confirm` (`src/lib/auth/actions.ts`), y `supabase/config.toml` usa los mismos valores en local.

Sin cambios de código, así que las pruebas son las de la sesión 5b. `npm run verify` se ejecutó de nuevo y está en verde: secretos (139 ficheros), lint, `tsc`, Vitest 41/41 y build.

**Tareas del propietario (vigentes):**

1. Revisión final y merge del PR #2: autorizados a Codex por el propietario el 28/09/2026; sujetos a CI verde del HEAD final.
2. Tras el merge, en el proyecto alojado y siguiendo [SETUP-SUPABASE §3](SETUP-SUPABASE.md):
   - MFA de la cuenta;
   - Email con confirmación y la política de contraseñas;
   - Site URL `http://localhost:3000` y Redirect URL `http://localhost:3000/auth/confirm`;
   - plantilla de confirmación;
   - SMTP si hace falta;
   - aplicar la migración con la CLI tras inspeccionar `db push --dry-run`.
3. Cerrar el registro abierto antes de dar acceso a clientes.
4. En fases posteriores: invitaciones, MFA de usuarios y recuperación de contraseña.
5. Las tareas de hosting siguen igual ([HOSTING](HOSTING.md)).

**CI:** el run del HEAD final de esta sesión se registra en la descripción del PR #2 y en su pestaña Checks, no en otro commit, para que el HEAD revisado sea el definitivo. El último run registrado en un commit es el de `120a89c` ([36440853359](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36440853359)); `a20ef0f` → [36441560553](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36441560553), también en verde.


## Sesión 5d — actualización documental y cierre de CORE-9.1 (28/09/2026)

**Autorización del propietario:** actualizar la documentación del repositorio y fusionar el PR #2 si la revisión y la CI final están correctas.

**Estado verificado antes del ajuste documental:**

- PR #2 abierto contra `main`, mergeable, con HEAD `05e09258c2d6e86292626539f59caeec6c714cbd`.
- CI de ese HEAD: [run 36443119218](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36443119218), en verde en `verify` (Node 22/24) y `e2e` (pgTAP 52/52, integración 9/9, Playwright 72 pasan y 18 se omiten).
- Las decisiones de CORE-9.1 están aprobadas y ya constan en ADR 0003, SETUP-SUPABASE y la descripción del PR.

**Documentación actualizada por Codex en esta rama:**

- ROADMAP: estado de CORE-9.1, último HEAD verificado, CI y los pasos manuales del propietario tras el merge.
- HANDOFF: el punto de partida previo se conserva como historial; se añade esta sesión para reflejar autorización, revisión y cierre.

**Alcance y límites:** la documentación no cambia código ni migraciones. Esta revisión no aplica migraciones, no ejecuta `db push`, no modifica el proyecto Supabase alojado y no despliega la aplicación. La configuración y prueba manual del Supabase alojado siguen siendo tareas del propietario según [SETUP-SUPABASE §3](SETUP-SUPABASE.md).

**Cierre verificado:** PR #2 fusionado en `main` el 28/09/2026 mediante el merge `debbb7078ea1af4931dea59d2169f8eda7a9967b`. La CI posterior al merge, [run 36445304853](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36445304853), terminó en verde en `verify` Node 22/24 y `e2e` con Supabase local. El artefacto visual [capturas-core-9-1](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36445304853) está disponible en el run. Siguen pendientes las tareas manuales del propietario descritas en SETUP-SUPABASE §3; no se ha aplicado migración al proyecto alojado ni se ha desplegado la plataforma.

## Sesión 6 — privilegios de `public.rls_auto_enable()` (28/09/2026)

**Punto de partida verificado:**

- `main` en `5ab1af4`: PR #2 fusionado (`debbb70`) más los commits documentales del propietario y de Codex.
- CI de `main`: [run 36447381733](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36447381733), en verde.
- Rama nueva `fix/core-9-1-rls-auto-enable-privileges` desde `5ab1af4`.

**Informado por el propietario** (Claude no accede al proyecto alojado y no lo ha verificado):

- CORE-9.1 está aplicada en el proyecto alojado.
- `db advisors --linked --type security --level info` detecta `public.rls_auto_enable()`: es `SECURITY DEFINER`, propiedad de `postgres`, está asociada a un event trigger, y `anon` y `authenticated` pueden ejecutarla.

**Investigación del origen** (código público de `supabase/supabase`, commit `c569a29`):

- Studio crea la función y el event trigger `ensure_rls` con la plantilla `AUTO_ENABLE_RLS_EVENT_TRIGGER_SQL`.
  - Al crear el proyecto (`ProjectCreationForm`, opción `enableRlsEventTrigger`), la envía como SQL inicial.
  - Desde el aviso «Automatically enable RLS» del panel, la ejecuta.
  - La guía [Event triggers](https://supabase.com/docs/guides/database/postgres/event-triggers) publica la misma función.
- La plantilla crea la función en `public` como `SECURITY DEFINER` y no revoca nada.
- Reproducida literalmente en local (`supabase/fixtures/studio-rls-auto-enable.sql`), da el ACL `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.
- Encaja con que el proyecto se creara con la RLS automática activada.

**Hecho:**

- **Migración** `supabase/migrations/20260928150000_rls_auto_enable_privileges.sql`:
  - conserva la función y `ensure_rls` si existen;
  - los crea con la plantilla de Studio si no existen (local y CI);
  - revoca `EXECUTE` a PUBLIC, `anon` y `authenticated`;
  - es idempotente.
  - `service_role` conserva `EXECUTE`, porque no estaba en el alcance pedido. Queda anotado como opción del propietario.
- **pgTAP** `supabase/tests/rls_auto_enable.test.sql` (22 aserciones):
  - la función y el trigger se conservan, con sus mismos eventos y etiquetas;
  - el ACL es explícito, sin PUBLIC, `anon` ni `authenticated`, y el propietario conserva `EXECUTE`;
  - `anon` y `authenticated` reciben 42501 al llamarla;
  - `CREATE TABLE`, `CREATE TABLE AS`, `SELECT INTO` y las tablas particionadas en `public` reciben RLS;
  - una tabla creada por un rol **sin** `EXECUTE` también recibe RLS;
  - otros esquemas no cambian.
- **Prueba estática:** `public.rls_auto_enable` es la única función `SECURITY DEFINER` expuesta permitida. Tiene que ser de event trigger y tener la revocación, sin ningún `grant`.
- **CI (job `e2e`):** después de pgTAP, recrea la función y el trigger con la plantilla de Studio (estado del proyecto alojado). Comprueba que pgTAP **falla** («PUBLIC cannot execute it»), aplica la migración dos veces y comprueba que pgTAP pasa.
- **Documentación:**
  - SETUP-SUPABASE: estado informado por el propietario, y §5 con origen, corrección, pasos para aplicarla con la CLI y comprobación con el Advisor;
  - ADR 0003 §4: la excepción documentada;
  - ROADMAP y este HANDOFF.

**Pruebas locales** (Windows, Node 24.14.1, Docker, Supabase CLI 2.118.0):

- `npm run test:db` tras `db reset`: 2 ficheros, 74/74 (52 de tenancy y 22 nuevas).
- **Simulación del estado alojado:** con la función y el trigger borrados y recreados con la plantilla de Studio, pgTAP falla en 6 aserciones de permisos (9–11, 13, 14 y 19). Tras aplicar la migración sobre los objetos existentes, 74/74; tras reaplicarla, 74/74. El ACL resultante es `{postgres=X/postgres,service_role=X/postgres}`.
- `npm run verify`: en verde, con secretos (142 ficheros), lint, `tsc`, Vitest 42/42 y build.
- `npm run test:integration`: 9/9.
- Los tipos generados coinciden con las migraciones.
- `E2E_PORT=3227 npx playwright test`: 72 pasan y 18 se omiten.
- `db advisors --local --type security --level info` (CLI 2.118.0) **no** detecta este aviso, ni siquiera con la plantilla abierta. Por eso no se usa como prueba.

**PR y CI:** [PR #3](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/3) contra `main`, sin merge.

| Commit | Contenido | Run | Resultado |
|---|---|---|---|
| `32fcfd5` | Migración, pgTAP, fixture de Studio, paso de CI y documentación | [36470062130](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36470062130) | ✅ Verde. `verify` en Node 22 y 24. En `e2e`: pgTAP 74/74; con el estado de Studio, pgTAP falla como se espera (tests 9–11, 13–14 y 19); tras la migración aplicada dos veces, 74/74; integración y Playwright 72 pasan y 18 se omiten |

El commit que registra este run solo cambia ROADMAP y HANDOFF. Su CI, la del HEAD final, consta en la descripción del PR #3 y en su pestaña Checks.

**No hecho, a propósito:** la migración nueva no se ha aplicado al proyecto alojado, no se ha ejecutado `db push`, no se ha accedido al proyecto alojado, y no hay merge ni despliegue.

**Tareas pendientes en ese momento (estado actualizado en la sesión 7):**

1. Revisar y fusionar el PR de esta rama.
2. Aplicar la migración con la CLI, siguiendo [SETUP-SUPABASE §5](SETUP-SUPABASE.md): `migration list --linked`, `db push --dry-run` (solo `20260928150000`), `db push` y repetir `db advisors --linked --type security --level info`.
3. Decidir si `service_role` también debe perder `EXECUTE`.
4. Siguen pendientes las tareas anteriores de SETUP-SUPABASE §3: Auth, URLs, plantilla, SMTP, prueba con dos cuentas y cerrar el registro antes de dar acceso a clientes.

## Sesión 7 — migración alojada aplicada y Advisor limpio (28/09/2026)

**Cierre de CORE-9.1 y su seguimiento:**

- PR #3 se fusionó en `main` mediante el merge `c1567d7ef3c8502aa4a5ed9dd02224da40d6b9e7`.
- HEAD revisado: `0429a793749f65e8b84b0e7b5cd469f7daddb850`. CI [run 36472096880](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36472096880) terminó en verde: verify Node 22, verify Node 24 y e2e local Supabase.
- El propietario actualizó su copia de `main`; el pull avanzó de `5ab1af4` a `c1567d7` e incluyó la migración.
- Antes de aplicarla, `migration list --linked` mostraba `20260928150000` solo en local y `db push --dry-run` proponía únicamente `20260928150000_rls_auto_enable_privileges.sql`.
- El propietario confirmó el prompt de `db push`. La CLI informó `Applying migration 20260928150000_rls_auto_enable_privileges.sql...` y `Finished supabase db push.`.
- Después, `migration list --linked` mostró `20260928120000` y `20260928150000` aplicadas tanto en local como en remoto.
- La comprobación `npx supabase@2.118.0 db advisors --linked --type security --level info` devolvió **No issues found**.

Esta verificación procede de la salida de terminal compartida por el propietario el 28/09/2026; Codex no accedió directamente al Supabase alojado. No se desplegó la aplicación.

**Siguiente trabajo:** completar la prueba manual de Auth contra el proyecto alojado con dos cuentas distintas (registro, confirmación de correo, creación de organizaciones/proyectos y aislamiento entre tenants), revisar el envío y la plantilla de confirmación y cerrar el registro abierto antes de dar acceso a clientes. Después, iniciar CORE-9.2 según el [plan de ejecución del Core](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/blob/main/docs/core-9/EXECUTION-PLAN.md).


## Sesión 8 — CORE-9.2, unidad 1: auditoría append-only y resultados firmados (07/10/2026)

**Punto de partida verificado:**

- `main@610256d`, sin cambios locales.
- Baseline `npm run verify`: secretos (143 ficheros), lint, `tsc`, Vitest 42/42 y build, en verde.
- En el Core, `main@f276837`: 314/314.

**Core (PR separado):** [PR #19](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/pull/19), D-28, HEAD `a243ae0`.

- Digest inyectable y firmado (`dataHashAlg`), sin downgrade al mock.
- `canonicalJson` exportado.
- El firmante recibe `keyId`.
- `offpage.measurement` acepta con `platform` el resultado que reconstruye `verifyProvenance`.
- 321/321 pruebas.

El pin de este repo apunta a ese HEAD hasta el merge. **Tras el merge, cambiar el pin al commit fusionado.**

**Hecho (rama `feat/core-9-2-persistence-provenance`, [ADR 0004](adr/0004-persistencia-auditoria-y-provenance.md)):**

- Migración `20261007120000_core_9_2_audit_and_provenance.sql`:
  - `audit_events`: encadenado, actor real e inmutabilidad en BD, bloqueo por proyecto, sin filtrar datos de cadenas ajenas;
  - `provider_results`: solo `sha256`, columnas iguales al payload firmado, inmutable, borrado solo por `owner`.
- `src/lib/provenance/`:
  - keyring HMAC con rotación;
  - auditoría (Core `auditEvent`/`verifyAuditChain` con SHA-256, más HMAC);
  - sellado y apertura de resultados (Core `signProvenance`/`verifyProvenance`);
  - repositorio Supabase con reintento ante concurrencia, exportación y borrado.
- Variables `PROVENANCE_SIGNING_KEYS`/`PROVENANCE_ACTIVE_KEY_ID`, solo de servidor, documentadas en ENVIRONMENT.
- Tipos de BD regenerados.

**Pruebas locales** (Linux, Node 22.22.0, Docker 29.8.2, Supabase CLI 2.118.0):

- `npm run verify`: en verde; secretos (152 ficheros) y Vitest 53/53 (9 de provenance y 2 estáticas nuevas).
- `npm run test:db`: 113/113 (39 nuevas).
- `npm run test:integration`: 18/18 (9 nuevas). Repetida 3 veces sin fallos, incluida la prueba de concurrencia.
- Playwright: con la configuración del repositorio no arranca en el contenedor, porque su Chromium preinstalado (build 1194) no es el que espera `@playwright/test` 1.63 y no se descargan navegadores. Ejecutado después con una configuración local no versionada que solo cambia `executablePath` a ese Chromium: **72 pasan y 18 se omiten**, el mismo resultado que la CI.
- Un hallazgo de pgTAP se corrigió antes del commit: el trigger revelaba la longitud de la cadena a un no miembro.

**PR y CI:** [PR #5](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/5). HEAD `9c8fd87` → [run 37613715959](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37613715959), en verde: verify Node 22/24 y e2e (pgTAP, integración y Playwright). El Core PR #19 tiene su CI en verde en Node 20/22: [run 37612032208](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/actions/runs/37612032208).

**No hecho, a propósito:**

- No se aplicó la migración al proyecto alojado ni se usaron claves reales.
- No hay merge ni despliegue.

**Siguiente paso:**

1. Revisar y fusionar el Core PR #19 y luego este PR, con el pin actualizado.
2. El propietario decide la custodia de claves y aplica la migración ([SETUP-SUPABASE §6](SETUP-SUPABASE.md)).
3. Siguiente unidad de 9.2: consentimientos y ledger de gasto.
4. Después, CORE-9.3: importación manual con las mismas garantías.

## Sesión 9 — CORE-9.3: importación manual (07/10/2026)

**Base:** rama `feat/core-9-3-manual-import`, creada desde `feat/core-9-2-persistence-provenance` (`73ffbd1`, PR #5). Está apilada: su PR apunta a la rama de 9.2 para que el diff sea solo de 9.3.

**Hecho** ([ADR 0005](adr/0005-importacion-manual.md)):

- Contrato `rubik-import-v1`:
  - rechazo del fichero entero, sin guardar nada;
  - errores por fila sin el valor rechazado;
  - estados `complete`, `partial`, `failed` y `empty`.
- Migración `20261007150000`, tabla `imports`:
  - un único `INSERT`;
  - SHA-256 único por proyecto;
  - fechas de captura y de importación separadas;
  - restricciones de coherencia, RLS por rol e inmutable.
- Repositorio: importar, listar, abrir, buscar por URL y borrar. Cada fichero, aceptado o rechazado, queda en la auditoría firmada. La exportación del proyecto incluye las importaciones.
- Interfaz:
  - sección «Importaciones» con lista, formulario (solo roles con `draft`), detalle y borrado con confirmación (solo `owner`);
  - ruta `/exportar` (solo `export-data`, 404 en cualquier otro caso).
- Banner y `/api/salud` pasan a «CORE-9.3».
- Playwright arranca el servidor de pruebas con una clave HMAC aleatoria por ejecución.

**Defectos encontrados por las pruebas y corregidos antes del commit:**

1. `Intl.DateTimeFormat` no admite `dateStyle`/`timeStyle` junto con `timeZoneName`: la página fallaba al renderizar.
2. La guarda estática detectó que el texto de la interfaz nombraba la variable de la clave.
3. Los selectores e2e eran ambiguos con el anunciador de rutas de Next.

**Pruebas locales** (Linux, Node 22.22.0, Supabase CLI 2.118.0):

- `npm run verify`: en verde, Vitest 78/78.
- `npm run test:db`: 137/137 (24 nuevas).
- `npm run test:integration`: 24/24 (6 nuevas).
- Playwright con el Chromium del contenedor y la configuración local que solo cambia `executablePath`: 81 pasan y 24 se omiten. El flujo de importación se repitió 3 veces sin fallos.

**No hecho:**

- No se aplicó nada en el entorno alojado.
- No se importaron datos reales de clientes.
- No hay merge.

**Siguiente paso:**

1. Revisar y fusionar #5 y luego este PR, previo cambio del pin del Core tras el merge de Core#19.
2. Con un proyecto autorizado para Sarah, importar la auditoría de su preview (repo madre, documento 08) como primer caso real.
3. Después, la auditoría live con OpenSEO (unidad 3), según el plan.

## Sesión 9b — pin del Core tras el merge de Core#19 (07/10/2026)

**Punto de partida:** Core PR #19 fusionado en `main` del Core con merge commit `8a1f80883b83536d02301d073259b010f696409b`. Su árbol es idéntico al de `a243ae0` (`git diff a243ae0 8a1f808` vacío).

**Hecho (rama `feat/core-9-2-persistence-provenance`, PR #5):**

- `package.json` y `package-lock.json` fijan el Core a `8a1f808`. En el lockfile solo cambian las dos referencias del commit y la integridad del paquete git; no se tocó ninguna otra dependencia.
- ADR 0004 y ROADMAP actualizados.

**Pruebas locales** (Linux, Node 22.22.0, npm 10.9.4): `npm ci` limpio y `npm run verify` en verde: `core pin ok: 8a1f808…`, Vitest 53/53, build correcto. pgTAP, integración y Playwright no se repitieron en local porque el código no cambia; los ejecuta la CI del HEAD.

**No hecho, a propósito:** merge de #5 y #6 (requiere autorización del propietario según este CLAUDE.md), migraciones alojadas y claves reales.

**Siguiente paso:** con la CI de este HEAD en verde y la autorización del propietario, fusionar #5 y cambiar la base de #6 a `main`.

## Sesión 10 — normalizador Lighthouse → `rubik-import-v1` (07/10/2026)

**Punto de partida:** `main@2beed3a`, con CORE-9.2 (PR #5) y CORE-9.3 (PR #6) fusionados.

Salud de `main` en local (Linux, Node 22.22.0, Docker 29.8.2, Supabase CLI 2.118.0):

| Comprobación | Resultado |
|---|---|
| `npm ci` y `npm run verify` | 78/78 y build correcto |
| `npm run test:db` | 137/137 |
| `npm run test:integration` | 24/24 |

**Hecho (rama `feat/lighthouse-import-normaliser`):**

- `src/lib/imports/lighthouse.ts`, el CLI `scripts/lighthouse-to-import.mjs` y la sección «Normalizador de Lighthouse» de la ADR 0005.
- ROADMAP: CORE-9.2 unidad 1 y CORE-9.3 pasan a fusionadas.

**Pruebas locales:** verify 84/84 (6 nuevas) e integración 25/25 (1 nueva: el recorrido normalizar, importar, auditar, releer y exportar).

**Evidencia de uso:** sobre 12 informes de Lighthouse 13.5.0 de una build local de la web de Sarah, el CLI produjo 32 hallazgos que `parseImport` acepta como `complete`. **No se importaron datos de Sarah en ninguna instancia.**

**Siguiente paso:** importar en un proyecto autorizado cuando exista una instancia desplegada.

## Sesión 11 — estado tras el merge del PR #7 (07/10/2026)

**Punto de partida:** `origin/main@fd8ef5600b6757d995afff33655c17ee4285a227`, merge del [PR #7](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/7) (normalizador Lighthouse y documentos de consolidación). Core fijado en `8a1f808`.

**CI de `main`:** [run 37655703584](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37655703584) del push de `fd8ef56`, **completed / success**: verify (Node 22), verify (Node 24) y e2e (pgTAP, tipos, integración, build conectado al stack local y Playwright).

**Reproducción local** (worktree limpio de `origin/main`, Linux, Node 22.22.0, Supabase CLI 2.118.0, solo stack local):

| Comando | Resultado |
|---|---|
| `npm ci` | correcto |
| `npm run verify` | `core pin ok: 8a1f808…`, secretos 181 ficheros, Vitest 84/84 (11 ficheros), build correcto |
| `npm run db:start` y `npm run db:reset` | migraciones aplicadas al stack local |
| `npm run test:db` | pgTAP 137/137 |
| `npm run test:integration` | 25/25 (4 ficheros), incluido `lighthouse-import.integration.test.ts` |
| `node scripts/lighthouse-to-import.mjs … <informe ficticio>` | 2 hallazgos; el fichero resultante se importó, auditó, releyó y exportó en el stack local con una prueba temporal no versionada |
| `npm run db:stop` | stack detenido |

**Hecho (rama `docs/post-7-merge-status`):** notas de vigencia fechadas en `RUBIK-CONSOLIDATION-AUDIT.md` y `MAIN-HEALTH-REPORT.md` (el texto histórico no se reescribe) y estado de #7 en ROADMAP (fila CORE-9.3).

**No hecho, a propósito:** merge, despliegue, migraciones alojadas, borrado de ramas e importación de datos de Sarah.

**Siguiente paso:** revisión del propietario del PR draft de esta rama; después, la siguiente unidad de CORE-9.2 o el piloto cuando se autorice.

## Sesión 11 — puente OpenSEO, primer tramo (08/10/2026)

**Punto de partida verificado:**
- `main@377fa73` (merge de #8), con CORE-9.2 unidad 1, CORE-9.3 y el normalizador Lighthouse fusionados.
- Core fijado en `8a1f808`. Su `docs/integrations/OPENSEO.md` (CORE-7.1, D-22) se leyó antes de editar.

**Hecho** (rama `feat/openseo-bridge-site-audit`, PR Draft; [ADR 0006](adr/0006-puente-openseo.md)):

- `src/lib/openseo/mcp-client.ts`: cliente MCP Streamable HTTP solo de servidor.
  - Protocolo: `initialize`, `notifications/initialized` y `tools/call`, con respuesta JSON o SSE, sesión, timeout y sin redirecciones.
  - **Lista blanca:** `whoami`, `run_site_audit`, `get_audit_status`, `get_audit_issues` y `get_audit_pages`. Todo lo demás se rechaza antes de la red: keywords, SERP, backlinks, rank tracking, Lighthouse, listar o borrar auditorías, y proyectos.
  - `run_site_audit` exige `runLighthouse:false` y `maxPages` dentro del límite.
- `src/lib/openseo/config.ts`: variables solo de servidor, validadas.
  - Rechaza datos de OpenSEO en `NEXT_PUBLIC_*`.
  - Rechaza previews, IP y `localhost` como hosts auditables.
  - Límite de páginas entre 10 y 500.
- `src/lib/openseo/bridge.ts`: usa el Core sin copiarlo.
  - Prueba de conexión: `OpenSEOAdapter.connectivity()` (health) más `providers.openseoConnectivity` con el verificador de `whoami`.
  - Auditoría manual (`trigger:"manual"`, `runLighthouse:false`) restringida al dominio del proyecto.
  - Seguimiento con `auditStatus` y, si termina, `auditIssues` y `auditPages` normalizados por el Core. Las filas de otros dominios se ocultan y se cuentan.
- Interfaz:
  - `src/lib/openseo/actions.ts`: Server Actions con sesión, RLS y `manage-connectors`.
  - `src/components/OpenSeoConsole.tsx`: tres pasos con un clic cada uno; la auditoría pide una casilla de confirmación.
  - Página `/proyectos/…/auditoria-tecnica`: no llama a OpenSEO al renderizar.
- Documentación y guardas:
  - `.env.example` y `docs/ENVIRONMENT.md`: solo nombres de variables.
  - Guarda de secretos: detecta claves `oseo_…`.
  - Catálogo de conectores: el texto de OpenSEO indica que no hay conexión verificada.
  - e2e: la sección nueva en las rutas protegidas, en el aislamiento entre tenants y en la batería visual (capturas 18 y 19).
