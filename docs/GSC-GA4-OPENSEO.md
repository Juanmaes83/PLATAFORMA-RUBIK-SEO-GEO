# Search Console y GA4 vía OpenSEO

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
  - el `projectId` de OpenSEO no viene de la conexión `ACTIVE` del proyecto (nunca se usa el global);
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
- **Contrato: falta en el Core.** El Core no tiene proveedor ni operaciones de GA4, así que un resultado de GA4 no se puede emitir como confiable ni firmar.
  - Según CLAUDE.md, no se duplica aquí. Se propone en RUBIK-SEO-GEO-CORE:
    - operaciones de OpenSEO de solo lectura para cada informe;
    - normalización de filas;
    - `propertyId` en la evidencia;
    - una función de aceptación de la propiedad inyectada por el host, equivalente a `acceptUrl`;
    - códigos de error estables.
  - Hasta que exista, GA4 queda en la lista de herramientas, apagado, y sin interfaz.

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

Si falta algo, la integración no se declara disponible.

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
