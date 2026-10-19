# Corrección de claves API para el preflight U03

Fecha: 2026-10-18. PR #129, rama `codex/u02-preview-isolation-20261017`.

## Diagnóstico

El ledger `9cf87776-1149-45e2-82dc-28f11a8c6e4e` registró HTTP 401 para Auth Admin y las cuatro lecturas REST; `auth-registration-closed` respondió 200. La causa fue enviar la clave nueva `sb_secret_` también como `Authorization: Bearer`, aunque las claves API nuevas no son JWT y deben ir en `apikey` según la [documentación oficial de claves](https://supabase.com/docs/guides/getting-started/api-keys#known-limitations).

## Cambio

- Auth Admin usa `@supabase/supabase-js` mediante `createPreviewAdminClient`. El wrapper de transporte garantiza `apikey` y retira únicamente `Authorization: Bearer <misma sb_secret_>`. No modifica tokens de sesión ni el comportamiento de claves JWT antiguas.
- Las lecturas REST del preflight generan cabeceras mediante `apiKeyHeaders`: claves `sb_secret_` solo llevan `apikey`; claves heredadas conservan `apikey` y Bearer.
- El arnés Data API reutiliza el cliente Admin seguro para operaciones Auth. No se ejecutó.
- Pruebas fijan ambas rutas nuevas y la compatibilidad heredada. Ninguna credencial real se usó o imprimió.

## Validación y límites

Pruebas dirigidas: **9 PASS, 0 SKIP, 0 FAIL** (`node --test scripts/u03-preview-api-key.test.mjs scripts/u03-preview-queries.test.mjs scripts/u03-preview-inventory-check.test.mjs`). `git diff --check` y el escáner de secretos pasan. `npm run verify` en el código de `cf2f1b17533dd1af7ce8f42ff2925961f7497818`: **607 PASS, 1 SKIP, 0 FAIL**; lint, typecheck y build PASS. La CI de GitHub sigue sin jobs por facturación. No se llamó a Supabase alojado, no se ejecutó la matriz, no se crearon fixtures y no hubo cambios en RLS, grants, configuración o datos. Playwright sigue pendiente: el bypass de Vercel está vacío.
