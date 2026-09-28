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

**CI:** consta en el PR (se actualiza al terminar el run).

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
