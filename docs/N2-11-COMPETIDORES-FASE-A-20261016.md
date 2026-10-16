# N2-11 · Fase A — Matriz de capacidades, herramientas y costes

Fecha: 16/10/2026 · Autor: Claude Code (rama `claude/n2-11-competitor-intelligence-v1`).
Alcance: inteligencia de competidores, backlinks y SERP/rank tracking. **No se ha activado ninguna
API ni consumido ningún crédito.** Los costes salen de la documentación del repositorio
([OPENSEO-API-CAPABILITIES](OPENSEO-API-CAPABILITIES.md), [OPENSEO-CAPACIDADES](OPENSEO-CAPACIDADES.md),
[SEO-CAPABILITIES-BACKLOG §15](SEO-CAPABILITIES-BACKLOG.md)), contrastada con el código de referencia de
OpenSEO en el commit `0ffff93` (09/10/2026). **No se han verificado en la instancia alojada**: son
estimaciones, no precios.

## Matriz

| Capacidad | Herramienta | Disponibilidad hoy en Rubik | Límites conocidos | Coste estimado | Permiso necesario | Decisión pendiente |
|---|---|---|---|---|---|---|
| Lista de competidores por proyecto | Rubik (esta PR) | **Disponible** (manual, local) | 200 por proyecto en la vista; dominio normalizado, sin visitarlo | 0 | `draft` (titular, gestor, analista) | — |
| Observación manual (tráfico, palabras clave, dominios de referencia, backlinks, autoridad, páginas indexadas) | Rubik (esta PR), dato copiado de cualquier herramienta | **Disponible** (manual) | Fuente, fecha, método y mercado obligatorios u opcionales según campo; sin valores futuros; «no disponible» ≠ 0 | 0 en Rubik (la licencia de la herramienta externa es del cliente/agencia) | `draft`; verificar: `approve-fact` | — |
| Verificación de un dato | Rubik | **Disponible** | Una vez; no se deshace | 0 | `approve-fact` (titular, aprobador cliente) | — |
| Visión general de dominio (tráfico/keywords estimados) | OpenSEO `get_domain_overview` | **Desactivada** (fuera de `ALLOWED_TOOLS`) | Caché 12 h | ≈100–300 créditos/dominio | Propietario: ampliar lista de herramientas + presupuesto | D-N2-11-1: ¿se activa y con qué tope mensual? |
| Descubrir competidores SERP | OpenSEO `find_serp_competitors` | **Desactivada** | keywords 1–100, limit 1–100, offset 0–1000 | ≈30–100 créditos/consulta (DataForSEO) | Propietario + lista de keywords aprobada por proyecto | D-N2-11-2: origen de las keywords (cliente, GSC, manual) |
| Palabras clave posicionadas | OpenSEO `get_ranked_keywords` | **Desactivada** | Paginada | ≈30–100 créditos/consulta | Propietario + presupuesto | D-N2-11-1 |
| Resumen de backlinks | OpenSEO `get_backlinks_overview` | **Desactivada** | Por dominio o página | ≈50/dominio, ≈25/página | Propietario + presupuesto | D-N2-11-3: ¿backlinks propios, de competidores o ambos? |
| Perfil de backlinks | OpenSEO `get_backlinks_profile` | **Desactivada** | pageSize 50/100/200 | ≈30 créditos/página | Propietario + paginación máxima | D-N2-11-3 |
| Estimar coste de rank tracking | OpenSEO `estimate_rank_tracker_cost` | **Desactivada** (aunque sea gratuita, no está en la lista) | — | 0 | Propietario (activar solo la estimación) | D-N2-11-4 |
| Rank tracking | OpenSEO `run_rank_tracker` | **Desactivada** | Requiere `maxCostCredits` y plan de pago; Rubik no tiene programador | Plan de pago + créditos por ejecución | Propietario + presupuesto + programador (N2-14) | D-N2-11-4: país/idioma/dispositivo, frecuencia y tope |
| Datos del propio sitio en Search Console | OpenSEO (lecturas Google) | Implementado, **lecturas desactivadas** (`OPENSEO_GOOGLE_READS_ENABLED=false`) | — | Sin créditos según la documentación; no confirmado en la instancia alojada | Propietario + consentimiento del cliente | Fuera de N2-11 (CORE-9.4) |

Plan alojado de OpenSEO documentado: 10 USD/mes de base más créditos. Ninguna cifra anterior se ha
comprobado contra la facturación real.

## Reglas de producto que quedan fijadas (también en código y pruebas)

1. Una posición desconocida no es la posición 0 (`RankPosition` con estado `unknown`/`not-in-top`).
2. La ausencia de datos no significa cero backlinks (`BacklinkSummary` con estado `unknown`; en BD,
   `availability='not-available'` exige `value IS NULL`).
3. Solo se comparan datos con igual métrica, fuente, método, mercado y dispositivo, a ≤31 días.
4. Una sola medición no es una evolución; los huecos «no disponible» se muestran como huecos.
5. Las puntuaciones de autoridad de herramientas distintas no son equivalentes (serie distinta).
6. Nada se lanza solo: sin programador, sin llamadas automáticas, sin gasto.

## Siguiente fase (B/C/D) — requiere autorización

- B: activar **solo** `estimate_rank_tracker_cost` y `get_backlinks_overview` con tope de créditos por
  proyecto y aprobación humana previa a cada consulta (`confirm-cost`, ya en la matriz del Core).
- C: persistir resultados como observaciones `method='observed'` con `source_name='OpenSEO/DataForSEO'`,
  referencia al job y recibo S1 (mismo outbox), sin mezclarlas con las manuales.
- D: rank tracking con programador (N2-14) y presupuesto mensual aprobado.
