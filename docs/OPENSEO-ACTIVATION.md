# Activar el guardado firmado de OpenSEO

Estado 09/10/2026: migración de jobs integrada mediante PR #28 y validada en Supabase local de CI. Botón/actions en PR #30; la firma de producción está configurada en Vercel. Ninguna de estas pruebas certifica todavía la persistencia alojada.

## Acceso y destino

El propietario autorizó expresamente las migraciones alojadas. El conector Supabase disponible no lista el proyecto de Rubik; no usar Sarah Studio ni otro proyecto como sustituto. La documentación identifica el proyecto como `plataforma-rubik-seo-geo-dev`, pero la referencia exacta y su coincidencia con la aplicación deben comprobarse antes de escribir.

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
- Tras verificar las migraciones y desplegar el PR #30, configurar `OPENSEO_PROJECT_JOBS_ENABLED=true` exclusivamente en servidor/producción y desplegar de nuevo. Hasta entonces permanece apagado por defecto.
- Usar una auditoría nueva vinculada por la plataforma, del dominio autorizado. «Consultar y guardar resultados» guarda únicamente al terminar; «Consultar estado» no escribe resultados. El botón pendiente no ejecuta polling automático.
- Comprobar escritura, detalle con firma verificada tras recargar, reintento sin duplicados y rechazo del acceso desde otro cliente. Registrar IDs de resultados y evidencia sin claves ni datos privados.

## Límites pendientes

Las auditorías anteriores al ledger no se adoptan automáticamente. Una respuesta de lanzamiento incierta conserva STARTING y requiere reconciliación administrativa antes de otro lanzamiento; no hay un botón para expirar esa reserva. OpenSEO mantiene un solo `OPENSEO_PROJECT_ID` global: el mapeo de instancias/proyectos del proveedor para varios clientes es una fase posterior. No se activan nuevas herramientas de pago, publicación ni indexación de Sarah.

Fuentes de CLI consultadas el 09/10/2026: [flujo de desarrollo](https://supabase.com/docs/guides/local-development/cli-workflows) y [referencia CLI](https://supabase.com/docs/reference/cli/introduction).
