# Supabase: estado real, pruebas locales y pasos manuales del propietario (CORE-9.1)

**Nadie debe pegar claves en el chat, en issues ni en PRs.** Claude no crea proyectos, no cambia la configuración de la cuenta, no aplica migraciones al proyecto alojado y no ejecuta `db push`.

## 1. Estado a 28/09/2026

### Proyecto alojado (lo ha creado el propietario; Claude no lo ha tocado)

- **Proyecto:** `plataforma-rubik-seo-geo-dev`, en la organización `Rubik Sota`. Plan Free, región West EU (Paris / eu-west-3), estado saludable. CORE-9.1 ya está fusionado en `main` mediante PR #2 (`debbb7078ea1af4931dea59d2169f8eda7a9967b`); su CI posterior al merge [36445304853](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36445304853) pasó. La migración versionada ya está en `main`, pero aún no se ha aplicado al proyecto alojado.
- **Data API:** activada. La exposición automática de tablas está desactivada y la activación automática de RLS está configurada.
- **Lo que todavía no tiene:**
  - migraciones (ni tablas de la plataforma) ni datos;
  - conexión con GitHub.
- **Lo que no consta como configurado:** Auth (métodos, URLs de redirección, SMTP, plantillas), MFA de la cuenta y migraciones. Este documento no afirma que lo estén.

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

Son pasos **del propietario** y ninguno está hecho. Sin ellos la aplicación no se ha probado contra el proyecto alojado.

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
4. **Aplicar la migración, solo con el flujo versionado de la Supabase CLI.**
   - No se usa el SQL Editor para cambios de esquema. Una migración pegada a mano no queda registrada en el historial de migraciones del proyecto, y el alojado y el repositorio dejarían de coincidir.
   - El propietario ejecuta estos pasos desde su máquina, con la CLI fijada en el repositorio y el PR de CORE-9.1 ya fusionado en `main`. Claude no los ejecuta.

   ```bash
   git switch main && git pull                      # migraciones revisadas y fusionadas
   npx supabase@2.118.0 login                       # sesión del propietario en el navegador
   npx supabase@2.118.0 link --project-ref <ref>    # <ref> del proyecto plataforma-rubik-seo-geo-dev
   npx supabase@2.118.0 migration list --linked     # historial local frente al remoto
   npx supabase@2.118.0 db push --dry-run           # SOLO muestra qué se aplicaría
   ```

   1. **Inspeccionar la salida de `--dry-run`** antes de continuar. Debe listar únicamente `20260928120000_core_9_1_tenancy.sql`. No debe proponer seed (no uses `--include-seed`) ni migraciones desconocidas; si aparece algo más, se para y se revisa.
   2. **Aplicación explícita por el propietario:** `npx supabase@2.118.0 db push`. La CLI pide confirmación antes de aplicar.
   3. **Comprobar:** `npx supabase@2.118.0 migration list --linked` debe mostrar la migración en local y en remoto. En el panel, **Database → Advisors** no debe tener avisos de seguridad (RLS, `search_path`, funciones expuestas).
   4. **Contraseña de la base de datos:** la CLI puede pedirla. Se escribe solo en la terminal del propietario: nunca en el repositorio, en `.env*`, en el chat ni en un PR.
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
