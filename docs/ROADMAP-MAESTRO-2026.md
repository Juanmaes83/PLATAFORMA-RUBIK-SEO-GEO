# ROADMAP MAESTRO · Rubik SEO/GEO

**Gate de aceptación integral incorporado el 18/10/2026:** [protocolo de dos pasadas para H1 y H2](GATE-ACEPTACION-INTEGRAL-H1-H2-20261018.md). Primero, tras #129 y U03 esencial, un único recorrido ficticio alojado desde login hasta exportación/verificación/restauración y limpieza; después, U04 con Sarah y aceptación humana. Esta prueba de producto completa faltaba como criterio ejecutable explícito. Sigue PENDIENTE: los PASS locales y parciales alojados no cierran H1/H2. La exportación firmada se realiza solo en el entorno expresamente autorizado, sin habilitar escritor en Preview por conveniencia.

**Estado vigente, 18/10/2026:** [Estado de los tres niveles y plan de cierre](ESTADO-TRES-NIVELES-Y-CIERRE-20261018.md). main@b99893e incorpora el checkpoint documental #134 después del merge de #133 en 42e8bcf. #129 sigue Draft en b68244f: U02 aislada en alcance verificado, U03 Data API parcial (12/12 reportados para tres actores), navegador y roles restantes pendientes. H1/H2 abiertos; N2 primeros incrementos en main sin acreditación alojada. La tabla de bloques más abajo conserva el plan original y cortes históricos; usar el estado vigente enlazado para decidir trabajo y responsables.


**CORTE HISTÓRICO · 18/10/2026 · N2-14 manual integrado.** #133 fusionada en `main@42e8bcfa2a3d6c446700b04a801613f999764c8d`; #118 cerrada sin fusionar como diseño sustituido. Informe por proyecto de solo lectura e imprimible, con acceso por membresía y procedencia de cada fuente; sin descarga firmada del informe ni automatizaciones. Vercel Production figura READY (`dpl_4f6RuJPLAsZBLv2MdSPM6HQdnPsw`) y `/api/salud` confirmó `yvdgmklgwlshizzgefpv`; esto no acredita N2 con datos reales. Revisión independiente del HEAD previo a dos correcciones de texto: verify 592 PASS/1 SKIP, lint, tipos y build; tras ellas, prueba dirigida del informe 12/12. Claude informó para el SHA funcional `0fcb778`: pgTAP 870/870, integración 148 PASS/2 SKIP, E2E 184 PASS/62 SKIP, modo Contenidos/GEO apagado 8 PASS/4 SKIP. GitHub Actions bloqueada por facturación. N2 alojado sin acreditar ni activar; H1/H2 BLOQUEADOS. Prioridad: U02 → U03 (#129 en trabajo de Codex), exportación/restauración ficticia alojadas y después Sarah bajo U04 y decisiones R1/retención.

**CORTE VIGENTE · 17/10/2026 · integración conjunta N2-12/13.** #131 fusionada en `main@cf16aca1eb456b4b4af04c7ba06a787c21d1d8c6`; #116 y #117 cerradas como ramas fuente sin fusionarlas aparte. Production desplegó ese SHA READY; `/api/salud` respondió 200 y confirmó `yvdgmklgwlshizzgefpv`. En revisión independiente del HEAD de #131 (`5fdbfdc`) `npm run verify` dio 580 PASS/1 SKIP, lint, tipos y build PASS. Claude informó para el SHA funcional `6163c13`: integración 145/145, pgTAP 870/870, E2E 170 PASS/58 SKIP/0 FAIL, rollback y restauración v4 doble en destino propio. No se aplicaron aquí migraciones N2 alojadas ni se activaron sus banderas. H1/H2 siguen abiertos. R1 (exportación sin instantánea transaccional) y retención/borrado de las 11 FK de autoría son condiciones de activación con datos reales; GitHub Actions no ejecutó jobs por facturación. Codex continúa U02/U03 en #129, que debe reconciliarse con el nuevo `main`; después, N2-14 funcional (#118 solo diseño) y operación N1-07/08.

**CORTE HISTÓRICO · 17/10/2026 · integración de Medición N2-10.** La PR #119 está fusionada en `main@46a6113fa4b6fd1ddc1614cfd99164ff55aaa656`. Despliegue Production `dpl_ug9sCBswRo7q8iB184s8ZdApfvcx` READY y `/api/salud` 200 con Supabase `yvdgmklgwlshizzgefpv`. En la integración local `npm run verify` dio 538 PASS/1 SKIP, lint, tipos y build PASS; se preservó la corrección TLS. Medición es lectura de capturas existentes: este merge no añadió migraciones ni acredita H1/H2. Claude debe rebasar su integración N2-12/13 desde este SHA y ejecutar los gates completos antes de abrir una PR combinada; Codex continúa U02/U03 en #129 sin usar Production para Preview. El nuevo proyecto Preview `rhnnplewqsekrnaousyl` aún no está acreditado ni enlazado a Vercel; no habilitar sesiones por su mera existencia. #129 continúa Draft; este expediente documental se integra mediante #128. GitHub Actions no ejecuta los jobs por facturación.

**CORTE HISTÓRICO · 17/10/2026 12:18 UTC · después de la ventana del escritor N1.** Repositorio y Vercel Production están en `main@f5afc09833eee77ab605abda3a2ec9d4a1e80a92`; despliegue `dpl_3UsSnD3hXnnHuNCtATK3i9BnFKB7` READY. `/api/salud` devuelve 200 y confirma Supabase `yvdgmklgwlshizzgefpv`. El proyecto `jlrppmpopaodpxtqtwmn` pertenece a Funding OS y queda excluido. Ver [identidad de entornos](SUPABASE-IDENTIDAD-ENTORNOS-20261017.md).

**N1 alojado — PASS acotado, no cierre de H1.** En el ref correcto constan 27 migraciones hasta `20261015210000`. `rubik_audit_writer` quedó LOGIN/NOINHERIT, sin BYPASSRLS ni SUPERUSER, con URL Sensitive solo en Vercel Production. La ventana acreditó TLS, identidad/permisos, firma y cadena HMAC, reintento idempotente y outbox usando fixtures ficticios: 2/2 pruebas dirigidas. Las banderas Google/OpenSEO se configuraron en `false` en Production y no se invocaron los proveedores; Vercel protege los valores frente a lectura posterior, por lo que su valor efectivo no está acreditado de forma independiente. El respaldo cifrado se restauró dentro del alcance ensayado (38/38 filas, 27/27 versiones); DPAPI depende del perfil Windows y no constituye snapshot global ni restauración completa de Auth/Storage/Realtime. La evidencia y límites están en [N1-GATES-ALOJADOS-20261017](n1-cierre/N1-GATES-ALOJADOS-20261017.md), publicada en Draft #128.

**H1 sigue BLOQUEADO.** Faltan U03 con JWT auténticos y matriz A1/A2/B1, controles positivos/negativos y limpieza; después, exportación firmada por el endpoint HTTP real y restauración/idempotencia con datos ficticios. La ventana actual usó claves ficticias y dobles de actor: no acredita anillo de firma Production ni identidad de sesión real. Sarah requiere autorización U04 y la decisión R1; no se utiliza en U03.

**H2 sigue BLOQUEADO.** Además de cerrar los gates de H1, requiere Preview realmente aislada (U02), controles entre entornos y las decisiones/procedimientos comerciales pendientes (incluidas R3, R4 y R7). GitHub Actions continúa bloqueada por facturación; Vercel READY no equivale a CI ni prueba funcional.

**Cola N2 verificada en GitHub el 17/10:** #120, #121 y #119 están integradas en `main`; #116 y #117 siguen Draft como ramas fuente de la integración conjunta de Claude, aún sin PR combinada ni migraciones alojadas; #118 es solo diseño. No aplicar migraciones N2 alojadas ni habilitar las funciones hasta revisar esquema, exportación y recuperación combinadas. Orden: integrar N2-12/13 conjuntamente con exportación/restauración v4 y pruebas completas sobre el nuevo `main`; después hacer funcional N2-14. Cerrar las ramas fuente solo al quedar la sustitución acreditada en `main`.

**Responsabilidades inmediatas (corrección 17/10):** U03 alojada requiere el proyecto Preview aislado U02 según [protocolo N1-05](N1-05-PROTOCOLO-ALOJADO-20261015.md), dos identidades ficticias controladas, JWT reales y limpieza atribuible. No ejecutar la matriz con escrituras en Production sin una autorización expresa distinta del propietario que resuelva el riesgo de datos existentes. Codex prepara U02 y el arnés alojado con controles de destino y limpieza, sin reutilizar el arnés E2E local contra Production; Claude avanza la integración N2 en su worktree independiente; ChatGPT audita gates y dependencias; Juanma decide U02, cuentas y, después, U04/Sarah. El valor de las banderas Google/OpenSEO de Vercel Sensitive no es legible después de configurarlas: documentar la acción y el despliegue, y excluir llamadas a proveedores de U03; no bloquear una matriz limitada a Auth/RLS por intentar leer ese valor. No repetir las 11 migraciones N1.

**CORTE HISTÓRICO · 16/10/2026, posterior a #120.** `main@9365387af16f79af8fc6f88cffed77b7b4725cdc`; [#120](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/120) fusionada con N2-09, N2-11 y recuperación SEO compatible. Vercel Production desplegó ese SHA y está READY; esto no acredita esquema, permisos, escritor ni flujos alojados. `npm run verify` sobre el HEAD fusionado de #120 (`5e64b48`): 523 PASS/1 SKIP, lint, tipos y build PASS. Las baterías locales comunicadas para su código fueron integración 123/123, pgTAP 734/734 y E2E 157 PASS/50 SKIP/0 FAIL; Actions continúa bloqueada por facturación.

**CORTE HISTÓRICO · 16/10/2026, previo a #120, GitHub y terminal local contrastados.** `main@b6555eaa8190ed8668c501813fda01e06c75163c`; PR [#113](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/113) está fusionada. La PR [#120](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/120), rama `codex/n2-integration-post113-20261016`, HEAD de código probado `b3596500f1d5cd867d2e006c05d2454677d7843c`, integra N2-09 (#114) y N2-11 (#115) con exportación/recuperación firmada SEO v3. Continúa OPEN/Draft, no fusionada.

**Gates locales del propietario en Windows, sobre el SHA exacto `b3596500f1d5cd867d2e006c05d2454677d7843c`:** `npm run verify` PASS (512/512 unitarias, 57 archivos, pin, secretos, lint, TypeScript y build); integración PASS (119/119, 18 archivos); pgTAP PASS (718/718, 25 archivos); E2E PASS (157 PASS / 50 SKIP / 0 FAIL, 207 casos; limpieza: 11 usuarios y 2 organizaciones ficticios propios, sin residuos). El stack usado es `rubik-n2-integration-20261016` (60321/60322); no se informó reset ni migración en esta pasada. Evidencia local, no CI ni validación alojada.

| Línea | Estado verificado al corte |
|---|---|
| N1-02/S2 y N1-03/S1 | Código fusionado en main; migraciones/validación alojadas y condiciones operativas pendientes. |
| N1-04 | #109 fusionada; Actions bloqueada por facturación y Preview aislada no acreditada. |
| N1-05/N1-06 | #113 fusionada; auditoría y recuperación siguen sin prueba alojada con Sarah. |
| N2-09/N2-11 | Código integrado en #120 y probado localmente; no está en main. #114/#115 están absorbidas y no se fusionan por separado. |
| N2-10 | #119 OPEN/Draft; rebasar/reconciliar tras cerrar #120. |
| N2-12/N2-13 | #116/#117 OPEN/Draft; tablas aún no cubiertas por exportación/recuperación combinada. |
| N2-14 | #118 OPEN/Draft; solo diseño/contrato, aún no funcional. |

**H1 sigue parcial; H2 bloqueado.** No hay migraciones N2 aplicadas en Supabase alojado. Antes de fusionar código que activa rutas SEO/Competidores hay que resolver compatibilidad con el esquema ausente y el efecto de despliegue de `main`. Esta PR no autoriza cambios en Production, migraciones alojadas, secretos ni proveedores. U02/U03/U04 y las decisiones R1/R3/R4/R7 siguen pendientes. Los checkpoints que siguen describen historia, no el estado actual.

**CHECKPOINT N1-03/S1 · 15/10/2026, 16:20 UTC:** borrado de `provider_results` con efecto+recibo atómicos y firma reintentable en la misma PR Draft #104; integración dirigida 16/16 y pgTAP de procedencia 41/41 PASS, batería completa del nuevo cambio pendiente. Falta traza durable con proveedores externos, retención y gates alojados; no declarar S1/H2 cerrado. Ver [S1-IMPLEMENTACION-LOCAL-20261015.md](S1-IMPLEMENTACION-LOCAL-20261015.md).

**CHECKPOINT N1-03/S1 · 15/10/2026, 16:04 UTC:** `provider_results` deja de aceptar INSERT JWT en la migración local S1; escritura dedicada de resultados Core firmados con autorización SQL e idempotencia en PR Draft #104. `verify:s1-local` completo PASS: verify 405/405, integración 88/88, pgTAP 603/603 y Playwright 145 PASS/44 SKIP/0 FAIL. Falta vínculo duradero con efectos externos y cerrar otros gates; no declarar S1 ni H2 completo, no aplicar alojado ni fusionar. Ver [S1-IMPLEMENTACION-LOCAL-20261015.md](S1-IMPLEMENTACION-LOCAL-20261015.md).

**CHECKPOINT N1-03/S1 · 15/10/2026, 15:49 UTC:** importaciones con efecto+recibo atómicos y reintento de firma en PR Draft #104. `verify:s1-local` completo PASS: verify 405/405, integración 87/87, pgTAP 598/598 y Playwright 145 PASS/44 SKIP/0 FAIL. `provider_results`, otros efectos y gates alojados impiden cerrar S1. Ver [S1-IMPLEMENTACION-LOCAL-20261015.md](S1-IMPLEMENTACION-LOCAL-20261015.md).

**CHECKPOINT N1-03/S1 · 15/10/2026, 15:35 UTC:** implementación local en curso desde `main@520e4119`, PR Draft #104; gate SQL aislado, verify 405/405, integración 86/86, pgTAP 594/594 y segunda E2E **145 PASS / 44 SKIP / 0 FAIL**. El primer ledger fallido sigue preservado. El bloque **no está completo**: faltan `provider_results`, atomicidad de efectos, negativos adicionales y alerta de outbox. Rollback local de contención probado. GitHub Actions no inicia jobs por facturación; se usa verificación local manual aislada. Ver [S1-IMPLEMENTACION-LOCAL-20261015.md](S1-IMPLEMENTACION-LOCAL-20261015.md). No hay migración alojada en este checkpoint.

**DECISIÓN VIGENTE — 15/10/2026:** U01 aprobada **para desarrollar y probar localmente** N1-03/S1 con escritor SQL dedicado de mínimo privilegio, firma en servidor, transacciones por proyecto, outbox para revocaciones y `provider_results` como subbloque. Ver [DECISION-U01-APROBACION-20261015.md](DECISION-U01-APROBACION-20261015.md). Próxima ejecución: S1; si falla el transporte/pooling seguro, alternativa a decidir. **U02, migraciones alojadas, claves reales y Production NO aprobadas**. Textos inferiores «U01 pendiente» son históricos.


**CORTE DE PLANIFICACIÓN 15/10/2026 post #100/#101:** S2 fusionado como código (PR #100, `aca06a08`), pero no desplegado en Supabase alojado. S1 tiene ADR propuesta aprobable en PR #101 (`09e8ab7`), **sin decisión U01 todavía**; N1-04 tiene plan de CI/Preview sin permiso U02. Los checkpoints inferiores quedan como histórico; evidencias actualizadas en [CONTROL-PROYECTO](CONTROL-PROYECTO.md).


**Roadmap Maestro aprobado por el propietario · 15/10/2026.**
**Base actualizada de referencia:** main c425ed3c6a554c12f7dc2e99f430bd6ea6060d62 (#85, #86, #95, #97 y #98 integradas).
**Estado:** planificación aprobada; no certifica funcionalidades ni despliegues. El estado operativo verificable por SHA lo mantiene CONTROL-PROYECTO. El registro de evidencias y el estado técnico por SHA permanecen en [CONTROL-PROYECTO](CONTROL-PROYECTO.md). La cronología permanece en [ROADMAP histórico](ROADMAP.md) y [HANDOFF](HANDOFF.md).

**Checkpoint N1-02, 15/10/2026:** S2 PROBADO LOCAL en rama desde `main@3eba9d0`; pendiente
[PR #100](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/100) OPEN / Draft,
revisión, fusión y autorización separada de migración alojada. Verify 403/403,
integración 84/84, pgTAP 581/581, rollback 10/10, E2E 145 PASS/44 SKIP/0 FAIL. Detalle operativo
en CONTROL-PROYECTO. N1-03/S1 preparado solo como [plan para U01](S1-PLAN-ESCRITOR-CONFIABLE-20261015.md).

## 1. Norte, entregables y alcance

Construir Rubik SEO/GEO como plataforma segura, multicliente, verificable y operable comercialmente para Rubik Sota, con Sarah como primer piloto controlado; después ampliar medición, conectores, inteligencia competitiva, GEO, IA y automatizaciones; finalmente elegir verticales y modelos de negocio adicionales.

**Tres hitos diferentes:**
- **H1 · Piloto Sarah técnicamente comprobado:** sesión y permisos, flujo Google/OpenSEO autorizado, evidencia auténtica, reintento, exportación/verificación y recuperación probadas en el entorno correcto. El código local por sí solo no cierra H1.
- **H2 · Primera versión multicliente utilizable comercialmente:** H1 + correcciones S1/S2, negativas alojadas con dos cuentas, infraestructura de pruebas aislada, procedimientos de operación y condiciones de hosting/seguridad/retención apropiadas. Requiere aceptación humana.
- **H3 · Plataforma ampliada:** niveles 2 y 3 entregados progresivamente. No es condición para H2. La lista de deseos del catálogo no equivale a un compromiso de implementar absolutamente todas sus variantes.

**Inventario de planificación:** ocho bloques de cierre (N1-01 a N1-08; **N1-01 y el código de N1-02 integrados**, seis bloques restantes por desarrollar, además de gates alojados pendientes para N1-02), seis dominios funcionales de expansión (N2-09 a N2-14) y cinco verticales/modelos sujetos a validación de negocio (N3-15 a N3-19): **19 unidades de dirección**, no 19 PRs ni estimación de horas. Cada unidad podrá dividirse en PRs cortas si su complejidad o los riesgos lo aconsejan.

## 2. Regla de responsabilidad y autoridad

| Actor | Hace | No hace sin autorización adicional |
|---|---|---|
| **Codex · ejecutor técnico** | Lee AGENTS.md y las fuentes, investiga el repositorio, propone solución, implementa en worktree propio, prueba en bucle, corrige, documenta evidencia, publica PR Draft, prepara siguiente lote | Fusionar por su cuenta; reset/borrados que afecten a fixtures ajenos; tocar Supabase alojado, claves, cuentas o variables Production; gastar cuota real, activar proveedores o enviar acciones externas |
| **ChatGPT · dirección técnica y control** | Audita dependencias, seguridad, código y PR; confronta evidencias con GitHub, Vercel y documentación; prioriza; prepara prompts/planes; actualiza documentación en rama separada; coordina gates y puede realizar merge tras revisión y autorización aplicable | Certificar pruebas no ejecutadas; confundir despliegue READY con CI; cambiar secretos o producción sin aprobación; trabajar sobre worktree local ajeno |
| **Propietario · producto y operación** | Aprueba alcance, arquitectura sensible, gasto, proveedor y uso comercial; custodia claves; autoriza migraciones, ensayos alojados, usuarios, políticas y publicación; valida UX y piloto | Delegar tácitamente una escritura o gasto en entornos reales: cada autorización operativa debe ser concreta |

**Fusión:** PR de producto activa → Codex completa varios ciclos internos → auditoría externa del HEAD exacto → aprobación/fusión → checkpoint y actualización de main → siguiente bloque. Se permite documentación/arquitectura preparatoria en paralelo si no altera el código de la PR activa. Si CI de GitHub está bloqueada por facturación, declarar esa limitación y exigir evidencia local suficiente; no falsear estado CI.

## 3. Semáforo de progreso (sin porcentajes inventados)

**Por bloque:** CANDIDATO / PLANIFICADO / EN EJECUCIÓN / PR EN REVISIÓN / INTEGRADO LOCAL / VALIDADO ALOJADO / ACEPTADO / BLOQUEADO.
**Por capacidad:** DISEÑO / CONTRATO / IMPLEMENTADO / PROBADO LOCAL / PROBADO REAL / OPERATIVO. Un mismo bloque puede incluir componentes en estados distintos; registrar el más restrictivo relevante para su aceptación.

**Estado de referencia del 15/10/2026:** #87 (manifiesto firmado), #88 (protección Preview), #85 (matriz Grupo 3 local), #86 (reintentos de Sarah y selección OpenSEO), #97 (fixtures Playwright seguros) y #98 (checkpoint documental) están **fusionadas**. Codex reportó, en la rama #97 y Supabase **local**, verify 397/397, integración 78/78, pgTAP 532/532 y dos ejecuciones Playwright de 145 PASS / 44 SKIP / 0 FAIL cada una. Los fixtures preexistentes se preservaron. CI sigue bloqueada por facturación; S1 y S2 no están mitigados; la matriz alojada de dos cuentas no está acreditada. La migración Google recovery alojada sigue pendiente y OpenSEO Production continúa en modo legacy según el corte documentado.

## 4. NIVEL 1 · Seguridad, piloto y primera versión multicliente (P0/P1)

**Definición de terminado de N1:** H1 y H2 acreditados, no solo PRs fusionadas. El orden indica dependencia técnica; algunas decisiones humanas pueden prepararse antes.

| ID | Prioridad | Bloque y objetivo concreto | Depende de | Ejecución / revisión / aprobación | Gate mínimo y resultado |
|---|---|---|---|---|---|
| **N1-01** | P0 | **E2E seguro — INTEGRADO EN #97**: fixtures propios por ejecución, pruebas de preservación y doble E2E, sin borrados por sufijo | main actual; Supabase solo local | **Codex / ChatGPT / —** | **Cerrado para alcance local**: #97 `main@17001160`; verify 397/397, integración 78/78, pgTAP 532/532, doble Playwright 145 PASS/44 SKIP. No prueba alojada |
| **N1-02** | P0 | **S2 · Consentimiento de membresía:** retirar INSERT directo en organización/proyecto, incluida concesión por columna; adaptar fixtures a invitación aceptada | N1-01 para E2E; SQL de S2 | **Codex / ChatGPT / propietario para alojado** | Owner no añade usuario ajeno; aceptación y altas legítimas funcionan; pruebas RLS, invitaciones, integración, E2E y rollback local; migración alojada diferida |
| **N1-03** | P0 | **S1 · Auditoría confiable:** prohibir HMAC arbitrario y sustituir todos los escritores antes de revocar INSERT; atomicidad, firma en servidor, privilegio mínimo | Decisión del propietario de identidad escritora/secretos; revisión S1; N1-02 integrado | **Codex / ChatGPT / propietario decide arquitectura y credencial** | Writer confiable con authz, firma, secuencia íntegra y concurrencia; rechazo de INSERT directo; pruebas de restauración, revocación y rollback; ninguna clave en navegador |
| **N1-04** | P0 | **CI y separación de entornos:** restablecer Actions, habilitar Preview con Supabase aislado o declarar bloqueo seguro, probar cookies/sesiones sin producción | N1-01; elección de entorno y coste | **Codex / ChatGPT / propietario configura cuentas y plan** | CI ejecutada o limitación explícita; Preview no puede leer/escribir datos reales; JWT negativos acreditados en entorno aislado |
| **N1-05** | P0 | **Grupo 3 alojado:** dos usuarios de prueba controlados, A1/A2/B1, RLS/RPC, no existencia revelada, retirada de acceso y limpieza | N1-02, N1-03, N1-04, protocolo y autorización operativa | **Codex prepara / ChatGPT audita / propietario ejecuta-autoriza** | Matriz negativa alojada por actor y proyecto + evidencia; sin proveedores ni datos reales de cliente; plan de limpieza; incidente bloquea H2 |
| **N1-06** | P0 | **Recuperación real Sarah:** migración Google recovery, exportación íntegra firmada, verificador local con keyring custodio, reintento controlado y recuperación | N1-03, plan respaldo, migración preparada y autorización puntual | **Codex instrumenta / ChatGPT contrasta / propietario opera** | Versiones alojadas verificadas; export verificable offline sin exponer anillo; recuperación y replay contrastados; procedimiento de rollback; H1 parcial |
| **N1-07** | P0/P1 | **OpenSEO por proyecto y gasto:** conexión/hosts por cliente, run/follow aislado, presupuestos, consentimiento; decidir si ADR 0010 se necesita antes de clientes adicionales | N1-05, validación N1-06, decisión modos/credenciales/precio | **Codex / ChatGPT / propietario activa-aprueba** | Legacy no se mezcla con project; casos negativos y reales autorizados; rollback project→legacy; límites de presupuesto; decisión registrada de #40 |
| **N1-08** | P0/P1 | **Release comercial y UX:** registro/correo, contraseñas filtradas, política retención/borrado, backups/custodia, hosting legalmente apto, dominio, UI móvil/a11y, soporte/incidencias | Gates anteriores, políticas y plan elegidos | **Codex prepara / ChatGPT verifica / propietario acepta y configura** | E2E móvil/escritorio, Auth de extremo a extremo, plan backup+restore probado, condiciones operativas, revisión de Sarah, aceptación humana de H1/H2 |

**Fronteras:** La fase alojada no se inicia con variables de Preview que apunten al Supabase de Production. Las pruebas locales solo dan aprobación de integración técnica, nunca permiso para aplicar migraciones. No ejecutar db reset, limpieza masiva de usuarios, envíos de invitaciones ni consultas facturables sin autorización precisa. N1-07 puede documentar una alternativa sin credenciales propias si el piloto usa OpenSEO; la primera versión genéricamente multicliente necesitará una decisión explícita del ADR 0010, no una suposición.

### Cola inmediata y criterio de traspaso · corte 16/10/2026

1. **Cerrar revisión de #120 por SHA `b3596500f1d5cd867d2e006c05d2454677d7843c`.** Los gates locales completos están registrados arriba y en [CONTROL-PROYECTO](CONTROL-PROYECTO.md). La PR sigue Draft hasta completar auditoría externa y resolver el despliegue compatible con el esquema alojado ausente.
2. **No fusionar #114 ni #115 por separado.** Su contenido se consolidó en #120. Tras integrar #120 y verificar GitHub, cerrarlas como sustituidas, conservando enlaces e historial.
3. **Siguiente integración de producto, después de #120:** rebasar #119 (medición) sobre main actualizado, auditarla y probarla; luego integrar #116 (contenidos) y #117 (GEO) junto con su exportación/recuperación firmada, manteniendo acciones de auditoría aditivas y contratos v1/v2 compatibles. No usar sus tablas con datos reales antes de completar el respaldo/recuperación.
4. **N2-14 funcional:** desarrollar el primer informe manual, de solo lectura, una vez disponibles sus fuentes N2; #118 es solo diseño/contrato. No añadir scheduler, envíos, IndexNow ni consultas externas en este primer incremento.
5. **N1 alojado:** U02/U03/U04, R1/R3/R4/R7 y plan de respaldo/rollback son carriles separados, requieren decisiones y ventanas concretas del propietario. H1/H2 no se cierran por pruebas locales.

La política permanente prohíbe abrir otra PR de producto mientras #120 siga abierta; se permite análisis y arquitectura independientes, sin tocar su worktree. La aceptación previa de merges a main no autoriza migraciones alojadas ni operaciones en Production.

### Acciones concretas reservadas al propietario

| Clave | Decisión o acción | Antes de |
|---|---|---|
| U01 | Autorizar estrategia escritor S1, custodio de clave y despliegue conjunto | N1-03 |
| U02 | Elegir Preview aislada y resolver facturación GitHub Actions / hosting y posibles costes | N1-04 |
| U03 | Autorizar ventana, usuarios ficticios, alcance y limpieza de prueba RLS alojada | N1-05 |
| U04 | Revisar respaldo, consentir migración 20261012130000 y verificar exportación real con su anillo fuera de chat/repo | N1-06 |
| U05 | Decidir activación modo OpenSEO project, presupuesto real, fuentes/credenciales por cliente ADR 0010 | N1-07 |
| U06 | Configurar Auth/SMTP, protección contraseñas, retención, plan comercial y aprobación UX | N1-08 |

Para J1–J13 históricos, usar [relevo de tareas del propietario](relevos/CONTINUACION-NUEVA-CUENTA.md) con revisión de vigencia antes de cada paso. No llamar «hecho» a lo que el documento histórico sugería sin confirmación actual.

## 5. NIVEL 2 · Seis dominios funcionales de expansión (P1/P2, tras H2 o pilotos aislados)

**Estado vigente 16/10/2026:** el orden de la tabla siguiente expresa dependencias de producto, no prueba de integración. N2-09/11 están en #120 OPEN/Draft; N2-10 en #119 OPEN/Draft; N2-12 y N2-13 en #116/#117 OPEN/Draft; N2-14 en #118 OPEN/Draft, solo diseño. Ninguno de estos módulos está en `main` salvo las capacidades preexistentes de medición indicadas en sus respectivos contratos. Los HEAD/base y estados se mantienen en [CONTROL-PROYECTO](CONTROL-PROYECTO.md). No activar módulos que requieren tablas alojadas todavía ausentes.


Las seis unidades son **agrupaciones de gestión propuestas**, no las seis fases históricas numeradas del ROADMAP. No abrirlas todas a la vez ni convertir un catálogo en publicidad de capacidades reales.

| ID | Orden sugerido | Dominio | Primer incremento verificable (sin gasto no autorizado) | Dependencias / responsable |
|---|---|---|---|---|
| **N2-09** | 1 | **SEO técnico, On-Page y keywords** | Inventario de indexabilidad/canonicals/hreflang/estructura, CWV/Lighthouse si fuente válida, informes sobre metadata y links; primeras consultas keyword con método y datos explícitos | H2 y contratos Core; **Codex implementa, ChatGPT audita, propietario prioriza fuentes** |
| **N2-10** | 2 | **Conectores y medición real** | Reforzar GSC/GA4 ya parcialmente operativos vía OpenSEO; Bing read-only; después GTM/Ads/Business Profile/redes solo cuando el alcance y APIs se aprueben | ADR 0010 si requiere OAuth propio, permisos y cuotas; **Codex / ChatGPT / propietario credenciales** |
| **N2-11** | 3 | **Inteligencia de competidores, backlinks y SERP/rank tracking** | Contratos y costes → consultas manuales multicliente → persistencia/provenance → histórico; tracking con contexto país/idioma/dispositivo y presupuesto aprobado | #11 histórico, [backlog §15](SEO-CAPABILITIES-BACKLOG.md); **Codex / ChatGPT / propietario presupuesto** |
| **N2-12** | 4 | **Estrategia de contenidos, SEO local y reputación** | Gaps y clústeres, briefs con fuentes y auditoría SEO local (NAP/GBP cuando conectado); propuestas sin autopublicación | Fuentes y política editorial; **Codex / ChatGPT / propietario aprueba vertical y copys** |
| **N2-13** | 5 | **GEO e IA asistida con evidencia** | Metodología de medición real por motor/consulta/fecha, rastreo de menciones verificables, propuestas basadas en fuentes y aprobación humana; sin inventar visibilidad | Contratos Core, privacidad, proveedores/modelos/coste; **Codex / ChatGPT / propietario elige servicios** |
| **N2-14** | 6 | **Automatización, IndexNow, reporting y escala** | Scheduler acotado, identidad de ejecutor, cuotas, cancelación, retries, reportes y entregas; IndexNow por URL aprobada con auditoría | #78 ADR 0023, N1 seguridad, presupuesto y consentimiento; **Codex / ChatGPT / propietario autoriza acciones externas** |

**Criterio de nivel 2:** cada capacidad solo se anuncia «operativa» si hay fuente autorizada, medición reproducible, aislamiento, presupuesto, logs de procedencia, negativo de permisos, recuperación y revisión UI. Se puede lanzar un incremento manual antes del scheduler, no al revés.

## 6. NIVEL 3 · Cinco líneas de expansión del producto (P3, no comprometidas)

Son **hipótesis comerciales** extraídas del catálogo, no funcionalidades aprobadas ni requisitos del lanzamiento H2. Para cada una: demanda/casos de uso, costes, datos y dependencias, solución de bajo coste, benchmark, propuesta de valor, decisión continuar/descartar; después plan de implementación. Una línea puede descartarse sin incumplir el roadmap.

| ID | Línea de negocio | Descubrimiento / MVP posible | Decisor |
|---|---|---|---|
| **N3-15** | **E-commerce SEO** | Análisis de productos/colecciones, schema, navegación facetada, feeds y Merchant Center solo con autorización; prueba en tienda ficticia | Propietario selecciona vertical; Codex construye solo tras aprobar |
| **N3-16** | **Afiliación SEO** | Research, comparadores, disclosure y medición de atribución; prohibidos precios/coberturas inventadas y tácticas contrarias a políticas | Propietario aprueba modelo económico y obligaciones; ChatGPT evalúa |
| **N3-17** | **Directorios, foros y reputación** | Inventarios de citas/directorios y escucha con fuentes; recomendaciones, sin creación masiva de cuentas, spam ni publicaciones automáticas | Propietario decide vertical, permisos y participación |
| **N3-18** | **SEO para SaaS y captación del propio Rubik** | Landings por solución, documentación indexable, comparativas responsables, funnels SEO→demo y atribución | Propietario decide packaging e imagen; Codex implementa web/medición con alcance separado |
| **N3-19** | **Monetización / modelos comerciales** | Tarifas por cliente, suscripción, licencias, leads, informes premium y métricas unitarias; simulación no es previsión | Propietario decide pricing, negocio, compliance y canal |

**Puerta de financiación:** no presupuestar desarrollo de N3 por entusiasmo técnico. Se prioriza por potencial de ingresos, demanda verificable, reutilización de Core, coste de proveedor, cumplimiento y capacidad de mantenimiento. El catálogo contiene además SEO Off-Page, investigación de palabras clave y SERP; ya están mapeados a N2, no duplicados artificialmente como verticales.

## 7. Cruce completo con el roadmap y catálogo históricos

| Fuente o categoría histórica | Destino organizativo | Regla |
|---|---|---|
| ROADMAP fase 1: OpenSEO legacy, recuperación, piloto Sarah | N1-06 y N1-07 | Estado real del piloto; verificar H1 |
| ROADMAP fase 2: credenciales, Preview, Auth, consentimiento y gasto | N1-02 a N1-05, N1-07, N1-08 | La seguridad es prerequisito comercial, no backlog optativo |
| ROADMAP fase 3: GSC/Bing, GA4/GTM/Ads/GBP/redes | N2-10, con validaciones de Sarah en N1-06 | Parte GSC/GA4 existe vía OpenSEO; no inventar demás conexiones |
| ROADMAP fase 4: web/Studio de Sarah | **FUERA DE ESTE REPO** | Mantener en frente correspondiente; no computar como bloque pendiente aquí |
| ROADMAP fase 5: históricos, comparativas, competidores, ranking, scheduler | N2-11 y N2-14 | Comparación básica ya existe; resto incremental |
| ROADMAP fase 6: IA, IndexNow y operación comercial | N2-13 y N2-14; seguridad comercial N1-08 | Actions externas requieren aprobación |
| Catálogo §1 técnico, §2 On-Page, §4 keywords, §9 SERP | N2-09, N2-11 | Distinguir herramienta de auditoría y dato live |
| Catálogo §3 Off-Page, §5 contenidos, §6 local | N2-11 y N2-12 | No automatizar outreach o construcción de enlaces de riesgo |
| Catálogo §7 GEO/IA | N2-13 | Medición verificable por fuente/fecha |
| Catálogo §8 e-commerce, §10 SaaS, §11 foros/directorios, §12 afiliación, §13 monetización | N3-15, N3-18, N3-17, N3-16, N3-19 | Oportunidades, no obligaciones del MVP |
| Catálogo §14 referencias SaaS/GEO; §15 competidores/backlinks/rank tracking fases A-D | N2-13 / N3-18; N2-11 | No perder investigación existente |

**PR legadas:** #11 (plan competidores) alimenta N2-11; #40 (ADR 0010/criptografía) alimenta N1-07; #78 (ADR 0023) alimenta N2-14. No mergearlas directamente desde bases antiguas: auditar y extraer ideas/código en PR nuevas. #9 y #79 ya se cerraron como históricas, sin borrar ramas.

## 8. Priorización y estimación basada en evidencia

**P0 — seguridad y cierre:** N1-01 a N1-06. **P1 — activación y medición:** N1-07/08, N2-09/10/11. **P2 — valor diferencial:** N2-12/13/14. **P3 — oportunidades:** N3-15 a N3-19.

En cada revisión puntuar de 1 a 5: impacto de cliente/ingresos, reducción de riesgo, dependencia que desbloquea, reuso y esfuerzo/coste. **Puntuaciones no fijadas** hasta estimación y evidencia de Codex; no presentar fechas ni porcentajes sin capacidad real. El tiempo de trabajo técnico y el tiempo de permisos/operaciones humanas se planifican por separado.

## 9. Contrato de ejecución autónoma por lote

1. **Entrada:** ID del bloque, alcance aceptado, repositorios, rama/main exactos, dependencias, límites de producción y gate de salida.
2. **Análisis:** inspeccionar reglas Next.js/AGENTS, migraciones, contratos Core, código y pruebas; localizar efectos colaterales. No modificar worktrees ajenos.
3. **Loop de Codex:** implementar → comprobar → corregir → reejecutar; ampliar tests negativos, reportar incertidumbres; no parar por cada error reversible.
4. **Publicación:** una PR Draft de código por lote funcional, con SHA, diffs, suite local, pgTAP, E2E si seguro, riesgo, rollback y decisiones externas. No fusionar.
5. **Auditoría externa:** ChatGPT contrasta GitHub, estado de HEAD, alcance, criticidad y evidencias. El propietario decide riesgos, arquitectura y activaciones reales.
6. **Integración controlada:** merge aprobado por SHA verificado; actualizar CONTROL-PROYECTO con estado **integrado**; esperar despliegue por el SHA correcto. No iniciar segunda PR de producto antes de cerrar la anterior (salvo autorización coordinada).
7. **Salida:** actualizar este mapa SOLO si cambia el alcance/prioridad/dependencias, mantener evidencia operativa en CONTROL-PROYECTO, y lanzar siguiente bloque desde main actualizado.

**Plantilla de informe:** bloque/objetivo; HEAD PR y SHA main; archivos; antes/después; comandos con resultado y entorno; pruebas no ejecutadas y por qué; superficies de seguridad; coste/provider calls; migraciones locales/alojadas; UX revisada/pediente; riesgos; rollback; aceptación humana; próximo bloque.

## 10. Registro de riesgos y decisiones abiertas

- **R1 CRÍTICO S1/S2:** todavía no mitigados en producto según documentación del corte. Bloquean afirmar H2 seguro.
- **R2 E2E:** corregido localmente e integrado en #97; propiedad por ejecución y limpieza atómica. Mantener negativas y preservar recibos si una interrupción impide limpiar; nunca volver al barrido por sufijo.
- **R3 ENTORNOS:** Preview comparte Supabase Production; bloqueada la sesión Preview por #88, pero no es una base aislada. No ensayar con cuentas/efectos reales ahí.
- **R4 CI:** GitHub Actions no inicia jobs por facturación; evidencia local no reemplaza CI.
- **R5 ALOJADO:** Grupo 3, migración de recuperación Google, export real y modo project requieren pruebas/decisiones del propietario.
- **R6 PROVEEDORES:** costes OpenSEO/Google, scopes OAuth, datos GEO, retención, propiedad de datos y credenciales por cliente deben acreditarse antes de ampliar funciones.
- **R7 OPERACIÓN:** plan de hosting comercial, política de registro, email reset, contraseñas filtradas, backups/restore y retención.
- **R8 DOCUMENTACIÓN:** ROADMAP y relevos históricos contienen cifras antiguas; preferir CONTROL-PROYECTO para estado de trabajo y este documento **una vez aprobado** para alcance. Evitar dos fuentes de verdad.

## 11. Mantenimiento documental y aprobación

**Aprobado el 15/10/2026:** la PR #96 formaliza este plan. Su fusión no modifica el código de S2 ni configura servicios alojados. Añadir un enlace estable a este roadmap maestro desde README, CONTROL-PROYECTO y cabecera del ROADMAP histórico en **una PR documental corta** desde el main resultante. Roles: ROADMAP-MAESTRO = alcance/orden/arquitectura de programas; CONTROL-PROYECTO = estado verificable actual/último SHA; ROADMAP histórico/HANDOFF = decisiones y evidencias pasadas; SEO-CAPABILITIES-BACKLOG = catálogo de ideas/no equivalencia a producto. Actualizar la tabla de estados al acabar cada integración, nunca una vez al trimestre.

**Fuentes consultadas:** [CONTROL-PROYECTO](CONTROL-PROYECTO.md), [ROADMAP](ROADMAP.md), [SEO-CAPABILITIES-BACKLOG](SEO-CAPABILITIES-BACKLOG.md), [Seguridad S1/S2](SECURITY-AUDIT-MEMBERSHIP-HMAC-20261015.md), [Decisiones ADR0010 y Preview](DECISIONES-ADR0010-Y-PREVIEW.md), [Relevo de tareas del propietario](relevos/CONTINUACION-NUEVA-CUENTA.md); arquitectura Core referida desde el roadmap. Los 19 grupos son una **clasificación propuesta**, no un recuento literal del roadmap histórico.
