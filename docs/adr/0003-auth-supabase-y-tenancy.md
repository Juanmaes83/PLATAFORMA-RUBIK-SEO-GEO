# ADR 0003 · Supabase Auth, organizaciones, proyectos y aislamiento por organización

**Estado:** decisiones aprobadas por el propietario. El PR de CORE-9.1 ([PR #2](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/2)) está pendiente de la revisión final y del merge, que hace el propietario.

- **Aprobado por el propietario:**
  - correo y contraseña como método inicial de acceso;
  - registro abierto solo durante las pruebas iniciales;
  - roles de organización `owner`/`member`;
  - edición del proyecto solo por su rol `owner`;
  - el riesgo residual de los identificadores globales (§1 y §5, Consecuencias).

**Fecha:** 28/09/2026.
**Sustituye:** el §5 de la [ADR 0001](0001-stack-y-dependencia-core.md) (autenticación de demostración de CORE-9.0).

## Versiones y documentación comprobadas (28/09/2026)

| Pieza | Versión | Fuente consultada |
|---|---|---|
| `@supabase/ssr` | 0.12.7 (última en npm) | Tipos del paquete instalado y [ejemplo oficial de Next.js](https://github.com/supabase/supabase/tree/master/examples/auth/nextjs) |
| `@supabase/supabase-js` | 2.117.2 (requiere Node ≥ 22) | npm |
| Supabase CLI | 2.118.0, fijada en scripts y CI (`npx supabase@2.118.0`) | npm |
| Next.js | 16.3.6 | Documentación incluida en `node_modules/next/dist/docs` (`proxy.ts` sustituye a `middleware.ts`) |

Patrones adoptados de esa documentación, sin APIs obsoletas:

- **Cliente de servidor** con `createServerClient` y cookies `getAll`/`setAll`. No se usan `get`/`set`/`remove`, que están obsoletos, ni `@supabase/auth-helpers-nextjs`.
- **`src/proxy.ts`** refresca la sesión en cada petición con `supabase.auth.getClaims()`, que valida el JWT.
- **Nunca `getSession()` en el servidor.**
- **Variables** `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: la clave publicable, no la `anon` heredada.
- **Confirmación de correo** en `/auth/confirm` con `verifyOtp({ type, token_hash })`. En los proyectos alojados la confirmación está activada por defecto.

## Decisiones

### 1. Método de acceso: correo y contraseña (aprobado por el propietario)

- **Aprobación:** el propietario aprobó en el PR #2 el correo y contraseña como **método inicial** de acceso.
- **Por qué:** es el método más sencillo de probar de principio a fin en local y en CI, con el Mailpit del stack local para el correo de confirmación.
- **Qué incluye:**
  - Registro, confirmación de correo obligatoria (como en el proyecto alojado), inicio y cierre de sesión.
  - Mínimo de 12 caracteres con letras y números, en `supabase/config.toml` y también en el formulario.
- **Qué queda fuera de esta fase** (no se implementa en CORE-9.1):
  - Proveedores OAuth.
  - Enlace mágico.
  - Invitaciones: envían correos a terceros.
  - MFA de usuarios. Qué factores ofrece cada plan de Supabase se comprueba en su panel antes de decidir.
  - Recuperación de contraseña. Envía correos y necesita SMTP propio en el proyecto alojado.
- **Decisiones aprobadas por el propietario:**
  1. **Registro abierto solo durante las pruebas iniciales.** Cualquiera puede crear una cuenta (y una organización) mientras la plataforma solo se usa en pruebas. **Debe cerrarse antes de dar acceso a clientes**, por ejemplo desactivando el registro en Supabase Auth y pasando a invitaciones en una fase posterior. Ese cierre es un requisito previo a cualquier acceso de clientes.
  2. **Roles de organización `owner`/`member`** (§5).
  3. **Solo el rol `owner` del proyecto edita sus datos descriptivos** (§5).
  4. **Se acepta el riesgo residual** de que pueda deducirse si un identificador global está ocupado. Se mantienen el modelo actual y el mensaje genérico (Consecuencias).

### 2. Toda la autenticación ocurre en el servidor

- **Dónde:** Server Actions (`src/lib/auth/actions.ts`) y un Route Handler (`/auth/confirm`). No hay cliente de Supabase en el navegador ni ningún Client Component que lo use.
- **Identidad del usuario:** `currentUser()` la obtiene con `getClaims()`, que verifica la firma y la caducidad. Solo se usan `sub` y `email`. **`user_metadata` y `app_metadata` no se leen nunca.** La prueba estática `tests/security-static.test.ts` lo comprueba en el código y en las políticas.
- **Páginas protegidas:** llaman a `requireSession()`, que redirige a `/acceso` si no hay sesión. El proxy solo refresca cookies y no autoriza nada.
- **Claves:**
  - La aplicación **solo usa la clave publicable**.
  - No existe variable para una clave secreta.
  - Si `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` contiene una clave `sb_secret_…` o un JWT `service_role`, `scripts/run-next.mjs` y `src/instrumentation.ts` impiden compilar y arrancar.
- **Demo de CORE-9.0 eliminada:**
  - Se borraron los fixtures, la cookie `rubik_demo_session`, el selector de usuarios y el modo `mock`.
  - `AUTH_MODE=mock` se mantiene **prohibido en producción** (barrera de `build`/`start` e instrumentación) para que una configuración antigua no llegue nunca a un servidor.
  - En desarrollo ya no activa nada.
  - Las pruebas e2e comprueban que las cookies antiguas o falsificadas no crean sesión.
- **Modo local de prueba:** es el **stack local de Supabase** (Docker), con Auth y Postgres reales. No es un simulacro: la CI lo levanta en cada ejecución.
  - Sus claves son las de desarrollo del contenedor y se leen en tiempo de ejecución.
  - `scripts/supabase-test-env.mjs` rechaza cualquier URL que no sea `127.0.0.1`/`localhost`.
  - No puede funcionar en producción, porque la URL local no existe allí.

### 3. Modelo de datos (esquema `public`, migración `supabase/migrations/20260928120000_core_9_1_tenancy.sql`)

| Tabla | Qué es | Claves e integridad |
|---|---|---|
| `organizations` | Tenant. `slug` = `tenantId` del scope del Core | `slug` único, mismo formato que `scope()` del Core. `created_by` lo fija la base de datos (`auth.uid()`), no el cliente |
| `organization_members` | Pertenencia a una organización: `owner` o `member` | PK (`organization_id`, `user_id`). Un trigger impide quedarse sin titular |
| `projects` | Proyecto dentro de una organización. `slug` = `projectId` del scope | Único por organización. `unique (id, organization_id)` para las FK compuestas |
| `project_members` | Rol humano del Core en un proyecto | FK compuesta a `projects (id, organization_id)`: el proyecto pertenece a esa organización. FK compuesta a `organization_members (organization_id, user_id)`: la persona es miembro de esa organización. `CHECK` con los cinco roles humanos |

Con estas FK compuestas, una fila no puede mezclar un proyecto de una organización con otra aunque se manipulen los IDs. Lo rechaza Postgres (23503), no el código.

### 4. RLS y mínimo privilegio

- **RLS y políticas:**
  - RLS activado en las cuatro tablas.
  - Políticas explícitas solo para `authenticated`. **`anon` no tiene ningún privilegio.**
- **Privilegios explícitos:**
  - El proyecto alojado tiene desactivada la exposición automática de tablas, así que se conceden a mano: `revoke all` y después `grant` por operación.
  - En `UPDATE`, **por columna**: `organizations.name`, `projects.name/domain/vertical` y `*.role`. Por eso `organization_id`, `slug` y `created_by` no se pueden cambiar (42501), y un proyecto o una pertenencia no pueden moverse de organización.
- **Todas las políticas `UPDATE` llevan `USING` y `WITH CHECK`.**
- **Funciones auxiliares** (`is_org_member`, `is_org_owner`, `is_project_member`, `has_project_role`):
  - `SECURITY DEFINER`, `search_path = ''`, en el esquema `private`, que no está expuesto en la Data API;
  - `execute` solo para `authenticated`;
  - solo responden sobre `auth.uid()`.
- **Aislamiento en cada consulta y mutación:**

  | Operación | Quién puede |
  |---|---|
  | Leer un proyecto | Solo sus miembros |
  | Leer una organización | Solo sus miembros |
  | Leer pertenencias | Cada persona ve las suyas; las titulares ven las de su organización |
  | Crear proyectos y gestionar pertenencias | Solo titulares de esa organización |
  | Editar un proyecto | Solo quien tiene rol `owner` en él |
  | Crear una organización | Cualquier usuario autenticado, que queda como su titular (trigger) |

- **Borrado:**
  - No se concede `DELETE` sobre organizaciones ni proyectos en esta fase.
  - Sí sobre pertenencias, solo a titulares.
- **Excepción documentada: `public.rls_auto_enable()`** (añadida después del merge de CORE-9.1).
  - Es la función del event trigger `ensure_rls`, que activa RLS en las tablas nuevas de `public`. La crea Supabase Studio al activar la RLS automática, no este repositorio.
  - Está en `public` y es `SECURITY DEFINER` con `search_path = pg_catalog`.
  - La migración `20260928150000_rls_auto_enable_privileges.sql`:
    - la conserva donde existe y la crea con la misma plantilla donde no existe;
    - revoca `EXECUTE` a PUBLIC, `anon` y `authenticated`.
  - Disparar un event trigger no comprueba `EXECUTE`, así que la RLS automática sigue funcionando.
  - **Pruebas:** `supabase/tests/rls_auto_enable.test.sql` y `tests/security-static.test.ts` (única función `SECURITY DEFINER` expuesta permitida, sin `EXECUTE` para esos roles).
  - **Detalle:** [SETUP-SUPABASE §5](../SETUP-SUPABASE.md).

### 5. Mapeo de roles con el Core (sin permisos nuevos)

- **Roles de proyecto:**
  - `project_members.role` guarda **exactamente** los roles humanos de `platform-contracts` `ROLES`: `owner`, `account-manager`, `analyst`, `client-approver` y `viewer`.
  - `system` e `ai` no se asignan a personas (lo impide un `CHECK`). Los usarán procesos de servidor en etapas posteriores.
- **Permisos por acción:** los decide **el Core** (`authorize`/`MATRIX`) con un actor construido desde la fila de la base de datos: `{ role, id: auth uid, memberships: [{ tenantId: org.slug, projectId: project.slug }] }`. La plataforma no mantiene una matriz propia.
- **Rol de organización** (`owner` | `member`), *aprobado por el propietario*: el Core no lo define. Es solo **administrativo**: crear proyectos y gestionar quién pertenece. No da acceso a los datos de ningún proyecto. Se corresponde con la acción `manage-members` del Core, que `MATRIX` reserva a `owner`.
- **Edición de los datos descriptivos del proyecto**, *aprobado por el propietario*: el Core no tiene una acción específica. Se limita a quien tiene rol de proyecto `owner`, el único con `manage-members`, `manage-connectors` y `delete-data`. Es la opción más restrictiva compatible.
- **Aprobaciones:** `execute-approved-action` sigue denegado siempre, porque no existen aprobaciones humanas registradas (CORE-9.2/9.8).
- **Doble barrera:** RLS decide **qué filas existen** para el usuario, y el Core decide **qué acciones** permite su rol. Un proyecto de otro tenant, uno inexistente o un scope mal formado dan el mismo 404.

### 6. Pruebas

| Capa | Dónde | Qué cubre |
|---|---|---|
| pgTAP (52 aserciones) | `supabase/tests/rls_tenancy.test.sql` · `npm run test:db` | RLS en todas las tablas; `anon` sin privilegios; `WITH CHECK`; ninguna política sobre metadatos; lecturas y escrituras entre tenants; manipulación de IDs (FK compuestas); usuario sin pertenencia con `user_metadata` falsificado; roles; último titular |
| Integración (9) | `tests/integration` · `npm run test:integration` | Registro con confirmación real vía Mailpit, inicio y cierre de sesión (refresh token revocado), contraseñas débiles o erróneas, peticiones anónimas, lecturas y escrituras cruzadas y manipulación de IDs por la Data API, roles, esquema `private` no expuesto |
| E2E (Playwright) | `e2e/auth-tenancy.spec.ts`, `e2e/visual.spec.ts` | Formularios reales; rutas protegidas sin sesión; cookies falsificadas; 404 idéntico entre otro tenant e inexistente; campo oculto manipulado rechazado por RLS; error genérico al usar un identificador de otro tenant; permisos según el rol guardado; comprobaciones visuales y de accesibilidad a 360, 390 y 1280 px |
| Unitarias y estáticas | `tests/*.test.ts` · `npm test` | Configuración y rechazo de claves secretas, redirecciones seguras, mapeo de rol a decisiones del Core, ausencia de fixtures, metadatos o claves secretas en el código |

Una mutación de comprobación (política de lectura de `projects` cambiada a `using (true)`) hace fallar 4 aserciones pgTAP y 4 pruebas de integración.

## Consecuencias

- **Migraciones versionadas en el repositorio:**
  - Solo se aplican al stack local (`supabase start` / `db reset`) y en la CI.
  - **No se han aplicado al proyecto alojado**, ni se ha ejecutado `db push`.
  - Aplicarlas es un paso manual del propietario, con la CLI versionada y una revisión previa de `supabase db push --dry-run` ([SETUP-SUPABASE §3](../SETUP-SUPABASE.md)).
- **Pendiente para etapas posteriores:**
  - Gestionar miembros desde la interfaz (invitaciones por correo).
  - Recuperar contraseña.
  - MFA de usuarios.
  - Auditoría (CORE-9.2).
- **Identificadores (`slug`):**
  - Son globales y aparecen en las URLs.
  - Si falla la creación de una organización o de un proyecto, el formulario muestra siempre el mismo error genérico: «No se ha podido crear. Revisa los datos o prueba con otro identificador.».
    - No distingue un identificador ocupado (23505) de otros fallos, así que no confirma que exista.
    - Lo comprueban `tests/security-static.test.ts` y el e2e «a taken organization identifier…».
  - **Riesgo residual:** alguien que envía un identificador válido y ve fallar la creación puede sospechar que está ocupado, aunque la aplicación no lo confirme y no muestre nada de la otra organización. Eliminarlo del todo exigiría identificadores no globales. **El propietario acepta este riesgo**: se mantienen el modelo actual y el mensaje genérico.

## Reversibilidad

- **Cambiar de método de acceso** (OAuth, enlace mágico) no toca el modelo de datos.
- **Añadir un permiso** se hace en el Core (MATRIX) y en una política nueva, nunca en una matriz paralela.
