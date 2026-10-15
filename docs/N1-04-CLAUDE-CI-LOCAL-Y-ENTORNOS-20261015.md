# N1-04 · CI local reproducible y seguridad de entornos (avance de Claude Code)

**Rama:** `claude/n1-04-ci-entornos-20261015`, desde `main@520e4119bafe8a9ce4b2293faad2e54b8e6d81d8` (verificado contra `origin` el 15/10/2026).
**Trabajo paralelo:** Codex desarrolla N1-03/S1 en [#104](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/104). Esta rama no toca ninguno de sus 50 archivos.
**Estado del bloque:** N1-04 **EN EJECUCIÓN**. Implementado y probado **localmente**: procedimiento equivalente a CI, diagnósticos y pruebas fail-closed de Preview. **No** hay GitHub Actions en verde ni entorno Preview aislado: ambos dependen de U02.

## 1. Auditoría de GitHub Actions (`.github/workflows/ci.yml`)

| # | Área | Observado | Valoración / acción |
|---|---|---|---|
| A1 | Arranque de jobs | Runs de #100 y #104: jobs con `steps: []`, anotación de bloqueo de cuenta por facturación | **Bloqueante, no técnico.** No se toca `runs-on` ni se activan runners propios o servicios de pago. Ruta: U02-a |
| A2 | Permisos y disparadores | `permissions: contents: read`, `push`(main) + `pull_request`, sin `pull_request_target`, sin `secrets.*`, sin despliegue | Correcto. Fijado ahora por `tests/ci-local-workflow.test.ts` |
| A3 | Node | `verify` matriz 22/24; `e2e` 22; `.nvmrc` 22; `engines >=22.12.0` | Coherente. En este contenedor solo hay Node 22: la pata 24 **no** se reproduce localmente (se declara en la evidencia) |
| A4 | Instalación y pin del Core | `npm ci` con lockfile v3; Core por Git en commit completo; `check:core-pin` exige el mismo commit en `package.json` y lockfile | Correcto. El lockfile resuelve `git+ssh://…#<sha>` y npm omite la integridad en dependencias Git: la garantía es el SHA (contenido direccionado) |
| A5 | Lint, tipos, unitarias, build | Pasos separados en `verify` | Correcto |
| A6 | Barreras de configuración | Smoke de producción sin Supabase; rechazo de `AUTH_MODE=mock` y de clave secreta en `NEXT_PUBLIC_*` | Correcto. **Añadido** smoke HTTP de Preview (ver §4) |
| A7 | Supabase local, migraciones, pgTAP | CLI fijado `2.118.0`; `start -x …`; `test db`; estado Studio abierto debe fallar y la migración lo corrige (idempotente) | Correcto. El preflight comprueba que el CLI esté fijado igual en `ci.yml`, `package.json` y `supabase-test-env.mjs` |
| A8 | Tipos generados | `gen types --local` comparado con `database.types.ts` | Correcto |
| A9 | Integración y Playwright | Data API con JWT ficticios; E2E 360/390/1280 con `next dev` | Correcto. 44 SKIP por diseño (deduplicación por viewport): **no cuentan como PASS** y CI no los separa |
| A10 | Limpieza | `stop --no-backup` con `if: always()` | Correcto en un runner efímero. En local es destructivo: el runner solo lo permite sobre un stack propio |
| A11 | Procesos en segundo plano | `npm start &` del smoke de producción nunca se detiene; en «Production build connected», `kill $server` mata `npm` pero no `next-server` | Inocuo en GitHub (VM efímera). **Riesgo real en local**: en el primer control negativo de esta sesión, un `next-server` superviviente respondió en el puerto y dio un falso PASS. El paso nuevo usa `set -m`, `trap` y comprobación de puerto libre; se recomienda lo mismo para los pasos existentes en una PR posterior |
| A12 | Evidencias | Solo capturas (`test-results/visual`, 14 días); sin informes JUnit/JSON | Mejora recomendada (requiere tocar `playwright.config.ts`/`package.json`, ahora en manos de #104) |
| A13 | Suministro | Acciones fijadas por etiqueta (`@v4`), no por SHA; imágenes Supabase implícitas en la versión del CLI | Riesgo bajo (token de solo lectura, sin secretos). Recomendado fijar por SHA cuando Actions vuelva a ejecutarse y pueda validarse |
| A14 | Dependencias externas | npm, GitHub (Core), CLI Supabase e imágenes Docker, Chromium de Playwright | Documentadas. En este contenedor el CDN de `public.ecr.aws` está bloqueado: imágenes desde Docker Hub (mismas etiquetas) con `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`, declarado en la evidencia |
| A15 | Tiempo máximo | Jobs sin `timeout-minutes` (por defecto 360 min) | Mejora menor recomendada |

## 2. Procedimiento local equivalente a CI

Código en `scripts/ci-local/` (archivos nuevos; no modifica scripts S1 ni `package.json`):

| Archivo | Función |
|---|---|
| `workflow.mjs` | Lector **estricto** de `ci.yml`: falla ante claves, condiciones, `env` de paso o acciones que no sepa reproducir, para que ningún paso nuevo de CI se omita en silencio |
| `checks.mjs` | Diagnósticos puros (sin efectos), uno por categoría del mandato |
| `facts.mjs` | Recogida de hechos de solo lectura (git, `docker ps`, `supabase status`, archivos). Nunca imprime valores de variables |
| `preflight.mjs` | Informe; `--json`; `--evidence <ruta>` verifica una evidencia contra HEAD |
| `run.mjs` | Ejecuta **los mismos bloques `run:`** de `ci.yml` con `bash --noprofile --norc -eo pipefail`, el `env` del workflow, `CI=true` y un entorno de **lista blanca** (no pasan `GH_TOKEN`, `GITHUB_TOKEN`, claves cloud ni variables Supabase del desarrollador) |

### Uso

```bash
node scripts/ci-local/preflight.mjs                 # diagnóstico, solo lectura
node scripts/ci-local/run.mjs --plan                # plan y guardas, no ejecuta
node scripts/ci-local/run.mjs --job verify          # sin Docker
node scripts/ci-local/run.mjs                       # verify + e2e con stack local propio
node scripts/ci-local/preflight.mjs --evidence test-results/ci-local/<sha12>-<fecha>/evidence.json
```

Opciones: `--keep-stack`, `--skip-step "<nombre>=<motivo>"` (el paso queda NO EJECUTADO y el veredicto nunca es PASS), `--allow-dirty` (veredicto UNBOUND), `--pass-env NOMBRE`.

### Diagnósticos (mandato §2)

| # | Categoría | Detección | Efecto |
|---|---|---|---|
| 1 | Dependencias ausentes | git, npm, curl, Docker cliente/daemon, `node_modules` desfasado del lockfile | Error/aviso |
| 2 | Versiones | Node fuera de matriz o de `engines`, patas no reproducidas, pins distintos del CLI Supabase, Chromium de Playwright distinto | Error/aviso |
| 3 | Supabase alojado accidental | Variables de destino (`NEXT_PUBLIC_SUPABASE_URL`, `DB_URL`, `*_DATABASE_URL`, `PGHOST`…) no locales; credenciales alojadas (`SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`…); `VERCEL_ENV`; archivos `.env*` que Next.js cargaría; CLI vinculado (`supabase/.temp/project-ref`); `.vercel/` | Error (los mensajes nombran variables, nunca valores) |
| 4 | API y DB incoherentes | `supabase status` vs puertos de `config.toml`; contenedor `supabase_db_<project_id>` publicando otro puerto; nombre de contenedor en `ci.yml` vs `project_id` | Error |
| 5 | Contenedores de otro worktree | Propiedad por *ledger* (`test-results/ci-local/stack-owner.json`): un stack es propio solo si todos sus contenedores los creó este worktree; otros proyectos se preservan; choque de puertos; puertos del workflow ocupados | Error, nunca limpia nada ajeno |
| 6 | Configuración incompleta | `config.toml`, `env` del workflow, `npm run X` inexistentes, ficheros SQL referenciados, migraciones/pgTAP vacíos, permisos no de solo lectura | Error |
| 7 | Pruebas omitidas | `.only` (error), `.skip/.todo/.fixme/.skipIf` (aviso), deduplicación por viewport (info), SKIP/flaky en ejecución, paso de pruebas sin resumen | Nunca cuentan como PASS |
| 8 | Build y tipado | Código de salida, errores `TS`, «Failed to compile» | Error |
| 9 | Evidencia y SHA | SHA completo, árbol limpio, hash de `ci.yml` y lockfile, tipo `local-ci-equivalent`, veredicto coherente | Error si no coincide |
| 10 | Operaciones destructivas | Prohibidas siempre: `db push`, `link`, `--linked`, `--project-ref`, `--db-url`, Vercel `env/deploy/link…`, `gh secret…`, `secrets.*`. Solo con stack propio: `start` (si no existe), `stop`, `db reset`, `docker exec`, `DROP`, fixtures | Paso bloqueado |

## 3. Resultados de la CI local

Todas las ejecuciones: contenedor efímero de Claude Code en la nube, Linux x64, Docker 29.8.2, stack Supabase **propio** `plataforma-rubik-seo-geo` en 127.0.0.1:54321/54322 (ningún otro contenedor existía al empezar; 0 contenedores al terminar). Evidencias en `test-results/ci-local/<sha12>-<fecha>/` (ignorado por Git; no se publica).

| Ejecución | SHA | Node | Resultado | Detalle |
|---|---|---|---|---|
| Línea base `verify` manual | `520e411` (`main`) | 22.22.0 | PASS | core-pin, secrets, lint, typecheck, 403/403 unitarias, build |
| Run 1 | `927b9a0` | 22.22.0 | **BLOQUEADO por el preflight** | Falso positivo `.only` dentro de una cadena; no se ejecutó nada. Corregido en `ba6bec2` |
| Run 2 | `ba6bec2` | 22.22.0 | PARTIAL (todos los pasos ejecutados PASS) | 461/461 unitarias; smokes de producción y Preview; configuraciones prohibidas; pgTAP 581/581 (20 archivos); estado Studio FAIL→PASS esperado; tipos sin diferencias; integración 84/84; build conectado; Playwright **145 PASS / 44 SKIP / 0 FAIL** (7,8 min) |
| Run 3 | `b5df91b` | 22.22.0 | PARTIAL (todos los pasos ejecutados PASS) | Mismos totales (461, 581, 84, 145/44/0 en 7,5 min); valida las correcciones del runner: árbol limpio tras ejecutar, resumen pgTAP con las dos pasadas, salida 3 |
| Final | ver [checkpoint](CLAUDE-N1-04-CHECKPOINT.md) | 22 y 24 | ver checkpoint | Sobre la HEAD final rebasada en `main@0107ca9` |

**Por qué PARTIAL y no PASS** (declarado en cada evidencia): (1) la pata Node 24 de `verify` solo se ejecuta en la ejecución final con un binario oficial verificado por SHA256; (2) el paso «Install Chromium for Playwright» no se ejecuta por política del entorno: se usa Chromium 141 (rev. 1194) preinstalado, mapeado a la ruta de la rev. 1243 que espera Playwright 1.63 (CI usaría Chromium 153); (3) las imágenes Supabase vienen de Docker Hub (`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`) porque el CDN de `public.ecr.aws` está bloqueado por el proxy; mismas etiquetas.

**Los 44 SKIP** son omisiones condicionales por viewport (8 marcadores en `e2e/`): pruebas que cambian datos o son independientes del ancho se ejecutan solo en `escritorio-1280`. No cuentan como PASS.

**Esto no es GitHub Actions.** Los jobs alojados siguen sin arrancar por la facturación de la cuenta.

## 4. Seguridad de entornos: contratos y pruebas

### Contratos observados

| Entorno | Condición en código | Sesión / datos | Pruebas |
|---|---|---|---|
| Development (local) | Sin `VERCEL_ENV` o `development`; URL `http://127.0.0.1`/`localhost` o https | Sesión si hay URL + clave publicable | `auth-mode.test.ts`, nuevas de contrato; preflight rechaza destinos alojados en local |
| Testing | `scripts/supabase-test-env.mjs` solo acepta el stack local esperado (puertos fijos) | Fixtures propios por ejecución | `supabase-test-env.test.ts`, e2e |
| Vercel Preview | `VERCEL_ENV=preview` (con espacios recortados) → `preview-locked` | **Sin cliente Supabase, sin sesión, sin lectura/escritura** | `preview-fail-closed.test.ts`, `preview-session-boundary.test.ts`, `preview-data-paths.test.ts`, smoke HTTP en `ci.yml` |
| Production | `VERCEL_ENV=production` + https + clave publicable | Sesión normal bajo RLS | Contrato fijado en `preview-fail-closed.test.ts` |

### Pruebas añadidas (todas sin red: `fetch` espiado y prohibido)

- **Sin sesión en Preview:** `currentUser()` nulo y `requireSession()` → `/acceso` con cookie de sesión previa.
- **Sin Auth en Preview:** `signIn`, `signUp`, `requestPasswordReset`, `updatePassword`, `signOut` y `/auth/confirm` (OTP y PKCE) no construyen cliente.
- **Sin escrituras:** `createOrganization`/`createProject` → `/acceso` antes de cualquier consulta. **Sin lecturas:** la exportación de proyecto responde 404.
- **Proxy:** no refresca ni reescribe cookies (incluidas las troceadas y el *code verifier*).
- **Ninguna bandera desbloquea:** 5 nombres plausibles × 5 valores verdaderos × 3 URLs.
- **Credenciales ausentes o mal formadas** (8 casos × 4 entornos) nunca dan acceso.
- **Clave secreta** (`sb_secret_`, con espacios, JWT `service_role`): nunca pública y el arranque se rechaza en todos los entornos, Preview incluida.
- **Production y Development** conservan sus contratos.
- **Guarda arquitectónica:** todo módulo de `src/` con un import de valor capaz de abrir BD (`@supabase/ssr`, `createClient` de `supabase-js`, `pg`, `postgres`…) debe llamar a `supabasePublicConfig()`/`previewLocked()`; solo `mode.ts` lee `NEXT_PUBLIC_SUPABASE_*`; ningún componente cliente importa clientes de BD; ninguna credencial de BD en `NEXT_PUBLIC_*` ni en `env` de `next.config`.
- **Smoke HTTP de Preview** sobre el build de producción (nuevo paso de `ci.yml`): `/api/salud` = `preview-locked`/`persistence:none`, rutas protegidas 307 con cookies falsas, `/acceso` sin formulario y con el aviso, ninguna cookie `sb-` emitida. Control negativo verificado: con `VERCEL_ENV=production` el mismo paso falla.

Las pruebas nuevas se validaron por **mutación**: un desbloqueo por `PREVIEW_SUPABASE_ISOLATED=true` introducido temporalmente en `mode.ts` hizo fallar 3 de ellas (cambio revertido, no commiteado).

### Hallazgos

| ID | Severidad | Hallazgo | Estado |
|---|---|---|---|
| H1 | **Alta (al fusionar S1)** | En #104 (`41512756`), `writerPool()` abre un `Pool` de `pg` con `RUBIK_AUDIT_DATABASE_URL` sin `previewLocked()`, y la ruta de drenaje del outbox lo usa sin sesión. Con esas variables en ámbito Preview, una Preview accedería a la BD saltándose el bloqueo | Detectado por `preview-data-paths.test.ts` en un worktree temporal de esa HEAD. Ajuste de una línea propuesto a Codex ([plan U02 §11](N1-04-PLAN-ACTIVACION-PREVIEW-U02-20261015.md)). **No** modificado por Claude |
| H2 | Media | Variables Supabase de Production posiblemente compartidas con el ámbito Preview (riesgo documentado previamente) | Inventario de metadatos por el propietario (U02-d). No se consultó Vercel |
| H3 | Baja | `previewLocked` compara exactamente `preview` tras recortar espacios; Vercel envía minúsculas, pero un valor `Preview` no bloquearía | Endurecimiento opcional (comparación sin mayúsculas) en una PR de producto revisada |
| H4 | Baja | Vercel *Development* no está bloqueado; `vercel env pull` podría traer valores alojados a `.env.local`, que Next.js carga en `build/start/dev` | El preflight lo detecta y bloquea; regla: no `vercel env pull` en worktrees de agentes |
| H5 | Baja | El runner S1 de Codex (`verify-s1-local.mjs`) registra HEAD pero no el estado sucio del árbol ni hashes de `ci.yml`/lockfile | Sugerencia; el formato de `scripts/ci-local` lo cubre |
| H6 | Info | Patrón de `kill` incompleto en pasos existentes de CI (A11) | Recomendación |

## 5. Aislamiento respecto a Codex (#104)

- Archivos de esta rama: `scripts/ci-local/*` (nuevos), `tests/ci-local-*.test.ts`, `tests/preview-*.test.ts` (nuevos), un paso añadido en `.github/workflows/ci.yml` (no tocado por #104) y documentos `docs/N1-04-CLAUDE-*`, `docs/N1-04-PLAN-ACTIVACION-PREVIEW-U02-*`, `docs/U02-REVISION-DECISION-*`, `docs/N1-05-PROTOCOLO-ALOJADO-*`, `docs/CLAUDE-N1-04-CHECKPOINT.md` (nuevos).
- No tocados: `src/`, `package.json`, `package-lock.json`, `playwright.config.ts`, `scripts/supabase-test-env.mjs`, migraciones, pruebas S1, `docs/ROADMAP-MAESTRO-2026.md`, `docs/CONTROL-PROYECTO.md`, `docs/N1-04-CI-ENTORNOS-PREPARACION-20261015.md` (modificado por #104), `docs/CODEX-AUTONOMIA-ESTADO.md`.
- El stack Supabase usado es propio de este contenedor efímero (sin ningún otro contenedor presente al empezar); el de Codex está en otra máquina y no se ha tocado.
- **Dependencia de orden de fusión:** si esta rama se fusiona antes que #104, `npm test` de #104 fallará en `preview-data-paths.test.ts` hasta aplicar el ajuste H1. Es intencionado: el fallo señala un camino real de datos sin bloqueo Preview. Si #104 se fusiona antes, esta rama se rebasa y la prueba fallará igual hasta que el ajuste llegue a `main`.
