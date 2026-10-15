// N2-12 adapters for data that lives in modules not yet merged into main. The content module
// depends on these interfaces only; until the owning PR is merged, each adapter reports
// "not integrated" and returns nothing, so the UI says "No disponible" instead of guessing.
//   - KeywordSource      ← N2-09 declared keywords (PR #114, Codex)
//   - CompetitorSource   ← N2-11 competitor observations (PR #115, Claude)
// Search volume, difficulty, positions, trends and CTR have no source at all in the platform.

export interface DeclaredKeyword {
  phrase: string;
  language: string;
  country: string | null;
  intent: string | null;
  targetUrl: string | null;
}

export interface CompetitorSignal {
  competitorDomain: string;
  metric: string;
  observedOn: string;
  sourceName: string;
}

export type SourceState = { integrated: false; pendingOn: string } | { integrated: true };

export interface KeywordSource {
  state: SourceState;
  list(projectId: string): Promise<DeclaredKeyword[]>;
}
export interface CompetitorSource {
  state: SourceState;
  list(projectId: string): Promise<CompetitorSignal[]>;
}

export const keywordSource: KeywordSource = {
  state: { integrated: false, pendingOn: "N2-09 (keywords declaradas, PR #114)" },
  list: async () => [],
};
export const competitorSource: CompetitorSource = {
  state: { integrated: false, pendingOn: "N2-11 (competidores, PR #115)" },
  list: async () => [],
};

/** Metrics this module never shows, and why. */
export const UNAVAILABLE_METRICS = [
  "Volumen de búsqueda",
  "Dificultad de palabra clave",
  "Posiciones y tendencias",
  "CTR e impresiones",
] as const;
