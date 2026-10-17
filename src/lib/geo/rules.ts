// N2-13 opportunity engine. Deterministic and explainable: every opportunity says which rule
// fired, which observations support it, what part is a hypothesis, what to do and why it has its
// priority. No visibility percentage, ranking or citation frequency is computed: a handful of
// manual observations cannot support them. Observations are only compared within a series of the
// same question, market, engine and method.

import { hostOf, isOwnUrl, queryKey, type Engine, type Method, type Presence } from "./contract";

export interface GeoObservation {
  id: string;
  entityName: string;
  engine: Engine;
  engineDetail: string | null;
  queryText: string;
  observedOn: string;
  marketLanguage: string | null;
  marketCountry: string | null;
  method: Method;
  presence: Presence;
  citedSources: { url: string; title: string }[];
  mentionedEntities: string[];
  supersedesId: string | null;
  verification: "declared" | "verified";
  createdAt: string;
}

export type Rule = "answer-gap" | "mentioned-not-cited" | "competitor-cited" | "volatile" | "repeat-measurement" | "keep-cited";
export type Priority = "high" | "medium" | "low";

export interface Opportunity {
  rule: Rule;
  key: string;
  queryText: string;
  title: string;
  problem: string;
  hypothesis: string;
  suggestedAction: string;
  limitations: string;
  priority: Priority;
  priorityReason: string;
  evidence: GeoObservation[];
}

export const VOLATILITY_DAYS = 31;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const newest = (a: GeoObservation, b: GeoObservation) => b.observedOn.localeCompare(a.observedOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

/** Observations a later correction replaced are history, not current evidence. */
export function current(list: readonly GeoObservation[]): GeoObservation[] {
  const superseded = new Set(list.map((o) => o.supersedesId).filter(Boolean));
  return list.filter((o) => !superseded.has(o.id));
}

/** Same question in the same market. */
export const groupKey = (o: Pick<GeoObservation, "queryText" | "marketLanguage" | "marketCountry">) =>
  [queryKey(o.queryText), o.marketLanguage ?? "", o.marketCountry ?? ""].join("|");
/** Comparable series: same question and market, same engine (and declared model) and method. */
export const seriesKey = (o: GeoObservation) => [groupKey(o), o.engine, o.engineDetail ?? "", o.method].join("|");

export interface QueryGroup {
  key: string;
  queryText: string;
  marketLanguage: string | null;
  marketCountry: string | null;
  /** Latest observation of each comparable series, newest first. */
  latest: GeoObservation[];
  all: GeoObservation[];
}

export function groupObservations(list: readonly GeoObservation[]): QueryGroup[] {
  const groups = new Map<string, GeoObservation[]>();
  for (const o of current(list)) groups.set(groupKey(o), [...(groups.get(groupKey(o)) ?? []), o]);
  return [...groups.entries()].map(([key, obs]) => {
    const sorted = [...obs].sort(newest);
    const seen = new Set<string>();
    const latest = sorted.filter((o) => (seen.has(seriesKey(o)) ? false : (seen.add(seriesKey(o)), true)));
    return { key, queryText: sorted[0].queryText, marketLanguage: sorted[0].marketLanguage, marketCountry: sorted[0].marketCountry, latest, all: sorted };
  }).sort((a, b) => a.queryText.localeCompare(b.queryText));
}

/** Whether two observations can be compared, and why not. */
export function comparable(a: GeoObservation, b: GeoObservation): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (queryKey(a.queryText) !== queryKey(b.queryText)) reasons.push("consultas distintas");
  if ((a.marketLanguage ?? "") !== (b.marketLanguage ?? "") || (a.marketCountry ?? "") !== (b.marketCountry ?? "")) reasons.push("mercados distintos");
  if (a.engine !== b.engine || (a.engineDetail ?? "") !== (b.engineDetail ?? "")) reasons.push("motores o modelos distintos");
  if (a.method !== b.method) reasons.push("métodos de obtención distintos");
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

function priorityFor(evidence: readonly GeoObservation[], base: Priority): { priority: Priority; priorityReason: string } {
  const engines = new Set(evidence.map((o) => o.engine)).size;
  const verified = evidence.filter((o) => o.verification === "verified").length;
  let priority = base;
  const parts = [`${evidence.length} observación(es) en ${engines} motor(es)`, verified ? `${verified} verificada(s)` : "ninguna verificada"];
  // Declared-only evidence never reaches "high": it still has to be checked by a person.
  if (priority === "high" && (verified === 0 || engines < 2)) {
    priority = "medium";
    parts.push(verified === 0 ? "prioridad limitada a media hasta verificar" : "prioridad limitada a media con un solo motor");
  }
  return { priority, priorityReason: parts.join("; ") };
}

const LIMITS = "Respuestas generativas variables por fecha, cuenta, ubicación y modelo; observación manual sin repetición sistemática. No garantiza aparecer ni ser citado.";

/** Runs every rule on every question group. `projectDomain` decides which cited URLs are the project's own. */
export function opportunities(list: readonly GeoObservation[], projectDomain: string | null): Opportunity[] {
  const out: Opportunity[] = [];
  for (const g of groupObservations(list)) {
    const latest = g.latest;
    const ownCited = latest.filter((o) => o.presence === "cited" && o.citedSources.some((s) => isOwnUrl(s.url, projectDomain)));
    const mentioned = latest.filter((o) => o.presence === "mentioned" || (o.presence === "cited" && !ownCited.includes(o)));
    const absent = latest.filter((o) => o.presence === "absent");
    const foreignDomains = [...new Set(latest.flatMap((o) => o.citedSources.map((s) => s.url)).filter((u) => !isOwnUrl(u, projectDomain)).map(hostOf).filter((h): h is string => !!h))];
    const base = { key: g.key, queryText: g.queryText, limitations: LIMITS };

    if (latest.length > 0 && absent.length === latest.length) {
      const p = priorityFor(absent, "high");
      out.push({ ...base, rule: "answer-gap", evidence: absent, ...p,
        title: `Responder directamente a «${g.queryText}»`,
        problem: `La marca no aparece en la última respuesta observada de ${absent.length} motor(es) para esta pregunta.`,
        hypothesis: "Una página que responda directamente a la pregunta, con estructura clara y datos propios citables, podría hacer la marca más fácil de encontrar y citar.",
        suggestedAction: "Crear o mejorar la página que responde a esta pregunta: respuesta directa al inicio, encabezados por subpregunta, datos originales con fecha y autoría visibles." });
    }
    if (mentioned.length > 0 && ownCited.length === 0) {
      const p = priorityFor(mentioned, "medium");
      out.push({ ...base, rule: "mentioned-not-cited", evidence: mentioned, ...p,
        title: `Hacer citable la información propia sobre «${g.queryText}»`,
        problem: "La marca se menciona, pero ninguna respuesta observada enlaza una página del proyecto.",
        hypothesis: "Información propia más clara, verificable y atribuida podría favorecer que se cite como fuente; la mención no equivale a cita.",
        suggestedAction: "Revisar la página propia más relevante: definición clara de la entidad, datos originales con fuente, autoría y fecha de actualización visibles." });
    }
    if (ownCited.length === 0 && foreignDomains.length > 0) {
      const ev = latest.filter((o) => o.citedSources.some((s) => !isOwnUrl(s.url, projectDomain)));
      const p = priorityFor(ev, "medium");
      out.push({ ...base, rule: "competitor-cited", evidence: ev, ...p,
        title: `Revisar las fuentes que se citan para «${g.queryText}»`,
        problem: `Las respuestas observadas citan otros dominios (${foreignDomains.slice(0, 5).join(", ")}) y no el del proyecto.`,
        hypothesis: "Las fuentes citadas cubren algo que el sitio del proyecto no responde o no deja claro; es una hipótesis hasta revisarlas.",
        suggestedAction: "Leer las fuentes citadas, identificar qué cubren (datos, comparativas, definiciones) y proponer el contenido que falta en el sitio propio." });
    }
    // Volatility: within one comparable series, presence changed within the window.
    const bySeries = new Map<string, GeoObservation[]>();
    for (const o of g.all) bySeries.set(seriesKey(o), [...(bySeries.get(seriesKey(o)) ?? []), o]);
    const volatile = [...bySeries.values()].filter((s) => s.length > 1 && s.some((a) => s.some((b) => a.presence !== b.presence && Math.abs(day(a.observedOn) - day(b.observedOn)) <= VOLATILITY_DAYS)));
    if (volatile.length > 0) {
      out.push({ ...base, rule: "volatile", evidence: volatile.flat(), priority: "low", priorityReason: "Resultados inestables: primero hay que confirmar la tendencia",
        title: `Respuestas inestables para «${g.queryText}»`,
        problem: `En ${volatile.length} serie(s) comparable(s) la presencia de la marca cambia en menos de ${VOLATILITY_DAYS} días.`,
        hypothesis: "Las respuestas varían; una sola lectura no permite concluir.",
        suggestedAction: "Repetir la observación con el mismo motor, método y mercado en fechas distintas antes de priorizar cambios." });
    }
    if (g.all.length === 1) {
      out.push({ ...base, rule: "repeat-measurement", evidence: g.all, priority: "low", priorityReason: "Una sola observación: insuficiente para priorizar",
        title: `Repetir la observación de «${g.queryText}»`,
        problem: "Solo hay una observación de esta pregunta.",
        hypothesis: "Otra fecha u otro motor podrían dar un resultado distinto.",
        suggestedAction: "Registrar al menos otra observación (otra fecha u otro motor) antes de actuar." });
    }
    if (ownCited.length > 0) {
      out.push({ ...base, rule: "keep-cited", evidence: ownCited, priority: "low", priorityReason: "Situación favorable observada; mantenimiento",
        title: `Mantener la página citada para «${g.queryText}»`,
        problem: "Una página del proyecto aparece citada en las respuestas observadas.",
        hypothesis: "Mantenerla actualizada y precisa ayuda a conservar la cita; no está garantizado.",
        suggestedAction: "Revisar que la página citada siga vigente (datos, fecha, autoría) y que responda bien a la pregunta." });
    }
  }
  const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.priority] - order[b.priority] || a.queryText.localeCompare(b.queryText) || a.rule.localeCompare(b.rule));
}

export const RULE_LABEL: Record<Rule | "manual", string> = {
  "answer-gap": "Hueco de respuesta",
  "mentioned-not-cited": "Mencionada sin cita",
  "competitor-cited": "Se citan otras fuentes",
  volatile: "Respuestas inestables",
  "repeat-measurement": "Falta repetir la medición",
  "keep-cited": "Mantener la cita",
  manual: "Propuesta manual",
};
