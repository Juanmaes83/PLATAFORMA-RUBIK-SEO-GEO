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
