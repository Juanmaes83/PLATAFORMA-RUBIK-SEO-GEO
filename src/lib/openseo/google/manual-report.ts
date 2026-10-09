import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { providers } from "@/lib/core";
import type { Database } from "@/lib/supabase/database.types";
import { readOpenSeoMcpConfig } from "@/lib/openseo/config";
import { createOpenSeoMcpClient, googleReadsEnabled, type McpClientOptions, type OpenSeoMcpClient } from "@/lib/openseo/mcp-client";
import { createOpenSeoSearchConsoleTransport } from "./search-console";
import { createOpenSeoAnalyticsTransport } from "./analytics";
import { resolveGoogleSource, type GoogleSource } from "./properties";

// One bounded, manual Google report through a server-resolved OpenSEO project/property.
// No UI/Server Action calls this yet; hosted reads remain disabled. This does not persist.
export type ManualGoogleQuery =
  | { provider: "search-console"; startDate: string; endDate: string; dimensions: string[];
      rowLimit: number; startRow?: number; type?: string; dataState?: string }
  | { provider: "google-analytics"; startDate: string; endDate: string; limit: number; offset: number };
export type ManualReportError = "DISABLED" | "INVALID" | "CONFIGURATION" | "FORBIDDEN" | "NOT_CONNECTED" | "UNAVAILABLE";
type ReportOutcome = { ok: true; result: Awaited<ReturnType<typeof providers.runProviderRequest>>; source: GoogleSource }
  | { ok: false; error: ManualReportError };

const day = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const dims = new Set(["date", "query", "page", "country", "device"]);
const validQuery = (q: ManualGoogleQuery) => {
  if (!q || (q.provider !== "search-console" && q.provider !== "google-analytics")
    || !day(q.startDate) || !day(q.endDate)) return false;
  const days = (Date.parse(`${q.endDate}T00:00:00Z`) - Date.parse(`${q.startDate}T00:00:00Z`)) / 86400000;
  if (days < 0 || days > 30) return false; // At most 31 calendar days per manual capture.
  if (q.provider === "google-analytics") {
    return Number.isSafeInteger(q.limit) && q.limit >= 1 && q.limit <= 100
      && Number.isSafeInteger(q.offset) && q.offset >= 0 && q.offset <= 1000;
  }
  return Array.isArray(q.dimensions) && q.dimensions.length >= 1 && q.dimensions.length <= 4
    && new Set(q.dimensions).size === q.dimensions.length && q.dimensions.every((d) => dims.has(d))
    && Number.isSafeInteger(q.rowLimit) && q.rowLimit >= 1 && q.rowLimit <= 100
    && (q.startRow === undefined || (Number.isSafeInteger(q.startRow) && q.startRow >= 0 && q.startRow <= 1000))
    && (q.type === undefined || ["web", "image", "video", "news", "discover", "googleNews"].includes(q.type))
    && (q.dataState === undefined || ["all", "final"].includes(q.dataState));
};

export async function runManualGoogleReport(
  client: SupabaseClient<Database>, projectId: string, query: ManualGoogleQuery,
  deps: { env?: Record<string, string | undefined>; mcpFactory?: (opts: McpClientOptions) => Pick<OpenSeoMcpClient, "callTool" | "close">;
    clock?: () => Date } = {},
): Promise<ReportOutcome> {
  const env = deps.env ?? process.env;
  if (!googleReadsEnabled(env)) return { ok: false, error: "DISABLED" };
  if (!validQuery(query)) return { ok: false, error: "INVALID" };
  const config = readOpenSeoMcpConfig(env);
  if (config.state !== "configured") return { ok: false, error: "CONFIGURATION" };
  const resolved = await resolveGoogleSource(client, projectId, query.provider);
  if (!resolved.ok) return { ok: false, error: resolved.error === "FORBIDDEN" ? "FORBIDDEN"
    : resolved.error === "NOT_CONNECTED" ? "NOT_CONNECTED" : "UNAVAILABLE" };
  const source = resolved.source;
  // Core signs this server-resolved source identity with the report provenance.
  // It is deliberately separate from provider input and never comes from browser IDs.
  const sourceContext = { connectionId: source.connectionId, propertyBindingId: source.propertyBindingId,
    providerProjectId: source.openseoProjectId, grantedAt: source.grantedAt };
  const mcp = (deps.mcpFactory ?? createOpenSeoMcpClient)({ mcpUrl: config.mcpUrl,
    apiKey: config.apiKey, maxPages: 10, googleReads: true, timeoutMs: 20_000 });
  try {
    if (query.provider === "search-console") {
      const input = { siteUrl: source.externalPropertyId, startDate: query.startDate, endDate: query.endDate,
        dimensions: query.dimensions, rowLimit: query.rowLimit, ...(query.startRow === undefined ? {} : { startRow: query.startRow }),
        ...(query.type === undefined ? {} : { type: query.type }), ...(query.dataState === undefined ? {} : { dataState: query.dataState }) };
      const transport = createOpenSeoSearchConsoleTransport({ mcp, openseoProjectId: source.openseoProjectId,
        expectedSiteUrl: source.externalPropertyId, projectDomain: null, resolvedSource: source });
      const result = await providers.runProviderRequest({ provider: "search-console", operation: "searchAnalytics",
        input, sourceContext, transport, budget: { maxUnits: 1, maxRequests: 1 }, clock: deps.clock });
      return { ok: true, result, source };
    }
    const input = { report: "organic_landing_pages", propertyId: source.externalPropertyId,
      startDate: query.startDate, endDate: query.endDate, limit: query.limit, offset: query.offset };
    const transport = createOpenSeoAnalyticsTransport({ mcp, openseoProjectId: source.openseoProjectId,
      expectedPropertyId: source.externalPropertyId });
    const result = await providers.runProviderRequest({ provider: "google-analytics", operation: "report",
      input, sourceContext, transport, budget: { maxUnits: 1, maxRequests: 1 }, clock: deps.clock });
    return { ok: true, result, source };
  } finally {
    await mcp.close();
  }
}
