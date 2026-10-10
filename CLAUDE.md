# Instrucciones para agentes en PLATAFORMA-RUBIK-SEO-GEO

@AGENTS.md

## Alcance

- Este repositorio es la **aplicación** de la plataforma SEO/GEO (CORE-9). Es el único destino de aplicación designado por el propietario en la decisión D-26 de [RUBIK-SEO-GEO-CORE](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE).
- Los contratos compartidos, la lógica SEO/GEO y las decisiones de producto viven en RUBIK-SEO-GEO-CORE. Aquí **no se copia** código del Core; se consume como dependencia fijada a un commit (ver [ADR 0001](docs/adr/0001-stack-y-dependencia-core.md)).
- Prohibido acceder, clonar, leer o modificar WEB-RESTAURACI-N-PREMIUM-DIN-MICA o cualquier repositorio distinto de este y del Core.
- Antes de trabajar, leer [docs/relevos/CONTINUACION-NUEVA-CUENTA.md](docs/relevos/CONTINUACION-NUEVA-CUENTA.md) (relevo vigente y tareas por responsable), [docs/HANDOFF.md](docs/HANDOFF.md), [docs/ROADMAP.md](docs/ROADMAP.md) y, en el Core, `docs/core-9/EXECUTION-PLAN.md` y `docs/core-9/PLATFORM-SPEC.md`.

## Qué no hacer sin autorización humana expresa y concreta

- Usar secretos o credenciales, conectar Supabase hosted, Google, Bing, IndexNow u otros servicios, o llamar a modelos de IA.
- Tratar datos reales de clientes (incluido SARAHKARENINA.COM, hasta que el propietario lo autorice).
- Desplegar, configurar dominios, generar gastos, publicar o enviar nada a terceros.
- Fusionar PRs, habilitar auto-merge o borrar ramas remotas (el propietario pidió conservarlas).

## Cómo trabajar

- Una rama y un PR por unidad coherente, con base en `main` verificada.
- `npm run verify` debe pasar (pin del Core, guard de secretos, lint, typecheck, tests y build), y la CI debe estar en verde antes de pedir revisión.
- Las decisiones técnicas reversibles se registran en `docs/adr/`. Si un contrato del Core no basta, documentar el caso y proponer el cambio en el repositorio Core por separado; nunca duplicarlo ni cambiarlo aquí en silencio.
- El acceso es solo con Supabase Auth ([ADR 0003](docs/adr/0003-auth-supabase-y-tenancy.md)). La demo de CORE-9.0 se eliminó; `AUTH_MODE=mock` sigue prohibido en producción. No relajar las barreras de `src/lib/auth/mode.ts`, `scripts/run-next.mjs` ni `src/instrumentation.ts` (incluido el rechazo de claves secretas en `NEXT_PUBLIC_*`), ni sus pruebas y pasos de CI.
- Supabase:
  - la aplicación solo usa la clave publicable;
  - la autorización nunca usa `user_metadata`;
  - toda tabla en un esquema expuesto llega con RLS, políticas explícitas de mínimo privilegio, `WITH CHECK` en las actualizaciones y privilegios concedidos a mano;
  - cada cambio de esquema es una migración nueva en `supabase/migrations` con pruebas pgTAP, y `src/lib/supabase/database.types.ts` se regenera;
  - las pruebas usan solo el stack local (`npm run db:start`);
  - **nunca** aplicar migraciones al proyecto alojado, ejecutar `db push` ni cambiar su configuración: lo hace el propietario ([SETUP-SUPABASE](docs/SETUP-SUPABASE.md)).
- Cambios visuales: seguir D-27 y la [ADR 0002](docs/adr/0002-ux-mobile-first.md) (mobile-first a 360 px, sin scroll horizontal, estados vacíos honestos, fixtures marcados), ejecutar `npm run test:e2e` y regenerar las capturas con `npm run visual:evidence`.
- No afirmar que la autenticación, la base de datos o una integración están conectadas si solo hay mocks o configuración local.
- Al terminar un bloque: actualizar `docs/ROADMAP.md` y `docs/HANDOFF.md` con fecha, rama/PR, HEAD, pruebas exactas, CI, bloqueos y el siguiente paso.
