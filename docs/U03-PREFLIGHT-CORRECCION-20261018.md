# Corrección U03: columnas reales del preflight

Fecha: 2026-10-18. PR: #129. Preview: `rhnnplewqsekrnaousyl`.

El ledger `c27b65e2-5b23-4e50-bb27-f3cd4cc03981` registró HTTP 400 porque el preflight pedía `select=id` en `project_members` y `audit_events`. El esquema N1 usa claves compuestas `(project_id,user_id)` y `(project_id,seq)`, respectivamente, y no tiene columna `id`.

`scripts/u03-preview-preflight.mjs` ahora obtiene las columnas desde `scripts/u03-preview-queries.mjs`: `id` para `organizations`/`projects` y `project_id` para `project_members`/`audit_events`. `scripts/u03-preview-queries.test.mjs` impide regresar a una columna inexistente y rechaza tablas fuera de la allowlist.

Resultado local: `node --test scripts/u03-preview-queries.test.mjs scripts/u03-preview-inventory-check.test.mjs` = **5 PASS, 0 SKIP, 0 FAIL**; `git diff --check` = PASS. No se hicieron escrituras alojadas ni se crearon fixtures. `protected-preview-identity` y Playwright siguen **BLOCKED** porque el bypass protegido está vacío; no se solicitaron ni publicaron claves.
