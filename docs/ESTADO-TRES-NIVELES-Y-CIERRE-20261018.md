# Estado de los tres niveles y plan de cierre · Rubik SEO/GEO

Corte: 18/10/2026, 23:20 CEST. Repositorio: [Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO). Este documento es el punto de entrada vigente; las tablas y cortes fechados del [Roadmap Maestro](ROADMAP-MAESTRO-2026.md) conservan historia y alcance original, pero no sustituyen los estados de este corte.

## Meta y criterio de terminado

Rubik SEO/GEO debe servir como plataforma segura y multicliente operable comercialmente por Rubik Sota, con Sarah Katerina como primer piloto controlado. Cada resultado utilizado para decidir debe conservar fuente, fecha, permisos y evidencia; exportación y recuperación deben funcionar en el entorno correcto. Después se amplían capacidades SEO, GEO y automatizaciones sin afirmar que una integración local ya opera en alojado. Las cinco líneas N3 son oportunidades de negocio que pueden aprobarse o descartarse: no son requisitos del primer lanzamiento.

| Hito | Qué acredita | Estado |
|---|---|---|
| **H1 · Piloto Sarah técnicamente comprobado** | Sesión y permisos alojados, flujo autorizado, evidencia auténtica, reintento, exportación HTTP firmada y verificación fuera de línea, restauración/idempotencia, [ensayo integral ficticio y aceptación del piloto Sarah](GATE-ACEPTACION-INTEGRAL-H1-H2-20261018.md) | **ABIERTO**. Escritor N1 alojado PASS acotado; faltan los flujos funcionales completos y U04 para Sarah |
| **H2 · Primera versión multicliente comercial** | H1 y sus dos pasadas de aceptación más S1/S2 alojados con negativos de actores, Preview aislada, operación, seguridad, soporte, hosting, retención, gasto y aceptación humana del release | **ABIERTO**. U02 aislada en alcance comprobado; U03 parcial; operación comercial pendiente |
| **H3 · Expansión** | Entregas N2 acreditadas por módulo y evaluación N3 según demanda y economía | **PARCIAL COMO CÓDIGO**. Primeros incrementos N2 en main; sin acreditación N2 alojada ni compromiso N3 |

## Evidencia y versión

- GitHub: main en b99893e8fbc59f265ce61f40dbdc2baab071f69a. El SHA 42e8bcfa2a3d6c446700b04a801613f999764c8d es el merge de #133; b99893e es exactamente un commit documental posterior (#134). No son bases divergentes.
- [#129](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/129) sigue OPEN/Draft, HEAD b68244f752bbfc38993c5b0d8b8f95b085a73872, base b99893e, mergeable en GitHub. «Mergeable» no acredita revisión funcional. El código de U03 probado localmente es 661f47d; el Preview READY citado en la PR sirve ac5a5ff, un SHA anterior.
- El propietario reportó [12/12 controles alojados Data API/RLS/RPC/JWT](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/blob/codex/u02-preview-isolation-20261017/docs/U03-PREVIEW-MATRIZ-20261018.md) con owner A, owner B y actor sin membresía; el ledger local no se publicó. Reportó limpieza de tres proyectos, dos organizaciones y tres usuarios, seguida de lectura independiente con 27 migraciones N1 y cero usuarios, organizaciones, proyectos, membresías, eventos y recibos pendientes. Se trata de un **PASS parcial**, no de U03 completa.
- Production SEO/GEO: Supabase yvdgmklgwlshizzgefpv; Preview de este producto: rhnnplewqsekrnaousyl; jlrppmpopaodpxtqtwmn pertenece a Funding OS y queda excluido. Las 27 migraciones N1 están acreditadas en Production y Preview. Según el expediente N2 local, main contiene 33 migraciones; las seis posteriores a N1 no constan acreditadas en Production. No activar banderas N2 por el mero merge.
- GitHub Actions sigue sin ejecutar jobs por facturación. Los resultados de verificación local y un despliegue READY no equivalen a CI verde ni a prueba alojada.

## Nivel 1 · Trabajo hasta H1 y H2

| Bloque | Lo que ya tenemos | Falta para cerrar | Responsable de ejecutar · revisión/decisión |
|---|---|---|---|
| **N1-01 E2E seguro** | #97 integrado, fixtures propios y doble E2E local | Conservar el ledger y la limpieza en cada ensayo alojado; no repetir la batería histórica sin riesgo nuevo | **Codex** usa arnés; **yo** reviso evidencia; **Juanma** no necesita intervenir |
| **N1-02 S2 consentimiento** | Código y migración N1 alojada; INSERT directo sensible denegado en catálogo | Matriz alojada con roles, invitación, consentimiento, retirada y JWT aún válido, sin dar por suficiente el catálogo | **Codex** prepara/ejecuta pruebas Preview; **yo** audito; **Juanma** custodia cuentas ficticias |
| **N1-03 S1 auditoría** | Escritor SQL dedicado en Production: TLS, privilegios, firma/HMAC, idempotencia y outbox ficticio PASS acotado; proveedor apagado | Endpoint real con sesión y anillo Production, exportación y recuperación; documentar límite entre llamada externa y commit | **Codex** instrumenta; **yo** reviso firma/negativos; **Juanma** autoriza ventana y custodia claves |
| **N1-04 entornos/CI (U02)** | Preview rhnnplewqsekrnaousyl aislada, 27 migraciones N1, centinela y Vercel Authentication; código en #129 Draft | Auditar HEAD funcional de #129, probar navegador contra despliegue fijado y fusionar el aislamiento; resolver bloqueo de facturación de Actions o registrar aceptación explícita de evidencia sustitutiva | **Codex** arnés y correcciones; **yo** audito PR/merge; **Juanma** ejecuta acceso protegido y gestiona facturación |
| **N1-05 matriz alojada (U03)** | 12/12 casos Data API reportados para tres actores, con limpieza contrastada | Account-manager, analyst, viewer, client-approver, viewer A2, invitación/consentimiento/retirada, revocación con JWT válido y negativos JWT auténticos; B-4 Playwright protegido en móvil y escritorio | **Codex** amplía una sola matriz y limpia por IDs; **yo** audito PASS/SKIP/FAIL; **Juanma** ejecuta desde entorno con secretos solo en memoria |
| **N1-06 recuperación (U04/R1)** | Exportación y restauración firmadas implementadas y ensayadas localmente; respaldo lógico N1 alojado restaurado en stack aislado con límites declarados | Exportación HTTP firmada de datos ficticios alojados, verificación offline y manipulación rechazada, restauración ficticia doble con idempotencia; decidir R1 y autorizar/ensayar después Sarah sin usarla como fixture | **Codex** prepara y ejecuta ensayo autorizado; **yo** verifica contrato/evidencia; **Juanma** decide R1, custodio y ventana Sarah |
| **N1-07 OpenSEO y gasto (U05)** | Conexiones/controles de presupuesto por proyecto en código, proveedor apagado | Elegir modo OpenSEO y ADR 0010, credenciales por cliente, costes, consentimiento y negativa entre clientes; validación controlada sin exceder presupuesto | **Codex** implementa/ensaya; **yo** reviso aislamiento; **Juanma** aprueba modo, coste y activación |
| **N1-08 operación comercial (U06)** | Despliegue Production y procedimientos iniciales documentados; E2E local móvil y escritorio | Registro/invitaciones y SMTP, protección de contraseñas, política de retención y borrado de cuentas con autoría, respaldo portable y restauración de servicios, alertas/soporte/incidentes, plan de hosting apto, dominio, UX y aceptación de release | **Codex** prepara runbooks y pruebas; **yo** audito checklist y release; **Juanma** decide políticas, plan y acepta H1/H2 |

**Secuencia de cierre N1:** (1) auditar y fusionar el aislamiento #129 sin presentarlo como U03 completa; (2) completar la matriz de actores y B-4 en Preview protegido; (3) ensayo alojado ficticio de exportación HTTP/restauración en el entorno expresamente autorizado; (4) decisión R1 y U04, piloto Sarah controlado; (5) N1-07/08 y aceptación comercial H2. Los casos que exigen escritor en Preview permanecen fuera mientras allí esté vetado; no desbloquearlo para simplificar U03.

## Gate explícito de aceptación integral

El [protocolo H1/H2](GATE-ACEPTACION-INTEGRAL-H1-H2-20261018.md) exige dos pasadas: **A**, recorrido ficticio alojado desde login, organización/proyecto y permisos hasta datos, medición/informe, exportación HTTP, verificación offline, restauración, logout y limpieza; **B**, piloto Sarah U04 con tareas reales pactadas, incidencias y aceptación humana. La matriz U03 y los tests locales son prerrequisitos y evidencias complementarias, no sustituyen este recorrido. Tras #129 y U03 esencial se ejecuta una sola campaña A, se corrigen fallos concretos y se repiten sus dependencias; después R1 y U04 permiten B. H1 y H2 siguen **ABIERTOS** hasta sus criterios respectivos.

## Nivel 2 · Funciones integradas frente a funciones operativas

[#120](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/120) integró los primeros incrementos N2-09/11; #119 añadió Medición; #131 integró Contenidos/GEO y #130 sus ensayos de recuperación; #133 integró el informe manual N2-14. Las PR fuente #114–#118 quedaron sustituidas/cerradas según sus expedientes. El código fusionado y sus pruebas locales no acreditan fuentes, tablas y banderas alojadas.

| Dominio | Ya integrado como primer incremento | Pendiente para declararlo operativo o ampliar su alcance | Quién |
|---|---|---|---|
| **N2-09 SEO** | Keywords y lectura inicial | Migraciones N2, bandera y pruebas alojadas; alcance técnico/On-Page adicional con fuente válida | **Codex** despliegue/pruebas; **yo** auditoría; **Juanma** fuente y prioridad |
| **N2-10 Medición** | Centro de medición orgánica de capturas existentes | Datos autorizados; Bing/GA4/Ads/GBP solo tras contrato, permisos y coste aprobados | **Codex** conectores; **Juanma** cuentas/alcance; **yo** evidencias |
| **N2-11 Competidores** | Registro manual y observaciones | Activación N2 alojada; backlinks, SERP y ranking reales sujetos a fuentes y presupuesto | **Codex**; **Juanma** fuentes/gasto; **yo** límites de evidencia |
| **N2-12 Contenidos** | Clústeres, oportunidades, evidencia y briefs | Activación alojada, adaptadores SEO/competidores, política editorial y SEO local/reputación posteriores | **Codex**; **Juanma** línea editorial; **yo** revisión |
| **N2-13 GEO** | Observaciones/propuestas con evidencia | Activación alojada y metodología de medición por motor/consulta/fecha; proveedores solo autorizados | **Codex**; **Juanma** servicios/coste; **yo** veracidad |
| **N2-14 Informe** | Informe manual imprimible, lectura por proyecto, integrado en #133 | Acreditación de fuentes alojadas; descarga firmada propia, scheduler, envíos e IndexNow son incrementos futuros con contrato, identidad y R1 | **Codex**; **yo** contrato; **Juanma** decide automatización |

**Gate N2 común:** decidir R1 (consistencia ante escrituras concurrentes) y retención de las 11 claves de autoría; respaldar el proyecto correcto, comparar y aplicar solo las migraciones N2 acordadas, comprobar contrato v2/v3/v4, permisos y rollback de contención, activar banderas por módulo y ensayar E2E alojado. No hacer un db push desde el checkout completo por conveniencia ni llamar proveedores por inferencia.

## Nivel 3 · Oportunidades, no deuda de lanzamiento

| Línea | Estado | Decisión y responsable |
|---|---|---|
| **N3-15 e-commerce SEO** | Hipótesis | **Juanma** valida demanda/cliente y coste; **yo** modelo de valor; **Codex** solo después de aprobar |
| **N3-16 afiliación SEO** | Hipótesis | **Juanma** decide modelo y obligaciones; **yo** evalúo fuentes/disclosure |
| **N3-17 directorios, foros y reputación** | Hipótesis | **Juanma** prioriza vertical y permisos; **yo** verifica valor; **Codex** implementa si se aprueba |
| **N3-18 SEO SaaS de Rubik** | Hipótesis | **Juanma** decide posicionamiento/packaging; **yo** estrategia; **Codex** web/medición tras alcance |
| **N3-19 monetización** | Hipótesis | **Juanma** decide pricing y canal; **yo** escenarios unitarios; **Codex** instrumenta métricas si procede |

Cada línea requiere hipótesis, demanda, coste, prueba y decisión continuar/descartar. Descartar una no impide H2.

## Reparto inmediato, sin duplicaciones

1. **Codex:** en #129, resolver el acceso protegido con token OIDC limitado al host exacto y suite Playwright B-4; continuar la matriz de roles/consentimiento. No repetir los 12 casos ya reportados salvo cambio que los afecte. Entregar SHA, ledger sanitizado, limpieza y límites.
2. **Yo (ChatGPT):** auditar el diff y HEAD funcional de #129, revisar pruebas y estados alojados, supervisar la fusión cuando sus gates de código estén satisfechos; mantener este checkpoint alineado con el Roadmap. Después revisar la exportación/restauración ficticia y el paquete N2.
3. **Juanma:** ejecutar el gate protegido desde PowerShell autenticado sin compartir tokens; decidir R1 y la política de retención/borrado; autorizar U04 Sarah solo tras el ensayo ficticio; elegir operación comercial (hosting, SMTP, respaldo y soporte). La facturación de Actions requiere intervención de la cuenta propietaria.

**Próxima evidencia decisiva:** una ejecución B-4 sobre el SHA y deployment exactos, con los roles faltantes y limpieza verificada. A continuación, un artefacto ficticio obtenido por el endpoint HTTP firmado y restaurado dos veces en un destino aislado. Cada paso debe distinguir PASS, FAIL, SKIP y lo no ejecutado.
