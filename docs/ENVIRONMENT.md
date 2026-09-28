# Variables de entorno

La plantilla es [`.env.example`](../.env.example), que contiene **solo nombres**. Para el desarrollo local se copia a `.env.local`, que git ignora. En este repositorio nunca se escriben valores reales: ni tokens, ni claves, ni URLs privadas, ni datos personales. El guard `npm run check:secrets` falla si se commitea un fichero `.env*` distinto de la plantilla o algo con forma de credencial.

| Variable | Etapa | Uso | Dónde vive el valor |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | CORE-9.1 | URL del proyecto Supabase. `https://…`, o `http://127.0.0.1`/`localhost` para el stack local; cualquier otra se ignora | Local: `API_URL` de `npx supabase@2.118.0 status -o env`. Alojado: configuración del hosting, por el propietario |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | CORE-9.1 | Clave **publicable** (`sb_publishable_…`). Es pública por diseño: toda consulta se ejecuta como el usuario que ha iniciado sesión y RLS decide qué ve | Local: `PUBLISHABLE_KEY` del mismo comando. Alojado: el propietario |
| `AUTH_MODE` | Retirada | La demostración de CORE-9.0 ya no existe. `AUTH_MODE=mock` sigue **prohibido en producción**: `npm run build`/`npm start` y el propio servidor se niegan a arrancar con él | No definirla |
| `NEXT_TELEMETRY_DISABLED` | Siempre | La fija `scripts/run-next.mjs` y la CI: la telemetría de Next.js no se envía | No hace falta configurarla |

Sin las dos variables de Supabase la aplicación arranca, pero **no hay inicio de sesión** y todas las páginas protegidas redirigen a `/acceso`.

## Claves secretas

- **La aplicación no usa ninguna clave secreta ni `service_role`.** No existe una variable para ella.
- Si `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` contiene una clave secreta (`sb_secret_…`) o un JWT con rol `service_role`, `scripts/run-next.mjs` se niega a ejecutar Next.js y `src/instrumentation.ts` corta el arranque del servidor. Las variables `NEXT_PUBLIC_*` se incrustan en el JavaScript del navegador.
- Las pruebas de integración y e2e contra el **stack local** leen sus claves en tiempo de ejecución con `supabase status -o env` (`scripts/supabase-test-env.mjs`). Son las claves de desarrollo del contenedor local, no se escriben en ningún fichero y no sirven para el proyecto alojado.
- Si una etapa futura necesitara una clave secreta en el servidor, se decidiría en una ADR y la configuraría el propietario en el gestor de secretos del hosting.

## Build y variables `NEXT_PUBLIC_*`

Next.js incrusta las variables `NEXT_PUBLIC_*` al compilar. Un `npm run build` sin ellas produce una aplicación sin inicio de sesión aunque luego se definan al arrancar; hay que definirlas **antes** del build del entorno correspondiente.
