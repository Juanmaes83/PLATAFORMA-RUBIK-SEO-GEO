# Variables de entorno

La plantilla es [`.env.example`](../.env.example), que contiene **solo nombres**. Para el desarrollo local se copia a `.env.local`, que git ignora. En este repositorio nunca se escriben valores reales: ni tokens, ni claves, ni URLs privadas, ni datos personales. El guard `npm run check:secrets` falla si se commitea un fichero `.env*` distinto de la plantilla o algo con forma de credencial.

| Variable | Etapa | Uso | Dónde vive el valor |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | CORE-9.1 | URL del proyecto Supabase. `https://…`, o `http://127.0.0.1`/`localhost` para el stack local; cualquier otra se ignora | Local: `API_URL` de `npx supabase@2.118.0 status -o env`. Alojado: configuración del hosting, por el propietario |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | CORE-9.1 | Clave **publicable** (`sb_publishable_…`). Es pública por diseño: toda consulta se ejecuta como el usuario que ha iniciado sesión y RLS decide qué ve | Local: `PUBLISHABLE_KEY` del mismo comando. Alojado: el propietario |
| `PROVENANCE_SIGNING_KEYS` | CORE-9.2 | **Secreta, solo servidor.** Claves HMAC para firmar la auditoría y los resultados de proveedor: entradas `keyId:base64` separadas por comas, de al menos 32 bytes cada una ([ADR 0004](adr/0004-persistencia-auditoria-y-provenance.md)). Sin ella, la aplicación no persiste datos firmados | Gestor de secretos del hosting o KMS, configurado por el propietario. Nunca en `NEXT_PUBLIC_*`, BD, repositorio, chat ni logs |
| `PROVENANCE_ACTIVE_KEY_ID` | CORE-9.2 | Identificador de la clave que firma los registros nuevos. Las demás claves solo verifican el historial (rotación) | Igual que la anterior; el identificador no es secreto |
| `OPENSEO_ENDPOINT` | OpenSEO ([ADR 0006](adr/0006-puente-openseo.md)) | URL https base de la instancia de OpenSEO. MCP en `/mcp` y salud en `/api/health`. Solo servidor | Configuración del hosting, por el propietario |
| `OPENSEO_API_KEY` | OpenSEO | **Secreta, solo servidor.** Clave `oseo_…` que solo viaja en la cabecera `Authorization` hacia `/mcp`. Si alguna variable `NEXT_PUBLIC_*` contiene datos de OpenSEO, la configuración se rechaza | Gestor de secretos del hosting. Nunca en `NEXT_PUBLIC_*`, BD, Project State, repositorio, chat ni logs |
| `OPENSEO_PROJECT_ID` | OpenSEO | Proyecto de OpenSEO donde se crean las auditorías. No llega al navegador | Configuración del hosting |
| `OPENSEO_AUDIT_ALLOWED_HOSTS` | OpenSEO | Hosts que se pueden auditar, separados por comas. Además, el destino debe ser el dominio del proyecto. Se rechazan IP, `localhost` y previews (`*.vercel.app` y similares). Vacía: ninguna auditoría | Configuración del hosting |
| `OPENSEO_AUDIT_MAX_PAGES` | OpenSEO | Máximo de páginas por auditoría: entero de 10 a 500, 50 si se deja vacía | Configuración del hosting |
| `OPENSEO_WHOAMI_IDENTITY_FIELD` | OpenSEO | Campo de primer nivel de `whoami` que confirma la autenticación. Sin él, la conexión queda «sin verificar» y la prueba muestra solo los nombres de campo observados | Lo elige el propietario tras la primera prueba |
| `OPENSEO_AUDIT_STATUS_COMPLETED`, `_FAILED`, `_PENDING` | OpenSEO | Valores de `get_audit_status` separados por comas; OpenSEO no los documenta. Un valor no clasificado nunca se da por terminado | Los fija el propietario tras observar una auditoría real |
| `AUTH_MODE` | Retirada | La demostración de CORE-9.0 ya no existe. `AUTH_MODE=mock` sigue **prohibido en producción**: `npm run build`/`npm start` y el propio servidor se niegan a arrancar con él | No definirla |
| `NEXT_TELEMETRY_DISABLED` | Siempre | La fija `scripts/run-next.mjs` y la CI: la telemetría de Next.js no se envía | No hace falta configurarla |

Sin las dos variables de Supabase la aplicación arranca, pero **no hay inicio de sesión** y todas las páginas protegidas redirigen a `/acceso`.

## Claves secretas

- **La aplicación no usa claves secretas de Supabase ni `service_role`.** Usa la clave publicable y la sesión del usuario bajo RLS.
- Si `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` contiene una clave secreta (`sb_secret_…`) o un JWT con rol `service_role`, `scripts/run-next.mjs` se niega a ejecutar Next.js y `src/instrumentation.ts` corta el arranque del servidor. Las variables `NEXT_PUBLIC_*` se incrustan en el JavaScript del navegador.
- Las pruebas de integración y e2e contra el **stack local** leen sus claves en tiempo de ejecución con `supabase status -o env` (`scripts/supabase-test-env.mjs`). Son las claves de desarrollo del contenedor local, no se escriben en ningún fichero y no sirven para el proyecto alojado.
- Las claves secretas de servidor son la clave OpenSEO y la de firma HMAC de CORE-9.2 (`PROVENANCE_SIGNING_KEYS`, [ADR 0004](adr/0004-persistencia-auditoria-y-provenance.md)). No es una clave de Supabase y no da acceso a datos. Las pruebas generan claves aleatorias en memoria en cada ejecución.

## Build y variables `NEXT_PUBLIC_*`

Next.js incrusta las variables `NEXT_PUBLIC_*` al compilar. Un `npm run build` sin ellas produce una aplicación sin inicio de sesión aunque luego se definan al arrancar; hay que definirlas **antes** del build del entorno correspondiente.
## Guardado de auditorías por proyecto

`CREDENTIALS_ENCRYPTION_KEYS` y `CREDENTIALS_ACTIVE_KEY_ID` ([ADR 0010](adr/0010-credenciales-por-cliente.md), propuesta): keyring de servidor para cifrar las credenciales de proveedor de cada cliente (`keyId:base64` de 32 bytes, separadas por comas, y el id activo). Solo servidor y *Sensitive*; nunca `NEXT_PUBLIC_`, que impide cargar el keyring. **Hoy no están definidas**: se configuran solo si el propietario aprueba el ADR.

`OPENSEO_PROJECT_CONNECTIONS_MODE=project` (fase 4 de [ADR 0007](adr/0007-openseo-conexion-por-proyecto.md)) hace que cada proyecto use su conexión de OpenSEO activa en lugar de `OPENSEO_PROJECT_ID` y `OPENSEO_AUDIT_ALLOWED_HOSTS`, que dejan de leerse. Ausente o con otro valor: modo `legacy`, el actual. Exige `OPENSEO_PROJECT_JOBS_ENABLED=true` y las migraciones `20261009120000` y `20261009150000` aplicadas en alojado. Cambiarla solo sin trabajos activos. Solo servidor; hoy no está definida en Vercel.

`OPENSEO_PROJECT_JOBS_ENABLED=true` activa la reserva de trabajos y el guardado manual firmado. Es una variable exclusiva del servidor, apagada por defecto. Activarla solo después de aplicar las migraciones oficiales 9.2, 9.3 y `20261009071705_openseo_project_jobs`, configurar el keyring de provenance y comprobar el aislamiento alojado. No usar `NEXT_PUBLIC_`.

Con el modo activo, cada lanzamiento obtiene una reserva en PostgreSQL antes de contactar con OpenSEO. «Consultar y guardar resultados» captura y firma las filas originales del Core y guarda la pareja en una transacción. Una auditoría no vinculada queda rechazada antes de salir a la red. Las auditorías históricas anteriores al ledger no se adoptan automáticamente.

Los estados STARTING tras timeout o error ambiguo requieren reconciliación: no caducan ni se relanzan automáticamente. El modo legacy permanece disponible mientras no se active la variable; sus resultados no se guardan.
