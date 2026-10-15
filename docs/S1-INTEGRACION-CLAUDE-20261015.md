# S1 · Integración y revisión de Claude Code (paquete B de la cola #108)

**Rama:** `claude/s1-integration-review-20261015`, creada desde la HEAD de [#104](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/104) `41512756ac1ce80934692d1722fd41bd95993933` (sin cambios en el remoto durante el relevo). **No escribe en la rama de Codex.** PR Draft hacia `codex/s1-trusted-audit-writer-20261015`.
**Alcance:** solo local (U01). Ninguna migración alojada, credencial real, Preview/Production ni gasto.

## 1. Entorno propio

| Elemento | Valor |
|---|---|
| Worktree | clon propio en contenedor efímero de Claude (`/home/user/rubik-s1-claude`), distinto del worktree Windows `test-results/s1-writer` de Codex |
| Stack Supabase | `rubik-claude-s1-20261015`, API `127.0.0.1:57321`, DB `57322` (todos los puertos movidos: 57320/57323/57324/57327/57329/8093) |
| Selección | `RUBIK_TEST_CLAUDE_S1_STACK=1`; `scripts/test-stacks.mjs` rechaza dos selectores a la vez en lugar de resolver por precedencia |
| Escritor | `rubik_audit_writer` con LOGIN y contraseña **ficticia aleatoria** solo en ese stack (`scripts/claude-s1-stack.mjs`, `env.sh` ignorado por Git) |
| Stack/ledger de Codex | No existe en esta máquina; no se ha tocado. El ledger ambiguo `aeb1e078…` permanece en su worktree |

## 2. Defectos encontrados en la HEAD de #104 (antes de cualquier cambio)

Además de los cinco siguientes: `database.types.ts` con BOM y sin cabecera, y `ci.yml` sin escritor para la integración/E2E (ver §4).

Línea base en el stack propio con solo el selector añadido: unitarias 407/411, integración 91/91, **pgTAP 597/605**.

1. **4 unitarias de captura Google fallaban:** simulaban el RPC `store`, pero desde `20261015190000` el almacenamiento usa el escritor Postgres. Reproducido también en un worktree intacto de `41512756`.
2. **8 aserciones pgTAP fallaban** (`openseo_jobs`, `openseo_isolation`): completaban trabajos con un JWT, que `190000` ya rechaza.
3. **H1 — `writerPool()` sin bloqueo Preview:** abría un `Pool` con `RUBIK_AUDIT_DATABASE_URL` sin `previewLocked()`; la ruta de drenaje lo usa sin sesión.
4. **Google sin trazabilidad duradera:** `google.capture` era un `appendAudit` separado y posterior al commit del resultado. Un fallo de firma o una respuesta perdida dejaba un resultado pagado sin evento para siempre; los *replays* devolvían `audited: false` sin reparar nada.
5. **OpenSEO sin evento:** completar un trabajo y guardar su par de resultados no dejaba ningún evento de auditoría.

## 3. Propuestas #105–#107: validación real

| PR | Qué aporta | Evidencia en PostgreSQL real (stack de Claude) | Correcciones necesarias |
|---|---|---|---|
| #105 | Probe transaccional del rollback `190000` | PASS: EXECUTE revocado con la guarda anti-HMAC activa y privilegios restaurados tras ROLLBACK; comprobación independiente posterior `t|t|t`; rechaza el puerto 56322 bajo el selector de Claude | El destino estaba fijado a 56322; ahora sigue el stack seleccionado sin aceptar ningún otro |
| #106 | Guard: no borrar proyecto/organización con recibos pendientes | pgTAP propio 14/14; **concurrencia con dos sesiones** A (recibo confirmado mientras el DELETE espera → 55000), B (DELETE primero → recibo falla por FK 23503, sin huérfanos), C (cascada de organización → 55000) | Rompía `audit_provenance` (cascada con recibo pendiente) y la limpieza de integración/E2E, que dejaba **residuos en silencio**; ambas corregidas sin rebajar la guarda. Formato del documento (comillas escapadas) |
| #107 | Drenaje fail-closed y sin inanición | Unitarias 5/5; integración con **25 recibos envenenados** más antiguos y 29 válidos: todos los válidos firmados en ≤3 páginas; validada por mutación (con el orden anterior la prueba falla); ruta 503 sin escritor | Su unitaria con un solo recibo envenenado no demostraba inanición |

## 4. Cambios propios

| Cambio | Commit | Evidencia |
|---|---|---|
| Stack propio y selector exclusivo | `67d8462` | 21 unitarias de selección + 3 de configuración |
| #105 adaptado al stack seleccionado | `f9e7174` | Probe real PASS |
| Concurrencia del guard #106 | `8340aa1` | Escenarios A/B/C PASS |
| Drenaje contra PostgreSQL | `18fe31c` | 3/3, discriminante por mutación |
| H1: escritor bloqueado en Preview | `891c6cf` | 2 unitarias; guarda estática de N1-04 (#109) 6/6 sobre esta rama |
| pgTAP coherente con `190000` y #106 | `b10f724` | 626/626; negativos JWT añadidos; camino del escritor con su identidad real (pertenencia concedida solo dentro de la transacción de prueba) |
| **Recibos duraderos Google/OpenSEO** (`20261015210000`) | `f13987c` | Ver §5 |
| Negativos del escritor | `29f5902` | Integración 6/6 + unitaria de JWT caducado |
| `database.types.ts` canónico | `40c2988` | En #104 perdió la cabecera y llevaba BOM UTF-8: el paso de CI de tipos habría fallado. Contenido idéntico al generado |
| `ci.yml`: login del escritor en el stack efímero de CI | `f47a54c` | Sin él, integración y Playwright S1 fallarían en Actions al desbloquearse la facturación |

## 5. Trazabilidad duradera Google/OpenSEO

- **Base de datos:** al pasar una captura a `STORED` o un trabajo a `COMPLETED`, un trigger crea en la **misma transacción** el recibo `google.capture` (objetivo = id del resultado) u `openseo.audit.store` (objetivo = id de auditoría OpenSEO). Id del recibo = id de la captura/trabajo (no colisiona con el recibo de borrado, cuyo id es el del resultado). Actor = owner verificado en SQL. La restauración offline (postgres sin JWT) no crea recibos. Funciones `SECURITY DEFINER`, `search_path` vacío, sin EXECUTE para roles de API ni para el escritor; el escritor sigue sin poder insertar recibos.
- **Servidor:** `signProviderReceipt` firma el recibo con el escritor confiable. Si la firma falla o la respuesta se pierde tras el commit, el recibo queda pendiente; reintentar la misma clave reproduce el resultado guardado **y firma el recibo**, o lo firma el drenaje del operador. El proveedor nunca se vuelve a llamar.
- **Pruebas:** pgTAP específico (privilegios, restricción de acción/objetivo, rechazo de viewer, idempotencia del reintento, restauración sin recibo, recibo pendiente que bloquea el borrado); integración Google con fallo de firma simulado tras el commit → recibo pendiente con detalles → reintento sin llamada al proveedor → un único evento verificable; integración OpenSEO → un único recibo tras completar y reintentar, firma idempotente, evento con `receiptId`.
- **Rollback de contención** (`supabase/rollbacks/20261015210000_…`): retira triggers y funciones sin borrar recibos ni reabrir HMAC; ensayado en transacción revertida (triggers 0 → 2 tras ROLLBACK; JWT sigue sin INSERT). Debe desplegarse junto con la versión de aplicación anterior.

## 6. Riesgos y decisiones abiertas (no inventadas)

| # | Tema | Estado / propuesta |
|---|---|---|
| R1 | **Exportación con recibos pendientes** | Exportación y restauración ignoran el outbox: una exportación tomada con pendientes no contiene esos eventos. Propuesta: RPC owner-only con el recuento de pendientes y exportación que **avise o se niegue** hasta drenar. Afecta a la UX del piloto: decisión del supervisor/propietario |
| R2 | Reintento OpenSEO tras commit incierto | No repite el rastreo (crawl) ni guarda dos veces, pero `followSiteAudit` vuelve a **leer** resultados de OpenSEO antes de llegar al `complete` idempotente. Mejora posible: atajo cuando el trabajo ya está `COMPLETED`. Coste de lectura de OpenSEO no confirmado |
| R3 | Retención tras borrar proyecto | #106 es fail-closed con pendientes; con recibos completados se mantiene la cascada histórica (el rastro se borra con el proyecto). Retención legal = decisión reservada |
| R4 | Alertas de pendientes | Hay recuento y antigüedad (`GET /api/operaciones/auditoria/pendientes`); no hay scheduler ni alerta automática (no autorizados) |
| R5 | Drenaje y anillo | El drenaje firma con el anillo recibido; un proyecto con cadena vacía acepta cualquier anillo. En producción hay un único anillo; documentado |
| R6 | Transporte alojado | Pooler de Supabase y runtime Vercel no probados (requiere Preview aislada, U02) |
| R7 | Denegaciones sin membresía | Registro de seguridad separado: decisión pendiente (U01) |
| R8 | `captureGoogleReport(actor)` | El parámetro ya no determina el actor del evento (lo resuelve SQL); se mantiene por compatibilidad de API |

## 7. Secuencia de migración y rollback (solo local; alojado requiere autorización)

Orden: `20261015145025` → `170000` → `171000` → `172000` → `180000` → `183000` → `190000` → `201500` (#106) → `210000` (recibos de proveedor). La aplicación con escritor (`RUBIK_AUDIT_DATABASE_URL`) debe desplegarse de forma coordinada con `145025`/`180000`/`190000`: sin escritor, auditoría y resultados fallan cerrados. Rollbacks de contención en orden inverso; `201500` no tiene rollback simple por diseño (ver documento de #106); `210000` se revierte junto con la versión de aplicación anterior. **Antes de cualquier migración alojada:** inventario de `provider_results`/`audit_events` históricos (firmas no confiables quedan `UNTRUSTED`) y drenaje completo.

## 8. Evidencia de pruebas (local, no GitHub Actions)

| Ejecución | SHA | Resultado |
|---|---|---|
| Línea base HEAD #104 + selector | `67d8462` | unitarias 407/411 (4 fallos heredados), integración 91/91, pgTAP 597/605 (8 fallos heredados) |
| Batería S1 completa (`verify-s1-local`) en el stack de Claude | `29f5902` | **verify 417/417** (lint, tipos, build), **integración 101/101**, **pgTAP 641/641**, **Playwright 145 PASS / 44 SKIP / 0 FAIL**; evidencia con `dirty: []`; 0 residuos |
| `ci.yml` de esta rama con el runner de N1-04 (#109), stack por defecto efímero | `f47a54c` | Todos los pasos ejecutados PASS: verify 417/417 y smokes; pgTAP 641/641; Studio FAIL→PASS esperado; **tipos coinciden**; integración 101/101 con el escritor del nuevo paso; build conectado; Playwright 145/44/0. Veredicto `UNBOUND` solo porque la copia temporal del runner (sin commit) ensuciaba el árbol; pata Node 24 y Chromium oficial no ejecutados |
| Final | ver checkpoint | Batería completa sobre la HEAD final con árbol limpio |

Los 44 SKIP son las omisiones por viewport de E2E (no cuentan como PASS). Desviaciones del entorno: Chromium 141 mapeado (Playwright 1.63 espera rev. 1243), imágenes Supabase desde Docker Hub.

## 9. Estado

Pendiente de la batería final sobre la HEAD final (checkpoint). Con ella en verde y los riesgos de §6 documentados, el estado propuesto es **S1 LISTO PARA AUDITORÍA DE FUSIÓN** (local). **No** es S1 alojado ni comercial: ninguna migración se ha aplicado fuera del stack local y #104 no se fusiona sin auditoría supervisada.

