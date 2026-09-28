# PLATAFORMA-RUBIK-SEO-GEO

Aplicación de la plataforma SEO/GEO de Rubik (CORE-9). Consume [RUBIK-SEO-GEO-CORE](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE) como dependencia fijada a un commit; no copia su código. El repositorio de aplicación lo designó el propietario (decisión D-26 del Core).

> **Estado: CORE-9.0, base local.** Autenticación solo de demostración (únicamente en desarrollo), con usuarios ficticios. Diseño mobile-first según D-27, pendiente de aprobación visual. Sin base de datos, sin servicios conectados, sin IA, sin datos reales y sin despliegue. Detalle en [docs/ROADMAP.md](docs/ROADMAP.md) y [docs/HANDOFF.md](docs/HANDOFF.md).

## Requisitos

- Node.js ≥ 22.12 (`.nvmrc` = 22; la CI prueba 22 y 24) y npm.
- Acceso de lectura a GitHub por HTTPS: el Core se instala desde su repositorio público.

## Instalación y uso

```bash
npm ci
cp .env.example .env.local   # opcional: solo nombres
npm run dev                  # http://localhost:3000 (la demo solo existe en desarrollo)
```

- **Recorrido de demostración:**
  1. Abrir `/acceso` y elegir un usuario ficticio (titular, analista, cliente o lectura).
  2. Ver el `/panel` y `/proyectos`, y entrar en un proyecto para ver los permisos que decide el Core.
  3. `/api/salud` muestra el estado técnico.
  4. Las capturas a 360, 390 y 1280 px están en [docs/visual](docs/visual/README.md).
- **Producción local:**
  - `npm run build && npm start`;
  - en producción **no hay inicio de sesión**: `AUTH_MODE=mock` está prohibido, y `build`, `start` y el propio servidor se niegan a arrancar con él;
  - si el puerto 3000 está ocupado: `npm start -- -p <puerto>`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run verify` | Todo lo que valida la CI: pin del Core, guard de secretos, lint, typecheck, tests y build |
| `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` | Cada paso por separado |
| `npm run check:core-pin` | Comprueba que el Core está fijado a un SHA completo y que el lockfile coincide |
| `npm run check:secrets` | Busca credenciales o ficheros `.env` commiteados |
| `npm run test:e2e` | Playwright a 360, 390 y 1280 px: sin desbordamiento horizontal, axe, objetivos táctiles y capturas (requiere `npx playwright install chromium` una vez) |
| `npm run visual:evidence` | Igual que `test:e2e`, y además regenera las capturas de `docs/visual/` |

`scripts/run-next.mjs` ejecuta Next.js con la telemetría desactivada.

## Documentación

- [ADR 0001 · Stack y dependencia del Core](docs/adr/0001-stack-y-dependencia-core.md), incluida la forma de actualizar el commit del Core.
- [ADR 0002 · Estructura visual mobile-first (D-27)](docs/adr/0002-ux-mobile-first.md) · [Evidencia visual](docs/visual/README.md)
- [Arquitectura](docs/ARCHITECTURE.md) · [Variables de entorno](docs/ENVIRONMENT.md) · [Supabase: pasos del propietario](docs/SETUP-SUPABASE.md) · [Hosting y términos](docs/HOSTING.md)
- [Roadmap](docs/ROADMAP.md) · [Handoff](docs/HANDOFF.md) · Instrucciones para agentes: [CLAUDE.md](CLAUDE.md)

## Límites

No se usan secretos, cuentas reales, proveedores ni modelos, no se despliega y no se fusiona sin revisión del propietario. SARAHKARENINA.COM será el primer piloto solo cuando el propietario lo autorice.
