// N2-13 GEO observation contract. Mirrors the checks of 20261017110000 so a form can explain an
// error before writing; the database is the authority. An observation typed by a person is a
// DECLARED observation: nothing here verifies it, fetches its URLs or queries an engine.

export const ENGINES = ["chatgpt", "claude", "gemini", "perplexity", "ai-overviews", "copilot", "other"] as const;
export type Engine = (typeof ENGINES)[number];
export const ENGINE_LABEL: Record<Engine, string> = {
  chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini", perplexity: "Perplexity", "ai-overviews": "AI Overviews (Google)",
  copilot: "Copilot", other: "Otro motor",
};

export const METHODS = ["manual-copy", "screenshot", "shared-link", "export", "other"] as const;
export type Method = (typeof METHODS)[number];
export const METHOD_LABEL: Record<Method, string> = {
  "manual-copy": "Copia manual de la respuesta", screenshot: "Captura de pantalla", "shared-link": "Enlace compartido de la conversación",
  export: "Exportación del motor", other: "Otro método",
};

export const PRESENCES = ["cited", "mentioned", "absent", "unclear"] as const;
export type Presence = (typeof PRESENCES)[number];
export const PRESENCE_LABEL: Record<Presence, string> = {
  cited: "Citada (con enlace o fuente)", mentioned: "Mencionada sin cita", absent: "No aparece", unclear: "No está claro",
};

export interface CitedSource { url: string; title: string }

export interface ObservationInput {
  entityName: string;
  engine: Engine;
  engineDetail: string | null;
  queryText: string;
  observedOn: string;
  marketLanguage: string | null;
  marketCountry: string | null;
  method: Method;
  presence: Presence;
  answerExcerpt: string | null;
  citedSources: CitedSource[];
  mentionedEntities: string[];
  evidenceReference: string | null;
  notes: string | null;
  supersedesId: string | null;
}

export type ObservationError =
  | "ENTITY" | "ENGINE" | "ENGINE_DETAIL" | "QUERY" | "DATE" | "DATE_FUTURE" | "LANGUAGE" | "COUNTRY" | "METHOD" | "PRESENCE"
  | "EXCERPT" | "SOURCES" | "CITED_NEEDS_SOURCE" | "ENTITIES" | "REFERENCE" | "NOTES";

const isOneOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);
const text = (v: string | undefined) => (v ?? "").trim();
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** http(s) URL with a host and no credentials; never fetched. */
export function sourceUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v || v.length > 2048 || /\s/.test(v)) return null;
  try {
    const u = new URL(v);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname || u.username || u.password) return null;
    return /^https?:\/\/[^\s/]+(\/\S*)?$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** "https://… | título" per line. */
export function parseSources(raw: string): { ok: true; value: CitedSource[] } | { ok: false } {
  const out: CitedSource[] = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [u, ...rest] = line.split("|");
    const url = sourceUrl(u);
    const title = rest.join("|").trim();
    if (!url || title.length > 200) return { ok: false };
    if (!out.some((s) => s.url === url)) out.push({ url, title });
  }
  return out.length <= 20 ? { ok: true, value: out } : { ok: false };
}

/** One entity per line (competitors or third parties named in the answer). */
export function parseEntities(raw: string): { ok: true; value: string[] } | { ok: false } {
  const list = [...new Set(raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
  return list.length <= 20 && list.every((e) => e.length <= 120) ? { ok: true, value: list } : { ok: false };
}

export function parseObservation(f: Record<string, string>, today: string): { ok: true; value: ObservationInput } | { ok: false; error: ObservationError } {
  const entityName = text(f.entity);
  if (entityName.length < 1 || entityName.length > 120) return { ok: false, error: "ENTITY" };
  const engine = text(f.engine);
  if (!isOneOf(ENGINES, engine)) return { ok: false, error: "ENGINE" };
  const engineDetail = text(f.engineDetail) || null;
  if (engineDetail && engineDetail.length > 80) return { ok: false, error: "ENGINE_DETAIL" };
  const queryText = text(f.query).replace(/\s+/g, " ");
  if (queryText.length < 1 || queryText.length > 500) return { ok: false, error: "QUERY" };
  const observedOn = text(f.observedOn);
  if (!validDate(observedOn) || observedOn < "2023-01-01") return { ok: false, error: "DATE" };
  if (observedOn > today) return { ok: false, error: "DATE_FUTURE" };
  const language = text(f.language).toLowerCase();
  if (language && !/^[a-z]{2}$/.test(language)) return { ok: false, error: "LANGUAGE" };
  const country = text(f.country).toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) return { ok: false, error: "COUNTRY" };
  const method = text(f.method);
  if (!isOneOf(METHODS, method)) return { ok: false, error: "METHOD" };
  const presence = text(f.presence);
  if (!isOneOf(PRESENCES, presence)) return { ok: false, error: "PRESENCE" };
  const answerExcerpt = text(f.excerpt) || null;
  if (answerExcerpt && answerExcerpt.length > 4000) return { ok: false, error: "EXCERPT" };
  const sources = parseSources(f.sources ?? "");
  if (!sources.ok) return { ok: false, error: "SOURCES" };
  if (presence === "cited" && sources.value.length === 0) return { ok: false, error: "CITED_NEEDS_SOURCE" };
  const entities = parseEntities(f.entities ?? "");
  if (!entities.ok) return { ok: false, error: "ENTITIES" };
  const evidenceReference = text(f.reference) || null;
  if (evidenceReference && evidenceReference.length > 500) return { ok: false, error: "REFERENCE" };
  const notes = text(f.notes) || null;
  if (notes && notes.length > 1000) return { ok: false, error: "NOTES" };
  return {
    ok: true,
    value: {
      entityName, engine, engineDetail, queryText, observedOn, marketLanguage: language || null, marketCountry: country || null, method,
      presence, answerExcerpt, citedSources: sources.value, mentionedEntities: entities.value, evidenceReference, notes,
      supersedesId: text(f.supersedes) || null,
    },
  };
}

/** Lowercase, single-spaced, accent-insensitive key for "the same question". */
export const queryKey = (q: string) => q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,;:]+/g, " ").replace(/\s+/g, " ").trim();

const bare = (h: string) => h.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
export function hostOf(url: string): string | null {
  try {
    return bare(new URL(url).hostname);
  } catch {
    return null;
  }
}
/** True when the URL is on the project's own domain (www ignored). */
export function isOwnUrl(url: string, projectDomain: string | null): boolean {
  if (!projectDomain) return false;
  const own = hostOf(/^https?:\/\//i.test(projectDomain) ? projectDomain : `https://${projectDomain}`);
  const host = hostOf(url);
  return !!own && !!host && (host === own || host.endsWith(`.${own}`));
}
