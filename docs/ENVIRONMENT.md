# Variables de entorno

La plantilla es [`.env.example`](../.env.example), que contiene **solo nombres**. Para el desarrollo local se copia a `.env.local`, que git ignora. En este repositorio nunca se escriben valores reales: ni tokens, ni claves, ni URLs privadas, ni datos personales. El guard `npm run check:secrets` falla si se commitea un fichero `.env*` distinto de la plantilla o algo con forma de credencial.

| Variable | Etapa | Uso | Dónde vive el valor |
|---|---|---|---|
| `AUTH_MODE` | CORE-9.0 | `mock` activa usuarios ficticios. Si falta: `mock` fuera de producción y desactivado en producción. `supabase` queda reservado (responde «no implementado») | `.env.local` o el entorno del proceso |
| `NEXT_PUBLIC_SUPABASE_URL` | CORE-9.1 (futura) | URL del proyecto Supabase | Configuración del hosting, por el propietario |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | CORE-9.1 (futura) | Clave pública (anon/publishable) de Supabase; la protección real viene de RLS | Configuración del hosting, por el propietario |
| `NEXT_TELEMETRY_DISABLED` | Siempre | La fija `scripts/run-next.mjs` y la CI: la telemetría de Next.js no se envía | No hace falta configurarla |

**No está previsto:** una service-role key de Supabase en el navegador, en `.env.example` ni en el repositorio. Si una etapa futura la necesitara en el servidor, se decidiría en una ADR y la configuraría el propietario en el gestor de secretos del hosting.
