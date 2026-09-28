# Evidencia visual (CORE-9.1, D-27)

- **Cómo se generan:** capturas de página completa con `npm run visual:evidence`: Playwright con Chromium contra `next dev`, conectado al **stack local de Supabase**, en tema claro.
- **Datos:** las cuentas, organizaciones y proyectos son **ficticios** (`@ejemplo.test`). Los crea `e2e/global-setup.ts` en la base de datos local a través de RLS.
- **Entornos:** las de este repositorio se generaron en Windows con las fuentes del sistema. La CI genera las suyas en Linux (artefacto `capturas-core-9-1` del job `e2e`).
- **Criterios y pruebas:** en la [ADR 0002](../adr/0002-ux-mobile-first.md).

| Vista | 360 px | 390 px | 1280 px |
|---|---|---|---|
| Inicio | [360](movil-360/01-inicio.png) | [390](movil-390/01-inicio.png) | [1280](escritorio-1280/01-inicio.png) |
| Acceso (correo y contraseña) | [360](movil-360/02-acceso.png) | [390](movil-390/02-acceso.png) | [1280](escritorio-1280/02-acceso.png) |
| Registro | [360](movil-360/03-registro.png) | [390](movil-390/03-registro.png) | [1280](escritorio-1280/03-registro.png) |
| Panel (titular) | [360](movil-360/04-panel.png) | [390](movil-390/04-panel.png) | [1280](escritorio-1280/04-panel.png) |
| Proyectos | [360](movil-360/05-proyectos.png) | [390](movil-390/05-proyectos.png) | [1280](escritorio-1280/05-proyectos.png) |
| Organizaciones (titular) | [360](movil-360/06-organizaciones.png) | [390](movil-390/06-organizaciones.png) | [1280](escritorio-1280/06-organizaciones.png) |
| Proyecto (analista) | [360](movil-360/07-proyecto-analista.png) | [390](movil-390/07-proyecto-analista.png) | [1280](escritorio-1280/07-proyecto-analista.png) |
| Proyecto (cliente) | [360](movil-360/08-proyecto-cliente.png) | [390](movil-390/08-proyecto-cliente.png) | [1280](escritorio-1280/08-proyecto-cliente.png) |
| Sección no disponible | [360](movil-360/09-seccion-no-disponible.png) | [390](movil-390/09-seccion-no-disponible.png) | [1280](escritorio-1280/09-seccion-no-disponible.png) |
| Revisión (no disponible) | [360](movil-360/10-revision-no-disponible.png) | [390](movil-390/10-revision-no-disponible.png) | [1280](escritorio-1280/10-revision-no-disponible.png) |
| Conectores | [360](movil-360/11-conectores.png) | [390](movil-390/11-conectores.png) | [1280](escritorio-1280/11-conectores.png) |
| Proyecto de otro tenant (404) | [360](movil-360/12-otro-tenant-404.png) | [390](movil-390/12-otro-tenant-404.png) | [1280](escritorio-1280/12-otro-tenant-404.png) |
| Panel de una cuenta sin proyectos | [360](movil-360/13-panel-sin-proyectos.png) | [390](movil-390/13-panel-sin-proyectos.png) | [1280](escritorio-1280/13-panel-sin-proyectos.png) |
| Menú móvil abierto | [360](movil-360/14-menu-movil-abierto.png) | [390](movil-390/14-menu-movil-abierto.png) | — (barra lateral) |
