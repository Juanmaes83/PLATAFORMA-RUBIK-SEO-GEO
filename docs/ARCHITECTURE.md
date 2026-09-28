# Arquitectura (CORE-9.1)

```text
Navegador ──HTTP──▶ Next.js (servidor Node)
                      ├─ src/proxy.ts         refresca la sesión de Supabase (getClaims); no autoriza
                      ├─ src/app/…            páginas, Server Actions, /auth/confirm, /api/salud
                      ├─ src/lib/auth/…       configuración, sesión verificada (getClaims), acciones de Auth
                      ├─ src/lib/supabase/…   cliente de servidor @supabase/ssr (clave publicable) y tipos
                      ├─ src/lib/tenancy*.ts  consultas y altas de organizaciones y proyectos (bajo RLS)
                      ├─ src/lib/access.ts    pertenencia guardada → decisiones del Core por proyecto
                      └─ src/lib/core/…       único punto de entrada al Core (server-only)
                              │                                   │
                              │ require (serverExternalPackages)  │ HTTPS · Data API y Auth, como el usuario
                              ▼                                   ▼
            node_modules/@rubik/seo-geo-core           Supabase (Auth + Postgres con RLS)
            ← RUBIK-SEO-GEO-CORE @ commit fijado       local: supabase start · alojado: no conectado
```

- **Datos:**
  - Postgres de Supabase, esquema `public`: `organizations`, `organization_members`, `projects` y `project_members`, todas con RLS.
  - Funciones auxiliares en el esquema no expuesto `private`.
  - Migraciones en `supabase/migrations`, aplicadas solo al stack local y en la CI.
  - Modelo, políticas y mapeo de roles en la [ADR 0003](adr/0003-auth-supabase-y-tenancy.md).
- **Identidad:** Supabase Auth con correo y contraseña, solo desde el servidor.
  - `currentUser()` usa `getClaims()`, que verifica el JWT. Nunca `getSession()` ni metadatos del usuario.
  - No hay cliente de Supabase en el navegador.
- **Autorización, en dos capas:**
  1. **RLS** decide qué filas existen para el usuario: aislamiento por organización en cada consulta y mutación, y privilegios por columna.
  2. `src/lib/access.ts` construye el actor del Core con el **rol guardado** en `project_members` y le pregunta (`platform.authorize`) por cada acción de `platform.ACTIONS`.
  - Un proyecto de otro tenant, uno inexistente o un scope mal formado dan el mismo 404.
  - `execute-approved-action` siempre queda denegado, porque aún no hay aprobaciones humanas registradas.
- **Límite de responsabilidades:** el Project State, Studio, Media Library y Page Registry siguen en cada host (D-05/D-20 del Core). La plataforma guardará referencias y resultados de servicio a partir de CORE-9.2.

## Rutas

| Ruta | Qué muestra | Acceso |
|---|---|---|
| `/` | Estado de esta versión y commit del Core | Pública |
| `/acceso` | Inicio de sesión (correo y contraseña); con sesión, cierre de sesión | Pública |
| `/registro` | Alta de cuenta con confirmación de correo | Pública |
| `/auth/confirm` | Verifica el enlace de confirmación (`verifyOtp`) y crea la sesión | Pública; enlace inválido → `/acceso?error=enlace` |
| `/panel` | Proyectos del usuario (base de datos), pendientes y actividad como estados vacíos honestos | Sesión (si no, 307 a `/acceso`) |
| `/proyectos` | Proyectos en los que el usuario tiene rol | Sesión |
| `/organizaciones` | Organizaciones del usuario; crear organización; si es titular, crear proyectos | Sesión; RLS decide cada alta |
| `/proyectos/[tenantId]/[projectId]` | Permisos según el Core para el rol guardado, y el estado de medición | Pertenencia al proyecto (si no, 404) |
| `/proyectos/[tenantId]/[projectId]/[seccion]` | Secciones del proyecto: «No disponible todavía», con su etapa | Pertenencia al proyecto (si no, 404) |
| `/revision`, `/borradores`, `/equipo`, `/configuracion` | Áreas aún no construidas: «No disponible todavía» | Sesión |
| `/conectores` | Catálogo de conectores del Core, ninguno conectado | Pública |
| `/api/salud` | JSON técnico: etapa, modo de Auth (`supabase`/`not-configured`), commit del Core y conectores | Pública; sin secretos, valores de entorno ni consultas |

`tenantId` y `projectId` en las URLs son los `slug` de la organización y del proyecto (formato de `scope()` del Core). Son solo una clave de búsqueda: el acceso lo decide la base de datos.

La navegación y el diseño mobile-first (D-27) están en la [ADR 0002](adr/0002-ux-mobile-first.md), y las capturas en [docs/visual](visual/README.md). Todas las rutas se renderizan por petición (`connection()`).
