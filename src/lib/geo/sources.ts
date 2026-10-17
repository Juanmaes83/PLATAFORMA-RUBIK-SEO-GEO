// N2-13 adapters for data owned by other modules (N2-09, N2-11, N2-12). Those modules exist, but
// this increment does not link GEO to them yet: each reports "not integrated", so the interface
// says so instead of guessing. No engine is queried by the platform.

import authority from "@rubik/seo-geo-core/authority";
import type { Presence } from "./contract";

export type SourceState = { integrated: false; pendingOn: string } | { integrated: true };

/** N2-12 content opportunities/briefs. */
export const contentTarget = {
  state: { integrated: false, pendingOn: "enlazar propuestas GEO con oportunidades y briefs de N2-12 (siguiente incremento)" } as SourceState,
};
/** N2-11 competitor list, to tell competitors from third parties among mentioned entities. */
export const competitorNames = {
  state: { integrated: false, pendingOn: "leer la lista de competidores de N2-11 desde GEO (siguiente incremento)" } as SourceState,
  list: async (): Promise<string[]> => [],
};
/** N2-09 declared keywords, to suggest questions to observe. */
export const keywordQuestions = {
  state: { integrated: false, pendingOn: "leer las keywords declaradas de N2-09 desde GEO (siguiente incremento)" } as SourceState,
  list: async (): Promise<string[]> => [],
};

/** Engines the platform could query automatically: none is connected or authorised. */
export const ENGINE_CONNECTIONS = { connected: false as const, reason: "Sin autorización ni proveedor: no se consulta ningún motor desde la plataforma." };

/**
 * The Core's AI Citation Monitoring record (Release E) for an observation: it keeps mention and
 * citation apart and records manual provenance. The Core labels a manual reading "MEASURED" when
 * the brand appears; this platform shows it as DECLARED until a person verifies it (see
 * docs/N2-13-GEO.md, proposal for the Core).
 */
export function coreCitation(o: { queryText: string; engine: string; engineDetail: string | null; presence: Presence; observedOn: string; citedSources: { url: string }[] }) {
  return authority.normalizeCitationObservation({
    query: o.queryText, provider: o.engine, model: o.engineDetail ?? "", subject: "own",
    mentioned: o.presence === "mentioned" || o.presence === "cited", cited: o.presence === "cited",
    sourceUrl: o.citedSources[0]?.url ?? "", observedAt: o.observedOn,
    provenance: { provider: o.engine, sourceType: "MANUAL", method: "manual", status: "UNKNOWN" },
  });
}
