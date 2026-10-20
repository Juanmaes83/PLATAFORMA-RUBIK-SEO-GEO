# Ampliación N2 SEO/GEO · alcance aprobado y contrato de ejecución

**Decisión de producto:** Juanma, 19/10/2026. **Estado:** alcance y diseño para implementar; ningún gate nuevo está acreditado por este documento. **Base documental:** `main@f39620e347756e980192aac8fe93b9a2e8db6376`. Leer junto a [Roadmap Maestro](ROADMAP-MAESTRO-2026.md), [estado de H1/H2/H3](ESTADO-TRES-NIVELES-Y-CIERRE-20261018.md) y [CONTROL-PROYECTO](CONTROL-PROYECTO.md).

## 1. Objetivo y límites

Conservar **todo el árbol SEO propuesto** como mapa de capacidades de Rubik SEO/GEO. Implementar sus funciones valiosas ampliando N2-09 a N2-14, con entregas verificables y resultados medidos. El árbol no constituye una promesa de cobertura operativa: cada hoja tendrá estado `propuesta / implementada-local / acreditada-alojada / no-disponible` y fuente, permisos, coste y criterio de aceptación. No convertir «150+ hacks» ni el caso CBD en reglas automáticas.

Esta ampliación no cambia los gates de H1/H2. Primero, terminar U03/#129 y la aceptación integral ficticia según el protocolo vigente. Después, cada módulo N2 se habilita únicamente en el entorno expresamente autorizado, con esquema, identidad, aislamiento, banderas y recuperación acreditados. No usar Production o Sarah como fixture; no llamar a Google, OpenSEO ni modelos o servicios facturables por inferencia. No publicar contenido ni solicitar indexación automáticamente.

## 2. Contrato común de oportunidad y propuesta

Toda propuesta visible en Rubik debe incluir:

| Campo | Regla |
|---|---|
| Alcance | `organization_id`, `project_id`, URL canónica o entidad afectada; nunca cruzar tenants. |
| Evidencia | Fuente, propiedad o captura, identificador verificable cuando exista, fecha de observación, ventana y estado de firma/verificación. |
| Naturaleza | Separar **observado**, **declarado**, **inferencia/hipótesis** y **recomendación**. «Sin datos» no significa cero ni «sin problemas». |
| Diagnóstico | Qué se observó, qué explicación se propone, nivel de confianza y alternativas relevantes; no atribuir causalidad solo por una correlación. |
| Acción | Cambio concreto, responsable, riesgo, reversión y aprobación humana antes de editar un sitio externo. |
| Resultado | Línea base, métrica, segmentación, fecha de aplicación, ventana de seguimiento y comparación posterior; registrar también resultado nulo o negativo. |
| Seguridad | Lectura por membresía; escrituras autorizadas y auditadas conforme S1/S2. Exportación y restauración cubren los nuevos datos antes de activar persistencia alojada. |

El identificador de fuente no debe contener claves, JWT, URLs de bypass ni datos sensibles en logs. El informe N2-14 debe mostrar cobertura y límites por módulo. Los cálculos de puntuación se explican y versionan; nunca disfrazar estimaciones como datos de proveedor.

## 3. Árbol completo y destino funcional

| Rama original | Entrega N2 propuesta | Condición para mostrar un hallazgo |
|---|---|---|
| **Keyword Research**: discovery, long-tail, low-competition, volume, SERP | N2-09: inventario consulta–URL–intención–país–dispositivo; agrupación y revisión de intención; SERP observada con fecha. | Volumen/dificultad solo con fuente licenciada; `low-competition` es hipótesis sin esa fuente. Distinguir consultas GSC de universo de mercado. |
| **On-page SEO**: title, headings, URL, image, internal links, schema, CTR | N2-09: auditorías por URL y propuestas de edición con diff, evidencia y comprobación posterior. | Title/H1/enlaces/markup deben extraerse de una captura o rastreo autorizado y fechado. CTR se interpreta con consulta, posición, país y dispositivo; sin garantía de mejora. |
| **Content Optimization**: gap, NLP, entities, refresh, readability | N2-12: mapa de cobertura y briefs; fuentes y afirmaciones contrastables; control editorial y caducidad. | «NLP optimization» se reformula como utilidad, exactitud y cobertura semántica, sin densidad obligatoria ni reescritura de competidores. |
| **Technical SEO**: crawl, index, sitemap, robots, redirects, speed, logs | N2-09 + N2-10: registro de hallazgos técnicos, severidad, URL, evidencia y relectura. | Distinguir rastreabilidad de indexación real. Logs y Core Web Vitals solo si hay acceso y contrato; no inferirlos de un crawler. |
| **Link Building**: PR, guest posting, broken links, mentions, assets, HARO | N2-11: registro de menciones, enlaces rotos y oportunidades editoriales con procedencia y revisión. | No cuotas de enlaces, anchors manipulativos ni compra de enlaces que transmitan ranking. DR y tráfico de terceros son métricas de su proveedor, no criterios de Google. |
| **AI SEO**: visibility, entities, citations, Reddit, third-party mentions | N2-13: observaciones por motor/modelo, consulta, fecha, locale, respuesta y cita; propuestas con evidencia. | La presencia/cita es una muestra, no garantía ni ranking estable. Reddit y terceros son fuentes observadas, no objetivos de spam. |
| **International SEO**: hreflang, multilingual, translation | Extensión N2-09/N2-12 condicionada a proyectos multilingües. | Comprobar URLs equivalentes, locales y reciprocidad; traducción con revisión humana. No crear páginas por combinatoria sin necesidad real. |
| **Analytics**: GSC, Bing, GA4, reporting | N2-10 y N2-14: medición por fuente y periodo, comparación antes/después y cobertura del informe. | Conectores nuevos sujetos a consentimiento, alcance OAuth, costes y prueba de aislamiento; ninguna fuente ausente se imputa como cero. |
| **SEO Tools**: Ahrefs, Semrush, Keywords Everywhere, Screaming Frog | Adaptadores opcionales de importación/lectura con contrato de licencia, fecha y procedencia. | No requisitos del producto base ni llamadas pagadas sin aprobación. Distinguir dato de herramienta de dato de buscador. |
| **SEO Wins**: hacks, tráfico, backlinks | Biblioteca de casos/experimentos medidos dentro de N2-14, no motor de «hacks». | Publicar internamente solo casos con línea base, cambios, ventana y límites; evitar atribución causal no demostrada. |
| **Growth**: tráfico, leads, conversión, ingresos, escala | Métricas de resultado y priorización en N2-10/N2-14. | Leads/ingresos únicamente desde fuente autorizada; no inferir revenue de clics. Segmentación por cliente y proyecto. |

## 4. Entregas revisables y orden

**N2-A · Procedencia y oportunidades (N2-09/12/14).** Inventariar el contrato actual de `seo_keywords`, clústeres, evidencias, briefs e informe. Añadir la relación consulta → intención revisada → URL → fuente → oportunidad → acción → resultado sin romper v2/v3/v4 de recuperación. Empezar con capturas/importaciones ficticias locales; no depender de un proveedor nuevo. Aceptación: positivos y negativos de RLS entre organizaciones y entre A1/A2; fuente ausente o firma inválida no produce observación «verificada»; informe y exportación reflejan el estado exacto; restauración doble idempotente.

**N2-B · Auditoría de página y enlazado interno (N2-09).** Contrato de snapshot por URL para title, H1/H2, canonical, indexabilidad, metadatos de imagen, enlaces internos y markup estructurado. Diferenciar página no rastreada, dato parcial y hallazgo. Proponer cambios, no aplicarlos. Aceptación: snapshot fechado, URL del mismo proyecto, diff revisable, falsos positivos documentados y medición posterior. Rastreo externo requiere presupuesto, robots/permisos y autorización separados.

**N2-C · Medición de impacto (N2-10/14).** Registrar fecha del cambio y comparar ventanas equivalentes antes/después por consulta, URL, país y dispositivo; separar GSC (clics, impresiones, CTR, posición media) de GA4/conversión. Mostrar estacionalidad, cambios simultáneos y cobertura insuficiente como límites. Aceptación: cálculos reproducibles con datos ficticios, ausencia tratada como ausencia, filtros de tenant y comparación exportable con procedencia.

**N2-D · Contenido y GEO (N2-12/13).** Vincular briefs y propuestas a evidencias y a una página o entidad concreta. Para GEO registrar protocolo de consulta, motor, fecha, idioma/locale y cita observada; repetir muestras antes de concluir tendencia. Aceptación: observación declarada distinta de verificada, revisión humana, rechazo de afirmaciones sin soporte y ningún contenido publicado o indexado desde Rubik.

**N2-E · Menciones/enlaces e internacional (N2-11/09/12).** Activar solo al tener fuente y proyecto que lo requieran. Aceptación: enlaces y menciones con URL, fecha, estado y permiso de uso; diagnósticos hreflang con pares recíprocos y locales coherentes; sin recomendaciones basadas solo en DR ni acciones automáticas de outreach.

Las cinco entregas son incrementos de producto, no cinco PR obligatorias. Planificar los límites de cada PR según dependencia real de migraciones, recuperación y pruebas. Mantener #129 y cualquier trabajo activo de Claude en sus ramas; no mezclar esta ampliación con el gate U03.

## 5. Jev · piloto acotado N2-J

Jev se considera **adaptador opcional de evaluación**, no fuente de verdad ni requisito de H1/H2. El primer uso permitido sería clasificar *relevancia* e *intención* de consultas ya disponibles en N2-09. El código debe aceptar un evaluador intercambiable y permitir correr la misma batería sin proveedor (etiquetas humanas y fixture local). Ninguna activación de API, credencial, gasto o envío de consultas reales de clientes queda autorizado por este documento.

1. Definir taxonomía cerrada con `other/ambiguous`, prompt/rúbrica versionados y entrada mínima sin datos personales ni secretos.
2. Etiquetar manualmente un conjunto representativo por idioma, intención, marca/no marca y casos ambiguos. Guardar desacuerdos y decisiones humanas. El número «50» del artículo es una sugerencia experimental, no un certificado de calibración.
3. Comparar precisión por clase, abstención, calibración de confianza, coste y latencia en el conjunto retenido; fijar umbrales con esos resultados y revisión humana de errores de alto impacto.
4. Resultado: propuesta revisable con probabilidad declarada como salida del modelo y versión; nunca editar URL, aprobar brief, redirigir, publicar ni descartar consultas de forma irreversible.
5. Antes de proveedor real: decidir condiciones de datos, presupuesto, disponibilidad, rate limits y plan de desactivación. En un fallo o dato insuficiente se muestra `no evaluado`, no un juicio inventado.

El texto aportado sobre Jev contiene afirmaciones de marketing sobre precio, velocidad y precisión. Deben verificarse con documentación vigente y medición propia antes de una integración pagada. El diseño no depende de ese proveedor concreto.

## 6. Evidencia y gobierno de entrega

Por entrega registrar SHA, entorno/ref, migraciones/flags efectivamente presentes, fuente o fixture, casos positivos/negativos, resultados, limpieza y límites. `PASS local`, `PASS alojado`, `FAIL`, `BLOCKED` y `SKIP` son estados diferentes. GitHub Actions sin jobs no es CI verde. Ningún módulo N2 pasa a «operativo» por estar fusionado o porque Vercel muestre READY.

Revisar primero el diff y el trabajo activo de #129/Claude. Tras el gate U03, elaborar implementación en rama revisable desde main actualizado, sin tocar Production ni Sarah. Coordinar cualquier migración con el contrato de exportación/restauración vigente y las decisiones R1/retención. La cuenta supervisora puede usar este documento para preparar prompts de ejecución; cada prompt debe referir el HEAD actual, una entrega, pruebas y límites, nunca asumir que Claude sigue ejecutándose.
