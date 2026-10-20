# U03 S-5 · emisor ajeno aislado

Estado: **PASS bajo la sustitución de alcance aceptada por Juanma**. Esta prueba no envió un JWT de Production y no equivale a ese caso literal.

## Identidad del run

- `runId`: `87fff99a-3176-45b7-9308-07985dd1d5e8`
- Script/operador ejecutado: PR #143 en `04bf773a2c1fbc8e6be6c7418abd720d2d9a11a4`.
- Destino web fijado: deployment #141 `dpl_Hmpevn3Vds4pFUzbiiFFB3vVGCKD`, SHA funcional `28fd3927f9acce8ba9b27b43d3afb86b12aa0a86`, host `plataforma-rubik-seo-3elivlu19-juanma-espinosas-projects.vercel.app`.
- Proyecto Supabase destino: Preview `rhnnplewqsekrnaousyl`.
- Emisor aislado: `http://127.0.0.1:55421/auth/v1`; token obtenido por Auth real del stack ficticio. El ledger guardó únicamente `iss` y `exp`, nunca el bearer.

## Pasos y resultados del ledger original

| Hora UTC | Caso | Resultado | Evidencia segura |
|---|---|---|---|
| 08:48:57.444 | `foreign-issuer-user` | CREATED | UUID ficticio `0eb4b01c-fe36-4ef0-a2e3-abec7f5dcf36`; namespace `u03-s5-<runId>` |
| 08:48:57.524 | `foreign-issuer-token` | PASS | issuer loopback de test; `exp=1792489737`, futuro al emitir |
| 08:48:57.732 | `s5-foreign-issuer-data-api` | PASS | HTTP 401 en Preview; no se devolvió array de proyectos |
| 08:49:01.424 | `s5-foreign-issuer-protected-route` | PASS | solicitud protegida a `/panel`; HTTP 200 final en `/acceso` |
| 08:49:01.511 | `foreign-issuer-cleanup` | PASS | mismo UUID ficticio eliminado por Admin Auth local |
| 08:49:01.512 | `s5-foreign-issuer` | PASS | etiqueta `emisor ajeno aislado` |
| 08:49:05.606 | `s5-foreign-issuer-stack-cleanup` | PASS | Supabase local detenido; contenedor y directorio temporal ausentes |

La verificación read-only de identidad de Preview pasó antes de crear el emisor; el run no escribió fixtures en Preview. Las tres preparaciones bloqueadas anteriores no crearon usuario: dos ledger conservan solo cleanup PASS; la tercera registra `LOCAL_ISSUER_INIT_PROCESS_FAILED` y cleanup PASS.

## Causa y corrección del operador

Windows PowerShell 5.1 elevaba el aviso de actualización emitido por `npx`/Supabase CLI en stderr a `RemoteException` con `$ErrorActionPreference = 'Stop'`. `supabase init` había creado la configuración y terminado con exit code 0; el wrapper interpretaba el stderr como fallo de la campaña. El operador ahora ejecuta procesos nativos en un ámbito que captura stdout/stderr solo en memoria, no los imprime ni persiste, y determina el éxito por exit code. La reproducción local con un directorio temporal y `ErrorActionPreference=Stop` pasó con la corrección.

Los JSONL completos permanecen en `test-results/u03-hosted/` local; no se reescribieron ni se añadieron al repo. No contienen contraseña, JWT, cookie, URL con credenciales, email ni cabeceras.
