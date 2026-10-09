# Capacidades de OpenSEO MCP: matriz verificada contra el código de referencia

**Fecha:** 09/10/2026.
**Fuente:** repositorio de referencia [Juanmaes83/open-seo](https://github.com/Juanmaes83/open-seo), commit `0ffff93`:
- `src/server/mcp/tools/*.ts`: nombres, *hints* y descripciones de coste;
- `specs/0003` (Search Console) y `specs/0007` (Google Analytics).

**Límites de esta evidencia:**
- Es el código de referencia, no la instancia alojada que usa Rubik. Puede ir por delante o por detrás de ella, y las tarifas del plan alojado pueden cambiar.
- Antes de usar una herramienta hay que confirmarla contra la instancia real (lista de herramientas MCP y plan de la cuenta).
- Este documento no amplía la lista blanca de Rubik ni hace ninguna llamada.

Es el entregable de la fase A de la §15 de [SEO-CAPABILITIES-BACKLOG](SEO-CAPABILITIES-BACKLOG.md).

## Modelo de cobro en alojado (código de referencia)

- **Créditos:** según el spec 0002, en modo alojado las consultas a DataForSEO se cobran en créditos de Autumn, a razón de **1000 créditos = 1 USD**. Antes de cada llamada se comprueba el saldo y después se registra el coste real devuelto por el proveedor. El plan base da créditos recurrentes y se pueden comprar recargas.
- **Auditorías (`run_site_audit`):** en el código no consumen créditos de DataForSEO. El acceso depende del plan (`resolveAuditLimitTier`):
  - sin acceso gestionado responde `PAYMENT_REQUIRED`;
  - el límite de páginas depende de si el plan es gratuito o de pago.
- Lo anterior hay que confirmarlo con la cuenta real, como ya se vio en la auditoría de Sarah.

## Lo que Rubik usa hoy

ADR 0006 permite cinco herramientas:
- `whoami`;
- `run_site_audit`;
- `get_audit_status`;
- `get_audit_issues`;
- `get_audit_pages`.

## Matriz

Leyenda de coste:
- «Sin créditos»: la descripción de la herramienta lo dice expresamente.
- «Créditos»: la herramienta declara consumo. Las cifras con «~» son orientativas, tomadas del propio código.

### Gratuitas y de solo lectura: candidatas a la fase 3

| Herramienta | Qué devuelve | Requisito |
|---|---|---|
| `get_search_console_performance` | Search Analytics por consulta, página, país, dispositivo y fecha; hasta 1000 filas con paginación | Propiedad de GSC conectada **al proyecto de OpenSEO** con OAuth de solo lectura |
| `inspect_urls` | URL Inspection de 1 a 10 URLs: indexación, último rastreo, canónica y verdicts | Igual que la anterior |
| `get_google_analytics_*` (9) y `get_search_opportunities` | GA4: landing orgánicas, rendimiento de páginas, eventos clave, adquisición, audiencia, e-commerce, búsqueda interna y salud de la medición | Propiedad de GA4 conectada al proyecto de OpenSEO (spec 0007) |
| `estimate_rank_tracker_cost`, `get_rank_tracker`, `list_projects`, `get_project_context`, `list_site_audits`, `search_serp_locations`, `list_business_categories` | Estimaciones y lecturas de configuración | — |

### De pago: fase 5, cada uso con presupuesto y aprobación

| Herramienta | Coste orientativo según el código | Uso en Rubik |
|---|---|---|
| `get_domain_overview` | ~100–300 créditos; caché de 12 h por dominio | Competidores |
| `get_domain_keyword_suggestions` | ~100–300 | Competidores y keywords |
| `get_ranked_keywords`, `find_serp_competitors`, `get_keyword_metrics`, `research_keywords` (~30–100 cada uno), `get_serp_results` (~5 por consulta a profundidad 20) | Créditos (DataForSEO) | Competidores y keywords |
| `get_backlinks_overview` | ~50 por dominio, ~25 por página | Backlinks |
| `get_backlinks_profile` | ~30 por página de resultados | Backlinks |
| `run_rank_tracker` | Créditos. Exige `maxCostCredits` aprobado tras `estimate_rank_tracker_cost`; en alojado, plan de pago | Ranking |
| `get_local_rank_grid`, `get_local_serp_results`, `search_local_businesses`, `get_business_profile`, `get_business_reviews`, `get_business_updates`, `get_google_business_questions` | Créditos | SEO local y Business Profile |

### Herramientas que escriben o borran en OpenSEO: fuera de la lista blanca

Escriben en OpenSEO:
- `create_project`;
- `create_rank_tracker`: es manual por defecto y, vacío, no consume;
- `add_rank_tracking_keywords`;
- `save_keywords`;
- `save_report`;
- `save_report_template`;
- `update_project_context`.

Borran (`destructiveHint`):
- `remove_*`;
- `delete_report`;
- `delete_report_template`;
- `delete_site_audit`.

Si alguna se habilita, debe ser una decisión aparte y pedir aprobación por acción.

## Hallazgo con impacto en el roadmap: Search Console y GA4 a través de OpenSEO

Según el spec 0003, OpenSEO:
- conecta **una propiedad por proyecto**;
- usa un OAuth de solo lectura separado del login, que admite cuentas de Google distintas, por ejemplo una agencia conectando a un cliente;
- guarda los tokens cifrados;
- no cobra créditos por estas lecturas.

Rubik ya asocia cada proyecto suyo a un proyecto de OpenSEO (ADR 0007). Por tanto, **Rubik podría leer GSC y GA4 a través de OpenSEO sin guardar tokens de Google propios**.

| | Vía OpenSEO | Vía propia (ADR 0009, fase B) |
|---|---|---|
| Tokens de Google en Rubik | Ninguno: los custodia OpenSEO | Sí, según el ADR 0010 |
| Coste | Sin créditos (spec 0003/0007) | Sin coste de Google; trabajo propio de OAuth y custodia |
| Dependencia | Instancia y cuenta de OpenSEO; las consultas van siempre en directo, sin caché | Solo Google |
| Verificación de la app OAuth | La de OpenSEO: hasta que Google la verifique, solo usuarios de prueba y grants de ~1 semana (spec 0003) | La del cliente OAuth del propietario |
| Bing | No cubierto | Transporte propio (fase A ya integrada) |

**Recomendación técnica, pendiente de tu decisión:**
- Para el piloto, usar la vía OpenSEO para GSC y GA4. Reduce el ADR 0010 a Bing y a proveedores futuros.
- Requiere tres cosas:
  1. Que conectes en la instancia alojada de OpenSEO la propiedad de Sarah, con la cuenta que tenga acceso (por ejemplo, marketing@).
  2. Que se confirme que la instancia ofrece esas herramientas y el estado de verificación de su app OAuth.
  3. Ampliar la lista blanca de Rubik con `get_search_console_performance` e `inspect_urls`. Se haría en un PR con mocks y sin llamadas reales.
- La fase B propia queda como alternativa si la verificación de OAuth o la dependencia no convienen.

## Comprobaciones pendientes antes de usar cualquier herramienta nueva

- Confirmar nombre y esquema en la instancia alojada (listado MCP) con la clave del servidor.
- Confirmar plan, créditos disponibles y si hay *hard caps* en la cuenta.
- Para GSC y GA4: estado de verificación de la app OAuth de OpenSEO y si la cuenta de Sarah aparece como usuario de prueba.
- Para ranking: plan de pago en alojado y `maxCostCredits` en cada ejecución.
