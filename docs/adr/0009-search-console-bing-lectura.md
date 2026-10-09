# ADR 0009 · Search Console y Bing Webmaster en solo lectura

**Estado:** fase A en PR #37 (transportes de servidor, probados solo con simulaciones) y fase C en la rama `claude/webmaster-propiedades`. Fases B, D y E propuestas. Nada conectado: ni OAuth, ni claves, ni propiedades reales.
**Fecha:** 09/10/2026.
**Depende de:** contrato CORE-7 del Core: `runProviderRequest` con transporte inyectado, operaciones `search-console.searchAnalytics` (cuota, release C) y `bing-webmaster.urlInfo` (cuota, release E), conector con consentimiento `provider-connection`, y `toReleaseC` hacia `SearchConsoleAdapter`.

## Contrato de los proveedores (comprobado el 09/10/2026)

La descarga directa de developers.google.com y learn.microsoft.com está bloqueada en este entorno. Los datos salen de búsquedas limitadas a esos dominios oficiales. Antes de la prueba real hay que volver a leerlos en la documentación.

| Proveedor | Llamada | Autorización | Límites y forma |
|---|---|---|---|
| Search Console | `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query` | OAuth 2.0 de usuario; alcance mínimo `https://www.googleapis.com/auth/webmasters.readonly`; la cuenta necesita permiso de lectura en la propiedad | `startDate` y `endDate` en YYYY-MM-DD (hora del Pacífico). `rowLimit` de 1 a 25 000 (1000 por defecto), con paginación por `startRow`. Dimensiones, `type` y `dataState` (`final` o `all`; `HOURLY_ALL` solo con `hour`). Filas `{keys, clicks, impressions, ctr, position}`. Propiedad `sc-domain:` o de prefijo de URL |
| Bing Webmaster | `GetUrlInfo(siteUrl, url)`, JSON GET `https://ssl.bing.com/webmaster/api.svc/json/GetUrlInfo?siteUrl=…&url=…&apikey=…` | OAuth 2.0 (recomendado por Microsoft) o API key: una por usuario y solo para sitios verificados | Respuesta envuelta en `d`: `UrlInfo {AnchorCount, DiscoveryDate, DocumentSize, HttpStatus, IsPage, LastCrawledDate, TotalChildUrlCount, Url}` |

## Decisión: fase A (esta rama)

- `src/lib/search-console/transport.ts` y `src/lib/bing/transport.ts`: transportes solo de servidor con la forma `{kind, request(operation, input)}` que exige el Core. Cada uno admite **una sola operación**; cualquier otra devuelve 400 antes de la red.
- **Credencial inyectada** (`accessToken()` o `apiKey()`): el transporte no sabe dónde vive. Sin credencial devuelve 401, que el Core convierte en `NOT_CONNECTED`, sin red. El token solo viaja en `Authorization`. La clave de Bing va en la URL por diseño del proveedor, así que ningún error incluye URL, cabeceras ni cuerpo.
- **Dominio del proyecto:** Search Console solo admite `sc-domain:<dominio>` o `https://<dominio o www>/`. Bing exige que el sitio y la URL sean https del dominio (o www), sin consulta. Lo demás devuelve 403 sin red.
- **Validación previa:** fechas reales, inicio no posterior al fin, `rowLimit` dentro del rango documentado, dimensiones de una lista cerrada sin repetir (sin `hour` ni `searchAppearance` en esta fase), `type` y `dataState` documentados.
- **Honestidad:**
  - Sin filas: `EMPTY`, no cero clics.
  - Una página llena: `PARTIAL`/`truncated`, porque puede haber más filas.
  - 401 → `NOT_CONNECTED`, 403 → `FORBIDDEN`, 429 → `RATE_LIMITED` con `Retry-After`; los clasifica el Core.
  - Las fechas de Bing en formato WCF (`/Date(ms)/`) o ISO se convierten; los centinelas de «nunca» quedan nulos.
- **Coste:** las dos operaciones son de cuota en el Core. Sin presupuesto finito, `BUDGET_REQUIRED` antes de la red.
- **Procedencia de la consulta:** Core #24/#25 añaden `requestContext` acotado a la procedencia. Search Console exige que `input.siteUrl` coincida con la propiedad configurada antes de llamar al proveedor; la ventana, dimensiones, paginación y `type` quedan registrados. Bing registra `siteUrl` y `url`. Las pruebas usan respuestas simuladas; todavía no hay credenciales ni snapshots reales.

## Fases siguientes

| Fase | Entrega | Bloqueo / dependencia |
|---|---|---|
| B — OAuth de Google y credencial de Bing | Flujo OAuth de servidor (PKCE + `state`), solo `webmasters.readonly`, revocación y caducidad. API key u OAuth de Bing | **Decisión del propietario:** almacén de secretos para los refresh tokens (el mismo bloqueo que la fase 2 del ADR 0007). Cliente OAuth creado por el propietario en Google Cloud. Por verificar: si el alcance exige verificación de la app de Google y en qué condiciones. Nunca pedir credenciales por chat |
| **C — Propiedad por proyecto** (implementada en rama) | Migración `20261009180000_webmaster_properties.sql`: tabla privada con RLS y sin privilegios directos, y RPC `webmaster_property(project, provider, get/connect/revoke)` solo para el owner. Una propiedad activa por proyecto y proveedor, y una por propiedad entre todos los proyectos. Search Console admite `sc-domain:` o https del dominio o www; Bing solo https. Consentimiento obligatorio y revocación con historial. Módulo `src/lib/webmaster/properties.ts`. Sin interfaz ni uso todavía | pgTAP 25/25, incluido el caso de dos organizaciones con el mismo dominio (`23505`). Unit tests e integración Data API en CI. **Orden de migraciones:** fusionar y aplicar antes la cadena OpenSEO (`20261009120000`–`170000`). Si se aplicara esta antes, `db push` exigiría `--include-all` para las anteriores |
| D — Snapshots y UI | Lectura manual (un clic) que guarda el resultado firmado en `provider_results`; histórico comparable; estados vacíos honestos; 360 px | Fases B y C; contexto de la consulta integrado en Core #24/#25 |
| E — Prueba real | Una propiedad autorizada (Sarah) y una consulta pequeña | Autorización expresa del propietario. Las cuotas de Google no tienen coste económico, pero sí límites |

## Rollback

La fase A es aditiva: dos módulos sin uso en producción y sin migraciones. Rollback: revertir el PR.
