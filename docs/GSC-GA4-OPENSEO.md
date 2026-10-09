# Search Console y GA4 vía OpenSEO

**Asociación explícita en desarrollo (10/10/2026, no alojada):** `private.openseo_google_properties` liga un proyecto Rubik, su conexión OpenSEO ACTIVE y una propiedad GSC o GA4 declarada por el owner, con consentimiento, fecha y revocación. Esto separa el host rastreado (`.com` en el piloto), la propiedad GSC mostrada (`https://sarahkaterina.es/`) y GA4 (`properties/519462393`); ninguna redirección ni coincidencia de nombre acredita equivalencia entre propiedades. El código no crea esas asociaciones para Sarah. `webmaster_properties` permanece intacta para la vía GSC/Bing de dominio coincidente; no se reinterpretan sus filas. La función `resolveGoogleSource` obtiene conexión y asociación mediante RPC owner-only de la sesión, compara sus IDs y falla cerrado si falta/revocó alguna. No depende de `OPENSEO_PROJECT_CONNECTIONS_MODE=project`, por lo que prepara lecturas Google independientes del destino del rastreo `legacy`. `OWNER_DECLARED` identifica una declaración del titular, no una verificación del proveedor: el transporte aún debe comparar la propiedad realmente devuelta y el flujo debe revalidar antes de guardar. Sin consulta, guardado ni despliegue de esta migración en alojado.

**Estado vigente de código (09/10/2026):** Core #27 se integró como `main@18fd72cc72640b7138198504d07b86f317816059`; el transporte GA4 de Rubik está limitado a `organic_landing_pages` y la rama de plataforma fija ese SHA. El Core valida las diez columnas del informe mediante una lista explícita: dos dimensiones, ocho métricas con sus tipos y rangos, restricciones de `null` y coherencia de sesiones. El transporte comprueba propiedad, solicitud, contadores, paginación y cobertura; no normaliza semánticamente las métricas. Filas vacías o inválidas producen `ERROR`, nunca `EMPTY` o `VERIFIED`. Una firma acredita integridad y contexto registrado, no exactitud ni cobertura completa. GSC rendimiento y GA4 páginas orgánicas se comprueban por capacidad: otras herramientas ausentes no bloquean esos informes, pero cada una necesita autorización, propiedad y lectura real propias. Todo sigue apagado por defecto; no hay consulta Google ni persistencia de estos informes desde Rubik.

**Decisión del propietario (09/10/2026):** Search Console y GA4 del piloto Sarah se leen a través de OpenSEO. Juanma hace la conexión con Google desde OpenSEO.

Esta decisión permite implementar y probar con simulaciones. No autoriza:

- la conexión de Sarah en Rubik;
- el modo `project`;
- secretos;
- declarar disponible la integración antes de confirmar la instancia alojada.

**Fuente:** el código de referencia `Juanmaes83/open-seo@0ffff93` (rutas citadas abajo). La instancia alojada (`https://app.openseo.so/mcp`, versión de servidor MCP «0.0.12») puede ir por delante o por detrás de ese código.

## 1. Por qué vía OpenSEO

- **Rubik no guarda tokens de Google.** OpenSEO custodia el OAuth cifrado, con un *grant* por producto (`google-search-console`, `google-analytics`).
- **La propiedad se fija por proyecto en OpenSEO.** Están en `gsc_connections` y `ga4_connections`, con una fila por proyecto, y por MCP no se puede elegir ni cambiar.
  - Como Rubik ya enlaza cada proyecto con un único proyecto de OpenSEO (ADR 0007), el aislamiento se apoya en esa conexión.
- **Todas las herramientas son de solo lectura y no consumen créditos** (`readOnlyHint: true`).

## 2. Integraciones diferenciadas

### Search Console

| Herramienta | Entrada | Resultado | Estado en Rubik |
|---|---|---|---|
| `get_search_console_performance` | `projectId`; `dimensions` (1–4); `startDate`/`endDate` (ambas o ninguna, hora del Pacífico); `rowLimit` 1–1000; `startRow`; `type`; `dataState` | `{ok, siteUrl, startDate, endDate, dimensions, rowCount, rows[{keys, clicks, impressions, ctr, position?}], hasMore, nextStartRow}` | Transporte listo para la operación del Core `search-console.searchAnalytics` (`src/lib/openseo/google/search-console.ts`) |
| `inspect_urls` | `projectId`; `urls` (1–10); `languageCode` | Resultado bruto de URL Inspection por URL | Pendiente: la operación del Core `urlInspection` es de release E |

- **Contrato:** el del Core que ya existe. El Core valida, normaliza (`SearchConsoleAdapter`) y emite el resultado de confianza que la plataforma firma con su contexto de consulta. Solo cambia la forma de obtener las filas.
- **Contexto de propiedad y proyecto.** El transporte rechaza la petición, sin datos, en cualquiera de estos casos:
  - el identificador del proyecto OpenSEO inyectado está vacío o malformado. El llamador de servidor debe resolver la conexión `ACTIVE`: el transporte aislado no consulta la base de datos ni acredita esa asociación;
  - la propiedad esperada no pertenece al dominio del proyecto (`sc-domain:` o prefijo `https://` del apex o de www);
  - la petición pide otra propiedad;
  - OpenSEO responde con otra propiedad;
  - la ventana de fechas devuelta no coincide con la pedida.
- **Errores.** OpenSEO agrupa varios fallos en `api_error`; el transporte los separa por su texto fijo.

  | Respuesta de OpenSEO | Estado en Rubik |
  |---|---|
  | `not_connected` | `NOT_CONNECTED` |
  | caducado o revocado | `NOT_CONNECTED` |
  | acceso denegado | `FORBIDDEN` |
  | propiedad no encontrada | 404 |
  | límite de Google | `RATE_LIMITED` |
  | `FORBIDDEN` lanzado (proyecto no accesible con la clave) | `FORBIDDEN` |
  | caída del transporte | error |

  En ningún caso se devuelven filas.
- **Límites:**
  - 1000 filas por llamada; si hay más, el resultado es `PARTIAL`.
  - OpenSEO no cachea ni limita; se aplica la cuota de Google.

### GA4

Son nueve informes más `get_search_opportunities`, que combina GSC y GA4. Las entradas son estrictas: solo `projectId`, fechas, `limit`/`offset` y opciones cerradas. No se pueden pasar la propiedad, las dimensiones ni las métricas.

| Herramienta | Opciones |
|---|---|
| `get_google_analytics_organic_overview` | `trend` diario o semanal |
| `get_google_analytics_organic_landing_pages` | — |
| `get_google_analytics_page_performance` | `includeDate`, `channel` |
| `get_google_analytics_key_events` | `breakdown`, `channel`, `comparePreviousPeriod` |
| `get_google_analytics_traffic_acquisition` | `breakdown`, `comparePreviousPeriod` |
| `get_google_analytics_ecommerce_performance` | `breakdown`, `onlyWithTransactions`, `channel` |
| `get_google_analytics_site_search` | — |
| `get_google_analytics_audience_breakdown` | `breakdown`, `channel`, `comparePreviousPeriod` |
| `get_google_analytics_measurement_health` | solo `projectId` |
| `get_search_opportunities` | necesita GA4 y GSC conectados; `limit` 1–100 |

- **Respuesta:**
  - Si va bien: `{status:"ok", source:{provider:"google_analytics", propertyId, propertyDisplayName}, request, rows, pageInfo, reportMetadata, quota, warnings}`.
  - Si falla: `{status:"error", error:{code, message, retryAfterSeconds?, actionUrl?}}`, con los códigos `ga4_not_connected`, `ga4_reconnect_required`, `ga4_property_inaccessible`, `ga4_report_incompatible`, `ga4_quota_exhausted`, `ga4_upstream_unavailable`, `ga4_malformed_response` y `validation_error`.
- **Estado histórico al abrir #57 (superado por el bloque vigente):** el Core no tenía proveedor ni operaciones de GA4, así que un resultado de GA4 no se podía emitir como confiable ni firmar.
  - Según CLAUDE.md, no se duplica aquí. Se propone en RUBIK-SEO-GEO-CORE:
    - operaciones de OpenSEO de solo lectura para cada informe;
    - normalización de filas;
    - `propertyId` en la evidencia;
    - una función de aceptación de la propiedad inyectada por el host, equivalente a `acceptUrl`;
    - códigos de error estables.
  - El contrato ya existe para `organic_landing_pages`; el informe continúa apagado y sin interfaz de lectura/persistencia.

## 3. Activación y disponibilidad real

Las herramientas de Google forman su propia lista (`GOOGLE_READ_TOOLS`).

- El cliente MCP solo las admite con `OPENSEO_GOOGLE_READS_ENABLED=true`, que ningún entorno define.
- Sin esa variable, las rechaza antes de enviar ninguna petición.
- Las herramientas de pago siguen fuera de cualquier lista.
- La comprobación manual `tools/list` tiene su propio flag `OPENSEO_GOOGLE_CATALOG_CHECK_ENABLED=true`, apagado por defecto. Sin él, el botón no se renderiza y la acción rechaza incluso una petición directa antes de hablar con OpenSEO. El flag de catálogo no habilita lecturas Google.

**Comprobación de la instancia alojada.** `listTools()` hace `tools/list`, que no ejecuta ninguna herramienta y es gratis. Después, `checkGoogleCatalog()` exige para cada herramienta:

- que exista;
- que sea de solo lectura;
- que tenga los campos obligatorios esperados.

Si falta la herramienta del informe concreto, ese informe no se declara compatible. Las demás herramientas se muestran individualmente, sin impedir un informe ya implementado. Compatibilidad de catálogo no demuestra conexión, permisos, lectura ni persistencia.

Orden previsto:

1. **Juanma** conecta en OpenSEO Search Console y GA4 del proyecto de OpenSEO de Sarah, con la cuenta que tenga acceso a esas propiedades.
2. **Comprobación del catálogo** contra la instancia alojada, con la clave del servidor. Es una lectura gratuita que Juanma autoriza aparte; solo entonces se activa temporalmente el flag de catálogo.
3. **Conexión del proyecto Rubik de Sarah con su proyecto de OpenSEO** (ADR 0007), que ya es una decisión pendiente de Juanma, y confirmación de la propiedad esperada.
4. **Activación** de `OPENSEO_GOOGLE_READS_ENABLED` y de la interfaz, en un PR y con una decisión aparte.

## 4. Pruebas

`tests/openseo-google.test.ts`, con un MCP simulado en memoria:

- herramienta y argumentos exactos;
- filas del Core;
- firma válida para el proyecto y rechazada para otro;
- respuesta con otra propiedad descartada;
- rechazos previos sin llamada;
- mapa de errores;
- `FORBIDDEN` lanzado;
- `PARTIAL` y ventana distinta;
- guarda del cliente con y sin la variable;
- comprobación del catálogo.

## Historial: revisión Codex y primer transporte GA4 — 09/10/2026

- En ese momento Core #27 (`b25ba92dc0e6474d397a86e0b06b596f5c876885`) proponía `google-analytics.report` y `searchOpportunities` y seguía abierto. **Sustituido:** el Core corregido se integró en `18fd72c` y el pin de esta continuación cambió a ese merge SHA; #57 se revisa e integra por separado antes de #58.
- `google/analytics.ts` implementa **solo `report: organic_landing_pages`**. Entrada estricta: propiedad confirmada, fechas explícitas reales, `limit` 1–1000, `offset` no negativo. El proyecto OpenSEO se inyecta en servidor; ninguna entrada elige la propiedad MCP. Se rechazan operaciones/opciones adicionales antes de llamar.
- La respuesta debe corresponder a `google_analytics`, propiedad exacta, informe `landing_pages`, canal orgánico, fechas, límite y offset exactos. No se aceptan filas ausentes, contadores incoherentes o cobertura inválida. OAuth/403/cuota se traducen a estados estables sin copiar mensajes privados.
- Muestreo/thresholding/pérdida de datos, advertencias o más páginas impiden declarar el informe completo (`PARTIAL`). Se emite una advertencia genérica sin copiar detalles del proveedor. El contexto firmado conserva la consulta; no hay persistencia ni UI de consulta en este tramo.
- GSC rechaza 0 o más de 4 dimensiones, filas malformadas y recuentos inconsistentes. Un array vacío válido sigue siendo `EMPTY`.
- Catálogo: verifica `object`/`projectId:string`, tipos y límites de las entradas usadas por GSC y este informe GA4; URLs de inspección 1–10. No es una comparación exhaustiva de todos los esquemas GA4 ni una comprobación de coste/OAuth. Un catálogo incompleto, cíclico o con nombres duplicados falla cerrado.
- Panel: «Compatible en el catálogo» significa compatibilidad con estas comprobaciones; **no** conexión, propiedad o permisos reales. No se ha pulsado contra la instancia alojada.
- Pruebas específicas: GSC 10, GA4 7, estados de interfaz 3, paginación MCP 2; todas simuladas, sin credenciales ni red.
- Siguiente: ampliar con contratos específicos los restantes informes y sus metadatos (overview, measurement health y oportunidades tienen envoltorios distintos); no aplanarlos ni declararlos implementados por estar en la lista blanca.

Revisión visible en la Preview del PR tras CI: requiere login como titular y OpenSEO configurado. Las previews actuales no lo tienen y comparten Supabase de producción, por lo que **no debe crearse configuración ni datos de prueba para mostrar el botón**. Las pruebas de render cubren inicio, pendiente, catálogo compatible/incompleto, denegación y fallo. La validación humana en móvil/escritorio queda pendiente; el botón solo ejecuta `tools/list`, sin herramientas Google ni escrituras en Supabase, y no activa ninguna integración.
