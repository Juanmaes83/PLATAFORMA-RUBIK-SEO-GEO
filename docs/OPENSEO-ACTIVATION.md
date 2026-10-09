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

## Paquete de aplicación: cuatro migraciones pendientes (main@8d56e18)

**Estado al 09/10/2026:** los PR #31–#38 están fusionados en `main`. El Supabase alojado tiene cinco versiones (`20260928120000`, `20260928150000`, `20261007120000`, `20261007150000`, `20261009071705`). Faltan cuatro, que se aplican juntas y en orden. El conector Supabase de la sesión de Claude no tiene acceso a este proyecto (solo lista los de otra organización), así que la aplicación la hace el propietario con su CLI. **No aplicarlas desde un conector o desde el editor SQL**: crearían versiones con otra fecha y el historial dejaría de coincidir con el repositorio.

| Orden | Migración | Qué hace |
|---|---|---|
| 1 | `20261009120000_openseo_project_connections.sql` | Conexión OpenSEO por proyecto: tabla privada y RPC solo para el owner |
| 2 | `20261009150000_openseo_job_connection.sql` | `connection_id` en el job y reemplazo de `private.openseo_job` |
| 3 | `20261009170000_openseo_active_job.sql` | Lectura del trabajo activo y liberación atómica de una reserva STARTING |
| 4 | `20261009180000_webmaster_properties.sql` | Propiedad de Search Console y Bing por proyecto |

Ninguna borra ni modifica filas existentes. La 2 reemplaza una función, así que **no debe haber ningún trabajo activo**.

### 1. Comprobación previa (editor SQL del proyecto, solo lectura)

```sql
-- Debe devolver 0 filas: ningún trabajo OpenSEO en curso.
select id, state, created_at from private.openseo_project_jobs where state in ('STARTING', 'SYNCING');
-- Debe devolver exactamente las cinco versiones listadas arriba.
select version from supabase_migrations.schema_migrations order by version;
```

Si hay un trabajo activo, esperar a que termine (o reconciliarlo cuando ya esté desplegado el panel) antes de seguir.

### 2. Dry-run y aplicación (PowerShell, copia local con árbol limpio)

```powershell
git switch main; git pull --ff-only          # debe quedar en 8d56e18 o posterior
npx supabase@2.118.0 link --project-ref yvdgmklgwlshizzgefpv
npx supabase@2.118.0 migration list --linked
npx supabase@2.118.0 db push --linked --dry-run
```

El dry-run debe proponer **exactamente** las cuatro versiones de la tabla, en ese orden. **Si propone otra cosa, detenerse** y compartir la salida sin secretos. No usar `--include-all` para forzarlo. Si coincide:

```powershell
npx supabase@2.118.0 db push --linked
npx supabase@2.118.0 migration list --linked          # nueve versiones, local y remoto iguales
npx supabase@2.118.0 db advisors --linked --type security --level info
```

### 3. Verificación posterior (editor SQL, solo lectura)

```sql
select to_regclass('private.openseo_project_connections') as conexiones,
       to_regclass('private.webmaster_properties') as propiedades,
       (select count(*) from information_schema.columns
         where table_schema = 'private' and table_name = 'openseo_project_jobs' and column_name = 'connection_id') as columna_job,
       has_function_privilege('authenticated', 'public.openseo_connection(uuid,text,jsonb)', 'execute') as rpc_conexion,
       has_function_privilege('anon', 'public.openseo_connection(uuid,text,jsonb)', 'execute') as anon_conexion,
       has_function_privilege('authenticated', 'public.openseo_active_job(uuid)', 'execute') as rpc_activo,
       has_function_privilege('authenticated', 'public.webmaster_property(uuid,text,text,jsonb)', 'execute') as rpc_propiedad;
```

Esperado: las dos tablas existen, `columna_job = 1`, las RPC son `true` para `authenticated` y `anon_conexion = false`. En el Advisor se espera el INFO `rls_enabled_no_policy` también para las dos tablas privadas nuevas, que es intencional (no crear políticas para silenciarlo), y el WARN de contraseñas filtradas, que ya existía.

### 4. Efecto en producción

- Tras aplicarlas, el owner verá en Auditoría técnica el panel «Conexión de OpenSEO del proyecto» operativo, en lugar del aviso «no disponible».
- Las auditorías siguen en modo `legacy`: `OPENSEO_PROJECT_CONNECTIONS_MODE` no existe en Vercel.
- Previews y producción comparten este Supabase. Una conexión creada desde una preview es real.

### 5. Rollback (solo si hiciera falta; antes, copia de seguridad y ningún trabajo activo)

1. Ejecutar, en este orden, [`docs/rollback/webmaster-properties-rollback.sql`](rollback/webmaster-properties-rollback.sql) y [`docs/rollback/openseo-multitenant-rollback.sql`](rollback/openseo-multitenant-rollback.sql).
2. Ejecutar `npx supabase@2.118.0 migration repair --status reverted 20261009180000 20261009170000 20261009150000 20261009120000`.
3. Probado en local el 09/10/2026 con las nueve migraciones aplicadas: tras los dos scripts no queda ninguno de los objetos nuevos, `private.openseo_job` vuelve a ser idéntica a la original (mismo md5) y las suites de jobs, provenance, importaciones, tenancy y RLS pasan.
4. Se pierden las conexiones y propiedades guardadas; no hay credenciales en ellas.

### Activar después el modo por proyecto (decisión aparte)

1. Crear desde el panel la conexión de Sarah con su proyecto OpenSEO real y su dominio.
2. Comprobar que no hay trabajos activos.
3. Definir `OPENSEO_PROJECT_CONNECTIONS_MODE=project` solo en producción y hacer redeploy.

Rollback: quitar la variable y hacer redeploy. Un trabajo lanzado en un modo no se consulta en el otro; ese rechazo es intencional.
