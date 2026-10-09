# Roadmap de la plataforma

Fuente de estado de este repositorio. El plan global y sus criterios están en [EXECUTION-PLAN](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/blob/main/docs/core-9/EXECUTION-PLAN.md) del Core.

El catálogo de capacidades SEO/GEO que el propietario quiere cubrir, con el estado actual, piezas parciales del Core y dependencias, está en [SEO-CAPABILITIES-BACKLOG.md](SEO-CAPABILITIES-BACKLOG.md).

## Checkpoint operativo — 09/10/2026 (Europe/Madrid)

- Producción Vercel funciona; login alojado y creación de organización/proyecto comprobados por el propietario. Esto verifica un acceso real, no sustituye la prueba de aislamiento con dos cuentas alojadas.
- OpenSEO: salud correcta, autenticación verificada (`CONNECTED`), auditoría `02f2f04d-c7ea-4fe9-bb05-be1c39509938` completada, 10/10 páginas. Dos incidencias visibles en portada: `meta-description-too-long` y `title-too-long`.
- El informe mostró una página y nueve filas ocultas por el filtro. Las URLs de esas nueve filas no se han observado: no afirmar que sean dominios ajenos ni que sean todas variantes `www`.
- Comprobación directa de Supabase alojado: migraciones `20260928120000` y `20260928150000`; cuatro tablas de tenancy. **CORE-9.2 y CORE-9.3 no están aplicadas en ese entorno.** La disponibilidad de claves de firma no se deduce de secretos que una API devuelva vacíos.
- Primer cliente comprobado: Sarah Katerina (`www.sarahkaterina.com`). La conexión de OpenSEO usa todavía un `projectId` global; no se declara el conector listo para muchos clientes.

| Etapa | Estado | Notas |
|---|---|---|
| **CORE-9.0 · Descubrimiento y base** | ✅ Fusionada por el propietario: [PR #1](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/1), merge `a34746e` en `main`. CI posterior al merge: [run 36432091098](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36432091098), en verde (verify Node 22/24 y ui) | Next.js 16, Core fijado en `20e4f4e`, estructura mobile-first con capturas ([ADR 0002](adr/0002-ux-mobile-first.md)), permisos separados de la disponibilidad, conectores todos «No conectado». El historial de CI por commit del PR #1 está en [HANDOFF](HANDOFF.md) |
| **CORE-9.1 · Identidad, organizaciones y aislamiento** | ✅ Fusionada en `main` mediante [PR #2](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/2), merge `debbb7078ea1af4931dea59d2169f8eda7a9967b`; su CI posterior pasó (verify Node 22/24 y e2e). Las migraciones CORE-9.1 y de privilegios están aplicadas en el Supabase alojado según la salida de CLI del propietario; Security Advisor: **No issues found**. | La aplicación implementa Supabase Auth con correo/contraseña, organizaciones, proyectos, pertenencias y roles del Core aislados por RLS ([ADR 0003](adr/0003-auth-supabase-y-tenancy.md)). Configuración Auth: email y confirmación activados; URL de producción y callback `/auth/confirm` configurados durante la sesión alojada. Pendiente: validar el flujo de la app contra Supabase alojado con dos cuentas, revisar correo/plantilla y cerrar registro antes de clientes. Producción y primer acceso real comprobados el 09/10/2026; OpenSEO conectado. Sin IA operativa. Fuera de fase: invitaciones, MFA de usuarios y recuperación de contraseña. |
| CORE-9.1 · Seguimiento: privilegios de `public.rls_auto_enable()` | ✅ PR #3 fusionado en `main` (`c1567d7`); CI verde en el HEAD `0429a79` ([run 36472096880](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36472096880), verify Node 22/24 y e2e). El propietario aplicó `20260928150000_rls_auto_enable_privileges.sql` desde Supabase CLI el 28/09/2026; `migration list --linked` muestra local y remoto sincronizados, y `db advisors --linked --type security --level info` devuelve **No issues found**. Evidencia original: salida compartida por el propietario; el 09/10/2026 se comprobaron directamente las dos migraciones alojadas. | La migración revoca `EXECUTE` a PUBLIC, `anon` y `authenticated`, conserva `ensure_rls` y está probada con pgTAP (74/74), integración (9/9) y Playwright (72 pasan, 18 se omiten). Pendiente: completar pruebas manuales de Auth con dos cuentas y cerrar el registro abierto antes de dar acceso a clientes ([SETUP-SUPABASE](SETUP-SUPABASE.md) §§3, 5). |
| CORE-9.2 · Persistencia, auditoría y provenance productiva | 🟡 Unidad 1 (auditoría append-only y resultados firmados) **fusionada en `main`** ([PR #5](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/5), merge `d0cfb93`, 07/10/2026). Quedan las demás unidades de 9.2. [Core PR #19](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/pull/19) (D-28) fusionado con merge commit `8a1f808`, como antecedente del contrato de firma; el pin actual está registrado en HANDOFF. Local: verify 53/53, pgTAP 113/113, integración 18/18. Sin aplicar al Supabase alojado | [ADR 0004](adr/0004-persistencia-auditoria-y-provenance.md): SHA-256, forma canónica del Core, HMAC con `keyId` y rotación, encadenado e inmutabilidad en BD, exportación y borrado. Pendiente del propietario: custodia de claves (hosting o KMS), validación legal de retención y aplicación de la migración. Pendientes de 9.2: consentimientos, ledger de gasto, fact book, snapshots, acciones y borradores |
| CORE-9.3 · Importación manual | ✅ Fusionada en `main` ([PR #6](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/6), merge `2beed3a`, 07/10/2026). Normalizador Lighthouse → `rubik-import-v1` en PR aparte. **Actualización 2026-10-07:** ese PR aparte, [#7](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/7), está **fusionado** en `main` (merge `fd8ef5600b6757d995afff33655c17ee4285a227`); CI del push a `main` [run 37655703584](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37655703584): **success** (verify Node 22/24 y e2e). Local sobre `fd8ef56`: verify 84/84, pgTAP 137/137, integración 25/25. Local: verify 78/78, pgTAP 137/137, integración 24/24, Playwright 81 pasan y 24 se omiten | [ADR 0005](adr/0005-importacion-manual.md): contrato `rubik-import-v1` estricto, estados `complete`/`partial`/`failed`/`empty`, idempotencia por SHA-256, sin guardar el fichero original, auditoría firmada de cada fichero, interfaz de lista, detalle y borrado, y exportación del proyecto. Sin CSV. Pendiente: aplicar la migración en el entorno alojado (propietario) |
| OpenSEO · puente de auditoría técnica (unidad 3 del plan) | ✅ Primer tramo integrado y verificado contra servicio real; PR #10 y correcciones #12/#13 integrados. Auditoría completada 10/10, resultado compartido por el propietario el 09/10/2026 | [ADR 0006](adr/0006-puente-openseo.md): transporte MCP de servidor, 5 herramientas permitidas, auditoría manual sin Lighthouse. Producción limitada a 50 páginas por configuración. Sin persistencia; un `projectId` global por servidor. Próximo tramo: resultado firmado, trabajo activo único y enlace por proyecto. Pendiente clasificar las nueve filas ocultas y separar configuración de conexión verificada en la interfaz |
| CORE-9.4 · Search Console (lectura) | ⏳ | Requiere consentimiento, OAuth y propiedad de prueba |
| CORE-9.5 · Bing Webmaster (lectura) | ⏳ | |
| CORE-9.6 · Observación y borradores | ⏳ | |
| CORE-9.7 · IA asistida | ⏳ | El propietario elige proveedor y modelo |
| CORE-9.8 · IndexNow | ⏳ | Aprobación humana por envío |
| CORE-9.9 · Piloto Sarah Katerina | 🟡 Primera auditoría real autorizada y completada; piloto global pendiente | Revisar informe completo, persistencia, exportación/recuperación, contratos del host y acceso por cliente; no equivale a comercialización ni a aprobación automática de publicaciones |
| CORE-9.10 · Preparación comercial | ⏳ | Hosting compatible con uso comercial ([HOSTING](HOSTING.md)) |

Ninguna etapa se cierra sin sus criterios demostrados, con CI en verde y la revisión del propietario.

## Implementación integrada en esta continuación

Selección del ID y límite de longitud, bloqueo de envío mientras hay peticiones activas, distinción del informe anterior, contador separado de páginas/incidencias ocultas y aceptación del compañero `www`/dominio base solo si está autorizado explícitamente. Banner y metadata corregidos. Integrado y desplegado mediante PR #14 con CI completa. No se declara que las nueve filas reales ya se hayan recuperado.

Docker local ausente: pgTAP, integración y e2e completas requieren CI/otro entorno con Docker. Supabase alojado sigue pendiente de las migraciones 9.2/9.3 y de confirmar claves de firma/custodia antes de persistir resultados.

## Próximas unidades, en orden de dependencia

| Prioridad | Unidad | Entrega verificable | Dependencias / límites |
|---|---|---|---|
| 1 | Estabilizar el flujo OpenSEO | PR #14 integrado y desplegado con CI completa: selección del ID nuevo, controles de envío en la consola, www/apex explícito y contadores separados; pruebas negativas de dominio | No ampliar automáticamente el scope a todos los subdominios. No lanzar auditorías nuevas para probar cambios de interfaz |
| 2 | Persistencia del informe y un trabajo activo por proyecto | Guardado firmado del resultado original del Core, historial/recarga, idempotencia y adquisición atómica del trabajo | Migraciones alojadas de 9.2/9.3 pendientes; comprobar firmante y custodia/recuperación de claves. Sin esas piezas, no anunciar guardado operativo |
| 3 | Conectores y consentimiento por cliente | Referencia OpenSEO por proyecto bajo RLS, conexión/revocación/scope propios; pruebas entre clientes | Sustituir el proyecto global; secretos siguen en servidor. Consentimientos y ledger de gasto de 9.2 |
| 4 | Search Console y Bing, lectura | Implementación, mocks, tratamiento de 401/403/429, provenance y desconexión | La prueba live necesita OAuth/acceso a una propiedad autorizada; no inventar acceso ni pedir claves por chat |
| 5 | Observación, snapshots e informes | Histórico comparable, trabajos idempotentes/cancelables y límites | Persistencia, consentimiento, scope, ledger y presupuestos antes de tareas periódicas |
| 6 | Competidores, backlinks y rank tracking | Fases y criterios en [SEO-CAPABILITIES-BACKLOG](SEO-CAPABILITIES-BACKLOG.md#15-competidores-backlinks-y-rank-tracking-por-fases) | Verificar API y costes; no ampliar herramientas permitidas ni activar consumo al documentar el plan |
| 7 | IA asistida, IndexNow, piloto completo y operación comercial | Borradores respaldados por evidencia; aprobaciones por acción; recuperación y límites por cliente | Modelo/presupuesto y OAuth pendientes de configuración específica. La plataforma funcionando no demuestra estas fases terminadas |

El desarrollo, las pruebas locales, la preparación de migraciones y los PR pueden continuar sin mantener al propietario delante de la pantalla. Un bloqueo de OAuth, custodia de firma o decisión de coste se documenta y se continúa con otra unidad independiente. No se declara que Claude Code esté trabajando si no existe una sesión accesible y confirmada.

Registro operativo por entrega: [OPERATIONS-STATUS](OPERATIONS-STATUS.md).

Contrato de herramientas, límites y costes contrastados: [OPENSEO-API-CAPABILITIES](OPENSEO-API-CAPABILITIES.md). El servicio alojado puede consumir créditos también para auditorías; el código abierto no implica datos de proveedores gratuitos.

Avance de prioridad 2: PR #19/#20 integrados y desplegados. La lectura/lista queda acotada por proyecto y la firma incluye UUID de organización/proyecto; CI incluye aislamiento entre proyectos del mismo titular y rechazo de replay firmado. No equivale al guardado/historial operativo de OpenSEO. Véase HANDOFF e issue #17.


### 09/10/2026 — aislamiento criptográfico antes de persistencia OpenSEO

Core PR #22 ofrece firmas vinculadas a UUID de cliente/proyecto. La plataforma
lo integró mediante PR #20 (`7ddc9d9`), con CI completa y producción READY. Las
firmas reasignadas o sin contexto se rechazan también en exportación. PR #19
(historial por proyecto) está integrado y desplegado. Esto no completa #17/#18: faltan almacenamiento de auditorías,
historial visible, jobs exclusivos y mapping/configuración por cliente.

### 09/10/2026 — frontera de trabajos OpenSEO preparada

PR #21, fusionado como `35277d8`, integra dos controles del siguiente tramo
sin activar persistencia alojada: `startSiteAudit` acepta únicamente un trabajo
activo de servidor coherente (`jobId === auditId`, estado `SYNCING`) y el Core lo
reutiliza sin llamar a `run_site_audit`; `followSiteAudit` puede exigir el
`auditId` vinculado al proyecto y rechaza ausencia o discrepancia antes de abrir
MCP. La vinculación debe proceder del repositorio/RLS, nunca del formulario.

La tabla y adquisición atómica siguen pendientes. La CLI fijada de Supabase
abortó en este entorno incluso al ejecutar `migration --help`; no se creó a mano
un fichero de migración ni se tocó el proyecto alojado. CI completa de PR #21 en
verde y producción READY (`dpl_F82HEYtPYntCHAgMmq2pAzBjkJoK`). Hasta cablear y
probar el repositorio, las acciones conservan el comportamiento del primer tramo
y estos parámetros solo son una frontera interna probada.

### 09/10/2026 — resultado confiable ya limitado al proyecto

Core PR #23 (`a6071fc`) permite al host filtrar URLs después de normalizar y
antes de emitir confianza. La plataforma prepara su consumo: incidencias y
páginas externas no llegan al `ProviderResult` que posteriormente se firmará;
el conteo `scopeFiltered` mantiene la explicación visual. Plataforma PR #23
fusionado en `139e2f6`: verificación local 185/185 y CI completa en verde
(run `37871833027`). Producción Vercel `READY` en ese merge
(`dpl_6EnsH1iR2k42ki7GVdtNFt3GBKLs`). Sigue sin existir almacenamiento operativo.

### 09/10/2026 — captura y firma previas al almacenamiento

El PR #25, fusionado en `7330802`, entrega el `ProviderResult` original y ya
limitado al proyecto a una frontera solo de servidor. Antes de firmar exige que
los resultados sigan marcados como emitidos por el Core y que proveedor,
operación y `auditId` coincidan. Los fallos de captura se distinguen del estado
del rastreo. CI completa en verde (run `37889221102`) y producción Vercel
`READY` en ese merge (`dpl_BmeUiNCPPnB1uS1LeKCAoa76H3CK`). Esta unidad no
escribe todavía: faltan idempotencia/transacción, tabla de jobs y migraciones
alojadas.

### 09/10/2026 — interfaz de historial firmado preparada

La rama `feat/openseo-signed-history` añade lista por proyecto y detalle con
verificación criptográfica previa. Solo un resultado verificado muestra sus
filas; una firma alterada, otro proyecto, claves ausentes o lectura fallida no
exponen datos. El estado distingue «sin resultados» de «almacenamiento no
disponible». La funcionalidad seguirá vacía/no disponible hasta aplicar las
migraciones y cablear la escritura idempotente.
# Trabajo en revisión: jobs OpenSEO (09/10/2026)

- Migración oficial generada por el propietario y completada en `feat/openseo-project-jobs`: reserva atómica, aislamiento por proyecto y finalización transaccional de dos resultados. Validación SQL/tipos pendiente de CI.
- Pendiente: conectar las actions al ledger, verificar concurrencia entre sesiones, probar fallos de red sin liberar reservas inciertas y activar solo tras migraciones/claves alojadas comprobadas. No declarar persistencia operativa por existir el RPC.
