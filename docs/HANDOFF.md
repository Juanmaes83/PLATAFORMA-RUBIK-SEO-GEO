# Handoff

## Verificación real OpenSEO — 2026-10-08/09

- Login de Rubik recuperado corrigiendo la URL de Supabase en Vercel. Organización Rubik y proyecto Sarah creados por el propietario.
- Prueba MCP real: CONNECTED, salud correcta y autenticación verificada con el campo userEmail. No se registran identidad ni claves.
- OPENSEO_PROJECT_ID contrastado con la URL real y corregido: se había omitido un carácter. Despliegue de configuración READY.
- Primera auditoría real iniciada: `348a6c58-8aab-4756-a518-25e6b6367bfe`, máximo 10 páginas, Lighthouse desactivado. No relanzar para validar el seguimiento.
- El seguimiento devolvió INVALID_RESPONSE. OpenSEO usa `{ status: { status, currentPhase, pagesCrawled, pagesTotal } }`; el mock antiguo y el Core esperaban campos planos.
- Corrección centralizada en Core PR #20, con compatibilidad del formato anterior. 31/31 pruebas locales y CI de Core en Node 20/22 en verde. La plataforma fija el commit `56867f845dc63a118ae5f8cd5c302440acf5c557` y sus pruebas usan el envoltorio real.
- **Resultado real confirmado el 09/10/2026 (Europe/Madrid):** el propietario consultó `02f2f04d-c7ea-4fe9-bb05-be1c39509938` y recibió `Terminada`, estado `completed`, 10/10 páginas. Informe con dos incidencias de portada (`meta-description-too-long`, `title-too-long`), una página visible y nueve filas ocultas. Las URLs ocultas no se han compartido; no inferir qué hosts contienen. Resultados sin guardar.


## Continuación autónoma — checkpoint 09/10/2026

**Base comprobada:** `main@80d0b9b`, tras las correcciones de lectura/diagnóstico OpenSEO. Vercel, Supabase Auth y primer proyecto real funcionan. El propietario autoriza avanzar, documentar el estado y revisar al día siguiente; no necesita permanecer conectado para desarrollo y pruebas.

**Comprobación alojada de persistencia:** Supabase registra únicamente las migraciones `20260928120000` y `20260928150000` y cuatro tablas de tenancy (`organizations`, `organization_members`, `projects`, `project_members`). No están aplicadas las migraciones CORE-9.2/9.3. La existencia/configuración del firmante necesita verificarse por metadatos y comportamiento seguro: valores vacíos devueltos para secretos no demuestran que falten.

**Implementación preparada en esta continuación (sin declarar despliegue):** selección del ID se sustituye al iniciar otra auditoría y el campo selecciona su contenido al enfocar; límite de 64 caracteres en cliente/servidor rechaza dos UUID concatenados. Lanzamiento y seguimiento se bloquean mutuamente mientras hay una petición en curso. El informe separa páginas/incidencias ocultas y admite solo la pareja `www`/dominio base si el host compañero está autorizado explícitamente en el servidor; no incorpora otros subdominios. Banner y metadata dejan de afirmar «sin conectores». Nuevas pruebas preparadas para alias autorizados, exclusión de subdominios y doble ID. **Pendientes:** `npm run verify`, CI y PR del checkpoint. No se declara nueva consulta real ni resultado de las nueve URLs.

**Limitación del entorno de prueba:** Docker no está disponible localmente en este entorno; las pruebas de Supabase local (pgTAP, integración y e2e completas) deberán ejecutarse en CI o en un entorno con Docker. Este límite no se convierte en aprobación de migraciones alojadas ni sustituye sus pruebas.

**Orden de continuación:** estabilizar selección del ID y el informe/scope; persistir resultados originales firmados y un trabajo activo por proyecto; añadir mapeo OpenSEO por proyecto/consentimiento; desarrollar conectores de lectura y observación con límites. Competidores, backlinks y rank tracking se han desglosado en el backlog como plan, sin activar herramientas ni consumo.

**Límites actuales:** sin persistencia OpenSEO, sin enlace OpenSEO distinto por cliente, sin OAuth GSC/Bing verificado, sin IA ni consultas periódicas de ranking. Auditoría real finalizada no cierra el piloto completo.

**Coordinación con Claude Code:** no hay una sesión Claude Code accesible/activa confirmada desde este entorno. No se afirma trabajo paralelo de Claude. Otro agente puede retomar desde este checkpoint y revisar diff/CI, conservando ramas y sin duplicar la misma unidad. Fuente de tareas: ROADMAP y backlog; comprobar SHA, PR, CI y cambios locales antes de comenzar.

**Para cerrar persistencia alojada:** preparar y probar migraciones nuevas/pendientes con RLS; comprobar custodia y recuperación de claves de firma, aplicar mediante el flujo autorizado de Supabase y verificar exportación/rehidratación. Hasta tener evidencia de esos pasos, no marcar datos guardados como disponibles. OAuth y decisiones de presupuesto se registran como bloqueos específicos y no detienen documentación, pruebas ni unidades independientes.

Los resultados de las pruebas y el PR de esta continuación se añadirán por quien integre el cambio; este checkpoint no inventa pruebas todavía no ejecutadas.

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

**Hecho** (rama `feat/openseo-bridge-site-audit`, [PR #10](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/10) en Draft; [ADR 0006](adr/0006-puente-openseo.md)):

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

**Pruebas locales** (Linux, Node 22.22.0, Supabase CLI 2.118.0, Docker 29.8.2):

| Comprobación | Resultado |
|---|---|
| `npm run verify` | En verde: core pin `8a1f808`, secrets ok, lint, typecheck, Vitest 13 ficheros / 142 pruebas (58 nuevas de OpenSEO), build |
| Bundle del navegador | `.next/static` sin `OPENSEO_`, `oseo_` ni `run_site_audit` |
| Playwright | Contra el stack local, con el Chromium del contenedor (configuración local que solo cambia `executablePath`, no commiteada): **87 pasan, 24 se omiten, 0 fallan** |
| Capturas | 18 y 19 regeneradas a 360, 390 y 1280 px |
| pgTAP e integración | No se repitieron: no hay cambios de esquema ni de repositorio de datos |

**CI:** en verde en `970df17` ([run 37830756873](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37830756873)): verify Node 22, verify Node 24 y e2e con Supabase local. Este commit solo añade esta línea.

**Todas las pruebas de OpenSEO usan un servidor MCP simulado en memoria.** No se hizo ninguna llamada real a OpenSEO.

**Bloqueado por el propietario:**
- Credenciales y variables en el servidor ([ENVIRONMENT](ENVIRONMENT.md)).
- Elegir el campo de `whoami` y el vocabulario de estados tras la primera prueba real.
- Autorizar, o no, el dominio de producción de Sarah. Nunca la preview.
- Revisión y merge del PR.

**Siguiente paso:**
1. El propietario configura las credenciales y pulsa «Probar conexión»; después, una auditoría de 10 a 20 páginas sobre un dominio autorizado.
2. Siguiente tramo: persistencia firmada de los resultados (ADR 0004), un job activo por proyecto (`activeJob`) y el enlace de cada proyecto con su `projectId` de OpenSEO.

### Verificación de este checkpoint

- Comprobación del pin, secretos, ESLint, TypeScript y 148 pruebas unitarias: pasan.
- Build local: bloqueado por `uv_resident_set_memory` (`ENOENT`) en el runtime de este workspace al arrancar Turbopack, después de pasar tests. Pendiente verificar build en CI; no se declara `npm run verify` completo en verde.
- Docker no está disponible en este workspace; las pruebas de PostgreSQL/Supabase y Playwright del cambio deben ejecutarse en CI.
- Revisión periódica solicitada por el propietario: automatización horaria creada para leer estado GitHub, retomar trabajo autorizado y documentar cambios/bloqueos; no es un proceso continuo de Claude Code.

### Entregas posteriores del checkpoint

- PR #14 integrado en `main` (`c2789b9e60e748eab9cee3ea832be740a4d1ff65`) tras CI completa en verde del head `630e946`: verify Node22/24 y e2e Supabase, run37855323689. Preview y producción READY (`dpl_7JMi11kCJotvpnFp3ShGpL5EEvAP`, alias público comprobado). La corrección permite solo companion www/apex autorizado y selecciona la auditoría nueva; no activa persistencia ni multicliente.
- PR #15 prepara callback PKCE `code`/`sb_flow_id` con 19 pruebas nuevas (167 total), sin activar recuperación/invitaciones. Estado y límites alojados detallados en [OPERATIONS-STATUS](OPERATIONS-STATUS.md). No declarar validado el flujo de correo live hasta observarlo.

- Revisión de API/costes OpenSEO en fork `0ffff93101043aad7600a3b6a499a0cd2887ef49`: [OPENSEO-API-CAPABILITIES](OPENSEO-API-CAPABILITIES.md). Herramientas, límites, scopes y consumo de competidores/backlinks/rank contrastados sin llamadas live. La tarifa alojada también incluye auditorías entre las funciones que usan créditos; se corrige la frase «sin funciones de pago» del encabezado para no prometer gratuidad del hosted. Lista blanca del puente intacta.

## Continuación — lectura e historial de resultados por proyecto (09/10/2026)

Base revisada: main `c1a1839e7a160f3be889861f44827e466863cb42`; PR14/15/16 integrados. Solo siguen abiertos los PR documentales históricos9/11; sin otra rama activa sobre esta tarea observada.

Entrega preparada: `loadProviderResult` exige ProjectRef y filtra por resultado, proyecto y organización, con validación de identificadores previa. Una persona con acceso a varios proyectos no puede reabrir el informe de otro pasando su ID al proyecto actual. `listProviderResults` añade lectura paginada de metadatos (25 por defecto,1–100 por página,offset máximo10000), orden estable fecha+ID y error explícito si la lectura falla. La lista no demuestra confianza criptográfica: cada detalle debe verificarse al abrirlo. No incluye data,signed_payload,key_id ni signature.

Pruebas:177 unitarias, ESLint, TypeScript y secretos pasan. Nueva prueba de integración del mismo titular en dos proyectos más aislamiento entre tenants; requiere CI/Supabase local. Docker ausente en workspace y fallo conocido del build local uv_resident_set_memory: no declarar verify/e2e locales completos. No cambia schema ni migraciones.

Límite: esto prepara el repositorio de historial y acota la lectura; todavía no guarda auditorías OpenSEO, no añade pantalla de historial ni bloquea trabajos simultáneos. Las firmas existentes validan el resultado del Core, no deben presentarse como vinculación criptográfica adicional de los IDs externos de fila. Migraciones9.2/9.3 y claves HMAC alojadas siguen pendientes. Trabajo restante en issues17/18.

CI inicial de esta entrega: verify Node22/24 pasa; integración falló al crear fixture de segundo proyecto con INSERT RETURNING antes de estar disponible su pertenencia bajo RLS. Fixture corregido: insert y lectura separados, como el flujo existente. No se modifica ni relaja RLS. Pendiente CI del commit corregido.


## 09/10/2026 — contexto criptográfico del resultado de proveedor

- PR #19 fusionado en `2d6c7a6`: verify Node22/24 y e2e/Supabase local correctos. Vercel confirmó producción READY con ese SHA (`dpl_CHEY4xTg35rnY74fGDoAZrKCzQUT`). Historial acotado y lectura por UUID de proyecto/organización, sin schema nuevo.
- Core PR #22 fusionado en `bd1b9e92e9c9cc68e2a6d8b71cabe9f0dfc65e32`, CI Node20/22 y 331 pruebas correctos. Firma opcional `scopeVersion:1` y contexto estable; se rechaza un resultado vinculado sin contexto esperado o bajo otro proyecto.
- Rama `feat/provider-signed-scope`: pin y tipos actualizados. Se firma `{tenantId:organizationId, projectId:projectId}` con los UUID; lectura y exportación pasan el proyecto autorizado, nunca confían en los UUID de la fila por sí solos. Slugs renombrados no invalidan la firma. Las firmas legacy sin contexto quedan UNTRUSTED (`SCOPE_REQUIRED`); no se re-firman automáticamente.
- Local: 181 pruebas, ESLint, TypeScript, pin, secretos y diff--check correctos. Cuatro regresiones nuevas (replay tenant/proyecto, slugs, legacy, UUID inválido) y prueba de integración que copia una firma genuina a una fila de otro proyecto del mismo titular. Build/DB/e2e pendientes CI; Docker no disponible localmente.
- Todavía pendientes: migraciones alojadas 9.2/9.3 y claves HMAC, captura persistida de auditorías OpenSEO, UI de historial y exclusión atómica de auditorías concurrentes. No se han lanzado llamadas live/de pago ni modificado contenido/indexación de Sarah.

## 09/10/2026 — preparación del enlace auditId/trabajo por proyecto

- Base `main@7ddc9d9`, con PR #19/#20 integrados, CI completa verde y producción comprobada. PR abiertos revisados: solo #9/#11 documentales históricos; no había otra rama activa sobre jobs OpenSEO.
- PR #21 fusionado como `35277d8`: `BridgeDeps.activeJob` solo admite un job `SYNCING` coherente y lo entrega al contrato existente del Core; la respuesta distingue `reused`. Un job inválido se rechaza antes de crear cliente MCP.
- `BridgeDeps.boundAuditId` es una frontera de servidor: cuando el futuro repositorio la aporta, la consulta rechaza ID ausente/distinto con `AUDIT_NOT_BOUND` antes de la red. `undefined` mantiene temporalmente el primer tramo; no debe alimentarse con el formulario.
- Pruebas dirigidas 68/68 y suite 185/185; ESLint y TypeScript correctos. CI completa del run `37864049883`: Node 22/24, pgTAP/RLS, tipos de migración, integración Data API, build y navegador en verde. Producción Vercel READY para el merge (`dpl_F82HEYtPYntCHAgMmq2pAzBjkJoK`). Sin peticiones live: servidor MCP simulado.
- Bloqueo nuevo: `supabase@2.118.0 migration --help` y `migration new --help` abortan en este runtime por un crash de Bun 1.4.1. Conforme al flujo del repositorio, no se inventó una migración. La tabla de jobs, adquisición atómica, RLS y pruebas de carrera siguen pendientes de CLI/CI funcional.
- No se aplicaron migraciones alojadas, no se usaron secretos, no se lanzó auditoría y no se tocó contenido/indexación de Sarah.

## 09/10/2026 — ámbito OpenSEO antes de firmar

- Core PR #23 fusionado en `a6071fc3e772d682f0659d5dc300f505a472bca2`, con CI Node 20/22 y 333/333 pruebas.
- Rama `feat/openseo-scoped-results`: pin actualizado. El puente pasa `acceptUrl` al Core para incidencias/páginas; el resultado confiable ya no contiene filas externas. La UI obtiene los contadores ocultos de `provenance.evidence.scopeFiltered`.
- Se conserva una incidencia global sin URL y la regla www/apex explícitamente autorizada. El predicado solo usa el dominio del proyecto autorizado y la allowlist de servidor.
- Plataforma PR #23 fusionado en `139e2f63749fd70e8db3f98cf49df815fd6096c8`. Verificación local: 185/185 pruebas, lint, TypeScript, pin del Core, secretos y `git diff --check` correctos. CI completa del run `37871833027` en verde: verify Node 22/24 y e2e con Supabase local, RLS, Data API, build y navegador.
- Producción Vercel verificada `READY` en el merge exacto: `dpl_6EnsH1iR2k42ki7GVdtNFt3GBKLs`. No añade almacenamiento, migración ni llamada live. La CLI `supabase@2.118.0 migration new openseo_project_jobs` volvió a abortar por el crash de Bun; no se creó manualmente la migración.

## 09/10/2026 — captura y firma del resultado OpenSEO original

- Base revisada: `main@5b2259b`; solo permanecen abiertos los PR documentales históricos #9/#11, sin otra rama activa observada sobre persistencia.
- PR #25 fusionado en `733080266043f7dee07820f853a3ab5c25013253`: `followSiteAudit` entrega opcionalmente, solo en servidor, los resultados originales de incidencias y páginas después del filtro de proyecto. Un error de captura se informa aparte y no falsea el estado completado de OpenSEO.
- `prepareCompletedAuditResults` exige la marca de confianza del Core, proveedor `openseo`, operaciones exactas y el mismo `auditId` en provenance; luego firma ambos resultados con el contexto UUID de organización/proyecto. Copias JSON y cruces de auditoría quedan rechazados.
- Pruebas dirigidas 70/70 y suite completa 187/187; pin, lint, TypeScript, secretos y diff correctos. CI completa del run `37889221102` en verde: verify Node 22/24 y e2e con Supabase local, RLS, Data API, build y navegador.
- Producción Vercel verificada `READY` exactamente en el merge: `dpl_BmeUiNCPPnB1uS1LeKCAoa76H3CK`.
- No hay escritura ni activación: faltan migración de jobs, deduplicación/transacción, claves alojadas y migraciones 9.2/9.3. No se usaron secretos, OpenSEO live ni funciones de pago; Sarah no se modificó.

## 09/10/2026 — historial firmado OpenSEO

- Base revisada: `main@ec236b0`; no se observó otra rama activa sobre el historial. La CLI `supabase@2.118.0 migration new openseo_project_jobs` volvió a abortar con el crash de Bun antes de crear fichero alguno.
- Rama `feat/openseo-signed-history`: la pantalla de auditoría lista metadatos con `listProviderResults`, siempre bajo el `ProjectRef` cargado por RLS. No envía payload, firma, huella ni clave a la lista.
- El detalle exige `loadProviderResult` con UUID de organización/proyecto y un keyring disponible. Solo `verification.verified` permite renderizar las filas conocidas de `auditIssues`/`auditPages`; una fila alterada o reasignada no muestra datos.
- Claves ausentes y fallos de lectura tienen estados distintos de una lista válida sin resultados. Así una tabla alojada todavía inexistente no se presenta como historial vacío.
- Pruebas dirigidas 85/85 y suite 192/192; pin, lint, TypeScript, secretos y diff correctos. Build y e2e pendientes de CI por el límite conocido del runtime local. No hay migración, escritura, secretos, llamadas live/de pago ni cambios en Sarah.
## 09/10/2026 — aviso de titularidad

- Por instrucción expresa del titular: Juan Manuel Espinosa Galant, DNI 48553293V; Rubik SEO GEO pertenece a Rubik Sota y su uso/comercialización requieren autorización expresa del titular.
- Rama `feat/proprietary-notice`: `NOTICE.md`, `LICENSE`, README, pie global y página `/aviso-titularidad`. El aviso distingue los elementos propios de las licencias de terceros.
- No certifica registros de marca ni altera licencias de dependencias. La restricción se documenta; no se ha añadido un sistema de licencias o activación comercial.

## 09/10/2026 — migración oficial de trabajos OpenSEO

- El propietario generó `20261009071705_openseo_project_jobs.sql` con CLI 2.118.0 y subió el fichero vacío en `86466bc`. El bloqueo del generador queda resuelto.
- El historial PR #27 pasó CI completa `37896049276` y se integró en `f4b8789`. Despliegue de ese merge todavía no comprobado en este tramo.
- `feat/openseo-project-jobs` completa el fichero oficial: ledger privado con RLS, RPC exclusiva del owner, reserva atómica serializada por proyecto, un único trabajo activo y auditId no reasignable ni compartible entre proyectos.
- La finalización inserta incidencias y páginas firmadas en una transacción y libera el trabajo solo tras ambas escrituras; reintentos completados no duplican filas. La base comprueba identidad y estructura, el Core comprueba HMAC/digest al leer. Una reserva STARTING nunca caduca automáticamente: un timeout puede haber iniciado el rastreo.
- Se añaden pgTAP de permisos, cliente ajeno, reserva repetida, vinculación, rollback del segundo resultado y finalización idempotente. Ejecución SQL y tipos generados pendientes de CI; sin Docker/Postgres disponible aquí. El workflow imprime el esquema generado cuando difiere para recuperar los tipos oficiales.
- Este tramo todavía no conecta las actions al RPC; no aplica migraciones alojadas ni modifica secretos. La persistencia operativa sigue pendiente de ese cableado, pruebas de concurrencia por sesiones reales y verificación alojada.
- Primera CI del PR #28: migración y pgTAP correctos; verify Node 22/24 en verde. El control de tipos detectó el nuevo RPC como diferencia esperada. Se recuperaron los tipos generados por CLI en el runner (sin editarlos a mano), se añadió prueba de ocho sesiones HTTP simultáneas y se exige scopeVersion 1. Validación final pendiente del nuevo commit.
- Historial PR #27 desplegado y comprobado `READY` en el merge `f4b8789`: Vercel `dpl_2NZD6XM3FvQfoPL3NeB543hDgDbx`.
- 09/10/2026, continuación `feat/openseo-project-save`: botón «Consultar y guardar resultados», actions autorizadas bajo RLS, reserva previa al lanzamiento y consulta exclusiva de auditorías vinculadas. Guarda solo los originales confiables del Core, con la pareja firmada en RPC transaccional; refresca el historial solo tras confirmar escritura.
- Pruebas de aplicación 210/210, lint y TypeScript correctos. Se conservan reservas ante timeout/TOOL_ERROR/respuesta ambigua; solo rechazos documentados o estado FAILED confirmado las liberan. La activación de servidor queda apagada hasta comprobar migraciones/keyring alojados.
- Autorización expresa del propietario para aplicar migraciones recibida el 09/10/2026. Bloqueo nuevo comprobado: el conector Supabase lista cinco proyectos (incluido Sarah Studio), pero no el de Rubik SEO GEO. Vercel lista URL publicable como variable sensitive sin valor recuperable y no muestra claves PROVENANCE. No se aplica SQL a otro proyecto ni se afirma persistencia alojada.
- Se han creado en Vercel, solo producción, `PROVENANCE_SIGNING_KEYS` (Secret/sensitive, 32 bytes aleatorios) y `PROVENANCE_ACTIVE_KEY_ID`; sin leer ni reemplazar claves anteriores (no existían). La clave no se imprime ni se guarda en Git/DB. Configuración persistida; verificación en proceso desplegado aún pendiente. Jobs sigue sin activar.
- Primera CI del guardado: firma/escritura/lectura real y reintento sin duplicados pasan en Supabase local. Dos listas estáticas de nombres de `.env.example` necesitaban incluir el nuevo flag; corregidas, suite completa 210/210 tras el ajuste. La comprobación alojada sigue bloqueada por acceso al proyecto correcto, no por permiso del propietario.
- PR #28 validado en CI completa `37900821388` (Node 22/24, pgTAP, tipos, concurrencia entre ocho sesiones, integración y navegador), integrado en `248850a0411fb5dd7f0c4a82e47898fede235a9d`. La migración alojada sigue pendiente de acceso comprobado; su fichero oficial ya está en main.
- Aviso de titularidad PR #29 integrado en `a03d37250449ccd4de11bd1ac4f226ce296c8992`, después de CI completa `37901636730`. Incluye el DNI y la vinculación a Rubik Sota solicitados por el propietario. Despliegue exacto pendiente de comprobación.
- Procedimiento alojado y comandos PowerShell en `docs/OPENSEO-ACTIVATION.md`; nunca sustituir el destino por otro proyecto ni duplicar timestamps por otra vía.

## 09/10/2026 — checkpoint de producción y activación pendiente

- Base `main@afb5a3838981a78b9f126acc280fdc0138bfdae0` revisada; solo siguen abiertos los PR documentales históricos #9/#11. Rama independiente `docs/openseo-production-checkpoint`; no se modifica ninguna rama de trabajo previa ni se presupone una sesión de Claude Code.
- PR #30 integrado en ese merge tras CI completa del HEAD `c7cadda4a9a16e4e3d6dc9c763071763fe49f77f`: [run 37902474922](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37902474922), verify Node 22/24 y e2e con Supabase local en verde. Incluye firma del original emitido por el Core, transacción de dos filas, lectura verificada, reintento idempotente y aislamiento; suite de aplicación 210/210.
- Producción Vercel comprobada `READY` en el SHA exacto del merge: `dpl_EnV1hDHWJUJkaS4rJm8NvTaDPKDf`, alias `plataforma-rubik-seo-geo.vercel.app`. Esto demuestra despliegue del código, no persistencia alojada. Antes se comprobó HTTP 200 y contenido del aviso de titularidad en el despliegue del PR #29 (`dpl_66TYjQDa66JXZ5SaiLf697pKXDu1`, merge `a03d372`).
- Keyring HMAC de producción configurado en Vercel; jobs sigue apagado. Falta demostrar acceso al Supabase correcto, migraciones 9.2/9.3/jobs, escritura real, recarga verificada y aislamiento con dos cuentas alojadas. El propietario comunica login/projects list en su PowerShell; la consulta del conector sigue sin mostrar Rubik. Ese login no acredita automáticamente acceso de este entorno.
- Se sincronizan README, ROADMAP, OPERATIONS-STATUS y OPENSEO-ACTIVATION para retirar pendientes de código/CI ya resueltos y distinguirlos de la activación alojada. Las entradas anteriores conservan su contexto histórico; prevalece este checkpoint para el estado actual.
- Siguiente unidad independiente: mapping/configuración del proyecto OpenSEO por cliente, consentimiento/revocación y pruebas negativas. Reconciliación administrativa de reservas inciertas, recuperación de claves y prueba Auth con dos cuentas también pendientes. No activar más herramientas, tareas periódicas de pago, contenidos ni indexación de Sarah.
- Verificación de este cambio: documentación únicamente, `git diff --check` y enlaces locales. No se modifican código, schema, secretos ni configuración desplegada; no se repiten suites de aplicación que ya aprobaron el HEAD de PR #30. La CI propia del nuevo PR debe registrarse por separado.

## 09/10/2026 — migraciones alojadas aplicadas por el propietario

- Evidencia compartida en la sesión: login CLI completado; projects list incluye `plataforma-rubik-seo-geo-dev` de organización `zsgpocnbsxoncqvvwepr`, referencia `yvdgmklgwlshizzgefpv`. Repositorio Windows actualizado a `main@afb5a38`; link terminado, dry-run propone exactamente 9.2/9.3/jobs.
- `db push --linked` finalizó tras aplicar `20261007120000`, `20261007150000` y `20261009071705`. La lista posterior muestra esas versiones y las dos de CORE-9.1 en columnas local/remoto. El bloqueo de migraciones queda resuelto mediante la CLI del propietario; el conector disponible aquí todavía no acredita acceso a ese proyecto.
- Advisor: INFO RLS sin política en `private.openseo_project_jobs` previsto por el diseño (sin grants directos; RPC privada DEFINER con search_path vacío y guard owner). WARN contraseñas filtradas permanece; no se contrata un plan ni se cambia Auth automáticamente. No se declara Advisor limpio.
- Se creó `OPENSEO_PROJECT_JOBS_ENABLED=true` solo en producción Vercel, sin tocar claves HMAC/OpenSEO. Se solicitó redeploy del despliegue probado de PR #30, manteniendo SHA `afb5a38`, nuevo ID `dpl_6hzwqBBTJq4582stffdxcU8VmdGF`. Estado final aún pendiente en este registro.
- Falta prueba desde sesión Auth de la plataforma: nueva auditoría propia vinculada al ledger, guardado explícito al completarse, apertura verificada tras recargar y reintento sin duplicados. No se adoptan las auditorías previas al ledger ni se lanza un rastreo desde este entorno para afirmar que ya funciona.
- Resultado posterior comprobado: redeploy `dpl_6hzwqBBTJq4582stffdxcU8VmdGF` en `READY`, SHA exacto `afb5a3838981a78b9f126acc280fdc0138bfdae0`, alias de producción asignado y sin aliasError. La activación está desplegada; la prueba de guardado real sigue pendiente.

## 09/10/2026 — OpenSEO multiempresa, fase 1 (rama `claude/zealous-noether-dq91ll`)

- Base: `docs/openseo-production-checkpoint@2bab218` (PR #31, abierto en Draft) sobre `main@afb5a38`. Se apila sobre PR #31 para no contradecir su registro; fusionar #31 antes. No hay otras ramas ni PR nuevos posteriores a #31.
- Coherencia documental: se corrigen en OPERATIONS-STATUS y ROADMAP las frases que aún pedían «comprobar/aplicar» migraciones alojadas. Estado: migraciones aplicadas por el propietario, flag y redeploy `READY`; **escritura alojada pendiente de verificación** con una auditoría nueva del propietario. No se lanzó ninguna auditoría ni llamada de pago.
- Plan por fases y decisión: [ADR 0007](adr/0007-openseo-conexion-por-proyecto.md). Una clave `oseo_` sirve a varios proyectos OpenSEO de la misma cuenta (contrato del fork); no está verificado que la clave alojada pueda limitarse a un proyecto. El aislamiento con clave compartida depende del mapeo, por eso un proyecto OpenSEO solo puede tener un proyecto Rubik activo.
- Fase 1 implementada: migración `20261009120000_openseo_project_connections.sql` (tabla privada con RLS y sin privilegios directos, RPC owner-only `openseo_connection` get/connect/revoke, consentimiento explícito, hosts limitados al dominio del proyecto y su compañero www/apex, revocación con historial y bloqueada si hay job activo), módulo `src/lib/openseo/connections.ts`, tipos regenerados con `supabase@2.118.0 gen types`. **No está cableada:** run/follow siguen usando `OPENSEO_PROJECT_ID` global; la conexión de Sarah no cambia.
- Pruebas locales: pgTAP con el contenedor `supabase/postgres:17.6.1.171`, aplicando las seis migraciones en orden: `openseo_connections` 32/32 y las cinco suites existentes sin fallos. Kong no se pudo descargar (límite del registro), así que la integración con la Data API (`tests/integration/openseo-connections.integration.test.ts`) se valida solo en CI. `npm run verify` en local; resultado de CI en el PR.
- Bloqueos: la fase 2 (clave por cliente) necesita que el propietario decida el almacén de secretos y confirme con OpenSEO si hay claves limitadas por proyecto. La migración nueva **no** se aplica en alojado; la aplicará el propietario cuando se fusione.
- Siguiente paso: (propietario) auditoría nueva con créditos para cerrar la verificación del guardado; revisar y fusionar #31 y este PR. (Desarrollo) fase 4: resolver run/follow por conexión con flag `legacy` por defecto y `connection_id` en el job.

## 09/10/2026 — ciclo 1: estado verificado y orden de fases

- GitHub (re-verificado): #31 en Draft, `2bab218`, CI [37906609239](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37906609239) en verde y preview `Ready`. #32 en Draft, apilado sobre #31, `a42767d`, CI [37911481664](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37911481664) en verde y preview `Ready`. `main@afb5a38` sin cambios. Sin otros PR o ramas activos aparte de los históricos #9 y #11.
- Vercel, solo lectura de nombres: Preview comparte el Supabase de producción y no tiene variables de OpenSEO ni HMAC (detalle en OPERATIONS-STATUS).
- ROADMAP: se corrigen las filas que aún decían «sin aplicar en alojado» (9.2 y 9.3) o «sin persistencia» (OpenSEO). Se añaden las filas de jobs y multicliente con su estado real.
- ADR 0007: orden 1 → 4 → 5 → 3, por la dependencia de Preview con la base de datos de producción.
- Siguiente: fase 4 en su propia rama, apilada sobre #32.

## 09/10/2026 — fase 4: run/follow ligados a la conexión (rama `claude/openseo-fase4-cableado`)

- Base: `claude/zealous-noether-dq91ll@ae8a64f` (PR #32). Orden de fusión: #31 → #32 → este PR.
- Migración `20261009150000_openseo_job_connection.sql`: añade `connection_id` anulable al job y reemplaza solo `private.openseo_job`. `acquire` valida la conexión ACTIVE del proyecto y la devuelve en `connectionId`. El wrapper público y sus permisos no cambian; pgTAP comprueba que `authenticated` sigue pudiendo ejecutar y `anon` no.
- Código:
  - `target.ts`: resolver de modo y entorno por conexión.
  - `jobs.ts`: `connectionId` en el job y en `acquire`.
  - `project-audit.ts`: rechaza jobs de otra conexión o legacy en ambos modos.
  - `actions.ts`: las tres actions resuelven el destino antes de cualquier llamada.
  - Página de auditoría: en modo `project` lee la conexión y muestra un estado vacío si no hay ninguna activa.
- Compatibilidad: si el alojado aún no tiene la migración, `connectionId` falta en la respuesta y se trata como nulo. El modo `legacy` funciona igual.
- Pruebas locales:
  - pgTAP con el contenedor `supabase/postgres:17.6.1.171`: siete suites sin fallos (`openseo_job_connection` 14/14).
  - `npm run verify` 226/226.
  - Tipos regenerados idénticos.
  - Integración Data API añadida, ejecutada solo en CI.
- No verificado: nada en alojado. Activar el modo requiere aplicar `20261009120000` y `20261009150000`, crear la conexión de Sarah (fase 6) y definir la variable. Cada paso se presentará antes con dry-run y rollback.
- Siguiente: fase 5 (pruebas negativas ampliadas de servidor y Data API) y después la fase 3 (interfaz).

## 09/10/2026 — fase 5: matriz negativa de aislamiento (rama `claude/openseo-fase5-negativas`)

- Solo pruebas: no cambia el producto. Va apilada sobre #33.
- `openseo_isolation.test.sql`, 25/25 en local:
  - Mismo owner con dos proyectos: no puede lanzar con la conexión del otro, usar su dominio, reclamar su `auditId` (`23505`), leer, liberar o completar su job, ni guardar filas de otro proyecto o de otro `auditId`.
  - Viewer y account-manager: sin acceso.
  - Otra organización: sin acceso, tampoco a través de su propio proyecto.
  - Anon: sin acceso.
- Lección: un `throws_ok` con solo el SQLSTATE puede pasar por un motivo distinto. La fila sintética fallaba por `key_id` y daba el mismo código `23514`. Ahora los rechazos de identidad se comprueban por su mensaje y hay un control positivo.
- Integración: mismo owner y dos proyectos a través de PostgREST. Se ejecuta solo en CI.
- Siguiente: fase 3 (interfaz de conexión). Su revisión visual en preview dependerá de que la migración de la fase 1 esté en alojado (Preview usa el Supabase de producción).

## 09/10/2026 — fase 3: panel de conexión del owner (rama `claude/openseo-fase3-interfaz`)

- Va apilada sobre #34. Corrección previa en #33: textos en español para los códigos de rechazo del modo `project` (sin ellos la interfaz mostraba «Error de OpenSEO.»). Ya está fusionada en #34 y en esta rama.
- Código:
  - Server Actions `connectProjectAction` y `revokeProjectAction`. Pasan por `authorized` y exigen consentimiento o confirmación. El test estático ahora exige que todas las actions exportadas llamen a `authorized`.
  - Componente `OpenSeoConnectionPanel`.
  - Estilos de `fieldset`.
  - La página muestra el panel solo al owner.
- Pruebas: `npm run verify` 227/227. La e2e nueva `e2e/openseo-connection.spec.ts` y el ajuste de `visual.spec.ts` (la página del owner ahora tiene formulario) **solo se ejecutan en CI**: en local no hay Kong. `docs/visual` no se ha regenerado; las capturas 18, 20 y 21 quedan en el artefacto `capturas-core-9-1` de la CI.
- Revisión visual: en la preview solo se verá el estado «no disponible» hasta aplicar `20261009120000` en alojado. Al aplicarla, la preview escribiría en producción, así que crear la conexión de Sarah desde ella sería un cambio real y necesita autorización expresa.

## 09/10/2026 — reconciliación de STARTING incierto (rama `claude/openseo-reconciliacion`)

- [ADR 0008](adr/0008-reconciliacion-openseo.md). Migración `20261009170000_openseo_active_job.sql`:
  - `openseo_active_job`: lectura del trabajo activo, sin crear reserva.
  - `openseo_release_starting_job`: libera solo un STARTING sin `auditId`, bajo el mismo lock.
  - Tipos regenerados con la CLI.
- Código:
  - `jobs.ts`: `findActiveAuditJob` y `releaseStartingAuditJob`.
  - `project-audit.ts`: `reconcileStartingJob`.
  - `actions.ts`: `reconcileAuditAction`, que pasa por `authorized` y exige confirmación.
  - `OpenSeoReconcilePanel`, visible solo para el owner y solo con una reserva STARTING.
- Corrección de interfaz existente: `errorText(code, message)` muestra el mensaje del servidor cuando el código no tiene texto. Antes `SIGNING_MISSING`, `START_UNCERTAIN`, `BIND_FAILED`, `AUDIT_NOT_BOUND`… mostraban solo «Error de OpenSEO.».
- e2e: `OPENSEO_PROJECT_JOBS_ENABLED=true` solo en el servidor local de Playwright; OpenSEO sigue sin configurar. Nueva spec `openseo-reconcile.spec.ts`, que deja el proyecto sin trabajo activo al terminar.
- Pruebas locales:
  - pgTAP: ocho suites sin fallos (`openseo_active_job` 15/15).
  - Unit: reconciliación y textos.
  - `npm run verify`: resultado en el PR.
  - e2e solo en CI.
- Paquete de aplicación alojada preparado en OPENSEO-ACTIVATION: orden, dry-run esperado, Advisor y riesgos, y un rollback `docs/rollback/openseo-multitenant-rollback.sql` probado en local (función restaurada idéntica por md5, permisos intactos, suites antiguas en verde). **No ejecutado:** lo aplica el propietario tras fusionar.
- Trazabilidad: conectar, revocar y reconciliar añaden un evento firmado a `audit_events`. Si falla el registro, la acción devuelve `audited: false` y la interfaz lo advierte. Test estático incluido. `npm run verify` 235/235.
## 09/10/2026 — Search Console y Bing en solo lectura, fase A (rama `claude/gsc-bing-lectura`)

- Base inicial `main@afb5a38`, independiente de la cadena OpenSEO. Tras fusionarse #31–#36, se integró `main@0695b44` en esta rama; los conflictos, solo de documentación, se resolvieron conservando ambas partes.
- Código:
  - `src/lib/webmaster/http.ts`: sin redirecciones, `no-store`, timeout y límite de tamaño; los errores solo llevan el código de estado.
  - `src/lib/search-console/transport.ts`: `searchAnalytics`.
  - `src/lib/bing/transport.ts`: `urlInfo`.
- Fuentes: endpoints, alcance `webmasters.readonly`, límites y formas tomados de developers.google.com y learn.microsoft.com mediante búsqueda acotada. La descarga directa está bloqueada por la red del entorno; hay que releerlos antes de la prueba real.
- Pruebas: `tests/webmaster-transports.test.ts`, 11 casos a través de `runProviderRequest` y `toReleaseC`.
  - Petición documentada; 401, 403 y 429 sin fuga de token ni clave; `EMPTY` y `PARTIAL`.
  - Rechazos sin red: propiedad ajena, sin credencial, entrada inválida, otra operación, sin presupuesto.
  - Fechas WCF de Bing.
  - Mutación comprobada: quitar la validación de dominio o de `rowLimit` hace fallar la suite.
- Hallazgo de contrato: la evidencia de la procedencia del Core está en lista cerrada, así que el rango y las dimensiones de la consulta no se firman. Se propondrá al Core por separado antes de guardar snapshots.
- Bloqueos: el OAuth (fase B) necesita la decisión del almacén de secretos y un cliente OAuth creado por el propietario. La fase C (propiedad por proyecto con RLS) se puede hacer sin credenciales y es el siguiente paso.

## 09/10/2026 — Search Console y Bing, fase C: propiedad por proyecto (rama `claude/webmaster-propiedades`, apilada sobre #37)

- Migración `20261009180000_webmaster_properties.sql`, módulo `src/lib/webmaster/properties.ts` y tipos regenerados con la CLI.
- Sin credenciales, interfaz ni llamadas a proveedores.
- Pruebas:
  - pgTAP `webmaster_properties` 25/25 en un contenedor limpio (solo migraciones de `main` más esta) y las suites existentes sin fallos.
  - Unit `webmaster-properties.test.ts`; integración Data API (solo en CI).
  - `npm run verify`: 225/225.
- Orden: fusionar y aplicar la cadena OpenSEO #31–#36 antes que #37 y esta rama, para que las versiones de migración se apliquen en orden.
- Siguiente: la fase D (lectura manual, snapshot firmado e interfaz) depende de la fase B (OAuth y almacén de secretos) y de la propuesta al Core sobre el contexto de la consulta.

## 09/10/2026, 11:15 — integración completa de #31–#38 y paquete de migraciones (rama `claude/paquete-migraciones`)

- El propietario fusionó #31–#36. Claude fusionó #37 (`4926f2f`) y #38 (`8d56e18`), con la autorización del encargo de continuidad del 09/10/2026, tras revisar el diff y con su CI en verde: #37 [37920127966](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37920127966), #38 [37920477604](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37920477604). En #38, el diff tras cambiar la base a `main` contenía solo la fase C, y su árbol coincidía con el que pasó la CI.
- CI de `main@0695b44` en verde: [37919976889](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37919976889). La de `8d56e18` se registrará al terminar.
- Supabase alojado: el conector de la sesión **no lista** `yvdgmklgwlshizzgefpv`, solo cinco proyectos de otra organización. No se puede aplicar ni ejecutar el dry-run desde aquí. Aplicar desde un conector rompería el historial de versiones, así que la aplicación la hace el propietario con su CLI.
- OPENSEO-ACTIVATION reescrito como un único paquete de cuatro migraciones: comprobación previa en SQL de solo lectura, dry-run esperado, verificación posterior y rollback encadenado. Nuevo `docs/rollback/webmaster-properties-rollback.sql`. Ambos rollbacks se probaron juntos en un contenedor local con las nueve migraciones: los objetos nuevos desaparecen y las suites originales pasan.
- Estado vigente unificado en README, ROADMAP y OPERATIONS-STATUS; las entradas anteriores quedan como histórico.

## 09/10/2026 — paquete de migraciones aplicado (rama `claude/paquete-migraciones`, PR #39)

- **Migración aplicada:** el propietario aplicó con su CLI 20261009120000, 150000, 170000 y 180000 en `yvdgmklgwlshizzgefpv`.
  - Codex confirmó nueve versiones sincronizadas.
  - Las tablas `openseo_project_connections`, `openseo_project_jobs` y `webmaster_properties` tienen RLS sin privilegios directos para `anon` ni `authenticated`.
  - Producción `READY` en `8d56e18`.
  - Esta sesión no tiene acceso al proyecto: la evidencia es del propietario y de Codex.
- **Conexión real verificada:** ninguna todavía. Juanma revisa el panel de conexión. Producción sigue en `legacy`.
- OPENSEO-ACTIVATION:
  - el paquete queda marcado como aplicado;
  - nueva sección A: verificación del guardado real con una sola auditoría en `legacy`, comprobaciones SQL de solo lectura y criterio para declararlo verificado;
  - nueva sección B: activación controlada del modo `project` (requisitos previos, conexión de Sarah, una sola conexión activa, cero trabajos activos, variable solo en producción, redeploy del mismo SHA, efecto esperado y rollback).
- El estado vigente de README, ROADMAP y OPERATIONS-STATUS se ha actualizado.
- Siguiente paso: Juanma ejecuta la sección A. Con ella superada y el panel revisado, la sección B. En paralelo, decidir el ADR 0010 (PR #40) y fusionar el Core PR #24 para actualizar el pin.

## 09/10/2026 11:40 UTC — CHECKPOINT DE RELEVO (Claude → Codex)

Claude detiene aquí las ediciones. Todo el trabajo está subido salvo la rama local de la web de Sarah, que se entrega como parche y bundle (ver más abajo).

### Ramas y PR

| Repositorio | Rama | Último commit | PR | CI del último commit | Estado |
|---|---|---|---|---|---|
| PLATAFORMA-RUBIK-SEO-GEO | `claude/paquete-migraciones` | este checkpoint (antes `a3bf0dc`) | #39 | `a3bf0dc`: [37923777993](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37923777993) en verde. Falta confirmar la CI del commit de este checkpoint (solo documentación) | Listo para revisión |
| PLATAFORMA-RUBIK-SEO-GEO | `claude/credenciales-cliente` | `f99a30e` | #40 | [37923525529](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37923525529) en verde | Espera la decisión sobre la opción B del ADR 0010 |
| PLATAFORMA-RUBIK-SEO-GEO | `claude/previews-integraciones` | `01ff21b` | #41 | [37923901339](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37923901339) en verde (verify en Node 22 y 24, y e2e) | Listo para revisión |
| RUBIK-SEO-GEO-CORE | `feat/provenance-request-context` | `4dd7546` | Core #24 | [37923502833](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/actions/runs/37923502833) en verde (Node 20 y 22) | Listo para revisión. Tras fusionarlo, PR en la plataforma para actualizar el pin |
| SARAHKATERINAWEBNUEVA | `claude/consentimiento-medicion` (**solo local**) | `9be1173` sobre la base `d5231afc9627aec44195cb97ef49ce5b53a7f358` (`origin/main`) | — | Sin CI: no se ha subido | Esta sesión no tiene permiso de escritura en ese repositorio |

No quedan cambios sin guardar en ninguna rama.

### Conflictos previsibles entre PR

Los PR #39, #40 y #41 añaden entradas al final de `docs/HANDOFF.md`. Además, #39 y #40 tocan `docs/ENVIRONMENT.md` y #40 el bloque de estado. Al fusionar uno, los demás necesitan merge de `main` y conservar todas las entradas en orden cronológico.

### Web de Sarah: cómo aplicar el trabajo local

Se entregan dos archivos por el chat. No se subieron a ningún repositorio para no mezclar repositorios.

- `0001-Consent-record-and-consent-gated-analytics-adapter-p.patch` (sha256 `13449e9cc3034b8d455586113b1d46b0fc5bbf556917b7bd3a0719aa03caa1f5`).
- `claude-consentimiento-medicion.bundle` (sha256 `1a63f2bcb47369e543ae8073cde460f7b1bffcc5b982fe58ab014e4761774a9d`). Contiene `origin/main..claude/consentimiento-medicion` y necesita la base `d5231af`.

Aplicar con el parche:

```bash
git checkout -b claude/consentimiento-medicion d5231afc9627aec44195cb97ef49ce5b53a7f358
git am 0001-Consent-record-and-consent-gated-analytics-adapter-p.patch
```

O con el bundle:

```bash
git fetch ./claude-consentimiento-medicion.bundle claude/consentimiento-medicion:claude/consentimiento-medicion
```

Es un solo commit, sin archivos sin seguimiento: solo `node_modules`, que está ignorado.

Archivos del commit:
- `lib/consent/consent.ts`
- `lib/analytics/consented.ts`
- `tests/consent.test.ts`
- `docs/legal-consent-readiness-2026-10-09.md`

### Pruebas ejecutadas de verdad en esta sesión

- **Plataforma:** `npm run verify` en local para cada rama.
  - #40: 255 pruebas.
  - #39 y #41: 250 pruebas, guard de secretos y build.
  - La CI de GitHub de los tres PR, en verde.
- **Core:** `npm test` con 337 pruebas (4 nuevas). CI en verde.
- **Web de Sarah:** `npm ci`, `npm test` (31 ficheros, 435 pruebas, 38 omitidas), `tsc --noEmit`, `eslint` (0 errores, 8 avisos ya existentes) y `prettier --check` de los archivos nuevos. El `prettier --check .` global falla en 170 archivos que ya fallaban antes; no se ha corregido.
- **No ejecutado:** e2e y evidencias visuales en local (Kong bloqueado), cualquier prueba contra Supabase alojado, OpenSEO u otro servicio real.

### Comprobaciones pendientes por PR

- **#39:**
  - confirmar la CI del commit de este checkpoint;
  - revisar que el estado vigente coincide con la evidencia del propietario y de Codex (nueve versiones, RLS);
  - fusionar.
- **#40:**
  - decidir la opción B del ADR 0010 (o A o C);
  - si se aprueba, PR siguiente con la tabla `private.provider_credentials`, RPC solo para el owner, pgTAP y tipos;
  - después, las dos variables en Vercel (solo producción, *Sensitive*).
- **#41:**
  - decidir el aislamiento de previews (opción A);
  - verificar en la página de precios de Supabase el coste de un segundo proyecto.
- **Core #24:**
  - revisar y fusionar;
  - después, en la plataforma: actualizar el pin del Core (`package.json` y el guard del pin), pasar `requestContext` en las lecturas de Search Console y Bing y ejecutar `npm run verify`.

### Pendientes y bloqueos generales

1. **Guardado real:** sección A de OPENSEO-ACTIVATION, ejecutada por Juanma. Bloquea la sección B.
2. **Modo `project`:** sección B, tras revisar el panel. No activar antes de comprobar la conexión de Sarah.
3. **Fase B de Search Console y Bing (OAuth):** depende de la decisión sobre el ADR 0010.
4. **Web de Sarah:**
   - aplicar el parche;
   - datos legales verificados del responsable;
   - aprobación de proveedor y textos;
   - el banner y la carga del tag llegan con el primer proveedor aprobado;
   - verificación en navegador.
5. **Dos cuentas alojadas para probar el aislamiento:** depende del entorno de previews aislado.

## 09/10/2026 — previews aisladas e integraciones (rama `claude/previews-integraciones`)

- [PREVIEWS-E-INTEGRACIONES](PREVIEWS-E-INTEGRACIONES.md):
  - Recomendación: un segundo proyecto Supabase «rubik-preview» para las variables *Preview*. El coste está por verificar si no queda una plaza gratuita. Pasos para el propietario.
  - Estado real de cada integración, distinguiendo entre invitación, código y conexión.
- Sin cambios de configuración. Siguiente paso: decisión del propietario sobre la opción A.

## 09/10/2026 12:11 UTC — continuación Codex tras el relevo

- Punto de partida: árbol local limpio en `main@8d56e18`; #39 en `a4c1e0d`. Su CI específica [37924633874](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37924633874) terminó en verde. Se revisaron los SHA de #40, #41 y Core #24 antes de editar.
- #39 integrado en `d59595b` tras corregir dos filas desactualizadas del roadmap y hacer que la consulta SQL de verificación del guardado una los resultados al `auditId` nuevo. CI del último SHA `41981c9`: [37926507243](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37926507243), verify Node 22/24 y e2e en verde. Las nueve migraciones aplicadas son evidencia del propietario y del relevo anterior; esta continuación no las repitió ni abrió el proyecto alojado por CLI.
- #41 integrado en `41e6c84`: se contrastaron el cupo gratuito y el coste inicial de cómputo adicional con la documentación oficial de Supabase, sin crear proyecto. Al resolver `HANDOFF.md` se conservaron todas las entradas y se comprobó que el diff frente a `main` solo añadía la sección de previews y su documento. **Incidencia de proceso:** la orden de fusión automática integró #41 antes de acabar su e2e, porque no era un check obligatorio; la e2e del SHA integrado `d5be0e1` terminó después en verde en [37927254401](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37927254401). No repetir esa secuencia.
- Core #24 corregido para rechazar fechas inexistentes y offsets inseguros; #25 registra `type` de Search Console como `searchType`; #26 da prioridad al `type` realmente enviado si hay un alias contradictorio. Los tres PR se integraron con CI Node 20/22 en verde. La plataforma #42 fija Core `ae9a8ab`, exige que la propiedad de Search Console coincida con la del transporte, registra el contexto de Search Console y Bing y rechaza offsets inseguros. `npm run verify` local tras el pin: 251 pruebas, lint, tipos y build correctos; la prueba focalizada del último ajuste de offset pasó. #42 se integró en `e998cab` tras pasar [37927594595](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37927594595) (Node 22/24 y e2e). CI propia de `main@e998cab` pendiente al redactar esta entrada.
- #40 queda abierto en `f9d4f40`: su prueba de rotación comprueba ahora que el valor resellado se abre tras retirar la clave antigua; una prueba de `.env.example` acepta CRLF en Windows. `npm run verify` local con 255 pruebas y [37925979446](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37925979446) completos en verde. La elección del ADR 0010 sigue pendiente; no hay tabla de credenciales, claves ni variables nuevas.
- Pantalla [Auditoría técnica de Sarah en Producción](https://plataforma-rubik-seo-geo.vercel.app/proyectos/rubik/sarah-katerina/auditoria-tecnica) comprobada en navegador con sesión del propietario: panel de conexión visible, aviso de modo `legacy` e historial vacío. Solo lectura; no se pulsaron «Conectar OpenSEO», «Lanzar auditoría» ni «Consultar y guardar resultados». **Validación humana:** panel pendiente de revisión del propietario. **Validación real:** guardado alojado y conexión por proyecto pendientes. Producción continúa en `legacy`.
- Web de Sarah: rama `claude/consentimiento-medicion@9be1173` aún no recuperada. Se solicitó al propietario la ruta local del parche o bundle; no se ha localizado ni aplicado nada, ni se ha comprobado SHA256. Sin lanzamiento ni indexación.
- Previews: propuesta de aislamiento documentada, sin crear Supabase, cambiar variables ni levantar protección. Pendientes la decisión sobre el ADR 0010, la opción de previews y la ruta del archivo de Sarah. No se hicieron cambios DNS, gastos ni activaciones reales.

## 09/10/2026 14:30 CEST — guardado real OpenSEO, `legacy`

**Evidencia visual comunicada por Juanma (validación humana de este flujo):** auditoría `d1899523-807d-4f02-8f1f-2bce653a43f8` terminada (10/10 páginas). Tras guardar a las 14:30 CEST, las dos entradas permanecen después de F5; sus detalles muestran «Firma verificada» y estado OK. Repetir «Consultar y guardar resultados» mantiene las dos entradas originales y la misma fecha de guardado. Esta evidencia procede de la prueba visual de Juanma, no de una nueva auditoría de Codex.

**Comprobación SQL independiente, solo lectura, en el proyecto Supabase alojado `yvdgmklgwlshizzgefpv`:** una fila de `private.openseo_project_jobs` para ese `auditId`, estado `COMPLETED`, `connection_id IS NULL` (modo `legacy`), proyecto `rubik/sarah-katerina` (`b8d00961-1141-4741-908a-54d2e3bf343a`). Sus IDs de resultado enlazan con una fila `auditIssues` y una `auditPages` de `openseo`, ambas `OK`, con el mismo proyecto y organización. El recuento adicional por `signed_payload.provenance.evidence.auditId` devuelve exactamente una fila de cada operación, ambas enlazadas al job. No hay trabajos `STARTING` ni `SYNCING` para Sarah (0 reservas activas). `job.updated_at` y ambas filas `provider_results.created_at` son `2026-10-09 12:30:53 UTC` (14:30:53 CEST). Las consultas no leyeron cargas, claves ni firmas completas. Esta comprobación de relaciones y metadatos no sustituye la verificación criptográfica visible en la aplicación.

**Resultado:** la sección A de [OPENSEO-ACTIVATION](OPENSEO-ACTIVATION.md) queda superada para este `auditId`; no lanzar otra auditoría para repetirla. Producción continúa en `legacy`. Preparación de la sección B: el proyecto Sarah tiene dominio `www.sarahkaterina.com`, cero conexiones OpenSEO activas o revocadas y cero trabajos activos, según consulta de lectura. Antes de crear la conexión, Juanma debe revisar el panel y contrastar el ID real de proyecto OpenSEO y los hosts; después se comprueba la fila `ACTIVE`. El cambio de flag a `project` y su redeploy son pasos posteriores y separados, aún no autorizados ni ejecutados. Sin nuevas migraciones, gasto, cambios DNS ni indexación.

## 09/10/2026 — límite del formulario OpenSEO (Codex)

- `main@5f3d83f` limpio al comenzar; su [CI posterior a #44](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37932321154) terminó correctamente (Node 22/24 y e2e).
- Juanma observó que, después de iniciar una auditoría con 10 páginas, el formulario volvía a mostrar 50. El campo usaba `defaultValue={Math.min(50, maxPages)}`: una acción de formulario puede restablecer un input no controlado. Se cambió a un valor controlado que conserva la elección del usuario y se distingue en el resultado el límite de la ejecución iniciada o reutilizada.
- Verificación sin proveedor real: `npm run verify` local (251 pruebas, lint, tipos y build) y prueba del render inicial. La prueba humana del comportamiento tras una acción real queda pendiente; **no lanzar otra auditoría solo para probar esta corrección**. Producción sigue en `legacy`.

## 09/10/2026 — integración #45/#46 y siguiente relevo Codex

- #45 (campo de páginas controlado) integrado en `57dbe51` tras [CI del SHA `5a29ef6`](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37933575410) completa. La [CI posterior de `main@57dbe51`](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37934273909) también terminó en verde. Vercel marcó `READY` el despliegue de producción `dpl_CuW4tz7A9TfXQ1URH7DoBkcsoMmt` con alias público y SHA exacto. La pantalla owner se recargó y mostró «Máximo de páginas para el próximo lanzamiento» y las dos entradas firmadas de las 14:30. Sin click de lanzamiento, conexión ni gasto. Validación humana de la corrección tras acción: pendiente.
- #46 (ROADMAP de seis fases y estados documentales) integrado en `9a5ec65` tras [CI del SHA `5842f35`](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37934329099) completa. Su diff frente a `main` antes de fusionar solo contenía documentación; se preservó esta entrada de #45 al incorporar el merge. [CI posterior de `main@9a5ec65`](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37935159799) en curso al redactar.
- Panel de conexión de Sarah comprobado visualmente en Producción a 390 y 1280 px, solo lectura: identificador vacío, `www.sarahkaterina.com` marcado, apex y consentimiento desmarcados; los controles caben y son legibles. **No es aprobación de Juanma.** La conexión real continúa ausente; `project` no está autorizado ni activado. «Probar conexión» solo comprueba salud/autenticación, no selección del destino; el procedimiento y rollback están en OPENSEO-ACTIVATION B.
- Supabase «Rubik Sota» declara plan Free en consulta de solo lectura; cupo de proyecto gratuito y coste específico de Preview sin verificar. No se creó proyecto ni se cambiaron variables. ADR 0010/#40 sigue abierto; la opción B se recomendó pero no está aprobada. Parche/bundle de Sarah aún necesitan ruta del propietario y verificación SHA256 antes de aplicarse. No se repitió ninguna migración ni auditoría, ni se publicó/indexó Sarah.
