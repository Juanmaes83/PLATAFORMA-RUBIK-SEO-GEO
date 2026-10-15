// N2-11 future data sources. Contracts only: every automated source is DISABLED. Enabling one
// needs an owner decision (tool allowlist, budget, credentials) recorded outside this module;
// see docs/N2-11-COMPETIDORES-FASE-A-20261016.md. Nothing here calls a provider.

/** A ranking position as a provider would report it. "Not found" is not position 0. */
export type RankPosition =
  | { state: "ranked"; position: number; url: string | null }
  | { state: "not-in-top"; checkedDepth: number }
  | { state: "unknown"; reason: "not-measured" | "provider-error" | "not-configured" };

/** Backlink totals as a provider would report them. Absence of data is not zero backlinks. */
export type BacklinkSummary =
  | { state: "measured"; backlinks: number; referringDomains: number; source: string; observedOn: string }
  | { state: "unknown"; reason: "not-measured" | "provider-error" | "not-configured" };

export function rankLabel(r: RankPosition): string {
  switch (r.state) {
    case "ranked": return `Posición ${r.position}`;
    case "not-in-top": return `Fuera de las primeras ${r.checkedDepth} posiciones`;
    default: return "Posición desconocida";
  }
}

export function backlinkLabel(b: BacklinkSummary): string {
  return b.state === "measured" ? `${b.backlinks} backlinks · ${b.referringDomains} dominios (${b.source}, ${b.observedOn})` : "Sin datos de backlinks";
}

export interface Capability {
  id: "domain-overview" | "serp-competitors" | "ranked-keywords" | "backlinks-overview" | "backlinks-profile" | "rank-tracker";
  label: string;
  /** OpenSEO MCP tool that would provide it (reference code, not verified on a hosted instance). */
  tool: string;
  enabled: false;
  costNote: string;
  needs: string;
}

export const CAPABILITIES: readonly Capability[] = Object.freeze([
  { id: "domain-overview", label: "Visión general de dominio (tráfico y palabras clave estimados)", tool: "get_domain_overview", enabled: false,
    costNote: "≈100–300 créditos por dominio (estimación del código de referencia)", needs: "Ampliar la lista de herramientas OpenSEO, presupuesto y aprobación del propietario" },
  { id: "serp-competitors", label: "Descubrir competidores en resultados de búsqueda", tool: "find_serp_competitors", enabled: false,
    costNote: "≈30–100 créditos por consulta", needs: "Lista de palabras clave aprobada, presupuesto y aprobación del propietario" },
  { id: "ranked-keywords", label: "Palabras clave posicionadas de un dominio", tool: "get_ranked_keywords", enabled: false,
    costNote: "≈30–100 créditos por consulta", needs: "Presupuesto y aprobación del propietario" },
  { id: "backlinks-overview", label: "Resumen de backlinks", tool: "get_backlinks_overview", enabled: false,
    costNote: "≈50 créditos por dominio", needs: "Presupuesto y aprobación del propietario" },
  { id: "backlinks-profile", label: "Perfil detallado de backlinks", tool: "get_backlinks_profile", enabled: false,
    costNote: "≈30 créditos por página de resultados", needs: "Presupuesto, paginación limitada y aprobación del propietario" },
  { id: "rank-tracker", label: "Seguimiento de posiciones", tool: "run_rank_tracker", enabled: false,
    costNote: "Requiere plan de pago y tope maxCostCredits; estimación gratuita con estimate_rank_tracker_cost", needs: "Plan de pago, tope de coste y programador aprobado (hoy no hay programador)" },
] satisfies Capability[]);
