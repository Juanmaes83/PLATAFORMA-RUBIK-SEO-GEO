# Instrucciones para agentes en PLATAFORMA-RUBIK-SEO-GEO

@AGENTS.md

## Alcance

- Este repositorio es la **aplicación** de la plataforma SEO/GEO (CORE-9). Es el único destino de aplicación designado por el propietario en la decisión D-26 de [RUBIK-SEO-GEO-CORE](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE).
- Los contratos compartidos, la lógica SEO/GEO y las decisiones de producto viven en RUBIK-SEO-GEO-CORE. Aquí **no se copia** código del Core; se consume como dependencia fijada a un commit (ver [ADR 0001](docs/adr/0001-stack-y-dependencia-core.md)).
- Prohibido acceder, clonar, leer o modificar WEB-RESTAURACI-N-PREMIUM-DIN-MICA o cualquier repositorio distinto de este y del Core.
- Antes de trabajar, leer [docs/HANDOFF.md](docs/HANDOFF.md), [docs/ROADMAP.md](docs/ROADMAP.md) y, en el Core, `docs/core-9/EXECUTION-PLAN.md` y `docs/core-9/PLATFORM-SPEC.md`.

## Qué no hacer sin autorización humana expresa y concreta

- Usar secretos o credenciales, conectar Supabase hosted, Google, Bing, IndexNow u otros servicios, o llamar a modelos de IA.
- Tratar datos reales de clientes (incluido SARAHKARENINA.COM, hasta que el propietario lo autorice).
- Desplegar, configurar dominios, generar gastos, publicar o enviar nada a terceros.
- Fusionar PRs, habilitar auto-merge o borrar ramas remotas (el propietario pidió conservarlas).

## Cómo trabajar

- Una rama y un PR por unidad coherente, con base en `main` verificada.
- `npm run verify` debe pasar (pin del Core, guard de secretos, lint, typecheck, tests y build), y la CI debe estar en verde antes de pedir revisión.
- Las decisiones técnicas reversibles se registran en `docs/adr/`. Si un contrato del Core no basta, documentar el caso y proponer el cambio en el repositorio Core por separado; nunca duplicarlo ni cambiarlo aquí en silencio.
- No afirmar que la autenticación, la base de datos o una integración están conectadas si solo hay mocks o configuración local.
- Al terminar un bloque: actualizar `docs/ROADMAP.md` y `docs/HANDOFF.md` con fecha, rama/PR, HEAD, pruebas exactas, CI, bloqueos y el siguiente paso.
