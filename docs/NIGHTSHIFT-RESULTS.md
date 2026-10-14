# Night shift — resultados (14→15/10/2026)

Turno autónomo sobre `PLATAFORMA-RUBIK-SEO-GEO`. Todo se ejecutó en **local** (Windows, Docker, Supabase CLI 2.118.0) y en Previews de Vercel de solo lectura. **No se tocó producción**: ni Supabase alojado (ninguna migración, consulta ni cambio de configuración), ni variables o flags de Vercel, ni proveedores (OpenSEO, Google, Bing), ni datos de Sarah, ni claves HMAC reales. No se fusionó ninguna PR.

## A. Estado Git

| | |
|---|---|
| HEAD inicial | `main@506ea91d24baa4feaff11e5f246f78135ee1b3ec` (PR #82). El checkout local estaba en `test-local-pr82@8074425`, limpio, con un stash ajeno: **no se tocó**; todo el trabajo se hizo en `git worktree` separados |
| HEAD final de `main` | `506ea91` (sin cambios: no se fusiona nada) |
| Clon local | Tenía un refspec de una sola rama (`feat/core-9-0-bootstrap`): `git fetch` no actualizaba `origin/main`. Se trajeron las ramas con refspec explícito; la configuración del clon **no se modificó** |
| Rama `test/nightshift-group3-anon-rpc-20261014` | Comprobada: apunta a `506ea91` (= `main`), sin commits propios. No se reutilizó; su contenido previsto está en #85 |

### Ramas y PR creadas (todas Draft, base `main@506ea91`)

| PR | Rama | HEAD | Tipo |
|---|---|---|---|
| [#85](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/85) | `test/group3-isolation-matrix-20261015` | `ec16af4` | Pruebas + doc (Grupo 3) |
| [#86](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/86) | `test/sarah-capture-idempotency-20261015` | `c029421` | Pruebas + doc (piloto Sarah) |
| [#87](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/87) | `feat/export-signed-manifest-20261015` | `ed877e6` | **Producto**: manifiesto firmado de exportación |
| [#88](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/88) | `feat/preview-session-lock-20261015` | `56ae0b1` | **Producto**: bloqueo de sesión en Previews |
| este informe | `docs/nightshift-results-20261015` | — | Documentación |

Commits: `ec16af4` (matriz de aislamiento e invariantes de catálogo), `c6cf52d` (reintentos concurrentes de captura), `c029421` (modo OpenSEO `project` en base real + doc del piloto), `ed877e6` (manifiesto firmado), `56ae0b1` (bloqueo de Preview).

PR existentes revisadas, **no actualizadas**: #81, #83, #84 (ver §F).

## B. Trabajo realizado

### Grupo 3 — aislamiento multicliente (PR #85)

- **Matriz de identidades completa** (`tests/integration/isolation-matrix.integration.test.ts`, 14 casos): owner A (A1 y A2), owner B (B1), account-manager, analyst, viewer y client-approver de A1, viewer solo de A2, autenticado sin pertenencia con `user_metadata` falsificado y anónimo.
- **Las 13 RPC expuestas** probadas contra cada identidad sin efectos secundarios (sondas con comando inexistente: el owner recibe error de validación, el resto `42501`).
- **No revelación de existencia:** para cada RPC, el error ante un UUID real de otro cliente es idéntico (code, message, details, hint) al de un UUID inexistente.
- **`user_metadata` falsificado de verdad:** el usuario reescribe su metadata, refresca el JWT, se comprueba que el claim viaja en el token y que nada lo usa.
- **PostgREST crudo:** `Accept-Profile/Content-Profile: private` → `406 PGRST106` incluso como owner; JWT con `sub` ajeno y firma inválida o vacía → `401`.
- **Invariantes de catálogo** (`supabase/tests/tenancy_surface.test.sql`, 14 pgTAP) sobre todo `public`/`private`: nada ejecutable por `anon` ni `PUBLIC`, DEFINER solo con `search_path` vacío, RPC públicas solo como envoltorio INVOKER, **lista cerrada de RPC** (una RPC nueva obliga a ampliar la matriz), RLS en todas las tablas, ningún privilegio de `anon`, políticas solo para `authenticated`, `WITH CHECK` en todo UPDATE, ninguna política ni función lee `user_metadata`.
- **Prueba de mutación:** se concedió temporalmente `EXECUTE` a `anon` en la base local; fallaron pgTAP y la matriz; se revocó y se comprobó.

### Piloto Sarah (PR #86)

- **Reintento idempotente concurrente:** dos sesiones HTTP con la misma clave a la vez → 1 llamada al proveedor y 1 resultado; fallo del proveedor → clave liberada, el reintento guarda exactamente uno. MCP simulado.
- **Modo OpenSEO `project` contra la base real:** solo la conexión ACTIVE propia; los IDs globales nunca sobreviven; UUID ajeno → `CONNECTION_FORBIDDEN`; sin registro de jobs → falla cerrado; revocada → `PROJECT_NOT_CONNECTED`.
- **Migración `20261012130000`:** ensayada en transacción con `rollback` sobre un estado «tipo alojado» (privilegios y `search_path` correctos, estado local intacto). Dependencias: solo tablas de migraciones ya aplicadas en alojado.

### Problema encontrado y corregido — exportación sin completitud demostrable (PR #87)

La verificación offline probaba **autenticidad**, no **completitud**: recortar la cola de la auditoría, quitar un resultado o una importación, o editar una importación (sin firma) seguía verificando y restaurándose. **Corrección:** manifiesto firmado sobre el cuerpo final (recuentos, cabeza de la cadena, resúmenes de resultados, importaciones y `operations`, alcance). Un manifiesto que no cuadra se trata como manipulación (`verify:export` exit 1, `planRestore` → `TAMPERED` antes de generar SQL). Ficheros antiguos siguen siendo legibles con completitud «NO DEMOSTRADA»; `--require-complete` la exige.

### Mejora de seguridad — Preview que comparte producción (PR #88)

Con `VERCEL_ENV=preview` la app no crea cliente de Supabase (sin inicio de sesión, sin sesión, sin consultas con JWT), salvo `PREVIEW_SUPABASE_ISOLATED=true`. Comprobado en la Preview real: `/api/salud` → `auth: "preview-locked"`; `/acceso` sin formulario.

### Hallazgos documentados (sin corrección, requieren decisión)

1. Cualquier miembro, incluido viewer, puede añadir filas a `audit_events` con su propio rol (diseño ADR 0004; la app lo necesita). Una fila forjada se detecta (`SIGNATURE`) pero es imborrable: puede dejar la cadena «no válida» de forma permanente.
2. Un titular puede añadir a su organización cualquier `user_id` existente sin su consentimiento (requiere conocer el UUID; no expone datos del añadido).
3. Una reserva de captura abandonada más de 5 minutos puede retomarse: posible doble lectura del proveedor (coste), nunca doble resultado.
4. Quitar el manifiesto de una exportación nueva la degrada a «no demostrada» (mitigado con `--require-complete`).

## C. Validaciones (exactas, Windows + Supabase local)

| Rama | `npm run verify` (unit/UI) | `test:integration` | pgTAP | e2e |
|---|---|---|---|---|
| `main@506ea91` (referencia) | 374/374 | 57/57 | 518/518 | — |
| #85 Grupo 3 | exit 0 · **374/374** · lint · TS · build · Core pin · secretos | **71/71** | **532/532** | — |
| #86 Piloto | exit 0 · **374/374** | **60/60** | **518/518** | — |
| #87 Manifiesto | exit 0 · **380/380** | **57/57** | **518/518** | `imports.spec.ts` escritorio **3/3** |
| #88 Preview | exit 0 · **375/375** | — (sin cambios de datos) | — | suite completa (360/390/1280 px) **145 passed, 44 skipped, 0 failed** |

Fallos durante el turno, todos diagnosticados: tipado de una fila de prueba (corregido), dos errores en mi propio SQL de pgTAP (`order by 1` dentro de `array_agg` y evaluación de `pg_get_functiondef` fuera del filtro; corregidos), una suposición de fixture en la prueba de modo `project` (corregida: B tenía su propia conexión), un fallo de build por usar una *junction* de `node_modules` entre worktrees (Turbopack la rechaza; se sustituyó por `npm ci`). Ninguno era un defecto de producto.

**GitHub Actions sigue bloqueado por facturación: ninguna de estas PR tiene CI.**

## D. Vercel

Proyecto `plataforma-rubik-seo-geo` (`prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook`, equipo `team_hLhdb3M9MviTIysXD9whFF2c`), confirmado ligado a `Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO`. Despliegues creados por la integración Git al hacer push; **ningún redeploy forzado**.

| PR | Deployment | Estado | SHA | URL |
|---|---|---|---|---|
| #85 | `dpl_J74dZEBsoy2QR2uwJP8MBa8hyfjM` | READY | `ec16af4` | https://plataforma-rubik-seo-aeuotq0l6-juanma-espinosas-projects.vercel.app |
| #86 | `dpl_8ym4XaALnZyepuZ5STFBM142GQbC` | READY | `c029421` | https://plataforma-rubik-seo-ap581l4bm-juanma-espinosas-projects.vercel.app |
| #87 | `dpl_CBwD2jxUAajymrCLdC2ZxGprSGEJ` | READY | `ed877e6` | https://plataforma-rubik-seo-m685jslfs-juanma-espinosas-projects.vercel.app |
| #88 | `dpl_5gFpzYivp1jSW2rmd3nnCsw9qFs4` | READY | `56ae0b1` | https://plataforma-rubik-seo-hqwvaq4j9-juanma-espinosas-projects.vercel.app |

Pruebas HTTP realmente ejecutadas (anónimas, sin escritura, vía enlace de omisión de protección de Vercel): #87 `/api/salud` 200 (Core `2aaf127`), `/` 200 con el `dpl` esperado, `/proyectos/no-existe/tampoco/exportar` 404; #88 `/api/salud` → `preview-locked`, `/acceso` sin formulario. **No** se probaron páginas autenticadas en Previews (comparten la base de producción). Las Previews de #85/#86 no cambian producto: solo READY. Revisión visual y de accesibilidad: en local con Playwright (§C), no en Vercel. READY ≠ CI.

## E. Roadmap

| Bloque | Estado |
|---|---|
| Grupo 3 · aislamiento en local | **COMPLETADO Y VALIDADO** (local) · PR #85 |
| Grupo 3 · aislamiento alojado (fase B, dos cuentas) | **BLOQUEADO** — propietario |
| Grupo 3 global | **IMPLEMENTACIÓN LOCAL VALIDADA, AISLAMIENTO ALOJADO PENDIENTE** |
| 4.1 Migración `20261012130000` | **PREPARADO PARA REVISIÓN HUMANA** (ensayada; aplicación alojada = propietario) |
| 4.2 Exportación verificable | **IMPLEMENTADO, PENDIENTE DE VALIDACIÓN** (PR #87; falta revisión del formato y descarga real) |
| 4.3 Reintento idempotente | **COMPLETADO Y VALIDADO** (local) · PR #86 |
| 4.4 Modo OpenSEO `project` | **PREPARADO PARA REVISIÓN HUMANA** (probado en local; activación = propietario) |
| 5.1 Credenciales por cliente (ADR 0010) | **BLOQUEADO** — decisión del propietario. PR #40: solo `docs/HANDOFF.md` en conflicto; `crypto.ts` aplica limpio y sus 5 pruebas pasan sobre `main` |
| 5.2 Contraseñas filtradas | **BLOQUEADO por plan**: según la documentación de Supabase requiere **Pro** |
| 5.3 Preview aislada | Salvaguarda **PREPARADA PARA REVISIÓN HUMANA** (PR #88); proyecto aislado **BLOQUEADO** — propietario |
| 5.4 Dependencias | **COMPLETADO Y VALIDADO**: producción 0 vulnerabilidades; desarrollo 5 «high» vía `eslint-config-next` → `braces`, **sin versión corregida** (`*`); `npm audit fix` propone bajar a 14.x: descartado |
| 7 · UI/UX multicliente | **NO INICIADO** como revisión dedicada. Referencia: suite e2e/visual completa (acceso, recuperación, organizaciones, proyectos, invitaciones, personas, importaciones, exportación, conectores, consumo, estados vacíos, 360/390/1280 px, sin desbordamiento horizontal) **145/145** con 44 omitidas por diseño, sobre la rama de #88 en local. Sin errores reproducibles detectados |

## F. Pendientes del propietario

1. **Revisar y decidir las PR #85–#88** (Draft). *Por qué:* sin CI, la única evidencia es local. *Riesgo que desbloquea:* aislamiento y exportación del piloto. *Alternativa sin él:* ninguna; no se fusiona sin revisión.
2. **Fase B del Grupo 3 en alojado** (protocolo de #84). *Por qué:* las pruebas locales no sustituyen dos sesiones reales. *Desbloquea:* cerrar el Grupo 3 y el onboarding multicliente. *Alternativa:* con la Preview aislada (5) se haría sin tocar producción.
3. **Aplicar `20261012130000` en alojado** (`docs/SETUP-SUPABASE.md`). *Desbloquea:* exportación con estado Google del piloto. *Alternativa:* ninguna (solo el propietario aplica migraciones).
4. **Decidir ADR 0010** (opción B recomendada). *Desbloquea:* credenciales por cliente. *Alternativa:* seguir con la conexión de OpenSEO (suficiente para Sarah).
5. **Preview aislada:** comprobar plaza gratuita en la organización Supabase y crear `rubik-preview`; luego `PREVIEW_SUPABASE_ISOLATED=true` solo en Preview. *Alternativa sin coste ni acción:* fusionar #88 y revisar con sesión solo en local.
6. **Contraseñas filtradas:** requiere plan Pro. Mientras tanto ya rigen 12 caracteres mínimos con letras y dígitos (app y Auth). *Alternativa:* subir requisitos a `lower_upper_letters_digits_symbols` en Auth (cambio de configuración alojada = propietario).
7. **Documentación pendiente:** cerrar #81 como superada (describe el estado previo a #80 y choca con #83 en los mismos tres ficheros); fusionar #83 y después #84. Ninguna de las tres entra en conflicto con `main` por separado.
8. **GitHub Actions (facturación).** *Desbloquea:* CI real en todas las PR.

## G. Próximas prioridades

1. Revisión y fusión de #85 (Grupo 3 local) y #87 (completitud de la exportación).
2. Fase B alojada del Grupo 3 con dos cuentas y limpieza verificada.
3. Aplicar `20261012130000` y hacer una exportación real de Sarah verificada con `--require-complete` (en la máquina del propietario).
4. Decidir #88 y la Preview aislada; con ella, repetir la matriz del Grupo 3 sobre un Auth alojado sin datos reales.
5. Decidir el riesgo residual de `audit_events` (alta por RPC firmada en servidor o política por acción/rol).
