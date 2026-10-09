# PLATAFORMA-RUBIK-SEO-GEO

Aplicación de la plataforma SEO/GEO de Rubik (CORE-9). Consume [RUBIK-SEO-GEO-CORE](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE) como dependencia fijada a un commit; no copia su código. El repositorio de aplicación lo designó el propietario (decisión D-26 del Core).

**Titularidad:** Rubik SEO GEO es propiedad de Juan Manuel Espinosa Galant, DNI 48553293V, y pertenece a Rubik Sota. Quedan prohibidos su uso y comercialización sin permiso y autorización expresa del titular. Todos los derechos sobre los elementos propios quedan reservados; las dependencias conservan sus licencias. Véanse [NOTICE.md](NOTICE.md) y [LICENSE](LICENSE).

> **Estado verificado el 09/10/2026:** plataforma desplegada en Vercel, acceso real con Supabase Auth y primer proyecto Sarah Katerina creado. OpenSEO devuelve `CONNECTED`; la auditoría `02f2f04d-c7ea-4fe9-bb05-be1c39509938` terminó con 10/10 páginas y dos incidencias visibles. El guardado firmado, el historial y la reserva de un trabajo por proyecto están integrados (PR #28/#30), con CI completa contra Supabase local. El propietario aplicó las migraciones alojadas 9.2/9.3/jobs y su CLI confirma cinco versiones sincronizadas en Rubik. Las claves HMAC y el flag de jobs están configurados en producción; redeploy `READY` en `afb5a38`. **El guardado alojado está activado, pero su escritura/recarga todavía no está verificada.** El login CLI del propietario no acredita acceso del conector. Pasos en [docs/OPENSEO-ACTIVATION.md](docs/OPENSEO-ACTIVATION.md); evidencia y límites en [docs/ROADMAP.md](docs/ROADMAP.md) y [docs/HANDOFF.md](docs/HANDOFF.md).

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

El propietario ha autorizado el despliegue, el acceso real y la auditoría técnica de Sarah Katerina. Esta verificación no cierra el piloto completo ni la preparación comercial: quedan persistencia, conectores por cliente, observación y recuperación. OpenSEO mantiene una única configuración de proyecto por servidor. No hay IA operativa, consultas de backlinks/rank tracking ni publicaciones automáticas. Los cambios se entregan con pruebas y documentación para revisión; las decisiones de presupuesto, OAuth y servicios nuevos requieren su configuración específica.
