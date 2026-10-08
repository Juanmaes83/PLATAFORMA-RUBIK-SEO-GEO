# OpenSEO: capacidades MCP y costes para las siguientes fases

**Revisión:** 09/10/2026 (Europe/Madrid). **Estado:** investigación de código y documentación pública, sin llamadas autenticadas, consultas de pago, configuración ni secretos.

Se inspeccionó el fork público `Juanmaes83/open-seo` en el commit `0ffff93101043aad7600a3b6a499a0cd2887ef49`. Esto demuestra su contrato de código, no que el servicio alojado use exactamente ese commit ni que la cuenta tenga todas las herramientas/scopes. Antes de activar cada integración hay que contrastar `tools/list`, la cuenta, cuotas y versión del endpoint real. Rubik conserva su lista blanca actual de cinco herramientas de auditoría.

## Herramientas y entradas confirmadas en código

Todas las herramientas siguientes usan `projectId` y autorización de pertenencia al proyecto. Las herramientas de investigación marcadas con consumo no son gratuitas por tener un nombre de lectura.

| Área / herramienta | Entradas y límites | Consumo / efecto |
|---|---|---|
| Competidores: `find_serp_competitors` | `keywords` 1–100, cada una 1–120 caracteres; `locationCode`/`languageCode` o mercado del proyecto; `resultTypes` 1–4; `excludeDomains` hasta 50; `includeSubdomains`; orden por visibility/traffic_estimate/avg_position/keyword_count; `limit` 1–100 (50 por defecto), `offset` 0–1000 | Usa DataForSEO Labs y créditos. Mercado nacional; no búsqueda local por radio ni medición GEO de LLM |
| Backlinks: `get_backlinks_overview` | `target`, `scope` opcional, `hideSpam` true por defecto | Resumen y hasta 100 dominios referentes; descripción estima ~50 créditos dominio / ~25 página. Estimación, no techo contractual |
| Backlinks: `get_backlinks_profile` | `target` hasta 2048 caracteres; `scope`; `page` entero positivo; `pageSize` 50/100/200 (100 por defecto); orden/filtros; `mode` one_per_domain/as_is; `hideSpam` | Una página acotada de URLs, anchors, dofollow/nofollow, autoridad/spam, lost/broken; descripción estima ~30 créditos por página |
| Rank: `get_rank_tracker` | `projectId`, `trackerId` UUID opcional | Lectura de configuraciones o últimos snapshots por keyword; no usa créditos. Informa estado del último run y frescura |
| Rank: `create_rank_tracker` | Dominio normalizado, ubicación/idioma, ubicación local exacta de `search_serp_locations`; devices desktop/mobile/both; profundidad 10–100 en múltiplos de 10; cadencia manual/daily/weekly/monthly | Vacío no consume ni inicia check. MCP usa manual por defecto, mobile y profundidad 40. Añadir keywords a una configuración programada causa consumo futuro |
| Rank: `add_rank_tracking_keywords` | Tracker UUID; 1–2000 entradas, hasta 200 caracteres; `matchCase`; `maxEstimatedScheduledCheckCredits` | Mutación sin check ni coste inmediato; servicio admite hasta 1000 keywords por configuración. Programados exigen aprobación de estimación nominal; no es un techo de gasto runtime |
| Rank: `remove_rank_tracking_keywords` | Tracker UUID y `keywordIds` 1–2000 UUID de `trackingKeywordId` | Sin créditos; conserva snapshots, ignora IDs ausentes/ajenos/repetidos. No habilitada en Rubik |
| Rank: `estimate_rank_tracker_cost` | Tracker UUID; `additionalKeywordCount` 0–1000 opcional | No inicia ni consume. Estima live y, si programado, queued por check y mes. No valida el importe como límite efectivo de futuros fallbacks |
| Rank: `run_rank_tracker` | Tracker UUID, `maxCostCredits` entero positivo obligatorio | Consume. Reestima y rechaza si supera aprobación; devuelve bloqueo si ya hay run. Hosting exige plan de pago; self-host no tiene ese gate de plan |

Fuentes versionadas: [registro MCP](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/mcp/server.ts), [competidores](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/mcp/tools/dataforseo-research-tools.ts), [backlinks overview](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/mcp/tools/get-backlinks-overview.ts), [backlinks profile](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/mcp/tools/get-backlinks-profile.ts), [crear tracker](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/mcp/tools/create-rank-tracker.ts), [leer tracker](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/mcp/tools/get-rank-tracker.ts), [añadir keywords](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/mcp/tools/add-rank-tracking-keywords.ts), [estimar](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/mcp/tools/estimate-rank-tracker-cost.ts), [ejecutar](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/mcp/tools/run-rank-tracker.ts).

## Scope y limitaciones de backlinks

El dominio sin ruta adopta `subdomains` por defecto; pedir `domain` explícitamente para excluir subdominios. También hay `exact_url` y `subfolder`; `page` es alias obsoleto de exact_url. Para subfolder, los totales vienen de backlinks filtrados: sin rank, tendencias ni desglose de dominios referentes. Las tendencias incluyen subdominios incluso cuando el resumen usa domain, limitación del proveedor. No mezclar estos scopes en una serie sin advertencia.

Self-host necesita Backlinks API habilitada en su cuenta DataForSEO. La herramienta no construye enlaces, publica ni contacta a terceros. El filtrado de spam y el modo one_per_domain hacen que un informe no equivalga a inventario exhaustivo de enlaces.

Fuente: [schema de backlinks](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/types/schemas/backlinks.ts) y herramientas anteriores.

## Costes, planes y límites

La [tarifa pública alojada](https://openseo.so/pricing), consultada el 09/10/2026, anuncia base de $10/mes con $10 de uso; prueba con $0.50. Competidores, backlinks y rank tracking usan créditos. Extras comprados se conservan y los créditos incluidos se reinician por ciclo; el servicio requiere suscripción activa. Esto no verifica el plan ni saldo de nuestra cuenta.

El código usa `managed_service_access`, `paid_plan`, `usage_credits` y `topup_credits`. La medida alojada aplica factor **1.28** al coste DataForSEO y **1000 créditos/USD**, con redondeo por llamada; el coste real se obtiene de la respuesta del proveedor. El preflight de saldo no demuestra un presupuesto estricto por cliente de Rubik. En self-host no se aplica ese metering alojado: se paga directamente DataForSEO y sigue habiendo costes de infraestructura y datos.

Para rank, el estimador del código contiene estas tarifas base por SERP: live $0.002 para los primeros 10 resultados + $0.0015 por cada bloque adicional de 10; queued $0.0006 + $0.00045 por bloque adicional. Son constantes de ese commit, **no precios de proveedor garantizados**. Multiplica keywords × dispositivos; live redondea cada petición y queued agrupa hasta 100 tareas. Por mes estima daily=30, weekly=4, monthly=1. Fallos/rechazos/timeouts queued pueden generar fallback live facturado adicional: la estimación nominal no es un techo runtime.

Límites del servicio en ese commit: 1000 keywords/configuración, 500 configuraciones por proyecto; longitud keyword 200. Son límites de aplicación, no una garantía de cuota disponible. Profundidad, mercados y dispositivos deben guardarse para comparar snapshots.

Fuentes: [billing](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/shared/billing.ts), [estimador rank y límites](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/shared/rank-tracking.ts), [servicio/gate paid_plan](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/features/rank-tracking/services/RankTrackingService.ts), [keywords y proyección](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/features/rank-tracking/services/RankTrackingKeywordService.ts), [metering real](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/lib/dataforseo/client.ts), [autorización de proyecto](https://github.com/Juanmaes83/open-seo/blob/0ffff93101043aad7600a3b6a499a0cd2887ef49/src/server/mcp/project-auth.ts).

## Decisiones para implementar en Rubik

1. Mantener manual por defecto; mapear OpenSEO por proyecto/tenant, consentimiento y scopes específicos antes de habilitar estas herramientas.
2. Añadir contratos al Core y transporte de servidor con lista blanca explícita; no copiar el servicio OpenSEO ni abrir herramientas arbitrarias.
3. Persistir snapshots originales con firma/fuente/método/contexto y comprobar aislamiento entre clientes. Lectura de rank solo aporta últimos snapshots: Rubik necesitará su histórico comparable si promete series propias.
4. Estimar y registrar aprobación del coste para cada run; imponer además presupuesto de Rubik por tenant/proveedor/periodo. Antes de programar, decidir cómo detener fallback adicional y cancelar/revocar.
5. Comprobar tool schemas/plan/cuotas del hosted y estimación real antes de una prueba pequeña autorizada. No activar cron, consumo, upgrade de plan o pago como consecuencia de esta revisión documental.

**Pendiente:** saldo/plan privado, cuotas account-specific, rate limits publicados aplicables a esta cuenta y correspondencia exacta fork/hosted. No se ha ejecutado ninguna herramienta live para resolverlos.
