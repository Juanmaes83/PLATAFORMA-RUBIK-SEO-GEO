// Comparison of two STORED Google captures (Search Console performance or GA4 organic landing
// pages) of the same project, without calling any provider. Pure: it receives both rows already
// verified (signature, digest and project context) and only reads their signed query
// (requestContext) and data.
//
// Blocking (no rows compared): different provider, property or GSC dimensions, or an unverified
// capture. Warnings (rows compared, read with care): different period lengths, overlapping or equal
// periods, different pagination, PARTIAL coverage on either side, EMPTY captures. A row present on
// one side only is "not observed" on the other, never a zero: with a partial capture or different
// pagination its absence proves nothing.

type Row = Record<string, unknown>;
export type GoogleProvider = "search-console" | "google-analytics";
export interface CaptureSide { id: string; provider: string; status: string; verified: boolean; signedPayload: unknown; data: unknown }

export type BlockReason = "UNVERIFIED" | "PROVIDER_DIFFERS" | "PROPERTY_DIFFERS" | "DIMENSIONS_DIFFER" | "NOT_GOOGLE" | "INVALID_QUERY";
export type Warning =
  | "PERIOD_LENGTH_DIFFERS" | "PERIODS_OVERLAP" | "SAME_PERIOD"
  | "PAGINATION_DIFFERS" | "PARTIAL_BEFORE" | "PARTIAL_AFTER" | "EMPTY_BEFORE" | "EMPTY_AFTER";

export interface MetricDelta { metric: string; before: number | null; after: number | null; delta: number | null }
export interface ComparedRow { key: string; label: string[]; presence: "both" | "only-before" | "only-after"; metrics: MetricDelta[] }
export type GoogleComparison =
  | { ok: false; reason: BlockReason }
  | { ok: true; provider: GoogleProvider; property: string; dimensions: string[];
      before: { id: string; start: string; end: string; status: string }; after: { id: string; start: string; end: string; status: string };
      swapped: boolean; warnings: Warning[]; rows: ComparedRow[] };

export const GSC_METRICS = ["clicks", "impressions", "ctr", "averagePosition"] as const;
export const GA4_METRICS = ["sessions", "activeUsers", "engagedSessions", "engagementRate", "keyEvents", "sessionKeyEventRate", "transactions", "purchaseRevenue"] as const;

const request = (s: CaptureSide): Row => (s.signedPayload as { provenance?: { requestContext?: Row } } | null)?.provenance?.requestContext ?? {};
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// The sides are put in chronological order of their period start (swapped = true when the caller
// passed them the other way round), so "before" is always the earlier period.
export function compareGoogleCaptures(first: CaptureSide, second: CaptureSide): GoogleComparison {
  let before = first, after = second;
  if (!before.verified || !after.verified) return { ok: false, reason: "UNVERIFIED" };
  const providers = ["search-console", "google-analytics"];
  if (!providers.includes(before.provider) || !providers.includes(after.provider)) return { ok: false, reason: "NOT_GOOGLE" };
  if (before.provider !== after.provider) return { ok: false, reason: "PROVIDER_DIFFERS" };
  const provider = before.provider as GoogleProvider;
  let a = request(before), b = request(after);
  const propA = provider === "search-console" ? a.siteUrl : a.propertyId, propB = provider === "search-console" ? b.siteUrl : b.propertyId;
  if (typeof propA !== "string" || propA !== propB) return { ok: false, reason: "PROPERTY_DIFFERS" };
  const dims = provider === "search-console" && Array.isArray(a.dimensions) ? (a.dimensions as string[]) : [];
  if (provider === "search-console" && JSON.stringify(dims) !== JSON.stringify(Array.isArray(b.dimensions) ? b.dimensions : [])) {
    return { ok: false, reason: "DIMENSIONS_DIFFER" };
  }
  let [sa, ea, sb, eb] = [day(a.startDate), day(a.endDate), day(b.startDate), day(b.endDate)];
  if (!sa || !ea || !sb || !eb || ms(sa) > ms(ea) || ms(sb) > ms(eb)) return { ok: false, reason: "INVALID_QUERY" };
  const swapped = ms(sa) > ms(sb) || (sa === sb && ms(ea) > ms(eb));
  if (swapped) { [before, after, a, b] = [after, before, b, a]; [sa, ea, sb, eb] = [sb, eb, sa, ea]; }

  const warnings: Warning[] = [];
  if (ms(ea) - ms(sa) !== ms(eb) - ms(sb)) warnings.push("PERIOD_LENGTH_DIFFERS");
  if (sa === sb && ea === eb) warnings.push("SAME_PERIOD");
  else if (ms(sa) <= ms(eb) && ms(sb) <= ms(ea)) warnings.push("PERIODS_OVERLAP");
  const page = (r: Row) => provider === "search-console" ? `${r.rowLimit ?? ""}|${r.startRow ?? 0}|${r.searchType ?? ""}|${r.dataState ?? ""}` : `${r.limit ?? ""}|${r.offset ?? 0}`;
  if (page(a) !== page(b)) warnings.push("PAGINATION_DIFFERS");
  if (before.status === "PARTIAL") warnings.push("PARTIAL_BEFORE");
  if (after.status === "PARTIAL") warnings.push("PARTIAL_AFTER");
  if (before.status === "EMPTY") warnings.push("EMPTY_BEFORE");
  if (after.status === "EMPTY") warnings.push("EMPTY_AFTER");

  const labelKeys = provider === "search-console" ? dims : ["hostName", "landingPage"];
  const metrics: readonly string[] = provider === "search-console" ? GSC_METRICS : GA4_METRICS;
  const index = (data: unknown) => {
    const m = new Map<string, Row>();
    for (const r of Array.isArray(data) ? (data as Row[]) : []) m.set(JSON.stringify(labelKeys.map((k) => r[k] ?? null)), r);
    return m;
  };
  const ia = index(before.data), ib = index(after.data);
  const keys = [...new Set([...ia.keys(), ...ib.keys()])];
  const rows: ComparedRow[] = keys.map((key) => {
    const ra = ia.get(key), rb = ib.get(key);
    return {
      key, label: (JSON.parse(key) as unknown[]).map((v) => (v === null ? "—" : String(v))),
      presence: ra && rb ? "both" : ra ? "only-before" : "only-after",
      metrics: metrics.map((metric) => {
        const x = ra ? num(ra[metric]) : null, y = rb ? num(rb[metric]) : null;
        return { metric, before: x, after: y, delta: x !== null && y !== null ? y - x : null };
      }),
    };
  });
  // Rows observed on both sides first, by the largest absolute change of the first metric.
  const weight = (r: ComparedRow) => Math.abs(r.metrics[0]?.delta ?? 0);
  rows.sort((p, q) => (p.presence === "both" ? 0 : 1) - (q.presence === "both" ? 0 : 1) || weight(q) - weight(p) || p.key.localeCompare(q.key));
  return { ok: true, provider, property: propA, dimensions: dims,
    before: { id: before.id, start: sa, end: ea, status: before.status }, after: { id: after.id, start: sb, end: eb, status: after.status }, swapped, warnings, rows };
}
