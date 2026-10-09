# PLATAFORMA-RUBIK-SEO-GEO

Aplicación de la plataforma SEO/GEO de Rubik (CORE-9). Consume [RUBIK-SEO-GEO-CORE](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE) como dependencia fijada a un commit; no copia su código. El repositorio de aplicación lo designó el propietario (decisión D-26 del Core).

**Titularidad:** Rubik SEO GEO es propiedad de Juan Manuel Espinosa Galant, DNI 48553293V, y pertenece a Rubik Sota. Quedan prohibidos su uso y comercialización sin permiso y autorización expresa del titular. Todos los derechos sobre los elementos propios quedan reservados; las dependencias conservan sus licencias. Véanse [NOTICE.md](NOTICE.md) y [LICENSE](LICENSE).

> **Estado vigente (09/10/2026):** plataforma en Vercel con Supabase Auth real y Sarah Katerina como primer proyecto. Las nueve migraciones del primer paquete están aplicadas; migraciones posteriores de presupuesto/consumo siguen pendientes de aplicación alojada. OpenSEO sigue en modo global `legacy`: el guardado firmado de la auditoría `d1899523-807d-4f02-8f1f-2bce653a43f8` está comprobado por Juanma en la interfaz y por SQL de solo lectura, sin duplicados (véase [HANDOFF](docs/HANDOFF.md)). El código de conexión por proyecto, reconciliación y propiedades de Search Console/Bing está integrado, pero **no hay conexión de Sarah ni modo `project` activo**. OpenSEO muestra GSC y GA4 conectadas; Rubik no ha verificado aún una lectura Google real ni el aislamiento alojado con dos cuentas. [ROADMAP](docs/ROADMAP.md) separa piloto, primera versión multicliente y capacidades posteriores; [OPERATIONS-STATUS](docs/OPERATIONS-STATUS.md) conserva la evidencia operativa.

La web nueva o antigua de Sarah, Studio, su contenido y consentimiento web, DNS, lanzamiento e indexación pertenecen a otro frente: **no son entregables pendientes ni terminados de Rubik**. Sarah sigue siendo el primer piloto de esta plataforma. Rubik conserva sus capacidades genéricas de análisis, medición, históricos, seguimiento y propuestas para cualquier proyecto.

La asociación GSC/GA4 por proyecto y conexión OpenSEO está integrada en código (#60), pero su migración no se ha aplicado en alojado ni se ha asociado una propiedad real de Sarah. La siguiente lectura manual acotada solo se ha probado con proveedor simulado; Rubik todavía no consulta, guarda ni recupera informes Google reales. El rastreo de producción continúa en `legacy`.

**Cierre de tanda:** #45, #46 y #47 están integradas; #45 conserva en el formulario el límite de páginas elegido. La carga en producción y el aspecto del panel se comprobaron en móvil y escritorio, pero la validación humana de este panel y del comportamiento del límite tras una acción real sigue pendiente. ADR 0010/#40 y el aislamiento de Preview esperan decisión de Juanma. El SHA, la CI exacta y el relevo están en [HANDOFF](docs/HANDOFF.md).

## Requisitos

- Node.js ≥ 22.12 (`.nvmrc` = 22; la CI prueba 22 y 24) y npm.
- Acceso de lectura a GitHub por HTTPS: el Core se instala desde su repositorio público.
- Para iniciar sesión y para las pruebas de base de datos, integración y e2e: Docker, que ejecuta el stack local de Supabase con la CLI fijada en `supabase@2.118.0`.

## Instalación y uso

```bash
npm ci
npm run db:start                     # stack local de Supabase; aplica supabase/migrations
npx supabase@2.118.0 status -o env   # copia API_URL y PUBLISHABLE_KEY a .env.local (ver .env.example)
npm run dev                          # http://localhost:3000
```

- **Recorrido:**
  1. En `/registro`, crear una cuenta. El correo de confirmación llega al Mailpit local (`http://127.0.0.1:54324`).
  2. En `/organizaciones`, crear una organización y un proyecto.
  3. En `/panel` y `/proyectos`, entrar en el proyecto para ver los permisos que decide el Core con tu rol.
  4. `/api/salud` muestra el estado técnico.
  5. Las capturas a 360, 390 y 1280 px están en [docs/visual](docs/visual/README.md).
- **Sin variables de Supabase** la aplicación arranca, pero no hay inicio de sesión y las páginas protegidas redirigen a `/acceso`.
- **Producción local:**
  - `npm run build && npm start`. Las variables `NEXT_PUBLIC_*` se fijan al compilar.
  - `AUTH_MODE=mock` sigue prohibido, y una clave secreta en `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` impide compilar y arrancar.
  - Si el puerto 3000 está ocupado: `npm start -- -p <puerto>`.
- **Proyecto Supabase alojado:** lo configura el propietario, con los pasos de [SETUP-SUPABASE](docs/SETUP-SUPABASE.md).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run verify` | Todo lo que valida la CI: pin del Core, guard de secretos, lint, typecheck, tests y build |
| `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` | Cada paso por separado |
| `npm run check:core-pin` | Comprueba que el Core está fijado a un SHA completo y que el lockfile coincide |
| `npm run check:secrets` | Busca credenciales o ficheros `.env` commiteados |
| `npm run db:start` · `npm run db:stop` · `npm run db:reset` | Arranca, para o reinicia el stack local de Supabase (Docker) con las migraciones del repositorio |
| `npm run test:db` | Pruebas pgTAP de RLS y aislamiento (`supabase/tests`) contra el stack local |
| `npm run test:integration` | Auth y aislamiento por la Data API contra el stack local |
| `npm run test:e2e` | Playwright contra el stack local, a 360, 390 y 1280 px: flujos de Auth y aislamiento, sin desbordamiento horizontal, axe, objetivos táctiles y capturas (requiere `npx playwright install chromium` una vez) |
| `npm run visual:evidence` | Igual que `test:e2e`, y además regenera las capturas de `docs/visual/` |

`scripts/run-next.mjs` ejecuta Next.js con la telemetría desactivada.

## Documentación

- [ADR 0001 · Stack y dependencia del Core](docs/adr/0001-stack-y-dependencia-core.md), incluida la forma de actualizar el commit del Core.
- [ADR 0002 · Estructura visual mobile-first (D-27)](docs/adr/0002-ux-mobile-first.md) · [Evidencia visual](docs/visual/README.md)
- [ADR 0003 · Supabase Auth, organizaciones y aislamiento](docs/adr/0003-auth-supabase-y-tenancy.md)
- [Arquitectura](docs/ARCHITECTURE.md) · [Variables de entorno](docs/ENVIRONMENT.md) · [Supabase: estado, pruebas locales y pasos del propietario](docs/SETUP-SUPABASE.md) · [Hosting y términos](docs/HOSTING.md)
- [Roadmap](docs/ROADMAP.md) · [Handoff](docs/HANDOFF.md) · Instrucciones para agentes: [CLAUDE.md](CLAUDE.md)

## Límites

El propietario autorizó la auditoría técnica ya guardada de Sarah Katerina. Esa verificación no cierra el piloto completo ni la preparación comercial: faltan conexión por proyecto, aislamiento alojado, credenciales por cliente, presupuestos, observación y recuperación. OpenSEO conserva la configuración global mientras siga en `legacy`. No hay IA operativa, consultas de backlinks/rank tracking ni publicaciones automáticas. Los cambios se entregan con pruebas y documentación para revisión; las decisiones de presupuesto, OAuth y servicios nuevos requieren autorización específica.
