# F1-A.2 — refinamiento de lectura y exploración · 01/11/2026

Candidato visual, pendiente de Juanma. Misma PR Draft #158 y rama `codex/f1-a2-premium-frontend`, contra la rama de Kimi; sin merge. ANTES: `01ca72f08b0dcb7f1dcc5904f64408f618c7577a`. Checkpoint de implementación: `a01e1ff9fb6124ee4553251f32a0264b52ff1265`. SHA publicado/Preview/CI del cierre en la PR.

## Cinco mejoras visibles

| Objetivo | Cambio y utilidad |
|---|---|
| Primera impresión | Diagnóstico técnico disponible en disclosure del pie cuando el acceso funciona. Bloqueos de acceso conservan aviso visible. No cambia autenticación ni sus decisiones |
| Primer vistazo móvil | Contexto compacto, nombre de proyecto una sola vez como título visible, tabs breves con nombres accesibles completos. Acción principal a y=568–612 en 390×844 |
| Legibilidad | Texto analítico 14–16 px, metadatos 12–13 px, controles 44 px, estados de cartera escritos además de su símbolo/color |
| Jerarquía | Situación → fuentes compactas → diagnóstico → próximos pasos. Información de procedencia y límites bajo demanda; módulos y navegación conservados |
| Comprensión visual | Barras de gravedad seleccionables y matriz de seis fuentes con estado explícito. Filtrar lleva a hallazgos concretos, fuente, URL y documento original |

## Fuentes y límites

- Barras: cantidades de hallazgos abiertos de hasta tres importaciones ya leídas, sin deduplicación semántica. Longitud respecto al máximo de categoría; no porcentaje del sitio, score ni urgencia comercial. Orden de lista por gravedad declarada.
- Explorador cliente: máximo seis entradas por categoría (30), seis visibles por filtro. Los totales pueden superar lo mostrado y se indica el límite. Cero consultas adicionales al filtrar; no se envía la importación completa a cliente.
- Matriz: seis estados de `readProjectOverview` existentes, con símbolo, texto, contexto de fuente y fecha cuando consta. No disponible no equivale a ausencia de datos. Los flags N2 y RLS siguen decidiendo disponibilidad y acceso.
- Cartera: colección autorizada existente, sin agregados nuevos entre organizaciones. Mostrar etiquetas de estado no amplía permisos.
- No series comparables disponibles: no curvas, Geo-Grid, puntuaciones universales, causas deducidas ni nuevas oportunidades inventadas. Propuestas de importaciones se etiquetan como declaradas.

## Verificación dirigida

- PASS `npm run verify`: 655 unitarias PASS / 1 SKIP heredado, lint, tipos, pin/secretos y build. Dos tests nuevos separan diagnóstico rutinario plegable de aviso bloqueante visible. Los tres tests de límites/procedencia/flags se conservan; ajuste singular/plural del titular.
- PASS 15/15 E2E dashboard existente, sin modificarlo: permisos/aislamiento, módulos, migas/Atrás, responsive y táctil. Teardown: siete usuarios y dos organizaciones propios retirados, sin restos.
- PASS cinco filtros por teclado, selección accesible, recuentos 1/2/3/1/1, cero peticiones de red al filtrar. PASS fuentes/evidencia/diagnóstico desplegables, ancla visible bajo header, documento real y Atrás. Script `scripts/f1-a2-interactions.mjs`.
- PASS visual 390/1280/1600 (poblado, vacío, cartera) y roles con 2/1 proyectos. PASS adicional 360/768 claro/oscuro, foco, menú y reduced-motion; sin infracciones axe WCAG2/2.1/2.2 AA en las escenas dirigidas. No certificación completa.
- PASS cartera 1/4/50: compacta automática, búsqueda y navegación; sin overflow 390/1600. Carga local con login: 3.42 s para 50 y 0.57 s para 1; no benchmark de Production ni mejora backend acreditada.

Las capturas anteriores válidas se conservaron sin repetir baseline. Evidencia comparativa actual: `output/playwright/f1-a2-refinement/{before/01ca72f,after,extended,interactions,review}`. Los scripts visual/responsive admiten `RUBIK_VISUAL_OUT` para preservar entregas anteriores. En una primera comprobación del ancla se leyó su posición antes del scroll asíncrono; al esperar la posición visible, PASS. Sin ocultar defectos ni debilitar tests.

Fixtures sólo en stack exclusivo verificado `rubik-f1-a2-20261101` (65421/65422). Se repitió volumen porque cambió el contenido de las tarjetas; 46 proyectos propios retirados por IDs/nombres/dominios controlados, cuatro demos originales conservadas. Sin Sarah, datos reales ni escrituras alojadas. Auth, RLS, Core, esquemas, migraciones, proveedores, worktrees ajenos y protección Vercel intactos.

Valoración: mejora de comprensión y legibilidad demostrable; no aceptación visual. La lista sigue requiriendo scroll con seis hallazgos y la cartera de 50 no incorpora virtualización. Ausencia de series comparables limita el análisis temporal. Recorrido privado alojado NOT_RUN; revisión de Juanma pendiente. Preview READY no sustituye CI ni aceptación.
