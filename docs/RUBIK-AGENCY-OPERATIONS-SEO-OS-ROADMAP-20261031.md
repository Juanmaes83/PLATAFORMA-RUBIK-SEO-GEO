# RUBIK Agency Operations — ampliación ADITIVA a partir de SEO OS
**Decisión de producto:** 31/10/2026 · **Propietario:** Juanma · **Seguimiento:** [Epic #151](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/issues/151) · **Estado:** MANDATO DE ALCANCE APROBADO, DISEÑO PARA IMPLEMENTAR; SIN CÓDIGO DE PRODUCTO IMPLEMENTADO POR ESTA PR.
**Proyecto:** [RUBIK SEO/GEO](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO) · **Base documental examinada:** main@3a735510b6b92adcabbdbf462dc06140265a379d, PR #145 (H1-A) Draft y #139/#144/#149 (documentación) abiertas en el corte.

## 0. Regla innegociable de alcance

RUBIK SEO/GEO **NO SE REEMPLAZA, NO PIERDE NINGUNA CAPACIDAD Y NO SE FRAGMENTA EN UN SEO OS PARALELO**. Todas las mejoras conceptuales descritas en la información aportada del sistema SEO OS forman parte del **objetivo funcional acumulativo**, con las 23 skills como inventario de cobertura obligatorio (23/23), añadidas a Core, N1, N2, OpenSEO, medición, GEO, plataforma multicliente, seguridad y recuperación existentes.

La obligación es alcanzar **equivalencia funcional o mejor** en la plataforma, no copiar arquitectura local, Python, SQLite, enlaces simbólicos, carpetas de clientes ni código no auditado. Ninguna función queda descartada por ser opcional, de nicho o requerir proveedor: se conservan alcance y justificación, con estado de dependencia, autorización, coste, seguridad y prueba. No declarar una skill operativa cuando solo exista un prompt Markdown.

La prioridad de negocio es **gestionar y demostrar el trabajo al cliente**: dato → diagnóstico → oportunidad → decisión → aprobación → tarea/encargo → ejecución → verificación → revisión de impacto → informe y entrega → seguimiento → facturación y renovación.

**Compatibilidad de release:** la investigación y especificación empiezan ahora; la implementación se hará en PRs separadas, sin tocar la PR H1-A #145, sin desviar ni bloquear la aceptación de H1-A/R1/U04/H2. No introducir módulos no probados en el primer release comercial. H2 podrá reutilizar componentes operativos que superen sus gates y tengan valor explícito de piloto, nunca por necesidad de completar este catálogo.

## 1. Qué conserva RUBIK y qué se amplía

| Base RUBIK existente (código/documento; verificar su despliegue real) | Mejora aditiva de SEO OS | Regla |
| --- | --- | --- |
| N2-10: GSC/GA4, capturas firmadas, comparaciones y estados de cobertura | Resúmenes deterministas mensuales y diarios, segmentación URL/mercado, anomalías, movimientos y seguimiento de resultados | No resumir filas parciales como totales ni promediar posiciones incorrectamente; mantener procedencia. |
| N2-09 + OpenSEO/Core: hallazgos técnicos y keywords | Auditoría multietapa, diagnóstico URL, intención SERP, ranking, canibalización basada en evidencia, schema/hreflang y clusters | Usar adaptadores a fuentes autorizadas, deduplicar hallazgos, no crear segundo crawler innecesario. |
| N2-11: entidades y observaciones de competidores | Vigilancia de cambios web/competencia, brecha SERP y backlinks | Diferenciar observación firmada, importación declarada y ausencia de datos. |
| N2-12: oportunidades, clusters, briefs y aprobaciones | Vincular brief a decisión, responsable, encargo externo, implementación real, resultado y revisión | No publicar ni tocar un CMS sin aprobación. |
| N2-13: observaciones GEO y revisión | Protocolos de repetición y motores ChatGPT/Claude/Gemini/Perplexity/AIO, muestras con cobertura y versiones | La muestra no equivale a tasa de visibilidad; costes/ToS aprobados. |
| N2-14: informe de proyecto imprimible | Periodo mensual, borrador, revisión, generación PDF reproducible, entrega, acuse y comparación con intervenciones | No sustituir informe actual; incorporar flujo editorial y entrega. |
| Ledger de presupuesto y paid-tools con bloqueo fail-closed | Caché + estimación transparente + reserva y conciliación de gasto por tarea/cliente/proveedor | No sustituir con SQLite ni aceptar --max-cost estimado como máximo facturable. |
| N1: identidad, roles, RLS/RPC, firmas, outbox, export/restore | Contexto de cliente, decisiones, tareas y facturación con aislamiento y evidencia | Toda nueva entidad pasa por autorización, auditoría, exportación, restore y prueba entre tenants. |

Los documentos de N2 pueden describir pruebas locales históricas o integración posterior; **código en main ≠ migración aplicada alojada ≠ servicio comercial aceptado**. Al implementar verificar HEAD, PR, entornos y dependencias actuales, no copiar estados antiguos.

## 2. Seis capacidades transversales obligatorias

**A. Expediente 360 de cliente:** identidad profesional, actividad, mercado, idiomas, dominios y propiedades autorizadas, compradores/intención, servicios/valor comercial, objetivos, KPIs verificables, conversiones, estacionalidad, público, limitaciones, tono y responsables. Campos con fuente/aprobación/visibilidad/permisos/fecha de revisión. No persistir juicios personales innecesarios de contactos.

**B. Memoria de decisiones:** decisión, contexto, alternativas evaluadas y descartadas, motivo, dueño, ámbito proyecto/organización, aprobación, vigencia, criterio de revisión, relación a objetivos y evidencia. Un agente debe contrastar decisiones vigentes antes de proponer y puede sugerir reabrir con nueva evidencia, nunca ignorarlas.

**C. Libro de intervenciones e impacto:** intervención concreta (URL/entidad/campaña), causa y objetivo, baseline y ventana, evidencia y firma, aprobador, encargo/PR/deployment/entrega externa, verificación del resultado publicado, fechas de revisión, métricas comparables, control de estacionalidad y cambios simultáneos, resultado también nulo o negativo. No presentar correlación como causalidad.

**D. Consola de operaciones de agencia:** cartera de clientes, servicio contratado y estado, tareas, bloqueos, dependencias del cliente, recordatorios de revisión, próximos informes, incidencias, horas/costes autorizados, trabajo ejecutado, servicios pendientes y alertas. Datos internos de tarifa/margen nunca visibles para rol cliente.

**E. Informes y demostración al cliente:** pipeline de snapshot → selección de evidencias firmadas → resumen determinista → interpretación claramente diferenciada → revisión interna → aprobación → PDF/portal → registro de entrega/lectura cuando exista autorización. Mostrar qué se hizo, para qué, prueba, antes/después, qué sigue y qué necesitamos del cliente. Modo móvil y accesible, exportación verificable y datos parciales expresos.

**F. Captación y facturación:** pre-auditoría de leads sin datos privados, propuesta/servicio, alta cuando exista contrato y permisos, tarifas y calendario de informe, borradores de emails, integración de facturación (Holded u otra si se aprueba), idempotencia de borradores y facturas, aprobaciones, no envío/cobro por defecto.

## 3. Matriz completa de las 23 skills — objetivo 23/23

**Semántica del estado:** TARGET = cobertura funcional aprobada, no implementada con esta decisión; REUSE = aprovechar código RUBIK identificado, verificando su estado; NEW = capacidades operativas nuevas. Todas se validarán individualmente en pruebas locales, CI y entorno autorizado antes de llamarlas operativas.

| # | Skill SEO OS referenciada | Función objetivo RUBIK | Encaje existente / extensión | Modo inicial |
| --- | --- | --- | --- | --- |
| 01 | alta-cliente-nuevo | Alta con perfil, contrato, objetivos, contactos, permisos, conexiones y checklist de acceso | N1 organizaciones/proyectos + nuevo expediente A; onboarding H2 | Asistido y aprobado |
| 02 | seo-lead | Auditoría pública limitada y propuesta comercial, sin pedir GSC/GA4 | N2-09/OpenSEO + embudo F | Sin pago por defecto |
| 03 | seo-informe-mensual | Recopilar capturas y acciones mensuales, revisar vencimientos, generar ficha interna | N2-10/14 + C/E | Determinista + revisión |
| 04 | seo-informe-cliente | Informe PDF / portal + entrega/acuse + borrador email y posible factura | N2-14 + E/F | Doble aprobación |
| 05 | seo-seguimiento | Pulso semanal del cliente, pendientes, decisiones, incidencias y fuentes disponibles | A/B/C/D + N2-10/11 | Lectura y propuesta |
| 06 | seo-impacto | Revisar intervenciones vencidas con métricas comparables y resultados negativos | N2-10/12/14 + C | Sin atribución causal automática |
| 07 | seo-auditoria | Auditoría con fases propios → técnico → mercado, agrupación por causa y plan | OpenSEO/Core, N2-09/14 | Fases y coste controlados |
| 08 | seo-url | Diagnóstico individual por URL, cobertura, indexabilidad, CTR y cambios propuestos | N2-09/10 | Fuente y muestra |
| 09 | seo-tecnico | Estado HTTP, canonicals, redirecciones, robots, sitemap, huérfanas | Core + OpenSEO + N2-09 | Crawl solo autorizado |
| 10 | seo-schema | Inspección y validación JSON-LD por segmento de página | Core schema + N2-09 | Evidencia por URL |
| 11 | seo-hreflang | Reciprocidad, coherencia idiomas/mercados, canonical, errores | Core hreflang + N2-09 | Prueba internacional |
| 12 | seo-serp-fit | Comparar intención, tipo de URL y SERP top por query/país/dispositivo | N2-09/12, con proveedor autorizado | Propuesta editorial |
| 13 | seo-gap | Detección de brecha real en consultas/ranking frente a competidores | N2-09/11, fuentes GSC y SERP | No inferir ausencia de ranking de GSC |
| 14 | seo-linkgap | Enlaces comparables con competidores y filtros contra métricas basura | N2-11/OpenSEO | Datos licenciados |
| 15 | seo-cluster | Agrupar queries por solapamiento SERP y revisión de intención | N2-09/12 | Algoritmo reproducible |
| 16 | seo-brief | Brief H1/H2/H3, fuentes, entidades, CTA, enlaces y aprobación | N2-12 + B/C | No publicar |
| 17 | seo-competencia | Vigilar cambios de URL, sitemaps, encabezados, fuentes y competidores | N2-11 + snapshots versionados | Aviso sin scraping descontrolado |
| 18 | seo-aio | Registrar AIO por consulta y citas reales con comparabilidad de SERP | N2-13/10 | No inferir caída CTR causal |
| 19 | seo-visibilidad-ia | Registrar/repetir prompts de marca en cuatro motores y comparar muestras | N2-13 + metodología Citation Lab | Capturas verificables, sin scraping no autorizado |
| 20 | seo-gbp-geogrid | Mallas Maps por posición, fecha y configuración, SoLV top3 con denominador | SEO local pendiente + N2-10/14 | Proveedor, cuotas y coste aprobados |
| 21 | seo-gbp-resenas | Leer reseñas autorizadas, alertar y redactar respuestas sin publicarlas | SEO local + D/F | Lectura + borradores |
| 22 | seo-panel-posiciones | Historial de ranking por query/mercado/dispositivo y reportes | N2-09/10/OpenSEO | Límite de coste; fuente real |
| 23 | seo-datos | Capa común de fuentes, caché, deduplicación, preflight y ledger por tarea | Transportes Core/OpenSEO + ledger N1 | Fail-closed, no SQLite |

**No hay exclusiones funcionales.** Si una skill depende de APIs/mercado/reglas no disponibles, su estado será DEPENDENCIA EXTERNA / NO ACTIVADA, documentando proveedor alternativo, coste, autorización, ruta y test requerido. No simular métricas para aparentar una función operativa. No aprobar por defecto crawling/solicitudes pagadas ni publicar respuestas.

## 4. Modelo de dominio propuesto — ampliar, no duplicar

**Primero inspeccionar tablas y contratos existentes en la rama/entorno real.** No crear tablas por sugerencia de este texto. Candidatos para nuevas entidades (nombre a ratificar tras ADR y revisión de export/restore):
- agency_client_profile / project_business_context (objetivos, KPIs, mercados, tipo de servicio y consentimiento).
- agency_decision + decision_revision (vigencia, alcance, descartes y trazabilidad de aprobaciones).
- agency_intervention + intervention_verification + impact_review (estado, URL, hipótesis, línea base, ventanas, cambios simultáneos y resultado).
- agency_work_order + work_order_receipt (encargo con archivos/ámbitos que no tocar, aprobación, verificación, reversión e informe de vuelta).
- agency_task + service_schedule (propietario, próxima acción, fecha, dependencia, recurrente y prioridad).
- agency_report_cycle + report_delivery (periodo, instantánea firmada, revisión, versión, destinatario autorizado y entrega).
- agency_service_agreement + billing_draft_reference (servicio, tarifa privada, facturación/estado de borrador, integración externa idempotente).
- agency_skill_run (contrato/versiones de skill, fuente/resultado, coste estimado/real, status, decisiones y errores).

**Vinculación preferente** a organization_id + project_id + usuario/rol existente, provider_results verificados, N2-09 keywords, N2-10 capturas, N2-11 competidores, N2-12 oportunidad/brief, N2-13 observación, N2-14 informe. Claves compuestas y RLS; permisos columna; autorización en servidor por sesión y rol vivos; auditoría S1. Datos comerciales de agencia y contactos personales separados del portal cliente; minimización y retención.

**Control y UI:** operador de agencia, cuenta del proyecto y portal del cliente usan el mismo producto con vistas y permisos diferentes. No crear un servidor en localhost:8787/8788 como sustituto. Mantener mobile-first, estados vacío/parcial/no-medido/error y accesibilidad; el cliente no ve hipótesis como hechos ni costes internos.

**Arquitectura agentes:** skill = contrato de tarea con inputs validados, idempotency key, preconditions, fuentes, herramientas permitidas, permisos, presupuesto/preflight, versión, resultado estructurado, intervención humana y prueba. Markdown es documentación de procedimiento, nunca permiso ni ejecución privilegiada. La IA explica y propone; los scripts/servicios hacen cálculos deterministas.

## 5. Orden incremental de implementación (todos los bloques forman el alcance)

| Paquete | Alcance funcional | Dependencia | Prueba de aceptación demostrable |
| --- | --- | --- | --- |
| A0 — Contratos y mapa 23/23 | Auditoría de esquema, Core/N2 y PRs, matriz de permisos, costes, fuente, estado por skill; ADR de operación y roles | Puede comenzar ahora, aislado | 23 fichas mapeadas, contrato de no regresión y backlog sin duplicados |
| A1 — Expediente y decisiones | Perfil de cliente, KPIs, servicios, responsables, decisiones/descartes versionados y uso contextual por agentes | Contratos de N1/S1 y export/restore | A1/A2/B1 RLS; revisión y revocación; decisiones antiguas no se re-proponen sin nueva evidencia |
| A2 — Intervenciones y encargos | Ciclo de aprobación, encargo web, recibo de ejecución, verificación, rollback y revisión con fecha | A1 + N2-10/12 | Un cambio ficticio trazado de fuente a publicación verificada y tarea de revisión |
| A3 — Informes y portal | Informes mensuales derivados de N2-14, informes históricos, PDF reproducible, estado de entrega y visibilidad para cliente | A1/A2 + N2-10/14 | Cliente ve evidencia y próximos pasos, no información interna; cada cifra recalculable |
| A4 — Gestión y captación | Alta asistida, leads, control de tareas, servicios, calendario, seguimiento semanal, incidencias | A1/A2 y onboarding H2 | Operador gestiona dos proyectos y vistas separadas con tareas y plazos |
| A5 — Ampliación SEO técnica/mercado | seo-auditoria/url/tecnico/schema/hreflang/serp-fit/gap/linkgap/cluster/brief/competencia y posiciones/datos | N2-09/11/12/10, Core/OpenSEO, proveedores autorizados | Cada skill con entrada/salida medible, fuentes, comparación, errores, coste, negativos |
| A6 — GEO y SEO local | seo-aio, visibilidad-ia, GBP geogrid, reseñas, versiones/plataformas/mercados y alertas | N2-13, GBP/AIO autorizados; Citation Lab y #144 complementan | Muestras verificables, geogrid reproducible, coste tope y evidencia de capturas |
| A7 — Entrega comercial y automatizaciones | Ciclo mensual completo, borradores correo, facturación, recordatorios, trazas de entrega, tareas recurrentes | A3/A4 y decisión de proveedores | Informe revisado/entregado, borrador factura idempotente, no envíos sin aprobación, fallos recuperables |

**Orden de valor:** entregar primero A1/A2/A3, sin esperar a terminar las 23 skills para demostrar trabajo al cliente; **ninguna** capacidad de A5/A6/A7 se retira del scope. Diseñar A0 ahora en paralelo sin mezclar con H1-A; cada paquete técnico empieza cuando el entorno/ADR/gates de seguridad lo permitan. H1-A/R1/U04/H2 siguen siendo prioridades de release; no confundir orden de integración con cancelación de alcance. Duraciones y fechas se fijarán al conocer dependencias reales, no se inventan.

## 6. Reglas de medición y reporte para evitar errores del script GSC de referencia

- Cálculo determinista de totales, delta MoM/YoY, segmentos, CTR, movers y oportunidades; nunca cifras calculadas libremente por el LLM.
- Divisor cero = no comparable / indefinido, no +100 %. CTR de segmentos con numerador/denominador compatibles; posición de consulta y serie por país/dispositivo; no sumar posiciones medias ni promediar promedios.
- GSC API: paginación donde proceda y registro de límites/top rows, de queries anonimizadas y de cobertura parcial; no presentar fila ausente como ausencia real en SERP.
- Oportunidades de CTR por umbral contextual y versiones, no regla 4–15/3 % universal; registrar CTR y mercado sin promesa de ranking.
- Distinguir periodo con misma duración, día de actualización de captura, cambios simultáneos, estacionalidad y atribución. Correlación ≠ impacto causal demostrado.
- Fuente y firma de cada resultado, advertencia si captura PARTIAL/EMPTY/no disponible, recálculo desde evidencia guardada cuando contrato lo permita.

## 7. Seguridad, operaciones y restricciones de la implementación

1. **Aislamiento multicliente:** roles por proyecto (owner/account-manager/analyst/viewer/client-approver), RLS/RPC/FK, pruebas cruzadas A1/A2/B1, sin filtraciones por errores/404/exports/informes.
2. **Integridad:** recibos/auditoría S1/S2, snapshots/procedencia, idempotencia, backups/restore versionados; R1 de consistencia de exportación se decide antes de datos reales de Sarah.
3. **Datos y secretos:** no almacenar OAuth en carpetas de cliente ni en Git; credenciales server-side con política de rotación; datos de correo/contactos retenidos solo con autorización y minimización RGPD; borrado/retención evidenciables.
4. **Coste:** por organización/proyecto/proveedor/periodo, reserva máxima verificable, conciliación/alertas/bloqueo de gasto; proveedor sin máximo real = no ejecución pagada. No habilitar DataForSEO, SerpApi, GBP, AIO o LLM por simple inclusión en backlog.
5. **Acciones externas:** tareas, borradores y propuestas pueden generarse; no enviar emails, facturar, contestar reseñas, alterar sitios, solicitar indexación ni desplegar en Production sin aprobación humana correspondiente.
6. **Rastreo y agentes:** SSRF, redirecciones, robots/términos de uso, rate-limit, inyección de prompts en webs/documentos y herramientas restringidas. No leer secretos de proyectos ajenos. El contexto del cliente es dato, no instrucción de sistema.
7. **Operación:** reintentos limitados e idempotentes, colas deduplicadas, calendario horaria Europa/Madrid con fecha efectiva, eventos auditables, errores visibles; no trabajo silencioso sin scheduler aprobado y supervisión.
8. **Entrega:** pruebas unitarias, pgTAP, integración, E2E 360/390/1280, permisos adversariales, snapshots/informes, fallos negativos, rollback, CI por HEAD exacto, QA humana y rollout por fases autorizado. PASS local ≠ alojado ≠ aceptado por Sarah.
9. **Compatibilidad:** no editar funciones actuales para simular mejoras; mantener interfaces y exports históricos, no romper UI/UX ni navegación. Separar rama/PR de producto por paquete y actualizar roadmap con evidencia.

## 8. Primer caso de aceptación comercial — Sarah Katerina

Preparar solo tras consentimiento y gates del piloto: objetivo autorizado «consultas relevantes de compradores internacionales sobre costes y riesgos de comprar vivienda en España». 
- Registrar negocio/mercados/idiomas y KPI comercial verificable.
- Conectar una observación GSC/GA4 o auditoría OpenSEO de fuente autorizada con oportunidad concreta N2-12.
- Crear decisión aprobada (incluyendo alternativas descartadas), encargo web con límites y responsables.
- Confirmar externamente la intervención aplicada y registrar URL/cambio/fecha/versión; mantener baseline y siguiente fecha de revisión.
- Calcular después variaciones comparables o «evidencia insuficiente», sin atribución causal automática.
- Producir informe que Sarah pueda ver en móvil: trabajo ejecutado, evidencia, resultado, límites, siguiente acción y aprobación.
- Con un segundo tenant ficticio verificar que Sarah no ve datos, coste ni contactos de otro proyecto.

**Indicadores de negocio a registrar como baseline, no objetivos inventados:** minutos por informe, porcentaje de intervenciones con evidencia, revisiones a tiempo, decisiones re-propuestas erróneamente, coste por auditoría, número de acciones aprobadas/completadas y feedback cliente.

## 9. Dependencias documentales y delimitaciones

- [ROADMAP MAESTRO](ROADMAP-MAESTRO-2026.md) / [CONTROL PROYECTO](CONTROL-PROYECTO.md), [SEO CAPABILITIES](SEO-CAPABILITIES-BACKLOG.md).
- [N2-10 Medición](N2-10-MEDICION-LOCAL-20261016.md), [N2-12 Contenidos](N2-12-CONTENIDOS.md), [N2-13 GEO](N2-13-GEO.md), [N2-14 Informe](N2-14-INFORME-MANUAL.md), [H2 Operación](H2-AUDITORIA-OPERATIVA-20261020.md).
- PR [#139](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/139) — ampliación SEO/GEO; PR [#144](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/144) — geo-audit-skill; PR [#149](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/149) e [issue #150](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/issues/150) — GEO Citation Lab. Son complementos, no reemplazos ni contenido a fusionar sin revisión.
- Fuente de decisión SEO OS: texto aportado por Juanma el 31/10/2026 (árbol descrito, plantillas, 23 skills, script extract_gsc.py). **No es una auditoría certificada del código original del vídeo**; usarlo como especificación funcional y verificar cada integración antes de atribuir prestaciones a un proveedor.

## 10. Próxima ejecución concreta

1. Revisar este documento y Epic #151 como contrato de alcance acumulativo.
2. Codex/Claude Code preparan A0: inventario tabla-a-tabla de lo ya implementado frente a 23 skills + seis capacidades transversales; documentan diferencias sin modificar PR #145 ni tocar Production.
3. Proponer los contratos mínimos de A1 y A2 y un primer vertical slice funcional: expediente → decisión → intervención → comprobación futura; incluye export/restore y RLS desde el diseño.
4. Abrir PR(s) pequeñas de implementación sobre HEAD actualizado cuando se confirme el aislamiento de worktrees y gates; revisión técnica por ChatGPT/Juanma antes de fusión.
5. Validar con Sarah cuando el release H1/H2 esté autorizado. Después cubrir A3–A7 con criterios de cierre verificables.

**Prohibido cerrar este backlog solo por tener documentos, UX mockups, scripts copiados o ejecuciones locales parciales.** Mantener status 23/23 trazable, con responsables, SHA y evidencia por función hasta entrega.
