# Roadmap de la plataforma

Fuente de estado de este repositorio. El plan global y sus criterios están en [EXECUTION-PLAN](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/blob/main/docs/core-9/EXECUTION-PLAN.md) del Core.

El catálogo de capacidades SEO/GEO que el propietario quiere cubrir, con el estado actual, piezas parciales del Core y dependencias, está en [SEO-CAPABILITIES-BACKLOG.md](SEO-CAPABILITIES-BACKLOG.md).

## Checkpoint operativo — 09/10/2026 (Europe/Madrid)

**Estado vigente (09/10/2026). El historial de checkpoints se conserva más abajo; prevalecen este bloque y la agrupación operativa.**

#45 (límite de páginas del formulario), #46 (seis fases y estados) y #47 (checkpoint) están integradas. La prueba técnica de #45 no incluye una nueva auditoría real: Juanma aún debe revisar el panel/formulario; el guardado `legacy` anterior sí está comprobado. La CI del SHA de cierre y las decisiones pendientes constan en [HANDOFF](HANDOFF.md). Responsables: Codex entrega y detiene ediciones; Juanma valida y decide; Claude Code puede retomar tras este relevo.

Supabase Rubik `yvdgmklgwlshizzgefpv`: el propietario aplicó con su CLI las cuatro migraciones del paquete. Codex confirmó que `migration list` muestra **nueve versiones sincronizadas** y que las tres tablas privadas nuevas o modificadas (`openseo_project_connections`, `openseo_project_jobs`, `webmaster_properties`) tienen RLS sin privilegios directos para `anon`/`authenticated`. Esa evidencia de migraciones procede del propietario y del relevo; la comprobación SQL alojada del guardado del 09/10/2026 se hizo después y queda detallada en HANDOFF.

| Área | Integrado en `main` | Alojado / desplegado | Verificación real | Siguiente acción |
|---|---|---|---|---|
| OpenSEO jobs y guardado firmado | PR #27/#28/#30 | Migración de jobs aplicada; flag y HMAC en producción | **Sí, para Sarah en `legacy`:** auditId `d1899523-807d-4f02-8f1f-2bce653a43f8`, prueba visual de Juanma y SQL alojado separados en HANDOFF | No repetir la auditoría; preparar sección B de OPENSEO-ACTIVATION |
| OpenSEO multiempresa (ADR 0007): conexión, cableado, negativas, panel | PR #32–#35 | Migraciones `20261009120000` y `150000` **aplicadas** por el propietario; producción en modo `legacy` | Panel de conexión pendiente de revisión humana; 0 conexiones Sarah, 0 jobs activos; ninguna auditoría en `project` verificada | Contrastar ID/hosts y consentimiento, crear conexión owner y comprobarla antes de cualquier cambio de modo (OPENSEO-ACTIVATION, sección B) |
| Reconciliación de STARTING (ADR 0008) | PR #36 | Migración `20261009170000` **aplicada** | Solo CI y pgTAP; no ha hecho falta reconciliar nada real | Ninguna salvo que aparezca un STARTING incierto |
| Search Console y Bing, fases A y C (ADR 0009) | PR #37/#38 (`8d56e18`) | Migración `20261009180000` **aplicada**; sin OAuth, claves ni interfaz | Solo simulaciones, CI y pgTAP | Decidir el ADR 0010 (PR #40); luego OAuth (fase B) |
| Credenciales por cliente (ADR 0010) | No: PR #40 abierto | Sin migración ni variables | — | Decisión del propietario sobre la opción B |
| Previews | — | Comparten el Supabase de producción; sin variables de OpenSEO ni HMAC | — | Entorno aislado de pruebas (pendiente de decisión) |

## Agrupación operativa en seis fases

Esta tabla organiza el trabajo; no sustituye los identificadores CORE-9.x, los contratos del Core ni los ADR. Una CI verde prueba el código, no concede permisos de proveedor, presupuesto, aprobación visual ni autorización de lanzamiento. **Codex** implementa y prueba; **Juanma** decide costes/credenciales y valida los flujos visibles. HANDOFF conserva la secuencia y OPERATIONS-STATUS la evidencia operativa.

| Fase / unidad | Entregable | Dependencias | Pruebas | Criterio de cierre | Responsable | Estado y evidencia |
|---|---|---|---|---|---|---|
| **1 · Piloto — guardado OpenSEO `legacy`** (CORE-9.2/9.9) | Job e informe firmado, recuperable e idempotente | Migraciones, keyring, flag y autorización de auditoría | CI local/PR; F5, firma y reintento de Juanma; SQL por `auditId` | Dos resultados exactos, firma verificada, job terminado, sin reserva | Codex / Juanma | **Comprobado para Sarah**: `d1899523-807d-4f02-8f1f-2bce653a43f8`; evidencia visual y SQL separadas en HANDOFF/#44. No equivale al piloto completo |
| **1 · OpenSEO por proyecto** (ADR 0007/0008) | Conexión con consentimiento, selección de destino, run/follow y rollback de modo | Panel aprobado; ID y hosts contrastados; cero jobs activos; decisión separada de activación | RLS/negativas en CI; lectura de conexión `ACTIVE`; prueba alojada de destino y job con `connection_id` | No cruza proyectos ni usa el destino global en modo `project`; rollback probado | Codex / Juanma | Código y migraciones listos; **0 conexiones Sarah, producción `legacy`**. Falta validación humana/real del modo |
| **1 · Recuperación del piloto** | Exportación, rehidratación y custodia de claves verificadas | Política de retención y custodia de HMAC | Exportar/rehidratar y comprobar firmas; restauración controlada | El propietario puede recuperar historial sin perder verificación | Claude / Juanma | Parcial: exportación v2 con estado operativo y verificación offline de una copia ([RECUPERACION-PILOTO](RECUPERACION-PILOTO.md)), en PR. Pendientes: restauración en entorno aislado, custodia del keyring y prueba humana con la exportación de Sarah |
| **2 · Credenciales por cliente** (ADR 0010/#40) | Almacén cifrado ligado a organización/proyecto/proveedor; rotación, revocación y OAuth | Elección A/B/C del propietario; claves separadas de HMAC | Tampering, RLS/RPC, dos proyectos, rotación y recuperación | Ningún secreto en navegador/log/exportación; fallo cerrado | Codex / Juanma | #40 abierto: propuesta B y módulo de cifrado probado, **sin** tabla, claves ni aprobación |
| **2 · Preview y aislamiento** (CORE-9.1) | Base/Auth de pruebas separados y dos cuentas de ensayo | Elección de opción/coste; configuración owner | RLS, API y servidor: dos organizaciones, dos proyectos del mismo owner, roles y auditId ajeno | Preview no escribe en producción; acceso cruzado rechazado en alojado | Codex / Juanma | CI local cubre negativas; Preview comparte la base de producción y la prueba alojada con dos cuentas falta |
| **2 · Auth, consentimientos y gasto** (CORE-9.1/9.2) | Invitación/registro definido, recuperación, roles, cuotas y ledger por proveedor | Decisión de política de registro, retención y presupuesto | Flujos Auth, caducidad/revocación, concurrencia y presupuesto agotado | Acceso correcto y ningún consumo fuera de cuota/consentimiento | Codex / Juanma | Auth/roles básicos y consentimiento OpenSEO existen; invitaciones, recuperación, ledger y cuotas operativas pendientes |
| **3 · GSC y Bing** (CORE-9.4/9.5; ADR 0009) | Lecturas autorizadas y firmadas con contexto, estados parcial/vacío y límites | ADR 0010, OAuth/API y propiedades reales confirmadas | 401/403/429, scope, cuotas y lectura pequeña autorizada | Consulta y revocación reales sin propiedad ajena ni secretos | Codex / Juanma | Transportes/procedencia y modelo de propiedad integrados; sin credenciales ni lectura live |
| **3 · GA4/GTM, Ads, Business Profile y redes** | Inventario de permisos y capacidades; primero lecturas/informes, propuestas sin publicar | Accesos, APIs, cuotas y aprobaciones de cada proveedor; consentimiento web para etiquetas | Simulaciones, mínimos permisos, lectura autorizada y procedencia | Cada canal demuestra la capacidad concreta antes de llamarse conectado | Codex / Juanma | Inventario en PREVIEWS-E-INTEGRACIONES; sin conectores live ni gasto/campañas |
| **4 · Nueva web de Sarah** | Consentimiento, retirada, legales verificados y etiquetas/embeds condicionados | Parche/bundle y SHA256 de HANDOFF; responsable legal, proveedor y textos aprobados | Rechazo/aceptación/retirada, red, móvil/escritorio y accesibilidad | Sin tratamiento opcional antes de consentimiento; revisión humana | Codex / Juanma | Trabajo `9be1173` por recuperar; sin lanzamiento, DNS ni indexación |
| **4 · Studio y contenido** | Formularios/Studio y borradores SEO/GEO basados en el repo madre | Acceso a Sarah Studio; datos y derechos confirmados | Roles, persistencia, metadatos/canonicals y revisión editorial | Borradores respaldados y aprobados; nada publicado automáticamente | Codex / Juanma | Pendiente de auditoría del repositorio y validación editorial |
| **5 · Históricos y seguimiento** (CORE-9.6) | Snapshots, comparativas, competidores/backlinks/ranking y scheduler | Consentimiento, persistencia, cuotas, ledger y API/coste verificados | Idempotencia, backoff, cancelación, parciales y recuperación | Periodos comparables sin consumo no autorizado | Codex / Juanma | Plan/backlog; sin jobs periódicos activos |
| **6 · IA y propuestas** (CORE-9.7) | Borradores sustentados en evidencia y aprobación humana | Proveedor/modelo, privacidad, presupuesto y consentimiento | Redacción, evidencia, límites, rechazos y aprobación | Ninguna acción externa sin aprobación registrada | Codex / Juanma | Pendiente, sin IA operativa |
| **6 · IndexNow y operación comercial** (CORE-9.8/9.10) | Envío por URL aprobado, monitorización, backup/restauración, retención y piloto multicliente | Seguridad, términos, credenciales, varios clientes y aprobación por envío | Recuperación, revocación, aislamiento y seguimiento del resultado | Piloto multicliente utilizable y operación recuperable; envío ≠ indexación | Codex / Juanma | Pendiente; sin indexación ni preparación comercial declarada |

Las tres entregas no se confunden: **piloto Sarah técnicamente comprobado** requiere además de su guardado las pruebas de conexión/destino y recuperación; **primera versión multicliente utilizable** añade credenciales, aislamiento alojado, Auth, presupuestos y consentimiento; **capacidades posteriores** son las fases 3–6 que dependan de esas bases. No hay porcentaje ni fecha prometidos.

## Historial de checkpoints anteriores

- OpenSEO multiempresa: plan por fases en [ADR 0007](adr/0007-openseo-conexion-por-proyecto.md). Fase 1 (conexión por proyecto, consentimiento, revocación y pgTAP) en la rama `claude/zealous-noether-dq91ll`, sin cablear y sin aplicar en alojado. El puente sigue siendo de proyecto global.
- Checkpoint previo a #44: redeploy de activación `READY`, ID `dpl_6hzwqBBTJq4582stffdxcU8VmdGF`, SHA probado `afb5a38`, alias público asignado. En aquel momento el guardado real seguía pendiente; la prueba posterior está en el bloque vigente.
- Actualización posterior: propietario confirma aplicación de 9.2/9.3/jobs mediante CLI al destino `yvdgmklgwlshizzgefpv`; cinco versiones local/remoto sincronizadas. Se creó el flag de jobs en producción y se solicitó redeploy del SHA probado `afb5a38`. Pendientes: estado final del redeploy, escritura/recarga verificada y dos cuentas alojadas. La evidencia nueva resuelve el pendiente de migraciones de los checkpoints anteriores, sin acreditar acceso del conector ni guardado real.
- Actualización comprobada a las 10:09: PR #28 (jobs), #29 (titularidad) y #30 (guardado) integrados. CI del guardado [37902474922](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37902474922) completa en verde; producción Vercel `READY` en `afb5a3838981a78b9f126acc280fdc0138bfdae0` (`dpl_EnV1hDHWJUJkaS4rJm8NvTaDPKDf`). Configuración HMAC creada en producción; el guardado sigue apagado hasta verificar las migraciones alojadas. El acceso CLI comunicado por el propietario no cambia el conector, que aún no lista el Supabase de Rubik. Véase [OPENSEO-ACTIVATION](OPENSEO-ACTIVATION.md).
- Producción Vercel funciona; login alojado y creación de organización/proyecto comprobados por el propietario. Esto verifica un acceso real, no sustituye la prueba de aislamiento con dos cuentas alojadas.
- OpenSEO: salud correcta, autenticación verificada (`CONNECTED`), auditoría `02f2f04d-c7ea-4fe9-bb05-be1c39509938` completada, 10/10 páginas. Dos incidencias visibles en portada: `meta-description-too-long` y `title-too-long`.
- El informe mostró una página y nueve filas ocultas por el filtro. Las URLs de esas nueve filas no se han observado: no afirmar que sean dominios ajenos ni que sean todas variantes `www`.
- Histórico (anterior a la aplicación del propietario): la comprobación directa de Supabase alojado solo encontró `20260928120000` y `20260928150000`. **Sustituido:** el propietario aplicó después 9.2/9.3/jobs y su `migration list` muestra las cinco versiones sincronizadas. Desde este entorno no se han inspeccionado tablas alojadas.
- Vercel, inspección de solo lectura (09/10/2026, solo nombres): Preview tiene únicamente `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, en la **misma entrada que producción**. Las previews usan el Supabase de producción y no tienen OpenSEO ni claves HMAC. Consecuencias: una preview con una migración no aplicada en alojado falla en esa parte, y lo que se haga en una preview escribe en la base de datos de producción.
- Primer cliente comprobado: Sarah Katerina (`www.sarahkaterina.com`). La conexión de OpenSEO usa todavía un `projectId` global; no se declara el conector listo para muchos clientes.

| Etapa | Estado | Notas |
|---|---|---|
| **CORE-9.0 · Descubrimiento y base** | ✅ Fusionada por el propietario: [PR #1](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/1), merge `a34746e` en `main`. CI posterior al merge: [run 36432091098](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36432091098), en verde (verify Node 22/24 y ui) | Next.js 16, Core fijado en `20e4f4e`, estructura mobile-first con capturas ([ADR 0002](adr/0002-ux-mobile-first.md)), permisos separados de la disponibilidad, conectores todos «No conectado». El historial de CI por commit del PR #1 está en [HANDOFF](HANDOFF.md) |
| **CORE-9.1 · Identidad, organizaciones y aislamiento** | ✅ Fusionada en `main` mediante [PR #2](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/2), merge `debbb7078ea1af4931dea59d2169f8eda7a9967b`; su CI posterior pasó (verify Node 22/24 y e2e). Las migraciones CORE-9.1 y de privilegios están aplicadas en el Supabase alojado según la salida de CLI del propietario; Security Advisor: **No issues found**. | La aplicación implementa Supabase Auth con correo/contraseña, organizaciones, proyectos, pertenencias y roles del Core aislados por RLS ([ADR 0003](adr/0003-auth-supabase-y-tenancy.md)). Configuración Auth: email y confirmación activados; URL de producción y callback `/auth/confirm` configurados durante la sesión alojada. Pendiente: validar el flujo de la app contra Supabase alojado con dos cuentas, revisar correo/plantilla y cerrar registro antes de clientes. Producción y primer acceso real comprobados el 09/10/2026; OpenSEO conectado. Sin IA operativa. Fuera de fase: invitaciones, MFA de usuarios y recuperación de contraseña. |
| CORE-9.1 · Seguimiento: privilegios de `public.rls_auto_enable()` | ✅ PR #3 fusionado en `main` (`c1567d7`); CI verde en el HEAD `0429a79` ([run 36472096880](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/36472096880), verify Node 22/24 y e2e). El propietario aplicó `20260928150000_rls_auto_enable_privileges.sql` desde Supabase CLI el 28/09/2026; `migration list --linked` muestra local y remoto sincronizados, y `db advisors --linked --type security --level info` devuelve **No issues found**. Evidencia original: salida compartida por el propietario; el 09/10/2026 se comprobaron directamente las dos migraciones alojadas. | La migración revoca `EXECUTE` a PUBLIC, `anon` y `authenticated`, conserva `ensure_rls` y está probada con pgTAP (74/74), integración (9/9) y Playwright (72 pasan, 18 se omiten). Pendiente: completar pruebas manuales de Auth con dos cuentas y cerrar el registro abierto antes de dar acceso a clientes ([SETUP-SUPABASE](SETUP-SUPABASE.md) §§3, 5). |
| CORE-9.2 · Persistencia, auditoría y provenance productiva | 🟡 Unidad 1 (auditoría append-only y resultados firmados) **fusionada en `main`** ([PR #5](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/5), merge `d0cfb93`, 07/10/2026). Quedan las demás unidades de 9.2. [Core PR #19](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/pull/19) (D-28) fusionado con merge commit `8a1f808`, como antecedente del contrato de firma; el pin actual está registrado en HANDOFF. Local: verify 53/53, pgTAP 113/113, integración 18/18. Migración aplicada en alojado por el propietario el 09/10/2026 | [ADR 0004](adr/0004-persistencia-auditoria-y-provenance.md): SHA-256, forma canónica del Core, HMAC con `keyId` y rotación, encadenado e inmutabilidad en BD, exportación y borrado. Claves HMAC configuradas en Vercel (producción). Pendiente del propietario: custodia/recuperación de claves y validación legal de retención. Pendientes de 9.2: consentimientos, ledger de gasto, fact book, snapshots, acciones y borradores |
| CORE-9.3 · Importación manual | ✅ Fusionada en `main` ([PR #6](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/6), merge `2beed3a`, 07/10/2026). Normalizador Lighthouse → `rubik-import-v1` en PR aparte. **Actualización 2026-10-07:** ese PR aparte, [#7](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/7), está **fusionado** en `main` (merge `fd8ef5600b6757d995afff33655c17ee4285a227`); CI del push a `main` [run 37655703584](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37655703584): **success** (verify Node 22/24 y e2e). Local sobre `fd8ef56`: verify 84/84, pgTAP 137/137, integración 25/25. Local: verify 78/78, pgTAP 137/137, integración 24/24, Playwright 81 pasan y 24 se omiten | [ADR 0005](adr/0005-importacion-manual.md): contrato `rubik-import-v1` estricto, estados `complete`/`partial`/`failed`/`empty`, idempotencia por SHA-256, sin guardar el fichero original, auditoría firmada de cada fichero, interfaz de lista, detalle y borrado, y exportación del proyecto. Sin CSV. Migración aplicada en alojado por el propietario el 09/10/2026; uso alojado de la importación no comprobado desde aquí |
| OpenSEO · puente de auditoría técnica (unidad 3 del plan) | ✅ Primer tramo integrado y verificado contra servicio real; PR #10 y correcciones #12/#13 integrados. Auditoría completada 10/10, resultado compartido por el propietario el 09/10/2026 | [ADR 0006](adr/0006-puente-openseo.md): transporte MCP de servidor, 5 herramientas permitidas, auditoría manual sin Lighthouse. Producción limitada a 50 páginas por configuración. Un `projectId` global por servidor. Persistencia y jobs: ver fila siguiente. Enlace por proyecto: [ADR 0007](adr/0007-openseo-conexion-por-proyecto.md). Pendiente clasificar las nueve filas ocultas y separar configuración de conexión verificada en la interfaz |
| OpenSEO · jobs y guardado firmado | 🟡 PR #27/#28/#30 fusionados y desplegados; migraciones alojadas aplicadas; flag y HMAC en producción; redeploy `READY` | Un trabajo activo por proyecto, `auditId` único, incidencias y páginas en una transacción y reintento sin duplicados: probados en CI (ocho sesiones concurrentes). **Escritura alojada de Sarah verificada después mediante #44**; conexión por proyecto y otros clientes pendientes. Reconciliación de STARTING incierto integrada mediante [ADR 0008](adr/0008-reconciliacion-openseo.md) |
| OpenSEO · multicliente | 🟡 Fases 1, 3, 4 y 5 y la reconciliación (ADR 0008) fusionadas en `main` mediante #32–#36, el 09/10/2026. Migraciones `20261009120000`–`170000` aplicadas en alojado; producción en `legacy` | [ADR 0007](adr/0007-openseo-conexion-por-proyecto.md). Producción sigue con `OPENSEO_PROJECT_ID` global; conexión por proyecto sin verificar |
| CORE-9.4 · Search Console (lectura) | 🟡 Fases A (transporte) y C (propiedad por proyecto con RLS) fusionadas mediante PR #37/#38 (`8d56e18`); migración `20261009180000` aplicada; sin OAuth ni conexión | [ADR 0009](adr/0009-search-console-bing-lectura.md). OAuth bloqueado por la decisión del almacén de secretos y por el cliente OAuth del propietario |
| CORE-9.5 · Bing Webmaster (lectura) | 🟡 Fases A y C fusionadas (PR #37/#38); sin clave ni conexión | [ADR 0009](adr/0009-search-console-bing-lectura.md) |
| CORE-9.6 · Observación y borradores | ⏳ | |
| CORE-9.7 · IA asistida | ⏳ | El propietario elige proveedor y modelo |
| CORE-9.8 · IndexNow | ⏳ | Aprobación humana por envío |
| CORE-9.9 · Piloto Sarah Katerina | 🟡 Primera auditoría real autorizada y completada; piloto global pendiente | Revisar informe completo, persistencia, exportación/recuperación, contratos del host y acceso por cliente; no equivale a comercialización ni a aprobación automática de publicaciones |
| CORE-9.10 · Preparación comercial | ⏳ | Hosting compatible con uso comercial ([HOSTING](HOSTING.md)) |

Ninguna etapa se cierra sin sus criterios demostrados, con CI en verde y la revisión del propietario.

## Implementación integrada en esta continuación

Selección del ID y límite de longitud, bloqueo de envío mientras hay peticiones activas, distinción del informe anterior, contador separado de páginas/incidencias ocultas y aceptación del compañero `www`/dominio base solo si está autorizado explícitamente. Banner y metadata corregidos. Integrado y desplegado mediante PR #14 con CI completa. No se declara que las nueve filas reales ya se hayan recuperado.

Docker local ausente: pgTAP, integración y e2e completas se verificaron en CI. El propietario aplicó en alojado las migraciones 9.2/9.3/jobs; falta verificar escritura y lectura firmada con una auditoría nueva. Las claves de firma están configuradas en Vercel; su uso por el proceso desplegado y recuperación/custodia no se dan por comprobados solo por existir esa configuración.

## Próximas unidades, en orden de dependencia

| Prioridad | Unidad | Entrega verificable | Dependencias / límites |
|---|---|---|---|
| 1 | Estabilizar el flujo OpenSEO | PR #14 integrado y desplegado con CI completa: selección del ID nuevo, controles de envío en la consola, www/apex explícito y contadores separados; pruebas negativas de dominio | No ampliar automáticamente el scope a todos los subdominios. No lanzar auditorías nuevas para probar cambios de interfaz |
| 2 | Persistencia del informe y un trabajo activo por proyecto | Código integrado/desplegado mediante PR #27/#28/#30: historial verificado, guardado transaccional firmado, idempotencia y adquisición atómica; CI completa con concurrencia entre ocho sesiones | Migraciones alojadas, flag y redeploy `READY` hechos. Pendiente: prueba alojada de escritura/recarga/reintento con una auditoría nueva del propietario. Keyring configurado en Vercel; faltan prueba del firmante y custodia/recuperación. No anunciar guardado operativo |
| 3 | Conectores y consentimiento por cliente | Plan por fases en [ADR 0007](adr/0007-openseo-conexion-por-proyecto.md). Fase 1 (conexión por proyecto bajo RLS, consentimiento, revocación, pgTAP) en rama; fases 2–7: credencial por cliente, UI, cableado run/follow, negativas, migración de Sarah y prueba alojada | Sustituir el proyecto global; secretos siguen en servidor. Consentimientos y ledger de gasto de 9.2 |
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
## Jobs y guardado OpenSEO integrados (09/10/2026)

- PR #28 fusionado en `248850a`: migración oficial, reserva atómica, aislamiento por proyecto y finalización transaccional de dos resultados; CI completa [37900821388](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37900821388), SQL/tipos y ocho sesiones concurrentes comprobados.
- PR #30 fusionado en `afb5a38`: actions conectadas al ledger, botón explícito de guardado, consulta ligada al proyecto y captura de los originales del Core. CI completa [37902474922](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37902474922), con 210 tests de aplicación; firma/escritura/lectura verificada y reintento sin duplicados probados contra Supabase local. Producción READY en ese merge.
- Timeout/respuesta ambigua conserva STARTING; no hay expiración automática ni adopción de auditorías históricas. La reconciliación administrativa y el mapping OpenSEO por cliente quedan pendientes.
- Migraciones oficiales aplicadas en alojado por el propietario; flag de jobs y redeploy `READY`. Las claves HMAC ya están configuradas en Vercel; no se ha demostrado todavía una escritura alojada ni el aislamiento con dos cuentas alojadas.
