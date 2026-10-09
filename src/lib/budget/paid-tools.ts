// Policy for OpenSEO tools that consume credits (owner decision of 09/10/2026, rule 6): a tool
// whose real cost can exceed what was reserved stays BLOCKED until it has a verifiable maximum.
// Even with a maximum, a paid tool stays blocked until the owner approves it explicitly: the
// budget decision allows implementation and simulated tests, not paid calls. This list is the
// only place that can unblock one, and every change goes through review.

export type PaidToolState =
  /** Cost can exceed any reservation: no verifiable per-call maximum exists. */
  | "BLOCKED_NO_CAP"
  /** A verifiable maximum exists, but paid calls are not approved yet. */
  | "BLOCKED_PENDING_APPROVAL"
  | "ALLOWED";

export interface PaidToolPolicy {
  state: PaidToolState;
  /** How the maximum is guaranteed, when there is one. */
  cap: string | null;
  /** Maximum credits for a given input, only for tools with a verifiable cap. */
  maxCredits?: (input: Record<string, unknown>) => number | null;
  note?: string;
}

const noCap = (note: string): PaidToolPolicy => ({ state: "BLOCKED_NO_CAP", cap: null, note });

/**
 * Paid OpenSEO tools, from the reference code `Juanmaes83/open-seo@0ffff93` (docs/OPENSEO-CAPACIDADES.md
 * and docs/CONSUMO-Y-PRESUPUESTO.md). OpenSEO only checks that the balance is above zero before a
 * call, charges the real DataForSEO cost × 1.28 afterwards (balances may go negative) and reports
 * no per-call cost (`meta.creditsCharged` is never set). The "~" figures in the tool descriptions
 * are indicative, not maximums, so these tools have no verifiable cap.
 */
export const PAID_TOOLS: Readonly<Record<string, PaidToolPolicy>> = {
  get_domain_overview: noCap("~100–300 créditos; caché 12 h"),
  get_domain_keyword_suggestions: noCap("~100–300 créditos; caché 12 h"),
  get_ranked_keywords: noCap("variable"),
  find_serp_competitors: noCap("variable"),
  get_keyword_metrics: noCap("hasta 700 keywords por llamada"),
  research_keywords: noCap("~30–100 por semilla; clickstream duplica"),
  get_serp_results: noCap("~5 por keyword a profundidad 20"),
  get_backlinks_overview: noCap("~50 dominio, ~25 página"),
  get_backlinks_profile: noCap("~30 por página"),
  get_local_rank_grid: noCap("una llamada por punto: gridSize²"),
  get_local_serp_results: noCap("variable"),
  search_local_businesses: noCap("variable"),
  get_business_profile: noCap("variable"),
  get_business_reviews: noCap("cobro al crear la tarea"),
  get_business_updates: noCap("cobro al crear la tarea"),
  get_google_business_questions: noCap("variable"),
  // The tool rejects a run whose fresh ESTIMATE exceeds `maxCostCredits`. The charge is still the
  // real cost after the call, and it is not reported per call, so the cap is on the estimate, not
  // on the charge. It stays blocked: paid calls are not approved and the maximum is not verifiable.
  run_rank_tracker: {
    state: "BLOCKED_NO_CAP",
    cap: null,
    note: "maxCostCredits limita la estimación, no el cobro real; sin coste por llamada en la respuesta",
  },
};

export type PaidToolDecision =
  | { ok: true; maxCredits: number }
  | { ok: false; reason: "NOT_A_PAID_TOOL" | PaidToolState | "NO_MAXIMUM_FOR_INPUT" };

/** Whether a paid call may be reserved at all, and for how much (the maximum, never an estimate). */
export function paidToolDecision(tool: string, input: Record<string, unknown>, policies = PAID_TOOLS): PaidToolDecision {
  const policy = Object.hasOwn(policies, tool) ? policies[tool] : undefined;
  if (!policy) return { ok: false, reason: "NOT_A_PAID_TOOL" };
  if (policy.state !== "ALLOWED") return { ok: false, reason: policy.state };
  const max = policy.maxCredits?.(input) ?? null;
  return max === null ? { ok: false, reason: "NO_MAXIMUM_FOR_INPUT" } : { ok: true, maxCredits: max };
}
