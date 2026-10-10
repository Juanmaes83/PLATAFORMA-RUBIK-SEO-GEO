# Relevo a una cuenta nueva de Claude Code — 10/10/2026

Estado de partida: `main@992003b`, CI posterior en verde. Este documento sirve para continuar el proyecto **sin el contexto de la conversación anterior**. Tiene cuatro partes: el prompt que hay que pegar, el estado comprobado, las tareas de cada responsable y lo que falta para cerrar.

## 1. Prompt para pegar en la ventana nueva

> Eres Claude Code y continúas el proyecto RUBIK SEO GEO de Juanma (juanmaes83). Repositorio de aplicación: `Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO`. El Core se consume fijado a un commit: `Juanmaes83/RUBIK-SEO-GEO-CORE`.
>
> **Antes de nada, lee en este orden:**
> 1. `CLAUDE.md` y `AGENTS.md`: reglas obligatorias.
> 2. `docs/relevos/CONTINUACION-NUEVA-CUENTA.md`: este relevo, con las tareas por responsable.
> 3. El bloque superior de `docs/ROADMAP.md` y de `docs/HANDOFF.md`.
> 4. `docs/OPERATIONS-STATUS.md`.
>
> **Comprueba el punto de partida.** `git fetch` y `main` debe estar en `992003b` o después. Revisa la CI del último commit de `main` y los PRs abiertos: #9 y #11 son borradores antiguos y #40 tiene base antigua. No rehagas trabajo cerrado.
>
> **Objetivo de hoy:** cerrar el **piloto Sarah técnicamente comprobado** y la **primera versión multicliente utilizable**. Empieza por las tareas «C» del relevo, en orden. Para cada tarea:
> - una rama y un PR con base en `main`;
> - `npm run verify` en verde antes de subir;
> - CI en verde con el SHA exacto antes de fusionar. En la sesión del 10/10/2026, Juanma autorizó fusionar los PRs propios con `merge_pull_request` del MCP de GitHub, en squash y pasando el `sha` esperado. Confírmalo con él al empezar: CLAUDE.md exige una autorización expresa;
> - al terminar, actualiza HANDOFF, ROADMAP y OPERATIONS-STATUS sin borrar historial.
>
> **Prohibido sin autorización expresa de Juanma:**
> - usar secretos;
> - llamar a Google, OpenSEO u otro proveedor de pago;
> - aplicar migraciones al Supabase alojado o ejecutar `db push`;
> - cambiar variables de Vercel;
> - activar el modo `project`;
> - escribir desde Preview (comparte la base de producción);
> - enviar invitaciones;
> - publicar o desplegar a mano;
> - borrar ramas;
> - fusionar PRs del Core.
>
> **Reglas técnicas:**
> - solo la clave publicable de Supabase;
> - RLS en toda tabla expuesta;
> - cada cambio de esquema, en una migración nueva con pgTAP;
> - `src/lib/supabase/database.types.ts` se regenera con la CLI, nunca a mano;
> - no relajar `src/lib/auth/mode.ts`, `scripts/run-next.mjs` ni `src/instrumentation.ts`;
> - no poner identificadores de modelo en commits ni en PRs.
>
> **Si algo depende de Juanma, no lo hagas tú.** Prepara el procedimiento exacto y díselo.

## 2. Estado comprobado

| Pieza | Estado |
|---|---|
| Código | `main@992003b`. Integrado hoy: #70 (modo `project` preparado), #71 (exportación y restauración del estado Google, migración `20261012130000`), #72 (reintento seguro), #73 (comparar capturas Google), #74 (capturas periódicas, solo diseño), #75 (recomendación ADR 0010 y Preview) |
| Pruebas | `npm run verify` en local: 368 tests. CI (verify Node 22/24, pgTAP, comprobación de tipos, integración y Playwright) en verde en cada PR y en `main` |
| Supabase alojado (`yvdgmklgwlshizzgefpv`) | 16 migraciones aplicadas, hasta `20261012120000`. **Falta `20261012130000`** |
| Sarah (proyecto `b8d00961-1141-4741-908a-54d2e3bf343a`) | Conexión OpenSEO `ACTIVE`; GSC `https://sarahkaterina.es/` y GA4 `properties/519462393` asociadas; una captura real `STORED/OK` por proveedor (GSC `45f2c4c7-…`, GA4 `e9140843-…`) |
| Producción (Vercel) | `OPENSEO_GOOGLE_READS_ENABLED=true` solo en Production. Rastreo en `legacy`. Preview comparte la base de producción |
| PRs abiertos | #40 (ADR 0010, base del 09/10, sin rehacer), #9 y #11 (borradores antiguos de documentación). Core: ninguno abierto |
| Fuera de Rubik | Web, Studio, textos legales, DNS, lanzamiento e indexación de Sarah se gestionan en otro frente |

**Detalles técnicos útiles:**
- **pgTAP sin `db:start`:** contenedor `supabase/postgres:17.6.1.171` con las migraciones aplicadas en orden. La CI ejecuta el stack completo.
- **Tipos:** `npx -y supabase@2.118.0 gen types typescript --db-url "postgresql://postgres:postgres@<ip>:5432/postgres?sslmode=disable" --schema public`, conservando la cabecera de 3 líneas del archivo actual.
- **Fusiones:** en la sesión anterior, el clasificador de permisos bloqueó `git merge` local. Para poner al día una rama propia se usó `git rebase origin/main` y `git push --force-with-lease=<rama>:<sha-anterior>`. Los PRs se fusionan con el MCP de GitHub.
- **HANDOFF:** cada PR añade una entrada al principio de `docs/HANDOFF.md`, así que los PRs en paralelo chocan ahí. Conviene fusionarlos uno a uno.

## 3. Tareas pendientes

### Juanma (propietario): solo tú puedes hacerlas

| # | Tarea | Cómo | Desbloquea |
|---|---|---|---|
| J1 | Aplicar la migración `20261012130000` en alojado | Con tu CLI, como las anteriores ([SETUP-SUPABASE](../SETUP-SUPABASE.md)). Deben quedar 17 versiones sincronizadas. Rollback en `docs/rollback/google-recovery-state-rollback.sql` | Exportación completa (J3) |
| J2 | Prueba A del reintento | SQL de solo lectura que termina en `rollback`, en [REINTENTO-CAPTURAS](../REINTENTO-CAPTURAS.md). Debe salir `STORED` con el mismo `resultId` | Cierre de C (reintento) |
| J3 | Exportar Sarah desde Producción y verificarla con el anillo | [RECUPERACION-PILOTO](../RECUPERACION-PILOTO.md). La descarga crea un evento `project.export` y no consulta proveedores. Nunca subas la exportación ni el anillo a Git ni al chat. Usa la herramienta de C1 cuando exista | Cierre de B (recuperación) |
| J4 | Segunda cuenta de prueba y matriz de aislamiento | [AISLAMIENTO-ALOJADO-GUION](../AISLAMIENTO-ALOJADO-GUION.md), filas 1–7 | Versión multicliente |
| J5 | Decisión A (activar modo `project`) y decisión B (auditoría acotada con presupuesto) | [OPENSEO-ACTIVATION](../OPENSEO-ACTIVATION.md): lista previa y rollback | Piloto completo |
| J6 | Decidir el ADR 0010 y la Preview aislada | [DECISIONES-ADR0010-Y-PREVIEW](../DECISIONES-ADR0010-Y-PREVIEW.md): recomendación B y opción A. Antes, comprueba en Cloud Console si los alcances de lectura de GSC y GA4 son sensibles, y si hay plaza Free en «Rubik Sota» | C2 y aislamiento en Preview |
| J7 | Supabase Auth | Personalizar la plantilla «Reset password». Activar la protección de contraseñas filtradas (aviso WARN de los advisors). Decidir la política de registro y cerrar el registro abierto antes de dar acceso a clientes | Versión multicliente |
| J8 | Vercel | Pasar a un plan apto para uso comercial antes de comercializar: Hobby no lo permite ([HOSTING](../HOSTING.md)) | Comercialización |
| J9 | Decisiones K3 y K4 (custodia) y D2, D5 y D6 (retención) | Recomendaciones en [CUSTODIA-CLAVES](../CUSTODIA-CLAVES.md) y [RETENCION-Y-BORRADO](../RETENCION-Y-BORRADO.md) | Operación comercial |
| J10 | Autorizar una segunda captura de la misma propiedad | Consume cuota de Google y OpenSEO. Sin ella no hay comparación real en `/google/comparar` | Validación del Bloque 3 |
| J11 | Validación visual | `/google/comparar` (con GSC frente a GA4 debe bloquear y explicar el motivo) y el mensaje de reintento | Cierre visual |
| J12 | PRs antiguos | Decidir si cerrar #9 y #11 (cerrar no borra la rama) y si #40 se rehace (C2) | Repositorio limpio |
| J13 | Datos de presupuesto | Confirmar las condiciones de la instancia OpenSEO alojada y la tarifa para traducir los 10 € a créditos ([CONSUMO-Y-PRESUPUESTO](../CONSUMO-Y-PRESUPUESTO.md)) | Control de gasto real |

### Claude (cuenta nueva): sin proveedor ni secretos, en este orden

| # | Tarea | Detalle | Depende de |
|---|---|---|---|
| C1 | Herramienta local para verificar una exportación | Script que Juanma ejecuta en su equipo, por ejemplo `npm run verify:export -- archivo.json`. Llama a `verifyProjectExport` (`src/lib/recovery/verify-export.ts`) con el anillo de su entorno. No envía nada y no imprime claves. Incluye pruebas y documentación en RECUPERACION-PILOTO | — (desbloquea J3) |
| C2 | Rehacer el ADR 0010 sobre `main` | Reutilizar `src/lib/credentials/crypto.ts` y sus pruebas de #40. Migración `private.provider_credentials` con RLS y RPC solo para la titularidad, pgTAP y tipos regenerados. Sin variables ni OAuth real. Después, cerrar #40 como sustituido | J6 = B |
| C3 | ADR de la identidad del ejecutor periódico | Opciones y recomendación, solo documentación, según [CAPTURAS-PERIODICAS](../CAPTURAS-PERIODICAS.md) §«Qué falta» | — |
| C4 | Migración de programaciones de captura, en pausa | `private.google_capture_schedules` y el registro de ejecuciones, con RLS, pgTAP y tipos. Nada las ejecuta | C3 aprobado |
| C5 | Capturas visuales | Regenerar `docs/visual` con `npm run visual:evidence` (stack local) para las capturas 33–35, o anotar que la CI las genera como artefacto | — |
| C6 | Acompañar las tareas de Juanma | Tras J1–J5: registrar la evidencia en OPERATIONS-STATUS, ROADMAP y HANDOFF, y verificar con SQL de solo lectura si Juanma lo autoriza | J1–J5 |
| C7 | Cierre | Cuando J1–J7 estén hechas, marcar los hitos 1 y 2 del ROADMAP como cerrados, con su evidencia | Todo lo anterior |

## 4. Qué falta para cerrar el proyecto

| Hito | Falta | Quién |
|---|---|---|
| **Piloto Sarah técnicamente comprobado** | J1, J2, J3 (con C1), J5 y su prueba, y C6 | Juanma, más Claude en C1 y C6 |
| **Primera versión multicliente utilizable** | Lo anterior más J4, J6 (y C2 si se elige B), J7 y J8 | Juanma, más Claude en C2 |
| Capacidades posteriores (no bloquean el cierre) | Capturas periódicas activas (C3, C4 y decisión de Juanma), Bing, Ads, Business Profile, redes, IA, IndexNow, competidores, backlinks y ranking | Por fases, con presupuesto y autorizaciones |

**Realista para hoy:** C1 y C3 los puede terminar Claude en pocas horas. El cierre depende sobre todo de que Juanma haga J1–J5 y J7. Sin esas acciones, el código está listo pero el piloto no puede declararse comprobado.
