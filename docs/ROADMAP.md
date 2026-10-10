# Roadmap de la plataforma

## Estado vigente y siguientes entregables — 10/10/2026

Las 16 migraciones constan aplicadas en Rubik `yvdgmklgwlshizzgefpv`. Sarah tiene una conexión OpenSEO `ACTIVE`; las capturas reales GSC y GA4 del 10/10 están `STORED/OK`, con procedencia vinculada al proyecto. Juanma verificó sus detalles y firmas en la interfaz. La comprobación SQL, separada de la evidencia visual, está en [OPERATIONS-STATUS](OPERATIONS-STATUS.md); ninguna prueba un reintento real ni aislamiento alojado entre dos cuentas. El rastreo continúa en `legacy`, sin prueba de run/follow en `project`.

Siguientes entregables: exportar y verificar los informes existentes; ensayar su restauración, incluido el estado operativo Google; probar reintento con la misma clave sin nueva consulta; completar aislamiento alojado y preparar activación reversible de `project` para aprobación específica. Las comparativas de capturas guardadas pueden avanzar sin proveedor. Credenciales por cliente (ADR 0010) y Preview aislada siguen pendientes de decisión. Web, Studio, contenido y lanzamiento de Sarah son otro frente, no una fase completada de Rubik.

### Evidencia de partida (detalle operativo en OPERATIONS-STATUS)

Consulta directa de solo lectura a Rubik `yvdgmklgwlshizzgefpv`, posterior a las capturas visuales de Juanma. Aunque el listado del conector omite este proyecto, execute_sql permitió consultar su base; no se deduce ausencia de acceso del listado.

- GSC `45f2c4c7-fdbd-4700-a940-1cbb8916cfce` y GA4 `e9140843-e880-41c4-afd1-0426dd80bd66`: exactamente una captura STORED por proveedor, resultados OK.
- Ambos resultados pertenecen al proyecto Sarah `b8d00961-1141-4741-908a-54d2e3bf343a` y su organización. Proveedor, connectionId y propertyBindingId de la procedencia coinciden con el ledger.
- Cero grupos duplicados por (project_id, idempotency_key); cero result_id compartidos por varias capturas; cero capturas STORED sin resultado. No se ejecutó un reintento real: ausencia actual de duplicados no demuestra por sí sola idempotencia ante reenvío.
- Una conexión OpenSEO ACTIVE de Sarah; cero jobs STARTING/SYNCING. Historial de migraciones: 16 versiones.
- La firma criptográfica fue verificada en la aplicación según capturas de Juanma; SQL comprueba relaciones, no sustituye HMAC. Tampoco prueba acceso negativo con una segunda cuenta.
- Rastreo permanece en legacy; lectura Google usa conexión por proyecto, pero no valida el run/follow de auditorías en project.

Siguiente unidad: comprobar reintento sin consulta adicional con la misma clave (en entorno aislado o procedimiento explícitamente seguro), exportación/verificación de los dos informes existentes y completar aislamiento alojado. Luego activación controlada de project, custodia/credenciales y Preview aislada según decisiones documentadas. Pueden avanzar sin proveedor: comparativas Google, pruebas de recuperación, diseño de conectores y preparación de observación. Ads/Business Profile/redes, Bing, ranking/backlinks y IA no se consideran operativos.


## Checkpoint alojado — 10/10/2026

Juanma aportó la salida de su CLI: proyecto enlazado `yvdgmklgwlshizzgefpv`, siete migraciones aplicadas sin errores y **16 versiones Local/Remote sincronizadas**, hasta `20261012120000`. Evidencia recibida en «Texto pegado(5).txt». No es una consulta directa realizada por este agente.

Los advisors muestran ocho avisos INFO de RLS sin políticas en tablas privadas y un WARN de protección de contraseñas filtradas desactivada. Los INFO coinciden con el diseño RPC-only; no prueban por sí solos los privilegios efectivos ni el aislamiento alojado. El WARN permanece pendiente.

La [CI posterior de main@57e2d97](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/38036496878) terminó completa en verde. Evidencia posterior del propietario (10/10/2026, 11:30–11:36 CEST): conexión OpenSEO de Sarah ACTIVE, host autorizado `www.sarahkaterina.com`; propiedades GSC `https://sarahkaterina.es/` y GA4 `properties/519462393` asociadas. Guardó `OPENSEO_GOOGLE_READS_ENABLED=true` solo en Production y redesplegó `main@57e2d97`; la captura Vercel muestra Ready/Latest y la aplicación «Lecturas de Google activadas». Ambas capturas reales figuran OK en el historial y sus detalles muestran «Firma verificada» y «Completa», periodo 2026-09-10–2026-10-07. GA4 devuelve páginas de www.sarahkaterina.com; GSC dos páginas de sarahkaterina.es con 4 y 16 impresiones y cero clics. Son propiedades distintas: no atribuir el informe GSC al dominio .com. Evidencia visual aportada por Juanma; no comprobación SQL de este agente.

Siguiente: comprobar por SQL de solo lectura la vinculación de estas capturas al proyecto y la ausencia de duplicados; completar aislamiento alojado entre clientes y recuperación. No repetir llamadas para documentar. El rastreo permanece en `legacy`: esta prueba Google no valida ni activa el encaminamiento de auditorías en modo `project`.


Fuente de estado de este repositorio. El plan global y sus criterios están en [EXECUTION-PLAN](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/blob/main/docs/core-9/EXECUTION-PLAN.md) del Core.

El catálogo de capacidades SEO/GEO que el propietario quiere cubrir, con el estado actual, piezas parciales del Core y dependencias, está en [SEO-CAPABILITIES-BACKLOG.md](SEO-CAPABILITIES-BACKLOG.md).

## Checkpoint histórico — 10/10/2026, revisión de main@aea14ab

**Corte histórico; el checkpoint alojado superior incorpora la evidencia posterior.** #57–#66 están integrados; solo permanecen abiertos #40 y los PR documentales históricos #9/#11 en la comprobación de GitHub. La [CI de main@aea14abadedd04539ddd0e08b697f72411237378](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/38009409329) terminó completa en verde. No se comprobó aquí un despliegue Vercel ni acceso alojado.

- **Google (#66): código integrado** para asociación, captura manual GSC/GA4, resultado firmado e idempotente, historial y detalle en `/proyectos/<org>/<proyecto>/google`. La evidencia del flujo es local/CI con proveedor simulado. Las frases anteriores «sin caller», «no guarda capturas» o «sin UI» describen los cortes #60–#62, no este estado.
- **Acceso y recuperación (#59/#63):** invitaciones por enlace de un solo uso, retirada de acceso, ensayo de restauración e inventario integrados; custodia e aislamiento alojado requieren completar los pasos del propietario.
- **Seguridad (#64/#65):** parche de dependencias integrado y prueba de borrado de organización sin huérfanos; #66 amplía el inventario a 15 tablas. La auditoría de dependencias local figura en HANDOFF; esta revisión no la volvió a ejecutar.
- **Alojado pendiente:** asociación real de Sarah, lectura Google real, validación humana y migraciones nuevas. No se aplicó ninguna migración, no se cambió ningún flag ni se llamó a proveedor durante esta revisión.
- **Credenciales por cliente:** #40 conserva el ADR 0010 y un módulo de cifrado probado en su SHA, pero está basado en `main@8d56e18` y no es fusionable con el `main` vigente. No está integrado; tras decidir la custodia debe rescatarse en una rama limpia y volver a verificarse.
- **Migraciones preparadas, no aplicadas:** [MIGRACIONES-PENDIENTES-20261010](MIGRACIONES-PENDIENTES-20261010.md) fija las nueve versiones de partida documentadas, las siete pendientes, el dry-run esperado, las condiciones de parada, la comprobación posterior y el rollback. La aplicación exige volver a comprobar el historial remoto y una copia de seguridad; esta revisión no accedió al alojado.
- **Próximos cierres:** aplicar y verificar el esquema solo por el propietario; después validar interfaz y aislamiento sin proveedor, y realizar el flujo real únicamente con autorización concreta. Ampliación de informes y comparativas continúa como trabajo de desarrollo independiente.
- **Alcance:** web nueva/antigua, Studio, contenido y consentimiento web de Sarah siguen trasladados a otro frente, no completados. Sarah permanece como piloto de Rubik.

## Historial — entregas #59–#62 (10/10/2026)

**Entrega E integrada (Claude, en paralelo a Codex).** [#59](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/59) se integró en `main@ac70b1dfa7fe3e1a6da9419f96ceef63e752fffd` tras [#62](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/62) (`main@22a83eb`, [CI posterior verde](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/38003705280)). Su última CI de PR (`d61c630`, [38001107067](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/38001107067)) fue completa y verde; la [CI posterior de main](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/38005005297) es la del merge. Incluye: invitaciones por enlace de un solo uso (ADR 0020), ensayo de restauración que falla cerrado ante conflictos, retirada de acceso sin borrar la cuenta (ADR 0021, decisión D3) e inventario de datos en solo lectura, más los documentos de custodia de claves, aislamiento alojado y retención. Migraciones `20261012090000`, `20261012100000` y `20261012110000` **sin aplicar en alojado**. Decisiones de Juanma del 09/10: K1, K2, A1–A4, D1, D3 y D4; pendientes K3, K4, D2, D5 y D6. Detalle y validación humana en [CLAUDE-PARALELO](relevos/CLAUDE-PARALELO.md).

Plataforma #61 integró en `main@536a1035704ed7ee889c97f4a4c999f7e29817ff` el servicio de lectura manual simulada GSC/GA4, sin caller alojado. Su CI del PR y la posterior de main terminaron verdes. Core #28 integró en `main@2aaf12700542e4499cfdd27a491d072abb635ca2` el contexto de origen firmable (CI de PR y main verdes). [PR #62](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/62), integrado después en `main@22a83eb` con CI posterior verde, actualiza el pin y pasa el contexto resuelto al Core; aún no guarda capturas. Persistencia, idempotencia, historial, detalle, exportación y UI continúan pendientes; no hay lectura Google real ni migración nueva aplicada en alojado.

Plataforma #60 incorporó en `main@cc5bba4d6ccaf3ebcf68b765429ad583efc27758` la asociación explícita, revocable y aislada de propiedad GSC/GA4 por proyecto y conexión OpenSEO. Su [CI del PR](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/38000342768) y la [CI posterior de main](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/38000964284) terminaron verdes en sus SHA exactos. La migración `20261010160000` solo se probó en Supabase local desechable, no se aplicó en alojado. La siguiente rama `feat/google-manual-read` prepara una lectura manual GSC/GA4 con proveedor simulado y límites finitos, sin pantalla, persistencia ni lectura real. Por tanto el flujo consultar → guardar → recuperar → verificar → exportar sigue pendiente; no se declara capacidad operativa.

Core #27 se corrigió e integró en `main@18fd72cc72640b7138198504d07b86f317816059`. Plataforma #57 se integró en `83d5fd0`; #58, con el pin del Core corregido, validación semántica/paginación GA4, catálogo por capacidad y separación del frente web de Sarah, se integró en `main@739627df166ba9b493a75968535f80fa9965dfab`. Su [CI posterior de main](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/actions/runs/37980479269) terminó verde. Google sigue sin lectura ni persistencia real desde Rubik; los flags de catálogo y lectura están apagados. La fase histórica 4 se trasladó al frente web de Sarah, **no se completó**; no bloquea el desarrollo funcional de Rubik.

**Asociación integrada, aún no alojada:** la propiedad GSC/GA4 se vincula explícita y revocablemente al proyecto y conexión OpenSEO. Modela GSC `.es`, dominio rastreado `.com` y GA4 por separado sin inferir equivalencia entre TLD. Reutiliza la conexión OpenSEO y deja `webmaster_properties` intacta, pues representa la vía GSC/Bing de dominio coincidente. Ninguna asociación real de Sarah se creó. Falta revalidar al guardar y persistir la captura firmada e idempotente.

## Historial: relevo Codex al abrir #58 — 09/10/2026

Juanma confirma que Claude está detenido y autoriza a Codex a asumir el código. Base remota comprobada: `main@f0c304cedf98053b2519af5904e89c11d763c33a`; #55/#56 integradas. #57 GSC abierto (`64b2db6`, CI completa verde); Core #27 GA4 abierto (`b25ba92`, CI verde y 346/346 reproducidas). Rama Codex `codex/google-integrations-review`, continuación apilada sobre #57, pendiente de revisión e integración.

- GSC: límites de 1–4 dimensiones, validación de filas/cobertura y comprobación de tipos/límites del catálogo, sin consultas reales.
- GA4: primer transporte `organic_landing_pages`, propiedad/ventana/paginación comprobadas antes de emitir y firmar; muestras y cobertura limitada producen `PARTIAL`. Core fijado al SHA propuesto en #27: **dependencia pendiente de integración**, no contrato ya fusionado.
- Catálogo: «Compatible en el catálogo» no acredita OAuth, propiedad, permisos ni activación. Paginación incompleta/cíclica rechazada.
- Invitaciones: solo migración, pgTAP y tipos en remoto `feat/invitaciones-proyecto@8414e32`; interfaz descrita por Claude no encontrada en GitHub ni en este entorno. Buscar el árbol local original antes de recrearla.
- Techo 10 €/mes/proyecto decidido; equivalencia a créditos todavía bloqueada por tarifa/moneda/impuestos/cambio de la instancia alojada. Todas las herramientas de pago continúan bloqueadas.
- **Web nueva, Studio, consentimiento y adaptación legacy de Sarah: EXCLUIDOS de este roadmap operativo por decisión de Juanma. Se gestionan en otro frente. No son pendientes de Rubik ni se consideran terminados por esta exclusión.** Sarah continúa como proyecto piloto de Rubik.

No hay nuevas migraciones alojadas, conexión Sarah, cambio de modo, secretos ni llamadas reales. Validación humana pendiente. El historial de abajo se conserva como evidencia y no sustituye este relevo.

## Checkpoint histórico — 09/10/2026 (Europe/Madrid)

**Corte histórico:** las cifras y pendientes de este bloque corresponden al 09/10. El estado vigente del 10/10 está al inicio de este documento y en OPERATIONS-STATUS; en particular, no volver a crear la conexión de Sarah ni aplicar las migraciones ya registradas.

#49–#54 integradas (`main@9e8f818`, producción `READY` en `dpl_EbGrPjMmzkgAndoLp6f9erY55uGX`): vigencia de informes, exportación v2 y verificación offline, lista previa al modo `project`, capacidades de OpenSEO, presupuesto y registro de consumo (migración `20261010090000` **sin aplicar** en alojado) y recuperación de contraseña (falta la plantilla alojada «Reset password»). Comparación de dos capturas firmadas de incidencias integrada en #55. Producción sigue en `legacy`, sin conexión de Sarah. Decisiones pendientes de Juanma y responsables del relevo en [HANDOFF](HANDOFF.md).

**Decisiones del propietario (09/10/2026):** (1) Search Console y GA4 del piloto Sarah **vía OpenSEO**; Juanma hace la conexión Google desde OpenSEO. (2) Techo de **gasto variable de 10 € por mes natural y proyecto** (techo, no objetivo); suscripciones y costes fijos aparte. Permiten implementar y probar con simulaciones; **no** autorizan llamadas de pago, conexión de Sarah en Rubik, modo `project`, secretos ni servicios nuevos. Detalle y datos pendientes de confirmar: [CONSUMO-Y-PRESUPUESTO](CONSUMO-Y-PRESUPUESTO.md).

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

El estado alojado de las unidades actualizadas aquí procede de la evidencia visual de Juanma y de SQL de solo lectura; no implica recuperación completa ni reintento real.

| Fase / unidad | Entregable | Dependencias | Pruebas | Criterio de cierre | Responsable | Estado y evidencia |
|---|---|---|---|---|---|---|
| **1 · Piloto — guardado OpenSEO `legacy`** (CORE-9.2/9.9) | Job e informe firmado, recuperable e idempotente | Migraciones, keyring, flag y autorización de auditoría | CI local/PR; F5, firma y reintento de Juanma; SQL por `auditId` | Dos resultados exactos, firma verificada, job terminado, sin reserva | Codex / Juanma | **Comprobado para Sarah**: `d1899523-807d-4f02-8f1f-2bce653a43f8`; evidencia visual y SQL separadas en HANDOFF/#44. No equivale al piloto completo |
| **1 · Recuperación del piloto** | Exportación, rehidratación y custodia de claves verificadas | Política de retención y custodia de HMAC | Exportar/rehidratar y comprobar firmas; restauración controlada | El propietario puede recuperar historial sin perder verificación | Claude / Juanma | Parcial: exportación v2 y verificación offline ([RECUPERACION-PILOTO](RECUPERACION-PILOTO.md), #50). **Ensayo de restauración integrado en #59** ([RECUPERACION-ENSAYO](RECUPERACION-ENSAYO.md)): restaura solo lo que falta, falla cerrado ante conflictos y no toca membresías existentes; probado en local y CI, nunca en alojado. **Custodia decidida** (K1: dos copias; K2: rotación anual e inmediata ante incidencia, [CUSTODIA-CLAVES](CUSTODIA-CLAVES.md)); la ejecuta Juanma. **Estado Google exportable y restaurable** (migración `20261012130000`, rama `claude/recuperacion-google`): conexiones, asociaciones y capturas guardadas, solo si cuadran con lo firmado; probado en local y CI, sin aplicar en alojado. Pendientes: K3/K4, aplicar la migración y prueba humana con la exportación de Sarah |
| **1 · OpenSEO por proyecto** (ADR 0007/0008) | Conexión con consentimiento, selección de destino, run/follow y rollback de modo | Panel aprobado; ID y hosts contrastados; cero jobs activos; decisión separada de activación | RLS/negativas en CI; lectura de conexión `ACTIVE`; prueba alojada de destino y job con `connection_id` | No cruza proyectos ni usa el destino global en modo `project`; rollback probado | Claude / Juanma | Código y migraciones listos; **1 conexión ACTIVE de Sarah comprobada por SQL; producción `legacy`**. Lista previa de solo lectura en el panel (#51). Falta validación humana/real del modo |
| **2 · Credenciales por cliente** (ADR 0010/#40) | Almacén cifrado ligado a organización/proyecto/proveedor; rotación, revocación y OAuth | Elección A/B/C del propietario; claves separadas de HMAC | Tampering, RLS/RPC, dos proyectos, rotación y recuperación | Ningún secreto en navegador/log/exportación; fallo cerrado | Codex / Juanma | #40 abierto: propuesta B y módulo de cifrado probado, **sin** tabla, claves ni aprobación |
| **2 · Preview y aislamiento** (CORE-9.1) | Base/Auth de pruebas separados y dos cuentas de ensayo | Elección de opción/coste; configuración owner | RLS, API y servidor: dos organizaciones, dos proyectos del mismo owner, roles y auditId ajeno | Preview no escribe en producción; acceso cruzado rechazado en alojado | Codex / Juanma | CI local cubre negativas; Preview comparte la base de producción. **Prueba alojada con dos cuentas autorizada por Juanma (A1–A4)**, antes del primer cliente y ejecutada por él: filas 1–4 ya, 5–7 tras aplicar las migraciones de invitaciones ([AISLAMIENTO-ALOJADO-GUION](AISLAMIENTO-ALOJADO-GUION.md)). No ejecutada |
| **2 · Auth, consentimientos y gasto** (CORE-9.1/9.2) | Invitación/registro definido, recuperación, roles, cuotas y ledger por proveedor | Decisión de política de registro, retención y presupuesto | Flujos Auth, caducidad/revocación, concurrencia y presupuesto agotado | Acceso correcto y ningún consumo fuera de cuota/consentimiento | Codex / Juanma | Auth/roles básicos, recuperación de contraseña #54, invitaciones y retirada de acceso #59, presupuesto y consumo #56 implementados. Las migraciones de estas unidades constan entre las 16 aplicadas en alojado. Techo de gasto variable: 10 € por mes natural y proyecto; no autoriza consumo. Falta prueba alojada con dos cuentas, plantilla de correo de recuperación y decisiones de retención D2/D5/D6 ([RETENCION-Y-BORRADO](RETENCION-Y-BORRADO.md)). Registro abierto sin cambio de política; no se envían invitaciones reales desde la plataforma. |
| **3 · GSC y Bing** (CORE-9.4/9.5; ADR 0009/0022) | Lecturas autorizadas y firmadas con contexto, estados parcial/vacío y límites | Propiedad y conexión autorizadas; API/cuotas. ADR 0010 solo para la vía que custodie credenciales en Rubik, no para GSC/GA4 vía OpenSEO | 401/403/429, scope, cuotas y lectura pequeña autorizada | Consulta y revocación reales sin propiedad ajena ni secretos | Codex / Juanma | GSC y GA4 de Sarah vía OpenSEO: conexión y propiedades asociadas, flag de lectura activo solo en Production, una captura real `STORED/OK` por proveedor el 10/10, detalles con firma verificada por Juanma y vinculación confirmada por SQL. GSC `.es` y GA4 `.com` son scopes distintos. El reintento real, recuperación operativa e aislamiento alojado siguen pendientes. Bing no tiene lectura real acreditada. Véase [GSC-GA4-OPENSEO](GSC-GA4-OPENSEO.md) y OPERATIONS-STATUS. |
| **3 · GA4/GTM, Ads, Business Profile y redes** | Inventario de permisos y capacidades; primero lecturas/informes, propuestas sin publicar | Accesos, APIs, cuotas y aprobaciones de cada proveedor; consentimiento web solo cuando una etiqueta o tratamiento lo requiera, en el frente que gestiona el sitio | Simulaciones, mínimos permisos, lectura autorizada y procedencia | Cada canal demuestra la capacidad concreta antes de llamarse conectado | Codex / Juanma | GA4: primer informe orgánico real de Sarah vía OpenSEO, descrito en la fila anterior. GTM, Ads, Business Profile y redes: inventario en PREVIEWS-E-INTEGRACIONES, sin capacidad operativa acreditada, gasto ni campañas. |
| **4 · Trasladada a otro frente (identificador histórico)** | Web nueva y adaptación de web antigua de Sarah, Studio, contenido, consentimiento web, DNS, lanzamiento e indexación | Se gestionan fuera de este repositorio | No forman parte de las pruebas de Rubik | No computan como terminadas ni pendientes de Rubik | Responsable del frente separado | **Trasladada, no completada.** Se conserva el número 4 para no renumerar las fases ni borrar el historial; las capacidades genéricas de Rubik permanecen en las fases 3, 5 y 6 |
| **5 · Históricos y seguimiento** (CORE-9.6) | Snapshots, comparativas, competidores/backlinks/ranking y scheduler | Consentimiento, persistencia, cuotas, ledger y API/coste verificados | Idempotencia, backoff, cancelación, parciales y recuperación | Periodos comparables sin consumo no autorizado | Codex / Juanma | Primer tramo integrado en #55: comparación local de dos capturas firmadas de incidencias (nuevas, que ya no aparecen, cambios de severidad, reservas si es parcial). Segundo tramo (#73, 10/10/2026): comparación de dos capturas Google guardadas de la misma propiedad, con bloqueo si fuente, propiedad o dimensiones difieren y avisos de periodo, paginación, `PARTIAL` y `EMPTY`. Capturas periódicas: diseño y planificador simulado (rama `claude/capturas-periodicas`, [CAPTURAS-PERIODICAS](CAPTURAS-PERIODICAS.md)), sin activar; falta la identidad del ejecutor, la migración, la cuota y el cron |
| **6 · IA y propuestas** (CORE-9.7) | Borradores sustentados en evidencia y aprobación humana | Proveedor/modelo, privacidad, presupuesto y consentimiento | Redacción, evidencia, límites, rechazos y aprobación | Ninguna acción externa sin aprobación registrada | Codex / Juanma | Pendiente, sin IA operativa |
| **6 · IndexNow y operación comercial** (CORE-9.8/9.10) | Envío por URL aprobado, monitorización, backup/restauración, retención y piloto multicliente | Seguridad, términos, credenciales, varios clientes y aprobación por envío | Recuperación, revocación, aislamiento y seguimiento del resultado | Piloto multicliente utilizable y operación recuperable; envío ≠ indexación | Codex / Juanma | Pendiente; sin indexación ni preparación comercial declarada |

Las tres entregas no se confunden: **piloto Sarah técnicamente comprobado** requiere además de su guardado las pruebas de conexión/destino y recuperación; **primera versión multicliente utilizable** añade credenciales, aislamiento alojado, Auth, presupuestos y consentimiento; **capacidades posteriores de Rubik** son las fases 3, 5 y 6 que dependan de esas bases. La fase histórica 4 se trasladó a otro frente, no se completó. No hay porcentaje ni fecha prometidos.

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
