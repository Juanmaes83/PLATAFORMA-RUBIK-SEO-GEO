// N2-12 adapters for data owned by other modules. N2-09 (declared keywords) and N2-11
// (competitors) are in main, but this increment does not read them yet: each adapter reports
// "not integrated" and returns nothing, so the UI says so instead of guessing.
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
  state: { integrated: false, pendingOn: "conectar las keywords declaradas de N2-09 con Contenidos (siguiente incremento)" },
  list: async () => [],
};
export const competitorSource: CompetitorSource = {
  state: { integrated: false, pendingOn: "conectar las observaciones de competidores de N2-11 con Contenidos (siguiente incremento)" },
  list: async () => [],
};

/** Metrics this module never shows, and why. */
export const UNAVAILABLE_METRICS = [
  "Volumen de búsqueda",
  "Dificultad de palabra clave",
  "Posiciones y tendencias",
  "CTR e impresiones",
] as const;
