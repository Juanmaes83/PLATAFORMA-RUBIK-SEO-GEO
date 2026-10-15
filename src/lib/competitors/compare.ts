// N2-11 honest comparison. Two readings are only put side by side when they measure the same
// metric, come from the same source with the same method, for the same market and device, and
// were taken within COMPARISON_WINDOW_DAYS of each other. Otherwise the cell says why the
// comparison is not valid instead of showing a difference. Nothing is interpolated, defaulted
// to zero or carried forward. A difference between unverified readings is only a hint
// ("pendiente de verificación"), never a recommendation.

import type { Device, Method, Metric } from "./contract";

export const COMPARISON_WINDOW_DAYS = 31;

export interface Observation {
  id: string;
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
  verification: "unverified" | "verified";
  notes: string | null;
  createdAt: string;
}

export type Mismatch = "source" | "method" | "market" | "device" | "period";

export const MISMATCH_LABEL: Record<Mismatch, string> = {
  source: "fuentes distintas",
  method: "un dato es observado y el otro declarado",
  market: "mercados distintos (país o idioma)",
  device: "dispositivos distintos",
  period: `fechas separadas más de ${COMPARISON_WINDOW_DAYS} días`,
};

export type Comparison =
  | { kind: "missing-competitor" }
  | { kind: "missing-project" }
  | { kind: "not-available"; side: "competitor" | "project" | "both"; competitor: Observation | null; project: Observation | null }
  | { kind: "not-comparable"; reasons: Mismatch[]; competitor: Observation; project: Observation }
  | { kind: "comparable"; competitor: Observation; project: Observation; difference: number; verified: boolean; declared: boolean };

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const newestFirst = (a: Observation, b: Observation) =>
  b.observedOn.localeCompare(a.observedOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

export function mismatches(a: Observation, b: Observation): Mismatch[] {
  const out: Mismatch[] = [];
  if (a.sourceName.trim().toLowerCase() !== b.sourceName.trim().toLowerCase()) out.push("source");
  if (a.method !== b.method) out.push("method");
  if (a.marketCountry !== b.marketCountry || a.marketLanguage !== b.marketLanguage) out.push("market");
  if (a.device !== b.device) out.push("device");
  if (Math.abs(day(a.observedOn) - day(b.observedOn)) > COMPARISON_WINDOW_DAYS) out.push("period");
  return out;
}

/** Same series: same subject, metric, source (case-insensitive), method, market and device. */
export const seriesKey = (o: Observation) =>
  [o.competitorId ?? "project", o.metric, o.sourceName.trim().toLowerCase(), o.method, o.marketCountry ?? "", o.marketLanguage ?? "", o.device ?? ""].join("|");

/**
 * Compares one competitor with the project for one metric. `competitor` and `project` hold the
 * observations of that metric for each subject (any order). The most recent valid pair wins; if
 * there is none, the latest reading of each side explains why.
 */
export function compareMetric(competitor: readonly Observation[], project: readonly Observation[]): Comparison {
  if (competitor.length === 0) return { kind: "missing-competitor" };
  if (project.length === 0) return { kind: "missing-project" };
  const c = [...competitor].sort(newestFirst);
  const p = [...project].sort(newestFirst);
  const cAvail = c.filter((o) => o.availability === "available");
  const pAvail = p.filter((o) => o.availability === "available");
  if (cAvail.length === 0 || pAvail.length === 0) {
    const side = cAvail.length === 0 && pAvail.length === 0 ? "both" : cAvail.length === 0 ? "competitor" : "project";
    return { kind: "not-available", side, competitor: c[0], project: p[0] };
  }
  for (const co of cAvail) {
    const match = pAvail
      .filter((po) => mismatches(co, po).length === 0)
      .sort((x, y) => Math.abs(day(x.observedOn) - day(co.observedOn)) - Math.abs(day(y.observedOn) - day(co.observedOn)) || newestFirst(x, y))[0];
    if (match) {
      return {
        kind: "comparable",
        competitor: co,
        project: match,
        difference: (co.value as number) - (match.value as number),
        verified: co.verification === "verified" && match.verification === "verified",
        declared: co.method === "declared",
      };
    }
  }
  return { kind: "not-comparable", reasons: mismatches(cAvail[0], pAvail[0]), competitor: cAvail[0], project: pAvail[0] };
}

export interface Series {
  key: string;
  metric: Metric;
  sourceName: string;
  method: Method;
  marketCountry: string | null;
  marketLanguage: string | null;
  device: Device | null;
  /** Oldest first. Not-available readings stay in place as gaps, never as zeros. */
  points: Observation[];
  /** Change between the first and last AVAILABLE reading; null with fewer than two. */
  change: { from: Observation; to: Observation; delta: number } | null;
}

/** Groups readings of one subject into comparable series. One reading is not a trend. */
export function buildSeries(observations: readonly Observation[]): Series[] {
  const groups = new Map<string, Observation[]>();
  for (const o of observations) {
    const key = seriesKey(o);
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  const series: Series[] = [];
  for (const [key, list] of groups) {
    const points = [...list].sort((a, b) => -newestFirst(a, b));
    const available = points.filter((o) => o.availability === "available");
    const first = available[0];
    const last = available[available.length - 1];
    series.push({
      key,
      metric: points[0].metric,
      sourceName: points[0].sourceName,
      method: points[0].method,
      marketCountry: points[0].marketCountry,
      marketLanguage: points[0].marketLanguage,
      device: points[0].device,
      points,
      change: available.length >= 2 && first.observedOn !== last.observedOn
        ? { from: first, to: last, delta: (last.value as number) - (first.value as number) }
        : null,
    });
  }
  return series.sort((a, b) => a.metric.localeCompare(b.metric) || a.key.localeCompare(b.key));
}
