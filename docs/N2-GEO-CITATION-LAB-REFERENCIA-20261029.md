# GEO Citation Lab — referencia de investigación y plan de aprovechamiento para Rubik SEO/GEO

**Decisión registrada:** 29/10/2026. **Estado:** APROBADO COMO REFERENCIA Y BACKLOG; NO IMPLEMENTADO NI ACTIVADO.
**Repositorio de destino de este documento:** Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO.
**Fuente revisada:** [fork de Juanma](https://github.com/Juanmaes83/geo-citation-lab), [upstream yaojingang](https://github.com/yaojingang/geo-citation-lab), main del fork @ 59e5188198d5fe627f6d160234f7ea1e94ee224a (último commit visible 28/10/2026).
**Prioridad:** después de H1 + H2 (piloto Sarah y MVP comercial multicliente). **No es un gate de H1-A, R1 ni H2.**
**Responsabilidad futura:** Juanma y ChatGPT priorizan y auditan; Codex/Claude Code investigan e implementan en ramas aisladas; activaciones, gasto y datos reales requieren autorización específica.

## 1. Decisión y lugar exacto

Se conserva GEO Citation Lab como **laboratorio externo de referencia metodológica**, no como dependencia de ejecución ni módulo instalado. Su función futura en Rubik es dar soporte al diagnóstico de citabilidad, medición por plataforma, trazabilidad de evidencias e informes explicables. El repositorio externo conserva sus propios datos, código, informes, PDF y licencias; **no se copiarán datasets ni se incrustará el aplicativo PHP/SQLite en Rubik por defecto**.

**Localización de esta decisión:** el documento presente, indexado desde docs/ROADMAP-MAESTRO-2026.md y docs/CONTROL-PROYECTO.md. En el árbol funcional de Rubik se evaluará como extensión de:
- **N2-09 (auditoría SEO por URL):** señales técnicas y estructura de páginas públicas, sin duplicar OpenSEO/CORE.
- **N2-12 (estrategia de contenidos):** evidencias, briefs y oportunidades de contenido extraíble/atribuible.
- **N2-13 (GEO e IA):** observaciones de citas reales por consulta, plataforma, mercado y modelo; distinción entre selección de fuente, mención y uso del contenido.
- **N2-14 (informes):** comparaciones, cobertura, límites, diagnósticos y recomendaciones revisables.
- **N2-10 (medición):** enlace opcional a ventanas y resultados, sin confundir datos GSC/GA4 con respuestas IA.
No asignar una nueva numeración N2 ni aprobar cambios de esquema hasta reconciliar los módulos existentes y sus contratos.

**Relación con otro backlog:** la [PR #144](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/144) contiene una propuesta de auditoría de citabilidad derivada de geo-audit-skill; es una propuesta documental separada y todavía no integrada en main en este corte. No duplicarla. geo-audit-skill evalúa preparación/citabilidad de URL, mientras GEO Citation Lab aporta **metodología empírica de selección/absorción y diseño de datos de observación**. El diseño de ambas fuentes debe compararse antes de escoger componentes.

## 2. Por qué interesa

- Descompone la investigación en **consulta → activación de búsqueda → selección/cita de fuente → posible absorción del contenido → exposición de entidades**. Evita tratar «página preparada», «fuente citada», «marca mencionada» y «contenido utilizado» como una sola cifra.
- Aporta taxonomías, un experimento controlado de preguntas y pipelines de extracción y análisis para formular hipótesis verificables de estructura, relevancia, evidencia y cobertura.
- Ofrece contratos de procedencia, normalización, deduplicación, informes de calidad y reconstrucción reproducible que pueden inspirar el modelo de evidencia de Rubik.
- Facilita propuestas comerciales explicables: **qué URL trabajar, para qué pregunta, con qué evidencia y qué volver a medir**. No garantiza que los motores de IA citen una página.

**Aplicación inicial cuando H1/H2 estén cerrados:** en Sarah Katerina, contrastar un conjunto pequeño de páginas públicas autorizadas (compra de propiedad, costes/impuestos, calculadoras) y preguntas reales por mercado/idioma (p. ej. inglés y otros idiomas europeos del piloto), evitando inferir que una muestra china o mayoritariamente anglófona representa al público de España.

## 3. Inventario verificable de la fuente y selección

| Componente fuente | Contenido visible/declarado | Decisión de aprovechamiento |
| --- | --- | --- |
| 01-geo-experiment-data-report | 602 prompts, 21.143 citas válidas en capa búsqueda, 23.745 observaciones con 72 atributos y 18.151 páginas recuperadas; ChatGPT, Google AI Overview/Gemini, Perplexity | **ALTO:** estudiar taxonomía, pipelines y variables; reproducir indicadores seleccionados antes de reutilizarlos. No usar estadísticas del estudio como métricas del cliente. |
| 03-cn-geo-citation-dataset | 214.119 referencias brutas, 64 fragmentos JSONL con hashes, Parquet, DuckDB, esquema, contratos, QA y mart analítico; plataformas chinas y Web/App | **MEDIO/ALTO metodológico:** adoptar ideas de esquema, trazabilidad, deduplicación y calidad, no dar por transferibles estadísticas chinas a Europa. |
| 02-geo-aeo-ai-search-papers | Índice declarado de 70 publicaciones y 65 PDF alojados, organizado por GEO, AEO, medición, riesgos, agentes y RAG | **ALTO como bibliografía:** revisar artículos originales y fechas, contrastar calidad y derechos de cada PDF antes de extraer conclusiones. |
| geo-assessment | App de test GEO de 30 preguntas en PHP/SQLite con su propio CI | **BAJO para MVP:** no integrar runtime PHP, sesiones, certificados ni base de datos; podría inspirar formación interna futura. |
| Viewer / SKILL | Visor estático offline, instalación y GitHub Pages | **OPCIONAL:** útil para lectura interna, no necesaria para la interfaz Rubik ni autorización de ejecutar scripts remotos. |

**Piezas prioritarias para auditoría técnica posterior:** 01-geo-experiment-data-report/03-pipeline/citation_features.py, analyze_influence.py y scripts de análisis por plataforma; 03-cn-geo-citation-dataset/data/contracts/warehouse_contract.json, scripts/build_data_warehouse.py, informes de calidad y schema/record.schema.json. No copiar ni ejecutar ciegamente; fijar commit de fuente y revisar dependencias, licencia, tests, coste y privacidad.

## 4. Capacidades futuras concretas

### A. Diagnóstico de preparación y citabilidad por URL (N2-09 y N2-12)

Entrada: URL pública autorizada, consulta objetivo, mercado/idioma, fecha y política de rastreo.
Salida: diagnóstico con evidencia de relevancia de la respuesta, subtítulos, bloques con hechos y fuentes, definiciones, comparaciones, pasos, atribución, HTML inicial/renderizado y limitaciones de acceso. Diferenciar «no medido», «no disponible», «no aplicable», «observado» e «inferido». Generar máximo tres acciones priorizadas y revisables; ninguna publicación automática.

### B. Observación GEO de plataformas (N2-13)

Contrato candidato: organization_id, project_id, question_id o texto controlado, prompt_version, platform, model/version si está disponible, interfaz Web/App si procede, locale/mercado, captured_at, método de obtención, respuesta/huella cuando lícita, source URL normalizada, tipo de coincidencia, verificación, disponibilidad y límites. **No introducir valores inventados** para tiempos, versiones o respuestas ausentes.

Separar mediciones:
1. **Selección/cita observada:** enlaces/fuentes que aparecen en una respuesta conservada.
2. **Mención o entidad observada:** si aparece marca/empresa, con reglas verificables.
3. **Absorción/influencia estimada:** análisis derivado de texto y evidencia; no presentarlo como consumo interno causal demostrable del modelo.
4. **Preparación de página:** características del contenido, no presencia real en respuestas.

Cualquier frecuencia, tendencia o cuota necesita denominador, ventana, muestra repetida y condiciones de captura equivalentes.

### C. Contratos, calidad y auditoría (N2-13/N2-14, N1)

Evaluar del laboratorio: claves estables para preguntas, dominios y páginas; esquemas versionados; deduplicación sin eliminar originales; normalización de URLs; calidad de fuente y banderas de disponibilidad. Adaptar al modelo Supabase de Rubik, manteniendo RLS de organización/proyecto, fuentes firmadas, permisos, auditoría de cambios, exportación y recuperación compatibles con N1 y decisión R1. Nunca importar el DuckDB completo como fuente viva de cliente ni crear tablas nuevas sin revisión de esquema.

### D. Informes comerciales explicables (N2-14)

Mostrar cobertura y límites por plataforma/mercado/fecha, evidencia por URL y consulta, evolución solo cuando exista muestra comparable, recomendaciones con trazabilidad y revisión humana. No prometer rankings ni citar el estudio como prueba de mejora causal. Dejar visible cuándo el resultado es correlacional, parcial o no verificable.

## 5. Límites metodológicos constatados en la documentación de origen

- El experimento internacional es un **snapshot estático**; carece de timestamp uniforme por registro, tiene 15 prompts ChatGPT ausentes y campos de región/idioma desconocidos. Sus tasas por país/idioma no son una base comercial europea.
- CN-GEO carece de límites fiables de respuesta completa, lote, versión de modelo y hora. Su tabla responses está intencionadamente vacía; **no** sustenta por sí sola ranking estricto de citas, tasa de recomendación de marca, sentimiento o series temporales.
- La correlación entre características y «influencia» no implica causalidad. No fijar reglas universales del tipo «1.000 palabras», «más Q&A» o «publicar en inglés» basándose solo en esta muestra.
- Los archivos contienen código y datos de distintas procedencias. El README declara MIT para código propio y CC BY 4.0 para informes/contenido propio, mientras datasets, papers PDF, tipografías y otros terceros conservan términos propios. Antes de reutilizar, comprobar LICENSE-CODE, LICENSE-CONTENT, THIRD_PARTY_NOTICES, origen y permisos; mantener atribución y avisos. No asumir que la licencia del repositorio concede derechos sobre cada PDF o dataset.
- No se han recalculado aquí de forma independiente las estadísticas, ejecutado suites completas ni validado extracción de campo. El catálogo es **candidato**, no componente certificado para producción.

## 6. Plan de evaluación aprobado como backlog (no ejecución)

| Etapa | Cuándo | Entregable / criterio |
| --- | --- | --- |
| R0. Registro | Ahora, documentación | Fuente y versión pinneadas, mapa de capacidades, relación con PR #144 y riesgos documentados. |
| R1. Auditoría de metodología | Tras H1/H2, en rama documental/técnica aislada | Diccionario de las 72 variables, fórmulas y fuentes; reproducir subconjunto numérico con datos de muestra y documentar sesgos, licencias y coste. |
| R2. Selección de 2–3 capacidades | Tras R1 | Comparar código existente N2-09/12/13/14, Core y OpenSEO; justificar reutilizar, adaptar o descartar cada componente. Sin duplicación funcional. |
| R3. Piloto con URLs autorizadas | Tras R2 y permisos de propietario | 2–3 páginas reales públicas + preguntas multilingües; datos de observación obtenidos legalmente, versiones/fechas, controles negativos, informe auditable y revisión humana. Costes aprobados previamente. |
| R4. Decisión de producto | Tras evidencia R3 | Prioridad por utilidad demostrada; contrato multicliente, presupuesto, seguridad, retención, recuperación y despliegue por gates, o decisión explícita de no incorporar. |

Estos códigos R0–R4 son **etapas del expediente de investigación**, no decisiones arquitectónicas R1 del producto (consistencia de exportación), ni hitos del roadmap H1/H2.

## 7. Gates antes de implementar o activar

- **No cambiar la prioridad comercial:** primero cerrar H1-A, R1 de exportación, piloto Sarah (U04) y H2 MVP.
- Evidencia por propuesta: revisión de fuente con SHA, licencia, versión, conjuntos de prueba, falsos positivos, métricas, incertidumbre y coste.
- Tenancy: pruebas A1/A2/B1, roles y denegación entre tenants; firma/procedencia e historial; exportación y restauración versionadas antes de persistencia.
- Seguridad de rastreo: SSRF, dominios permitidos, redirecciones, límites de tiempo/tamaño, robots/términos del proveedor, inyección de contenido externo y datos personales.
- Medición IA: no scraping/consulta automatizada sin permiso/contrato, ni uso de secretos de cliente o proveedores de pago sin autorización. Consultas y registros deben registrar fecha, versión y condición de medición.
- Calidad: no inferir «no citado» de muestras inexistentes; nunca llamar causal a un score heurístico. Diferenciar capturas verificadas, informes del estudio y recomendaciones.
- Gobernanza: aprobación humana de cambios en sitios; CI y QA sobre SHA exacto; PR de producto separada; ninguna activación en Production por la existencia de este documento.

## 8. Próxima acción y estado verificable

**AHORA:** solo conservar esta referencia y sus enlaces desde el roadmap/control. **NO IMPLEMENTAR EN H1/H2, NO HACER MERGE DE CÓDIGO EXTERNO, NO ACTIVAR APIs NI SUBIR DATOS.**

**CUANDO H1/H2 ESTÉN ACEPTADOS:** abrir auditoría comparativa con geo-audit-skill (#144) y lo existente en N2, elaborando una matriz «capacidad / valor / método / evidencia / dependencias / seguridad / coste / decisión». El propietario decide qué subset entra en el roadmap y su presupuesto.

**Fuentes principales:**
- [Fork fuente de Juanma](https://github.com/Juanmaes83/geo-citation-lab)
- [Repositorio upstream](https://github.com/yaojingang/geo-citation-lab)
- [README y límites del estudio internacional](https://github.com/Juanmaes83/geo-citation-lab/blob/main/01-geo-experiment-data-report/README.md)
- [Contrato CN-GEO](https://github.com/Juanmaes83/geo-citation-lab/blob/main/03-cn-geo-citation-dataset/data/contracts/warehouse_contract.json)
- [Licencias y atribución](https://github.com/Juanmaes83/geo-citation-lab/blob/main/LICENSE-CODE) · [Contenido](https://github.com/Juanmaes83/geo-citation-lab/blob/main/LICENSE-CONTENT)
- [Backlog GEO páginas públicas, PR #144](https://github.com/Juanmaes83/PLATAFORMA-RUBIK-SEO-GEO/pull/144)
