# Catálogo objetivo de capacidades SEO/GEO

**Estado:** inventario de capacidades deseadas por el propietario, pendiente de priorización y de entrega por fases.  
**Actualizado:** 09/10/2026.
**Estado vigente (09/10/2026):** producción Vercel, acceso real Supabase y Sarah Katerina como primer proyecto piloto. Su auditoría de 10/10 páginas en OpenSEO `legacy` quedó guardada y verificada visualmente y por SQL de solo lectura: un resultado de páginas y uno de incidencias, firmados y sin duplicados tras reintento (HANDOFF/#44). Las nueve migraciones del primer paquete están aplicadas; las migraciones posteriores de presupuesto/consumo integradas en código no están aplicadas en alojado. No hay conexión OpenSEO de Sarah por proyecto, modo `project` ni lectura Google real desde Rubik. El resto del catálogo conserva su estado por capacidad.

**Límite del producto:** web nueva o antigua de Sarah, Studio, contenido, consentimiento web, DNS, lanzamiento e indexación del sitio se gestionan en otro frente. Su traslado no es una entrega completada de Rubik. Las capacidades genéricas de análisis, medición, seguimiento y propuestas de Rubik siguen en este backlog para cualquier cliente.

**Integración Google en desarrollo, no operativa:** GSC rendimiento y GA4 páginas orgánicas tienen transportes simulados y normalización Core; la asociación explícita de propiedad a conexión/proyecto se integró en #60, pero su migración no está aplicada en alojado. #61 integró la lectura manual acotada solo con proveedor simulado y sin caller. Core #28 añade procedencia firmable del origen; la plataforma actualiza el pin en `feat/google-signed-capture`. No hay llamada, guardado ni captura real de Google desde Rubik. Compatibilidad de catálogo, consentimiento owner declarado, permiso API, lectura verificada y persistencia son estados distintos.

> **Interpretación:** esta lista registra lo que el propietario quiere que la plataforma pueda cubrir con el tiempo. No significa que ya exista, que todo deba entrar en una única entrega, ni que toda tarea sea automatizable. El orden, los límites, las fuentes de datos, los costes y las aprobaciones se concretarán antes de implementar cada bloque.

## Leyenda de estado

- **No implementado en la plataforma:** no hay flujo funcional en la aplicación.
- **Parcial en el Core:** hay lógica/contratos reutilizables en RUBIK-SEO-GEO-CORE, pero no equivalen a una capacidad operativa de la plataforma.
- **Pendiente de decisión:** requiere definir vertical, proveedor, consentimiento, coste, política editorial o cumplimiento.
- **Solo con aprobación humana:** nunca publicar, enviar, contactar o cambiar un sitio de forma automática sin aprobación registrada.

## Qué existe hoy en el Core y qué no

El Core es una librería, no una suite SEO con interfaz ni datos propios. Tiene piezas reutilizables para metadatos por página, title/description/H1, Page Registry, schema.org por vertical, SEO de medios, canonical/hreflang, HTML inicial, sitemap y robots.txt; también contratos de conectores/proveedores, autoridad/citas, snapshots y borradores de acciones. La plataforma presenta y persiste la auditoría técnica `legacy` comprobada de Sarah; eso no conecta automáticamente las demás piezas a su sitio ni implementa todo este catálogo. Persistencia de informes Google, otras integraciones y medición externa siguen pendientes.

## Catálogo deseado

### 1. SEO técnico
**Estado de plataforma:** auditoría manual de OpenSEO disponible y verificada, sin Lighthouse, sin persistencia y con límite de páginas. No equivale a cubrir todos los controles siguientes. **Core:** parcial en generación de metadata, canonical/hreflang, sitemap, robots, schema y HTML inicial; el rastreo lo realiza OpenSEO.

**Capacidades objetivo:** indexación e indexabilidad; mapas del sitio XML; robots.txt; etiquetas canónicas; arquitectura del sitio y estructura de URL; HTTPS/SSL; Core Web Vitals (LCP, INP, CLS); velocidad de página; amigabilidad móvil/diseño responsivo; datos estructurados/Schema.org (JSON-LD); hreflang y segmentación internacional; paginación; renderizado JavaScript (SSR frente a CSR); contenido duplicado; redirecciones (301, 302 y cadenas); códigos HTTP y errores (404, 5xx); análisis de logs; presupuesto de rastreo/indexación; navegación facetada; CDN y rendimiento del alojamiento; optimización de imágenes (compresión, WebP, carga diferida); detección de páginas huérfanas.

### 2. SEO On-Page
**Estado de plataforma:** no implementado como herramienta de análisis/edición. **Core:** parcial en title, description, H1, contratos por página y SEO de medios.

**Capacidades objetivo:** etiquetas de título; meta descripciones; jerarquía de encabezados H1–H6; colocación/densidad de palabras clave; optimización de contenido; enlaces internos; texto ancla; texto alternativo de imágenes; slug de URL; frescura/actualización de contenido; HTML semántico; fragmentos destacados; tabla de contenidos/enlaces de salto; enlaces salientes; profundidad/exhaustividad del contenido; legibilidad.

### 3. SEO Off-Page
**Estado de plataforma:** no implementado con datos o proveedores reales. **Core:** parcial en contratos de autoridad/citas, snapshots y propuestas; las acciones externas requieren aprobación humana.

**Capacidades objetivo:** construcción de enlaces; relaciones públicas digitales; publicaciones invitadas; enlaces rotos; reclamación de menciones de marca no enlazadas; HARO/contacto con periodistas; análisis del perfil de backlinks; detección de enlaces spam; distribución de texto ancla; velocidad de enlaces; menciones/citas de marca; colaboración con influencers; podcasts/entrevistas; enlaces de páginas de recursos; técnica del rascacielos; sindicación social.

**Revisión de política obligatoria antes de cualquier desarrollo:** backlinks sigilosos, construcción de enlaces escalonados, compra/venta de enlaces, redes privadas de blogs y tácticas equivalentes no se automatizarán. Deben evaluarse frente a las políticas de plataformas y la política de tácticas prohibidas del Core. Todo outreach o publicación necesitará aprobación humana por destinatario y alcance.

### 4. Investigación de palabras clave
**Estado de plataforma:** no implementado; no hay proveedor live ni datos de volumen/dificultad.

**Capacidades objetivo:** intención de búsqueda (informativa, navegacional, comercial, transaccional); volumen; dificultad; cola larga; términos semánticos; agrupación de keywords/temas; brechas frente a competidores; estacionalidad y tendencias; preguntas/PAA; keywords de volumen cero; canibalización; características SERP por keyword.

### 5. Estrategia de contenido
**Estado de plataforma:** no implementado como CMS, calendario o flujo editorial. El Core puede aportar lógica para borradores, pero no gestiona un equipo editorial.

**Capacidades objetivo:** autoridad temática; hubs/pilares/clústeres; calendarios editoriales; brechas de contenido; poda/consolidación; actualización de contenido; formatos (guías, listas, comparativas, herramientas); SEO programático; contenido generado por usuarios; biografías de autores/entidades; información y datos originales; briefs/SOP; cobertura de noticias.

### 6. SEO local
**Estado de plataforma:** no implementado. Los adapters/schema de negocios locales del Core no son una integración con perfiles, directorios ni rankings locales.

**Capacidades objetivo:** Google Business Profile; consistencia NAP (nombre, dirección, teléfono); citas/directorios locales; generación y gestión de reseñas; enlaces locales; páginas de ubicación/área de servicio; rankings en paquete local/mapa; contenido geodirigido; schema local; señales de proximidad, relevancia y prominencia.

### 7. Optimización de búsqueda GEO/IA
**Estado de plataforma:** no hay proveedores ni medición live de motores generativos. **Core:** contratos base de autoridad/citas y borradores; observaciones de motores generativos no verificadas.

**Capacidades objetivo:** visibilidad/citas en respuestas LLM (ChatGPT, Claude, Perplexity, Gemini); AI Overviews; optimización de entidades/grafo de conocimiento; contenido estructurado y extraíble; frecuencia de menciones de marca; llms.txt; estadísticas/datos citables; presencia en Wikipedia/Wikidata; visibilidad en Reddit/foros; contenido respuesta-primero; oportunidades de citación LLM.

**Límite:** no fabricar consenso, menciones o citas. Toda afirmación de visibilidad deberá llevar fuente, fecha, método y estado verificado/no verificado. SEO parásito y tácticas similares quedan sujetas a revisión de política y no son acciones por defecto.

### 8. SEO para E-commerce
**Estado de plataforma:** no implementado como flujo de tienda. El adapter Retail del Core no equivale a integración de catálogo, inventario o Merchant Center.

**Capacidades objetivo:** páginas de producto y colección; schema de producto (precio, reseñas, disponibilidad); navegación facetada; páginas agotadas; reseñas de producto; Google Merchant Center/feed de Shopping; descripciones duplicadas; búsqueda interna; extracción permitida de datos de competidores.

### 9. Características SERP
**Estado de plataforma:** no hay monitorización SERP. El Core genera algunos datos estructurados, pero no controla qué elementos muestra el buscador.

**Capacidades objetivo de seguimiento/elegibilidad:** fragmentos destacados; preguntas relacionadas; paneles de conocimiento; paquetes de imágenes; carruseles de vídeo; sitelinks; resultados enriquecidos FAQ/HowTo cuando las políticas vigentes lo permitan; estrellas de reseñas; Top Stories; paquete local/mapa. No prometer una aparición: la decisión final corresponde al buscador.

### 10. SaaS SEO
**Estado de plataforma:** no hay adquisición SEO pública del SaaS ni analítica de conversión SEO. La aplicación multi-tenant no implica que estas funciones estén construidas.

**Capacidades objetivo:** keyword research SaaS; product-led SEO y contenido product-led; páginas de funcionalidades/casos de uso; páginas de integraciones; alternativas, competidores y comparativas; páginas por industria/persona; páginas de plantillas/herramientas y herramientas gratuitas; contenido bottom-of-funnel; keywords solution-aware/problem-aware y customer journey; optimización de trial/demo; arquitectura de landing pages y mapas feature/keyword y use-case/keyword; documentación API/developer, knowledge base, help center y changelog; indexación de documentación; subdominio frente a subdirectorio; arquitectura multi-producto y multidioma; generación escalada/por plantillas; UGC y casos de clientes; directorios de software/marketplaces/app stores; brand SERP y competidor; funnels free-to-paid y leads; atribución, conversiones asistidas y analítica SEO→producto; Search Console + analítica de producto; content decay; enlaces internos product-led y topic clusters; entidades/Knowledge Graph; visibilidad IA/LLM y recomendaciones de producto; comparativas de software; queries “best [categoría]”, “[competidor] alternative”, “[producto] vs [competidor]”, “[caso de uso] software”, “[industria] software” y “[función] tool”.

### 11. Forum & Directory SEO
**Estado de plataforma:** no implementado. Directorios y foros requieren participación/publicación humana y control de marca.

**Capacidades objetivo:** perfiles en foros/comunidades; envíos y optimización de directorios empresariales, sectoriales, locales, de nicho, asociaciones, cámaras, reseñas y recursos; citas; descripción/categorías/servicios/perfil completo; consistencia de entidades y NAP; menciones y recuperación de menciones no enlazadas; participación y reputación comunitaria; Q&A, Reddit, Quora y foros sectoriales; contenido/hilos comunitarios; descubrimiento de hilos; monitorización de marca y coocurrencia de entidades; menciones contextuales y anchors naturales; enlaces de perfil/contextuales/citas y atributos nofollow/sponsored/UGC; evaluación de calidad; indexación; listados duplicados/incorrectos y consolidación; optimización/respuesta a reseñas; análisis de competidores, brechas de citas y visibilidad de foros; detección de directorios spam/tóxicos; recuperación de enlaces; brand SERP; visibilidad de crawlers IA y oportunidades de cita LLM.

### 12. Affiliate SEO
**Estado de plataforma:** no implementado. **Pendiente de decisión de producto:** confirmar si Rubik ofrecerá servicios o productos afiliados; no se asume por estar en este catálogo.

**Capacidades objetivo si se aprueba ese modelo:** research de keywords comerciales, comparativas, “best/top”, X vs Y, alternativas, reseñas, pricing, cupones/descuentos; buyer/buying guides, reviews, roundups, categorías y alternativas; tablas comparativas; herramientas/calculadoras/quizzes/recomendadores; pruebas originales, experiencia directa, revisiones expertas, fotografía/screenshots, pros/contras, precios/features/specs y comparativas de competidores/retailers; disclosure, independencia editorial, gestión/cloaking/atributos sponsored de enlaces, tracking y conversiones; EPC, CTR, ingresos por visitante y por mil; selección de programas, comisiones, cookies y recurrencia; feeds/API y frescura de datos; agotados, precios, enlaces rotos, productos/ofertas expirados y redirecciones; estacionalidad, análisis SERP y brechas; information gain, investigación original, autoridad temática, contenido informativo y funnels/enlaces internos; captación email/retargeting/marca; E-E-A-T, experiencia de autores, autenticidad/UGC, entidad del sitio afiliado y visibilidad/citas/recomendaciones de producto en IA.

### 13. Monetización SEO
**Estado de plataforma:** no implementado. El ledger de gasto del plan CORE-9 controla costes de proveedores; no gestiona ingresos de SEO.

**Modelos a evaluar, no habilitados:** afiliación; anuncios display/programáticos, AdSense y redes premium; contenido/posts patrocinados y venta directa de publicidad; patrocinios de newsletter; generación/venta de leads (cualificados, pay-per-lead, local, rank-and-rent, llamadas y formularios); suscripciones SaaS, trials/freemium, herramientas y productos digitales; ebooks/cursos/plantillas/checklists/informes y bases de investigación; newsletters y comunidades premium; directorios, job boards, clasificados, marketplaces, comisiones/transacciones/reservas/referidos; leads de consultoría/agencia/servicios; e-commerce, dropshipping, print-on-demand y licencias; monetización de APIs/datos; directorios patrocinados, featured listings, placements y perfiles premium; donaciones/membresías/crowdfunding; patrocinios de marca/licencias/sindicación; compra/venta de activos web y portfolios; arbitraje de tráfico; funnels search-to-email/community/SaaS/lead/commerce/affiliate/subscription; ingreso por sesión, CRO, AOV, LTV, diversificación, dependencia de tráfico, riesgo algorítmico y atribución ROI.

## Dependencias y puertas antes de activar capacidades

1. Primer acceso real comprobado; completar aislamiento con dos cuentas alojadas antes de incorporar clientes adicionales.
2. Definir CORE-9.2: persistencia, auditoría, provenance, retención y política de claves; validar requisitos legales antes de datos reales.
3. Priorizar por vertical/cliente y decidir qué áreas de negocio (SaaS SEO, e-commerce, afiliación, directorios, monetización) pertenecen realmente a Rubik.
4. Para cada integración: proveedor, permisos mínimos, consentimiento por proyecto, secreto server-side, presupuesto/cuotas y fuente verificable.
5. Para acciones externas (publicar, outreach, reseñas, enlaces, envíos): aprobación humana registrada, alcance explícito, trazabilidad, cancelación y prueba negativa sin autorización.
6. Entregar por etapas con pruebas, CI verde, documentación y revisión humana; no marcar una capacidad como implementada por existir solo como contrato en el Core.

## Relación con la hoja de ruta

- Estado operativo y fases de la plataforma: [ROADMAP.md](ROADMAP.md).
- Plan de ejecución detallado: [CORE-9 EXECUTION-PLAN](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/blob/main/docs/core-9/EXECUTION-PLAN.md).
- Alcance del Core SEO/GEO: [RUBIK-SEO-GEO-CORE README](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE#propósito-y-límites).


## 14. Patrones de arquitectura SaaS y checklist GEO (insumo visual, 30/09/2026)

**Estado:** incorporado al catálogo como oportunidad de producto; no implementado. Las imágenes son referencias de principios, no especificaciones técnicas ni garantías de ranking. Se debe decidir el alcance por fase y por tipo de proyecto.

### 14.1 Arquitectura SEO para las páginas públicas de un SaaS

La primera imagen propone separar páginas de producto y adquisición por intención:

| Grupo de páginas | Ejemplos de rutas | Intención |
|---|---|---|
| Funcionalidades | `/features`, `/features/[feature]` | Qué hace el producto |
| Casos de uso | `/use-cases/[audience]` | Cómo resuelve una necesidad |
| Comparativas | `/compare/[product]-vs-[competitor]`, `/[competitor]-alternative` | Evaluación comercial |
| Integraciones | `/integrations/[provider]` | Compatibilidad |
| Contenido | `/blog/[topic]` | Aprendizaje y descubrimiento |
| Herramientas | `/tools/[tool]` | Utilidad gratuita y adquisición |
| Conversión | `/pricing` | Intención de compra |

Principios que sí conviene convertir en capacidades: arquitectura de URL estable; enlaces contextuales entre contenido informativo, funcionalidades y conversión; páginas descubribles desde enlaces internos; detectar páginas huérfanas; y revisar profundidad de clics. “Tres clics máximo” se registra como heurística de auditoría, no como regla universal ni requisito rígido. Las comparativas deben ser exactas, actualizadas y transparentes.

**Límite de aplicación:** este mapa describe el sitio público de marketing de Rubik (si se prioriza captar demanda orgánica para el SaaS), o sitios de clientes cuando el proyecto configure una arquitectura equivalente. No se debe imponer a la aplicación autenticada ni sustituir las rutas/datos de cada tenant. Páginas de competidores, integraciones y herramientas solo se crearán si existe contenido útil y verificable para ellas; evitar páginas programáticas vacías o repetitivas.

**Futuras funciones de Rubik:** editor visual de arquitectura/árbol de URLs; mapa de intención a página; detector de páginas huérfanas y profundidad; sugerencias de enlaces internos con destino y contexto; comprobación de enlaces entre grupos; y revisión de canibalización/duplicados antes de publicar. Cualquier escritura o publicación requiere autorización del usuario.

### 14.2 GEO: checklist convertido en flujo verificable

| Área | Capacidad que podría ofrecer Rubik | Estado / matiz |
|---|---|---|
| Acceso y rastreo | Comprobar robots.txt, directivas noindex/canonical, sitemap, respuestas HTTP y bloqueos conocidos del CDN; revisar contenido renderizado | Pendiente. Permitir bots de IA es decisión del propietario del sitio; no recomendar permitirlos todos por defecto. robots.txt expresa directivas, no es control de acceso. |
| Descubrimiento | Validar sitemap y, si se configura, enviar URLs mediante IndexNow | Pendiente. IndexNow comunica cambios a buscadores participantes; no garantiza indexación ni sustituye otras medidas. |
| Contenido extraíble | Evaluar si las páginas clave entregan texto útil en HTML/renderizado; detectar preguntas sin respuesta clara, comparativas pobres y falta de enlaces internos | Pendiente. Preguntas H2, respuesta breve inicial y secciones comprensibles por separado son patrones a probar, no formato obligatorio para cada página. |
| Evidencia y confianza | Revisar datos originales, fuentes, autoría, fecha de actualización, ejemplos/capturas, precios públicos y consistencia de marca | Pendiente. Rubik puede señalar faltantes; no debe inventar pruebas, opiniones, credenciales o testimonios. |
| Cobertura de menciones | Proponer oportunidades de presencia en comunidades, directorios, reseñas, medios y páginas que ya citan fuentes del sector | Parcial en contratos del Core; datos/proveedores y flujo de trabajo pendientes. Contactar, publicar o solicitar reseñas requiere aprobación humana. |
| Observación GEO | Guardar un conjunto versionado de consultas representativas, registrar fecha, motor, respuesta, URL y cita observada, comparar competidores y atribuir referencias verificables | Pendiente. “20 prompts” es un punto inicial configurable, no un estándar. Las respuestas pueden variar por usuario, región, idioma y fecha; la medición no representa ranking universal. |
| Tráfico y conversión | Analizar referencias de IA, sesiones y conversiones solo donde analítica y consentimiento lo permitan | Pendiente de integración y política de datos. Search Console/Bing pueden ofrecer informes específicos según disponibilidad de propiedad/producto; además, los informes y métricas cambian. |

### 14.3 Criterios de seguridad editorial y medición

- Ninguna función fabricará consenso, sembrará menciones, publicará reseñas falsas, enviará spam a Reddit/foros ni comprará enlaces.
- Las recomendaciones de acceso a crawlers deben mostrar qué agente se permitiría, qué rutas puede rastrear y el efecto sobre privacidad/licencias; la decisión pertenece al propietario.
- Una cita LLM observada es evidencia puntual con fuente, consulta, fecha, idioma/región y método; no se presentará como garantía, cuota de mercado ni ranking.
- Las sugerencias editoriales serán borradores. Publicar, editar el sitio del cliente, contactar a terceros o realizar envíos exigirá aprobación explícita y trazabilidad.
- Los informes distinguirán: comprobación técnica automatizable, recomendación editorial, trabajo de marketing externo y decisión del propietario.

### Referencias de plataforma para diseñar estas funciones

- [Google Search Central: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features): aplicar las prácticas generales de SEO; la elegibilidad no garantiza aparecer en funciones de IA.
- [Google Search Central: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics): comprobar contenido y enlaces tras el renderizado.
- [IndexNow: FAQ](https://www.indexnow.org/faq): el envío notifica URLs a buscadores participantes; cada motor decide su tratamiento.
- [Bing Webmaster Blog: AI Performance report](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools): referencia para observar citas en experiencias de IA de Bing; la disponibilidad puede cambiar.

## 15. Competidores, backlinks y rank tracking por fases

El propietario solicitó estas tres capacidades para una plataforma con muchos clientes. **Plan aprobado como objetivo; funcionalidades no activadas.** La lista blanca actual del cliente MCP solo permite identidad y auditoría técnica. Tener una clave con scopes amplios no habilita herramientas adicionales en Rubik.

### Fase A · Contrato, disponibilidad y costes

- Revisar la documentación oficial y el esquema real de herramientas de la instancia de OpenSEO: herramientas disponibles, argumentos, fuentes/subproveedores, planes, cuotas, paginación, retención y errores. Registrar fecha y evidencia; no inferir gratuidad del repositorio abierto ni de una auditoría sin Lighthouse.
- Distinguir análisis de competidores SEO, comparación de auditorías y comparación de visibilidad GEO. Ninguno sustituye a los demás ni aporta rankings sin una fuente que los mida.
- Para backlinks: verificar cobertura, fechas, frescura, límites, datos de dominios/URLs y condiciones de reutilización. No afirmar exhaustividad ni equiparar ausencia de datos con cero enlaces.
- Para rank tracking: comprobar país, idioma, ubicación/dispositivo, motor, SERP, cadencia admitida y unidades por consulta; comparar el coste de keywords × proyectos × ubicaciones × frecuencia.
- Entrega: matriz de capacidades/contratos y costes con estados confirmado/no confirmado, decisión de fuente y alcance. **Primera versión:** [OPENSEO-CAPACIDADES](OPENSEO-CAPACIDADES.md), verificada contra el código de referencia el 09/10/2026; falta confirmarla en la instancia alojada. Hasta entonces no hay llamadas live ni ampliación silenciosa de la lista blanca.
- Herramientas de OpenSEO MCP identificadas el 08/10/2026 (trasladado del PR #11; **hay que revalidarlas contra la instancia real** antes de usarlas):
  - competidores: `get_domain_overview`, `get_ranked_keywords` y `find_serp_competitors`;
  - backlinks: `get_backlinks_overview` y `get_backlinks_profile`;
  - rank tracking: `estimate_rank_tracker_cost`, que debe llamarse y aceptarse antes de configurar o ejecutar nada.
  - Según la documentación de entonces, estas consultas usan DataForSEO, consumen créditos con tarifa variable, y el rank tracking de OpenSEO es semanal por defecto. Rubik no activa ninguna recurrencia sin consentimiento y presupuesto.

### Fase B · Base multicliente y consultas manuales

| Capacidad | Primera entrega | Criterio |
|---|---|---|
| Competidores | Lista aprobada por proyecto y consultas de comparación manuales según datos disponibles | Dominio/cliente correcto, método y fecha, datos faltantes explícitos, permisos y aislamiento negativos |
| Backlinks | Consulta manual, paginación e informe persistido con provenance | Coverage/límites visibles, deduplicación, fuente, retención y exportación; no automatizar construcción de enlaces |
| Rank tracking | Conjunto versionado de keywords y contexto; una medición manual persistida | Guardar posición o desconocido con método, fecha, motor, país, idioma/dispositivo y configuración comparable |

Dependencias comunes: mapeo del proveedor por proyecto, RLS, consentimiento, límites finitos de gasto/cuotas y confirmación del coste donde proceda. El Core debe incorporar contratos compartidos; la aplicación implementa transporte, persistencia e interfaz sin copiarlos.

### Fase C · Histórico y programación

- Snapshots e historial por proyecto; comparar únicamente series con método/contexto compatible.
- Para rank tracking: consultas periódicas mediante job runner, programación explícita, idempotencia, un trabajo activo, reintentos acotados, manejo 429, cancelación/revocación y presupuesto por tenant/proveedor/periodo.
- Para competidores/backlinks: refresco configurable únicamente si fuente, cuota y presupuesto lo permiten; no forzar una frecuencia común.
- Entrega: pruebas de aislamiento entre clientes, concurrencia, repetición, fallo parcial, límites y cancelación; observación programada sin publicación ni gasto fuera del presupuesto autorizado.

### Fase D · Piloto y escalado

Validar primero Sarah con fuente autorizada y un conjunto pequeño; revisar calidad/latencia/coste real, exportación, borrado y recuperación. Ampliar después a otros clientes y planes compatibles. No presentar la fase como operativa por existir solo código, mocks o un contrato.
