# Supabase: estado real, pruebas locales y pasos manuales del propietario (CORE-9.1)

**Nadie debe pegar claves en el chat, en issues ni en PRs.** El propietario administra el proyecto alojado y aplica las migraciones versionadas desde su terminal; Codex/Claude no reciben claves ni ejecutan `db push`.

## 1. Estado a 28/09/2026

### Proyecto alojado (administrado por el propietario; estado actualizado el 28/09/2026)

- **Proyecto:** `plataforma-rubik-seo-geo-dev`, en la organización `Rubik Sota`. Plan Free, región West EU (Paris / eu-west-3), estado saludable. CORE-9.1 ya está fusionado en `main` mediante PR #2 (`debbb7078ea1af4931dea59d2169f8eda7a9967b`); su CI posterior al merge [36445304853](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36445304853) pasó. Según las salidas de CLI compartidas por el propietario el 28/09/2026, las migraciones `20260928120000_core_9_1_tenancy.sql` y `20260928150000_rls_auto_enable_privileges.sql` están aplicadas en el proyecto alojado. Tras la segunda, `db advisors --linked --type security --level info` devuelve **No issues found**. Codex no accedió directamente al proyecto.
- **Data API:** activada. La exposición automática de tablas está desactivada y la activación automática de RLS está configurada.
- **Lo que todavía no tiene:** datos de clientes ni conexión con GitHub.
- **Aplicada y verificada:** la migración `20260928150000_rls_auto_enable_privileges.sql` (§5), por el propietario con Supabase CLI. El historial remoto coincide con el local y el Security Advisor no reporta incidencias.
- **Lo que no consta como configurado:** Auth (métodos, URLs de redirección, SMTP, plantillas) y MFA de la cuenta. Este documento no afirma que lo estén.

### Implementado y probado solo en local (CORE-9.1 fusionado en `main`)

- **Auth:** Supabase Auth con correo y contraseña en el servidor ([ADR 0003](adr/0003-auth-supabase-y-tenancy.md)).
- **Datos:** organizaciones, proyectos, pertenencias y roles, con RLS. Migración en `supabase/migrations/`.
- **Pruebas:** contra el **stack local** de Supabase (Docker):
  - pgTAP (`supabase/tests`);
  - integración (`tests/integration`);
  - e2e (`e2e/`).

  La CI levanta ese stack en cada ejecución (job `e2e`).

### Decisiones

Todas aprobadas por el propietario ([ADR 0003 §1 y §5](adr/0003-auth-supabase-y-tenancy.md)):

- correo y contraseña como método inicial de acceso;
- registro abierto **solo durante las pruebas iniciales**; debe cerrarse antes de dar acceso a clientes;
- roles de organización `owner`/`member`;
- solo el rol `owner` del proyecto edita sus datos descriptivos;
- riesgo residual aceptado: puede deducirse si un identificador global está ocupado. Se mantienen el modelo actual y el mensaje genérico.
- **Fuera de esta fase:** invitaciones, MFA de usuarios y recuperación de contraseña.

## 2. Probar en local (sin tocar el proyecto alojado)

Requisitos: Docker en marcha y Node ≥ 22.12.

```bash
npm ci
npm run db:start          # supabase start (solo Auth, Postgres, API y Mailpit); aplica las migraciones
npm run test:db           # pgTAP: RLS y aislamiento
npm run test:integration  # Auth y aislamiento por la Data API
npx supabase@2.118.0 status -o env   # API_URL y PUBLISHABLE_KEY para .env.local
```

1. **Variables:** copia `API_URL` como `NEXT_PUBLIC_SUPABASE_URL` y `PUBLISHABLE_KEY` como `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `.env.local`. Git ignora ese fichero. **Nunca** copies `SECRET_KEY` ni `SERVICE_ROLE_KEY`.
2. **Arranque:** ejecuta `npm run dev` y abre `http://localhost:3000/registro`. El correo de confirmación llega al Mailpit local (`MAILPIT_URL`, normalmente `http://127.0.0.1:54324`).
3. **E2E:** `npm run test:e2e` levanta su propio `next dev` conectado al stack local y crea cuentas ficticias `@ejemplo.test`. Si el puerto 3217 está ocupado, usa `E2E_PORT=<puerto>`, que debe estar en `additional_redirect_urls` de `supabase/config.toml` para que funcione el enlace de confirmación.
4. **Parar el stack:** `npm run db:stop`. Para volver a una base limpia: `npm run db:reset`.

## 3. Qué falta para probar Auth contra el proyecto alojado

La migración de seguridad descrita en §5 ya está aplicada. Siguen pendientes las tareas de cuenta/Auth y la prueba manual de aislamiento; hasta completarlas, la aplicación no se considera validada de extremo a extremo contra el proyecto alojado.

1. **CORE-9.1 ya está fusionado.** Confirma que tu copia está en `main` y actualizada antes de seguir; la migración `20260928120000_core_9_1_tenancy.sql` ya debe estar en `supabase/migrations/`.
2. **Seguridad de la cuenta:** activar MFA en la cuenta de Supabase y revisar quién tiene acceso a la organización `Rubik Sota`.
3. **Auth en el panel** (Authentication):
   - Método **Email** con **Confirm email** activado (es el valor por defecto) y ningún proveedor OAuth.
   - Contraseñas: longitud mínima 12 y requisito «letters and digits», los mismos valores que `supabase/config.toml`.
   - **URL Configuration**, mientras no haya despliegue:
     - **Site URL:** `http://localhost:3000`. Es la URL por defecto a la que Supabase redirige cuando no se indica `redirectTo`.
     - **Redirect URLs** (lista de permitidas): solo `http://localhost:3000/auth/confirm`, como URL exacta y sin comodines. Es la que envía la aplicación como `emailRedirectTo` al registrarse (`src/lib/auth/actions.ts`, origen de la petición + `/auth/confirm`). Así el enlace de confirmación vuelve a esa ruta.
     - Fuente: [Supabase · Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), consultada el 28/09/2026. La guía indica que la Site URL es la redirección por defecto sin `redirectTo`, que la lista admite URLs exactas o patrones glob, y que `redirectTo` debe coincidir con esa lista.
     - Coincide con el stack local: `site_url` y `additional_redirect_urls` de `supabase/config.toml`.
   - **Plantilla «Confirm signup»:** el enlace debe ser `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`, como `supabase/templates/confirmation.html`. Con la plantilla por defecto el enlace no pasa por `/auth/confirm` y la sesión no se crea en el servidor.
   - **Registro abierto (decisión aprobada):** solo durante las pruebas iniciales. **Antes de exponer la plataforma a clientes hay que cerrarlo**: desactivar «Allow new users to sign up» en Authentication y pasar a invitaciones en una fase posterior.
     - En el plan Free, el SMTP integrado tiene límites de envío muy bajos. Para más que pruebas puntuales hace falta un SMTP propio, que implica un proveedor externo y otra decisión.
4. **Migración de seguridad aplicada:** el propietario ejecutó `npx supabase@2.118.0 db push` el 28/09/2026 después de comprobar que `--dry-run` proponía únicamente `20260928150000_rls_auto_enable_privileges.sql`. `migration list --linked` muestra las versiones `20260928120000` y `20260928150000` tanto en local como en remoto; `db advisors --linked --type security --level info` devuelve **No issues found**. La salida compartida confirma la ejecución; Codex no accedió al proyecto alojado.
5. **Comprobación manual en el proyecto alojado:**
   1. Poner la URL del proyecto y la **clave publicable** (`sb_publishable_…`, en Settings → API Keys) en el `.env.local` de su máquina. Nunca la secreta.
   2. Ejecutar `npm run dev`.
   3. Registrar dos cuentas de prueba con correos propios. Crear una organización y un proyecto con cada una.
   4. Comprobar que ninguna ve el proyecto de la otra, ni en `/proyectos` ni abriendo su URL (debe dar 404).
   5. Cerrar sesión y comprobar que `/panel` redirige a `/acceso`.

   Las pruebas automáticas (`test:integration`, `test:e2e`) están limitadas a propósito al stack local y **no** deben apuntarse al proyecto alojado.
6. **Sin despliegues automáticos:** no conectar GitHub a Supabase (branching o migraciones automáticas) ni el hosting, salvo decisión expresa. La CI no tiene ni necesita secretos de Supabase.
7. **Legal:** antes de datos reales, revisar el DPA y los subencargados de Supabase, y la retención aprobada como propuesta de producto (PLATFORM-SPEC §4.3), con asesoría legal.

## 4. Reglas que no cambian

- La aplicación solo usa la **clave publicable**. La **clave secreta o `service_role` no se comparte** con Claude ni con Codex, no va al navegador ni a variables `NEXT_PUBLIC_*`, y no entra en el repositorio. El build y el servidor se niegan a arrancar si aparece en `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Toda tabla nueva en un esquema expuesto llega con RLS, políticas explícitas de mínimo privilegio, `WITH CHECK` en las actualizaciones y privilegios concedidos a mano. Así lo exigen `tests/security-static.test.ts` y la suite pgTAP.
- La autorización nunca usa `user_metadata`.

## 5. Función `public.rls_auto_enable()` (aviso del Security Advisor)

### Origen

- **No la crea este repositorio.** La crea Supabase Studio cuando se elige activar RLS automáticamente, al crear el proyecto o desde el aviso del panel. El formulario de creación del proyecto tiene la opción `enableRlsEventTrigger`.
- **Plantilla:** `AUTO_ENABLE_RLS_EVENT_TRIGGER_SQL`, con este contenido:
  - la función `public.rls_auto_enable()` (`SECURITY DEFINER`, `search_path = pg_catalog`, propiedad de `postgres`);
  - el event trigger `ensure_rls` (`ddl_command_end`, en `CREATE TABLE`, `CREATE TABLE AS` y `SELECT INTO`), que activa RLS en las tablas nuevas de `public`.
- **Fuentes:**
  - la plantilla se copió literalmente en `supabase/fixtures/studio-rls-auto-enable.sql`, desde el repositorio `supabase/supabase`, commit `c569a29`;
  - la misma función aparece en la guía [Event triggers](https://supabase.com/docs/guides/database/postgres/event-triggers).
- **Por qué avisa el Advisor:** la plantilla no revoca nada. Reproducida en local, deja el ACL `{=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}`: PUBLIC, `anon`, `authenticated` y `service_role` pueden ejecutarla.

### Corrección: migración `20260928150000_rls_auto_enable_privileges.sql`

- **Qué hace:**
  - conserva la función y el event trigger si existen (proyecto alojado);
  - los crea con la misma plantilla solo si no existen (stack local y CI);
  - revoca `EXECUTE` a PUBLIC, `anon` y `authenticated`. El propietario (`postgres`) lo conserva.
- **Idempotente:** se puede aplicar dos veces sin cambios.
- **Qué no cambia:** la activación automática de RLS sigue funcionando. Disparar un event trigger no comprueba `EXECUTE` sobre su función, y lo prueba `supabase/tests/rls_auto_enable.test.sql` con un rol sin ese permiso.
- **`service_role`:** conserva `EXECUTE`, porque la corrección pedida no lo incluye. La aplicación no usa ese rol. Revocárselo sería otra migración, si el propietario lo decide.
- **Recrear la función desde Studio:** si alguien la borra y la vuelve a crear, recupera los permisos abiertos. `CREATE OR REPLACE` conserva el ACL.

### Aplicación y verificación (completadas por el propietario el 28/09/2026)

1. `migration list --linked`: el propietario confirmó que `20260928120000` y `20260928150000` aparecen en local y remoto.
2. `db push --dry-run`: propuso únicamente `20260928150000_rls_auto_enable_privileges.sql`.
3. `db push`: terminó con `Applying migration ...` y `Finished supabase db push`.
4. `npx supabase@2.118.0 db advisors --linked --type security --level info`: resultado **No issues found**; desaparecieron los avisos sobre `public.rls_auto_enable()`.
5. **Comprobación opcional en el SQL Editor**, solo lectura:

   ```sql
   select proacl from pg_proc where oid = 'public.rls_auto_enable()'::regprocedure;
   ```

   Se espera `{postgres=X/postgres,service_role=X/postgres}`.

**Nota:** `db advisors --local` de la CLI 2.118.0 no informa de este aviso ni siquiera con la plantilla abierta (comprobado el 28/09/2026). Por eso la comprobación automática es pgTAP, y la CI reproduce el estado de Studio antes de aplicar la migración.

## 6. CORE-9.2 · Migración `20261007120000_core_9_2_audit_and_provenance.sql` (pendiente del propietario)

Estado a 07/10/2026: probada **solo en local** (pgTAP 113/113 y la integración). **No** se ha aplicado al proyecto alojado. Detalle en la [ADR 0004](adr/0004-persistencia-auditoria-y-provenance.md).

Antes de aplicarla:

1. Fusionar el PR de CORE-9.2 y el PR #19 del Core del que depende.
2. Decidir la custodia de las claves de firma (variables del hosting o KMS). Generarlas fuera del chat y del repositorio, por ejemplo con `openssl rand -base64 32` por clave. Configurar `PROVENANCE_SIGNING_KEYS` y `PROVENANCE_ACTIVE_KEY_ID` solo en el servidor.
3. Guardar una copia de seguridad de las claves fuera del repositorio. Sin ellas, la auditoría y los resultados guardados dejan de ser verificables.

Aplicación, con el mismo flujo de §3/§5:

1. Ejecutar `migration list --linked`.
2. Ejecutar `db push --dry-run` y comprobar que solo propone `20261007120000`.
3. Ejecutar `db push`.
4. Repetir `db advisors --linked --type security --level info`.

## 7. CORE-9.3 · Migración `20261007150000_core_9_3_manual_imports.sql` (pendiente del propietario)

Probada **solo en local**: pgTAP 137/137 e integración 24/24 ([ADR 0005](adr/0005-importacion-manual.md)). Requiere antes la migración de §6 y las claves de firma, porque cada importación se audita. Se aplica con el mismo flujo: `migration list --linked`, `db push --dry-run` (solo `20261007150000`), `db push` y Security Advisor.

