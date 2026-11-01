# F1-A.2 — cierre técnico de contratos E2E · 01/11/2026

PR #158 Draft, rama `codex/f1-a2-premium-frontend`. Dirección visual de `1fa73cefc79b6e4f78be62cebec87c0d49b1f095` provisionalmente aceptada por Juanma para continuar. No más rediseños en este bloque. Cambios exclusivamente en tests y esta continuidad; `src`, CSS, Auth, Core, RLS, rutas, permisos, proveedores y migraciones intactos.

## Fallo original y diagnóstico acreditado

CI [41255995965](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/41255995965), SHA `1fa73ce`: Node 22/24 PASS; E2E 189 PASS / 12 FAIL / 66 SKIP. Cuatro contratos repetidos en tres viewports:

1. Competidores y contenidos: `getByRole(link)` excluye enlaces ocultos en `details` cerrado. La UX aprobada los sitúa en Más. Se prueba ahora abrir con Enter, enlace visible, href exacto, `aria-current=page` único, salida a Resumen y regreso real mediante teclado, y cierre del menú. Se conservan a11y, 404 entre tenants y comprobaciones de roles.
2. `/panel`: el fixture de un proyecto tiene un control válido de densidad. Se exige exactamente un input, checkbox accesible Vista compacta, visible/habilitado, y se comprueban ambos estados con Space y la clase de cartera correspondiente. No se habilitan formularios o inputs arbitrarios.
3. Cifras: ambos dígitos residuales son los dos `1` de `1 PROYECTOS AUTORIZADOS · 1 ORGANIZACIÓN`. **No son fecha ni zona horaria ni métricas SEO/GEO.** `PortfolioGrid.tsx:59,84` deriva cantidades de `items.length` y organizaciones distintas de la colección autorizada; `globals.css:263` aplica uppercase, y `innerText` devuelve mayúsculas que no coincidían con la exclusión antigua. El fixture global crea exactamente un proyecto Restaurante de ejemplo en Agencia de ejemplo para el owner.

Evidencia previa a cambiar exclusiones: reproducción del guard original FAIL con `["1","1"]`, extracción de nodos `textContent` y texto visible en `output/playwright/f1-a2-close-numbers-before.log`. Captura de la CI original: artefacto `capturas-core-9-1/f1-dashboard/panel-escritorio-1280.png`, copia local en `output/playwright/f1-a2-close-ci-captures`.

El nuevo guard valida el texto completo del caption contra el fixture, una tarjeta, su organización y href autorizado, y retira **sólo esa instancia DOM acreditada**. No añade regex global de organizaciones, mayúsculas ni encabezados. Mantiene los controles anteriores de cifras. Contraprueba activa: insertar `Visibilidad IA 99% · 1 ORGANIZACIÓN` fuera del caption produce exactamente `["9","9","1"]`; al retirar la sonda, el guard vuelve a pasar. Un KPI inventado y un recuento no acreditado siguen detectándose.

## Verificación local y alcance

- PASS 12/12 regresiones dirigidas, 360/390/1280, sin SKIP: `competidores at every width`, `contenidos at every width`, `04-panel`, `honest empty states` (2.4 min). Incluye escritura/lectura de contenido con roles, revisiones y 404 del flujo existente.
- PASS `npm run verify`: 655 unitarias PASS / 1 SKIP heredado, lint, tipos, build, Core pin y secretos. Diff-check PASS. Ningún cambio de workflow, retry, timeout, skip, seguridad o implementación de producto.
- Diseño: los fuentes y CSS del producto son idénticos a `1fa73ce`; las capturas visuales de ese candidato siguen siendo válidas y no se repite el rediseño.
- Sólo stack local exclusivo `rubik-f1-a2-20261101` (65421/65422), sin reset. Writer técnico local temporal según el procedimiento CI existente para ejercitar las escrituras auditadas; no cambia políticas ni permisos. Se restaura NOLOGIN y contraseña nula al terminar. Fixtures E2E: siete usuarios y dos organizaciones propios retirados sin restos. Cuatro demos originales conservadas; nada alojado ni de otros agentes.

## Publicación y resultado remoto

El SHA final, la Preview protegida exacta y el resultado **completo** de CI se registran como checkpoint de entrega en la descripción de [PR #158](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/158). Esta página acredita la validación local; no afirma CI verde anticipadamente. No se relanza manualmente una ejecución anterior ni se altera su resultado. No merge. La aceptación visual sigue siendo provisional y los gates generales H1-A/R1 mantienen su alcance propio.
