# Catálogo objetivo de capacidades SEO/GEO

**Estado:** inventario de capacidades deseadas por el propietario, pendiente de priorización y de entrega por fases.  
**Actualizado:** 29/09/2026.  
**Estado del producto:** CORE-9.0 y CORE-9.1 están fusionados; la seguridad de las migraciones de Supabase está aplicada y verificada por el propietario. La app aún no ha completado la prueba manual de Auth contra el Supabase alojado, no tiene proveedores SEO conectados y no está desplegada.

> **Interpretación:** esta lista registra lo que el propietario quiere que la plataforma pueda cubrir con el tiempo. No significa que ya exista, que todo deba entrar en una única entrega, ni que toda tarea sea automatizable. El orden, los límites, las fuentes de datos, los costes y las aprobaciones se concretarán antes de implementar cada bloque.

## Leyenda de estado

- **No implementado en la plataforma:** no hay flujo funcional en la aplicación.
- **Parcial en el Core:** hay lógica/contratos reutilizables en RUBIK-SEO-GEO-CORE, pero no equivalen a una capacidad operativa de la plataforma.
- **Pendiente de decisión:** requiere definir vertical, proveedor, consentimiento, coste, política editorial o cumplimiento.
- **Solo con aprobación humana:** nunca publicar, enviar, contactar o cambiar un sitio de forma automática sin aprobación registrada.

## Qué existe hoy en el Core y qué no

El Core es una librería, no una suite SEO con interfaz ni datos propios. Tiene piezas reutilizables para metadatos por página, title/description/H1, Page Registry, schema.org por vertical, SEO de medios, canonical/hreflang, HTML inicial, sitemap y robots.txt; también contratos de conectores/proveedores, autoridad/citas, snapshots y borradores de acciones. La plataforma actual no conecta esas piezas a un sitio de cliente ni presenta auditorías SEO. Las integraciones reales, la persistencia productiva y la medición externa siguen pendientes.

## Catálogo deseado

### 1. SEO técnico
**Estado de plataforma:** no implementado. **Core:** parcial en generación de metadata, canonical/hreflang, sitemap, robots, schema y HTML inicial; no hay rastreador ni auditor del sitio.

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

1. Completar prueba manual de Auth y aislamiento con dos cuentas contra el Supabase alojado.
2. Definir CORE-9.2: persistencia, auditoría, provenance, retención y política de claves; validar requisitos legales antes de datos reales.
3. Priorizar por vertical/cliente y decidir qué áreas de negocio (SaaS SEO, e-commerce, afiliación, directorios, monetización) pertenecen realmente a Rubik.
4. Para cada integración: proveedor, permisos mínimos, consentimiento por proyecto, secreto server-side, presupuesto/cuotas y fuente verificable.
5. Para acciones externas (publicar, outreach, reseñas, enlaces, envíos): aprobación humana registrada, alcance explícito, trazabilidad, cancelación y prueba negativa sin autorización.
6. Entregar por etapas con pruebas, CI verde, documentación y revisión humana; no marcar una capacidad como implementada por existir solo como contrato en el Core.

## Relación con la hoja de ruta

- Estado operativo y fases de la plataforma: [ROADMAP.md](ROADMAP.md).
- Plan de ejecución detallado: [CORE-9 EXECUTION-PLAN](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE/blob/main/docs/core-9/EXECUTION-PLAN.md).
- Alcance del Core SEO/GEO: [RUBIK-SEO-GEO-CORE README](https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE#propósito-y-límites).
