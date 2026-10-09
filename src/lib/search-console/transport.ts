import "server-only";
import { apexOf, requestJson, type FetchLike } from "@/lib/webmaster/http";

// Google Search Console, read only (ADR 0009). Server-side transport for the Core's
// `search-console.searchAnalytics` operation: `{ kind, request(operation, input) }`.
// Documented contract (developers.google.com, consulted 09/10/2026):
//   POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
//   OAuth 2.0 bearer with https://www.googleapis.com/auth/webmasters.readonly
//   startDate/endDate YYYY-MM-DD (Pacific Time), rowLimit 1–25 000, startRow, dimensions,
//   type, dataState; response rows { keys, clicks, impressions, ctr, position }.
// The access token comes from an injected server-side provider (OAuth storage is a later phase)
// and only travels in the Authorization header. No other Search Console method is reachable.

export const SEARCH_ANALYTICS_DIMENSIONS = Object.freeze(["date", "query", "page", "country", "device"] as const);
export type SearchAnalyticsDimension = (typeof SEARCH_ANALYTICS_DIMENSIONS)[number];
const SEARCH_TYPES = ["web", "image", "video", "news", "discover", "googleNews"];
const ENDPOINT = "https://www.googleapis.com/webmasters/v3/sites";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface SearchAnalyticsInput {
  startDate: string;
  endDate: string;
  dimensions: SearchAnalyticsDimension[];
  rowLimit: number;
  startRow?: number;
  type?: string;
  dataState?: "final" | "all";
}

/** A property may be the project's Domain property or its https URL-prefix property only. */
export function searchConsolePropertyFor(projectDomain: string | null, siteUrl: string): boolean {
  const apex = apexOf(projectDomain);
  if (!apex) return false;
  if (siteUrl === `sc-domain:${apex}`) return true;
  return siteUrl === `https://${apex}/` || siteUrl === `https://www.${apex}/`;
}

const validDate = (v: string) => DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

export function validateSearchAnalyticsInput(input: unknown): input is SearchAnalyticsInput {
  if (!input || typeof input !== "object") return false;
  const v = input as Record<string, unknown>;
  const dims = v.dimensions;
  return typeof v.startDate === "string" && typeof v.endDate === "string" && validDate(v.startDate) && validDate(v.endDate) && v.startDate <= v.endDate
    && Array.isArray(dims) && dims.every((d) => (SEARCH_ANALYTICS_DIMENSIONS as readonly unknown[]).includes(d)) && new Set(dims).size === dims.length
    && Number.isInteger(v.rowLimit) && (v.rowLimit as number) >= 1 && (v.rowLimit as number) <= 25_000
    && (v.startRow === undefined || (Number.isInteger(v.startRow) && (v.startRow as number) >= 0))
    && (v.type === undefined || SEARCH_TYPES.includes(v.type as string))
    && (v.dataState === undefined || v.dataState === "final" || v.dataState === "all");
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Maps documented rows to the Core's SearchConsoleAdapter shape (position → averagePosition). */
export function mapSearchAnalyticsRows(json: unknown, dimensions: readonly SearchAnalyticsDimension[]) {
  const rows = (json as { rows?: unknown })?.rows;
  if (rows === undefined) return [];
  if (!Array.isArray(rows)) return null;
  return rows.map((r) => {
    const row = (r ?? {}) as { keys?: unknown; clicks?: unknown; impressions?: unknown; ctr?: unknown; position?: unknown };
    const keys = Array.isArray(row.keys) ? row.keys : [];
    const out: Record<string, string | number | null> = {};
    dimensions.forEach((d, i) => { out[d] = typeof keys[i] === "string" ? keys[i] : null; });
    return { ...out, clicks: num(row.clicks), impressions: num(row.impressions), ctr: num(row.ctr), averagePosition: num(row.position) };
  });
}

export function createSearchConsoleTransport(opts: {
  siteUrl: string;
  projectDomain: string | null;
  accessToken: () => Promise<string | null>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}) {
  return {
    kind: "live" as const,
    async request(operation: string, input: unknown) {
      if (operation !== "searchAnalytics") return { httpStatus: 400, message: "Operation not allowed by the platform transport" };
      if (!searchConsolePropertyFor(opts.projectDomain, opts.siteUrl)) return { httpStatus: 403, message: "Property outside the project domain" };
      if (!validateSearchAnalyticsInput(input)) return { httpStatus: 400, message: "Invalid Search Analytics request" };
      const token = await opts.accessToken();
      if (!token) return { httpStatus: 401, message: "No server-side authorization" };
      const body = { startDate: input.startDate, endDate: input.endDate, dimensions: input.dimensions, rowLimit: input.rowLimit,
        ...(input.startRow !== undefined ? { startRow: input.startRow } : {}), ...(input.type ? { type: input.type } : {}),
        ...(input.dataState ? { dataState: input.dataState } : {}) };
      const out = await requestJson(`${ENDPOINT}/${encodeURIComponent(opts.siteUrl)}/searchAnalytics/query`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body),
      }, opts);
      if (!out.ok) return { httpStatus: out.httpStatus, retryAfter: out.retryAfter, message: out.message };
      const rows = mapSearchAnalyticsRows(out.json, input.dimensions);
      if (rows === null) return { httpStatus: 502, message: "Unexpected Search Analytics response" };
      // A full page may continue at startRow + rowLimit: report it as truncated, never complete.
      // The Core whitelists provenance evidence: only the property travels (sourceUrl). The
      // request window and dimensions stay with the caller, which knows the input it sent.
      return { rows, truncated: rows.length === input.rowLimit, sourceUrl: opts.siteUrl };
    },
  };
}
