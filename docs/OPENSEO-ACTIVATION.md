# Activar el guardado firmado de OpenSEO

Estado 09/10/2026: migración de jobs integrada mediante PR #28 y validada en Supabase local de CI. Botón/actions del PR #30 integrados y desplegados: producción READY en `afb5a3838981a78b9f126acc280fdc0138bfdae0`, CI completa `37902474922`. La firma de producción está configurada en Vercel. Ninguna de estas pruebas certifica todavía la persistencia alojada.

## Acceso y destino

El propietario autorizó expresamente las migraciones alojadas. Su CLI identifica el destino `plataforma-rubik-seo-geo-dev`, referencia `yvdgmklgwlshizzgefpv`; `link` finalizó correctamente. El 09/10/2026 compartió `db push` exitoso y `migration list` con las cinco versiones sincronizadas, incluidas 9.2/9.3/jobs. El bloqueo de aplicación de migraciones queda resuelto mediante su terminal. El conector de este entorno sigue sin listar ese proyecto; no se ha escrito en Sarah Studio ni en otro destino.

Security Advisor devuelve INFO `rls_enabled_no_policy` sobre el ledger privado: RLS sin políticas y sin privilegios directos es deliberado; el acceso pasa por la RPC con comprobación de owner. No crear políticas abiertas para silenciar ese INFO. Persiste WARN `auth_leaked_password_protection`, sin contratar planes ni cambiar Auth automáticamente.

Desde la copia ya creada en Windows, con el árbol de trabajo limpio:

```powershell
cd C:\Users\temp123\rubik-migracion-openseo
git fetch origin
git switch main
git pull --ff-only
npx --yes supabase@2.118.0 login
npx --yes supabase@2.118.0 projects list
```

El login se completa en el navegador de la persona propietaria; no compartir tokens ni contraseñas. Si no aparece el proyecto de Rubik, iniciar sesión en la cuenta que lo administra. No continuar con otro proyecto.

Tras confirmar el Reference ID del proyecto correcto y su correspondencia con Vercel:

```powershell
$rubikProjectRef = Read-Host "Reference ID comprobado del proyecto Supabase de Rubik"
npx --yes supabase@2.118.0 link --project-ref $rubikProjectRef
npx --yes supabase@2.118.0 migration list --linked
npx --yes supabase@2.118.0 db push --linked --dry-run
```

Si las dos migraciones CORE-9.1 ya están aplicadas, el dry-run debe proponer únicamente las versiones pendientes de esta lista:

- `20261007120000_core_9_2_audit_and_provenance.sql`
- `20261007150000_core_9_3_manual_imports.sql`
- `20261009071705_openseo_project_jobs.sql`

No usar `migration repair`, `db reset`, recrear tablas ni copiar el mismo SQL con otro timestamp para sortear una discrepancia. Resolver primero cualquier diferencia con el historial remoto.

Después de revisar destino e historial, aplicar la autorización ya otorgada:

```powershell
npx --yes supabase@2.118.0 db push --linked
npx --yes supabase@2.118.0 migration list --linked
npx --yes supabase@2.118.0 db advisors --linked --type security --level info
```

Registrar el resultado real y comprobar tablas, RLS y permisos RPC con acceso de administración; las suites automáticas del repo siguen limitadas al stack local y no deben apuntarse a producción.

## Activación de Vercel

- Producción tiene `PROVENANCE_SIGNING_KEYS` como Secret/sensitive y `PROVENANCE_ACTIVE_KEY_ID` como identificador público al servidor, creado el 09/10/2026. No rotar ni borrar una clave que firme historial sin mantenerla para verificación.
- El PR #30 ya está desplegado. Tras recibir la evidencia de migraciones sincronizadas se creó `OPENSEO_PROJECT_JOBS_ENABLED=true` exclusivamente en producción y se solicitó reconstruir el mismo SHA probado `afb5a38` (`dpl_6hzwqBBTJq4582stffdxcU8VmdGF`). Configuración creada; estado final del despliegue y prueba de guardado real deben registrarse antes de cerrar la activación.
- Usar una auditoría nueva vinculada por la plataforma, del dominio autorizado. «Consultar y guardar resultados» guarda únicamente al terminar; «Consultar estado» no escribe resultados. El botón pendiente no ejecuta polling automático.
- Comprobar escritura, detalle con firma verificada tras recargar, reintento sin duplicados y rechazo del acceso desde otro cliente. Registrar IDs de resultados y evidencia sin claves ni datos privados.

## Límites pendientes

Redeploy de activación comprobado `READY` el 09/10/2026: `dpl_6hzwqBBTJq4582stffdxcU8VmdGF`, SHA `afb5a3838981a78b9f126acc280fdc0138bfdae0`, alias público asignado. Esto confirma despliegue/configuración, no una escritura real del informe.

Las auditorías anteriores al ledger no se adoptan automáticamente. Una respuesta de lanzamiento incierta conserva STARTING y requiere reconciliación administrativa antes de otro lanzamiento; no hay un botón para expirar esa reserva. OpenSEO mantiene un solo `OPENSEO_PROJECT_ID` global: el mapeo por cliente se diseña en [ADR 0007](adr/0007-openseo-conexion-por-proyecto.md) y su fase 1 no cambia este flujo. No se activan nuevas herramientas de pago, publicación ni indexación de Sarah.

Fuentes de CLI consultadas el 09/10/2026: [flujo de desarrollo](https://supabase.com/docs/guides/local-development/cli-workflows) y [referencia CLI](https://supabase.com/docs/reference/cli/introduction).

## Paquete de aplicación: multiempresa y reconciliación (PR #32, #33, #36)

**Preparado para revisión del propietario, no ejecutado.** Solo procede después de fusionar #32, #33 y #36 en `main` y con la CI de `main` en verde. Mientras tanto, el código de producción es compatible con un alojado sin estas migraciones: modo `legacy` y sin panel de reconciliación activo.

- **Destino:** `plataforma-rubik-seo-geo-dev`, referencia `yvdgmklgwlshizzgefpv`.
- **Migraciones, en este orden:**
  1. `20261009120000_openseo_project_connections.sql`: tabla privada y RPC de conexión.
  2. `20261009150000_openseo_job_connection.sql`: columna `connection_id` y reemplazo de `private.openseo_job`.
  3. `20261009170000_openseo_active_job.sql`: lectura del trabajo activo y liberación atómica.
- **Requisito:** que no haya ningún trabajo STARTING o SYNCING en ese momento. La segunda migración reemplaza la función que usan los trabajos.

Desde la copia de Windows, con el árbol limpio y `main` actualizado:

```powershell
git switch main; git pull --ff-only
npx supabase@2.118.0 link --project-ref yvdgmklgwlshizzgefpv
npx supabase@2.118.0 migration list --linked          # las cinco versiones actuales, sincronizadas
npx supabase@2.118.0 db push --linked --dry-run       # debe proponer exactamente las tres versiones de arriba
```

**Detenerse** si el dry-run propone otra cosa. Si coincide:

```powershell
npx supabase@2.118.0 db push --linked
npx supabase@2.118.0 migration list --linked          # ocho versiones sincronizadas
npx supabase@2.118.0 db advisors --linked --type security --level info
```

En el Advisor se espera:
- el INFO `rls_enabled_no_policy` también para `private.openseo_project_connections`, que es intencional, igual que el ledger;
- el WARN de contraseñas filtradas, que ya existía.

No crear políticas para silenciar el INFO.

- **Qué cambia en producción al aplicarlas:** nada visible hasta el siguiente despliegue con #35. Después, el owner verá el panel de conexión. Las auditorías siguen en `legacy`, porque `OPENSEO_PROJECT_CONNECTIONS_MODE` no existe en Vercel.
- **Riesgo:** previews y producción comparten Supabase. Una conexión creada desde una preview es real.
- **Rollback:** primero copia de seguridad del proyecto y ningún trabajo activo.
  1. Ejecutar [`docs/rollback/openseo-multitenant-rollback.sql`](rollback/openseo-multitenant-rollback.sql) en el editor SQL del proyecto.
  2. Ejecutar `npx supabase@2.118.0 migration repair --status reverted 20261009170000 20261009150000 20261009120000`.
  3. Probado en local: la función `private.openseo_job` queda idéntica a la original (mismo md5), los permisos se conservan y las suites de jobs, provenance, tenancy e importaciones pasan.
- **Activar el modo por proyecto** es otra decisión posterior, que se presentará aparte: crear la conexión de Sarah, comprobar que no hay trabajos activos, definir la variable y hacer redeploy.
