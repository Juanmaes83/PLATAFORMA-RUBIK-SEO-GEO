// N2-11 observation contract. Mirrors the database checks so the form can explain an error
// before the insert; the database stays the authority. A value that a source does not give is
// "not available", never 0: an unknown position is not position zero, and missing backlink
// data is not "zero backlinks".

export const METRICS = ["organic-traffic", "organic-keywords", "referring-domains", "backlinks", "authority-score", "indexed-pages"] as const;
export type Metric = (typeof METRICS)[number];

export const METRIC_LABEL: Record<Metric, string> = {
  "organic-traffic": "Tráfico orgánico estimado (visitas/mes)",
  "organic-keywords": "Palabras clave orgánicas",
  "referring-domains": "Dominios de referencia",
  backlinks: "Enlaces entrantes (backlinks)",
  "authority-score": "Puntuación de autoridad (0–100, propia de cada herramienta)",
  "indexed-pages": "Páginas indexadas",
};
export const METRIC_SHORT: Record<Metric, string> = {
  "organic-traffic": "Tráfico orgánico",
  "organic-keywords": "Palabras clave",
  "referring-domains": "Dominios de referencia",
  backlinks: "Backlinks",
  "authority-score": "Autoridad",
  "indexed-pages": "Páginas indexadas",
};

export const METHODS = ["observed", "declared"] as const;
export type Method = (typeof METHODS)[number];
export const METHOD_LABEL: Record<Method, string> = {
  observed: "Dato observado en una herramienta",
  declared: "Declarado manualmente",
};

export const RELATIONS = ["direct", "indirect"] as const;
export type Relation = (typeof RELATIONS)[number];
export const RELATION_LABEL: Record<Relation, string> = { direct: "Directo", indirect: "Indirecto" };

export const DEVICES = ["desktop", "mobile"] as const;
export type Device = (typeof DEVICES)[number];
export const DEVICE_LABEL: Record<Device, string> = { desktop: "Escritorio", mobile: "Móvil" };

export const MAX_VALUE = 1e12;
const EARLIEST = "2000-01-01";

export interface ObservationInput {
  competitorId: string | null;
  metric: Metric;
  availability: "available" | "not-available";
  value: number | null;
  method: Method;
  sourceName: string;
  sourceReference: string | null;
  observedOn: string;
  marketCountry: string | null;
  marketLanguage: string | null;
  device: Device | null;
  notes: string | null;
}

export type ObservationError =
  | "METRIC"
  | "METHOD"
  | "VALUE_REQUIRED"
  | "VALUE_INVALID"
  | "VALUE_RANGE"
  | "VALUE_NOT_INTEGER"
  | "SOURCE"
  | "REFERENCE"
  | "DATE"
  | "DATE_FUTURE"
  | "COUNTRY"
  | "LANGUAGE"
  | "DEVICE"
  | "NOTES";

const isOneOf = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

/** Parses "1234", "1234.5" or "1234,5". Thousands separators are refused: "1.234" and "1,234" are ambiguous. */
export function parseValue(raw: string): number | null {
  const text = raw.trim().replace(/ /g, "");
  if (!/^\d{1,13}([.,]\d{1,4})?$/.test(text)) return null;
  if (/^\d{1,3}[.,]\d{3}$/.test(text)) return null;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const validDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** `today` is the server's UTC date (YYYY-MM-DD); the database checks again with current_date. */
export function parseObservation(fields: Record<string, string>, today: string): { ok: true; value: ObservationInput } | { ok: false; error: ObservationError } {
  const metric = fields.metric ?? "";
  if (!isOneOf(METRICS, metric)) return { ok: false, error: "METRIC" };
  const method = fields.method ?? "";
  if (!isOneOf(METHODS, method)) return { ok: false, error: "METHOD" };
  const available = fields.availability !== "not-available";
  let value: number | null = null;
  if (available) {
    if (!fields.value?.trim()) return { ok: false, error: "VALUE_REQUIRED" };
    value = parseValue(fields.value);
    if (value === null) return { ok: false, error: "VALUE_INVALID" };
    if (value < 0 || value > (metric === "authority-score" ? 100 : MAX_VALUE)) return { ok: false, error: "VALUE_RANGE" };
    if (metric !== "authority-score" && !Number.isInteger(value)) return { ok: false, error: "VALUE_NOT_INTEGER" };
  }
  const sourceName = (fields.source ?? "").trim();
  if (sourceName.length < 1 || sourceName.length > 80) return { ok: false, error: "SOURCE" };
  const reference = (fields.reference ?? "").trim();
  if (reference.length > 500) return { ok: false, error: "REFERENCE" };
  const observedOn = (fields.observedOn ?? "").trim();
  if (!validDate(observedOn) || observedOn < EARLIEST) return { ok: false, error: "DATE" };
  if (observedOn > today) return { ok: false, error: "DATE_FUTURE" };
  const country = (fields.country ?? "").trim().toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) return { ok: false, error: "COUNTRY" };
  const language = (fields.language ?? "").trim().toLowerCase();
  if (language && !/^[a-z]{2}$/.test(language)) return { ok: false, error: "LANGUAGE" };
  const device = (fields.device ?? "").trim();
  if (device && !isOneOf(DEVICES, device)) return { ok: false, error: "DEVICE" };
  const notes = (fields.notes ?? "").trim();
  if (notes.length > 500) return { ok: false, error: "NOTES" };
  const competitor = (fields.competitor ?? "").trim();
  return {
    ok: true,
    value: {
      competitorId: competitor && competitor !== "project" ? competitor : null,
      metric,
      availability: available ? "available" : "not-available",
      value,
      method,
      sourceName,
      sourceReference: reference || null,
      observedOn,
      marketCountry: country || null,
      marketLanguage: language || null,
      device: device ? (device as Device) : null,
      notes: notes || null,
    },
  };
}

export interface CompetitorInput {
  name: string | null;
  notes: string | null;
  relation: Relation;
}

export function parseCompetitorDetails(fields: Record<string, string>): { ok: true; value: CompetitorInput } | { ok: false; error: "NAME" | "NOTES" | "RELATION" } {
  const name = (fields.name ?? "").trim();
  if (name.length > 120) return { ok: false, error: "NAME" };
  const notes = (fields.notes ?? "").trim();
  if (notes.length > 1000) return { ok: false, error: "NOTES" };
  const relation = (fields.relation ?? "direct").trim();
  if (!isOneOf(RELATIONS, relation)) return { ok: false, error: "RELATION" };
  return { ok: true, value: { name: name || null, notes: notes || null, relation } };
}
