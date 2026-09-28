# ADR 0002 · Primera estructura visual, mobile-first (D-27)

**Estado:** implementada en el PR #1 para revisión. **La dirección visual queda pendiente de aprobación del propietario** (D-27). **Fecha:** 28/09/2026.
**Fuente:** [D-27 del Core](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/blob/main/docs/DECISIONS.md), «Dirección inicial de experiencia de usuario para la plataforma CORE-9».

## Decisiones

- **Estilo:** «premium» sobrio y B2B, sin inventar marca.
  - No hay logo, paleta oficial ni tipografía de marca: todo se expresa con **tokens** en `src/app/globals.css` (`--color-*`, `--radius`, `--space-*`, `--tap`, `--font-*`).
  - Se usan una paleta pizarra neutra con un solo acento, las fuentes del sistema y un distintivo con la letra «R» como marcador provisional, no como logo.
  - Tema claro u oscuro según el sistema. **Todo esto es una propuesta**, reemplazable en un único sitio cuando exista la marca.
- **Mobile-first:** los estilos base se diseñan para 360 px, y se añaden capas con `min-width` a 640 px (tablas y rejillas) y a 1024 px (barra lateral fija).
  - **Sin scroll horizontal:** `overflow-wrap: break-word` en el cuerpo, y las tablas cambian de disposición en lugar de desplazarse.
- **Tablas:** hasta 640 px, cada fila de `.rtable` es un bloque con pares etiqueta/valor (`data-label`); desde 640 px, es una tabla comparable.
  - Se aplica a los permisos y a los conectores. Se usa el mismo HTML semántico (`<table>`, `<th scope>`, `<caption>`) en ambos casos, así que los lectores de pantalla siguen viendo una tabla.
- **Navegación (arquitectura de D-27):**
  - Espacio de trabajo: Panel, Proyectos, Revisión y aprobaciones, Borradores e informes, Conectores, Equipo y permisos, Configuración.
  - Proyecto: Resumen, Mediciones, Acciones y campañas, Borradores e informes, Aprobaciones, Conectores, Miembros.
  - Lo no construido existe como ruta que dice «No disponible todavía», con la etapa en que se construye y sin datos simulados.
  - En móvil, la navegación es un `<details>` nativo («Menú»), accesible con teclado y sin JavaScript. En escritorio, una barra lateral.
- **Panel:** prioriza proyectos, pendientes de aprobación y actividad, y el estado y la fecha de la última observación.
  - Sin persistencia, cada hueco es un **estado vacío honesto**: «Desconocido · Sin observaciones registradas», «Sin bandeja de aprobaciones todavía», «Sin actividad registrada».
  - No se muestran cifras inventadas; una prueba lo comprueba.
- **Datos de demostración (CORE-9.0):** lo que venía de `src/lib/fixtures/demo.ts` llevaba el distintivo «Demo · ficticio».
  - *CORE-9.1:* los fixtures y el distintivo se eliminaron; los datos salen de la base de datos bajo RLS ([ADR 0003](0003-auth-supabase-y-tenancy.md)).
  - Las cuentas de prueba son ficticias (`@ejemplo.test`) y solo existen en el stack local.
- **Permisos (segunda auditoría del PR #1):** cada fila separa lo que **permite el rol** (la decisión del Core) de si **la función existe ya** en la plataforma (`src/lib/permissions.ts`).
  - Hay tres estados: «Disponible», «Permitido, aún no disponible» (con su etapa y «Hoy no se puede usar») y «No permitido».
  - Los motivos de denegación del Core se explican en lenguaje claro; el código (por ejemplo `ROLE_NOT_ALLOWED`) queda solo como «Código de diagnóstico».
- **Conectores:** nombres y categorías en español (`src/lib/connectors.ts`), con qué aportará cada uno, desarrollo y etapa, coste y autorización necesaria. Todos muestran «No conectado», y la página no pide ni guarda credenciales.
- **Estados vacíos:** cada área no construida indica «Qué necesitará» (información o configuración) y «Cuando esté disponible» (el siguiente paso). No hay botones sin función: la CI lo comprueba.
- **Honestidad de datos:** la vista de proyecto anticipa los cuatro estados de medición (observado, estimado, no verificado y desconocido) y muestra hoy «Desconocido».
- **Accesibilidad:** enlace «Saltar al contenido», un solo `<h1>` por página, landmarks, foco visible, objetivos táctiles de 44 px y contraste comprobado con axe (WCAG 2.1 A/AA).

## Verificación reproducible

`npm run test:e2e` (Playwright con Chromium; en CI, el job `e2e` desde CORE-9.1) recorre las vistas a **360, 390 y 1280 px**: 10 en CORE-9.0 y 13 en CORE-9.1. Para cada una comprueba:

- un solo `<h1>`;
- **sin desbordamiento horizontal** (`scrollWidth ≤ innerWidth`, con una autoprueba que demuestra que el control detecta un elemento de 2000 px);
- sin violaciones axe graves o críticas;
- objetivos táctiles ≥ 44 px en móvil;
- que solo las páginas de formulario (acceso, registro, organizaciones) tengan campos, y ningún control sin acción. En CORE-9.0 se comprobaba también el distintivo de demostración.

Además prueba el menú móvil con teclado, el inicio y cierre de sesión con el formulario, y la ausencia de cifras en el panel. Guarda capturas de página completa.

- **Capturas en el repositorio:** [`docs/visual/`](../visual/). Se regeneran con `npm run visual:evidence`.
- **Capturas de CI:** artefacto `capturas-core-9-1` del job `e2e` (antes `capturas-core-9-0` del job `ui`), generado en Linux, con tipografías distintas a las de Windows.

Las pruebas visuales se ejecutan contra `next dev` conectado al stack local de Supabase, con cuentas ficticias que inician sesión por el formulario real (CORE-9.1). En CORE-9.0 se usaba la demo, que solo existía en desarrollo.

## Pendiente del propietario

Aprobar o corregir la dirección visual: tokens, densidad, jerarquía y textos. Cuando haya marca (logo, paleta, tipografía), sustituir los tokens en un PR propio.
