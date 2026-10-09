import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { runManualGoogleReport } from "@/lib/openseo/google/manual-report";

const projectId = "11111111-1111-4111-8111-111111111111";
const connectionId = "33333333-3333-4333-8333-333333333333";
const bindingId = "55555555-5555-4555-8555-555555555555";
const env = { OPENSEO_GOOGLE_READS_ENABLED: "true", OPENSEO_ENDPOINT: "https://openseo.example",
  OPENSEO_API_KEY: "oseo_123456789" };
const connection = { connectionId, state: "ACTIVE", credentialMode: "platform", openseoProjectId: "client-project",
  allowedHosts: ["sarah.com"], grantedAt: "2026-10-09T10:00:00Z", revokedAt: null };
const property = (provider: "search-console" | "google-analytics") => ({ propertyId: bindingId, connectionId, provider,
  state: "ACTIVE", externalPropertyId: provider === "search-console" ? "https://sarah.es/" : "properties/123",
  source: "OWNER_DECLARED", grantedAt: "2026-10-09T10:10:00Z", revokedAt: null });
const gscQuery = { provider: "search-console" as const, startDate: "2026-09-01", endDate: "2026-09-28",
  dimensions: ["page"], rowLimit: 10 };
const ga4Query = { provider: "google-analytics" as const, startDate: "2026-09-01", endDate: "2026-09-28",
  limit: 10, offset: 0 };
const gscReply = { structuredContent: { ok: true, siteUrl: "https://sarah.es/", startDate: "2026-09-01", endDate: "2026-09-28",
  dimensions: ["page"], rowCount: 1, rows: [{ keys: ["https://sarah.es/"], clicks: 1, impressions: 10, ctr: 0.1, position: 3 }],
  hasMore: false, nextStartRow: 1 } };
const ga4Reply = { structuredContent: { status: "ok", source: { provider: "google_analytics", propertyId: "properties/123" },
  request: { reportKind: "landing_pages", channel: "organic_search", resolvedDateRange: { startDate: "2026-09-01", endDate: "2026-09-28" }, limit: 10, offset: 0 },
  rows: [{ hostName: "sarah.es", landingPage: "/", sessions: 10, activeUsers: 8, engagedSessions: 7,
    engagementRate: 0.7, keyEvents: 1, sessionKeyEventRate: 0.1, transactions: 0, purchaseRevenue: 0 }],
  rowCount: 1, totalRowCount: 1, pageInfo: { limit: 10, offset: 0, hasMore: false, nextOffset: null },
  reportMetadata: { hasLimitedData: false, subjectToThresholding: false, dataLossFromOtherRow: false,
    sampling: [], restrictedMetrics: [] }, warnings: [] } };

function setup(provider: "search-console" | "google-analytics", reply: unknown, conn: unknown = connection) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (args.p_project_id !== projectId) return { data: null, error: { code: "42501" } };
    return { data: name === "openseo_connection" ? conn : property(provider), error: null };
  });
  const callTool = vi.fn(async () => reply as { structuredContent?: unknown; isError?: boolean });
  const close = vi.fn(async () => {});
  const mcpFactory = vi.fn(() => ({ callTool, close }));
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc, callTool, close, mcpFactory };
}

describe("bounded Google manual read through project association, in-memory only", () => {
  it("reads GSC .es via the bound project without requiring the global crawl project", async () => {
    const s = setup("search-console", gscReply);
    const r = await runManualGoogleReport(s.client, projectId, gscQuery, { env, mcpFactory: s.mcpFactory });
    expect(r).toMatchObject({ ok: true, result: { status: "OK", provenance: { evidence: { sourceUrl: "https://sarah.es/" } } },
      source: { openseoProjectId: "client-project", externalPropertyId: "https://sarah.es/" } });
    expect(s.callTool).toHaveBeenCalledWith("get_search_console_performance", expect.objectContaining({ projectId: "client-project" }));
    expect(s.mcpFactory).toHaveBeenCalledWith(expect.objectContaining({ mcpUrl: "https://openseo.example/mcp", googleReads: true, timeoutMs: 20_000 }));
    expect(s.close).toHaveBeenCalledTimes(1);
  });
  it("reads only the implemented GA4 landing report and preserves Core normalization", async () => {
    const s = setup("google-analytics", ga4Reply);
    const r = await runManualGoogleReport(s.client, projectId, ga4Query, { env, mcpFactory: s.mcpFactory });
    expect(r).toMatchObject({ ok: true, result: { status: "OK", data: [{ sessions: 10, activeUsers: 8 }] },
      source: { externalPropertyId: "properties/123" } });
    expect(s.callTool).toHaveBeenCalledWith("get_google_analytics_organic_landing_pages",
      { projectId: "client-project", startDate: "2026-09-01", endDate: "2026-09-28", limit: 10, offset: 0 });
  });
  it("fails before database or provider access if disabled or unbounded", async () => {
    const s = setup("search-console", gscReply);
    expect(await runManualGoogleReport(s.client, projectId, gscQuery, { env: { ...env, OPENSEO_GOOGLE_READS_ENABLED: "false" }, mcpFactory: s.mcpFactory }))
      .toEqual({ ok: false, error: "DISABLED" });
    expect(await runManualGoogleReport(s.client, projectId, { ...gscQuery, rowLimit: 1000 }, { env, mcpFactory: s.mcpFactory }))
      .toEqual({ ok: false, error: "INVALID" });
    expect(await runManualGoogleReport(s.client, projectId, { ...ga4Query, endDate: "2026-12-01" }, { env, mcpFactory: s.mcpFactory }))
      .toEqual({ ok: false, error: "INVALID" });
    expect(await runManualGoogleReport(s.client, projectId, gscQuery,
      { env: { ...env, OPENSEO_ENDPOINT: "http://insecure.example" }, mcpFactory: s.mcpFactory }))
      .toEqual({ ok: false, error: "CONFIGURATION" });
    expect(await runManualGoogleReport(s.client, projectId, gscQuery,
      { env: { ...env, NEXT_PUBLIC_OPENSEO_API_KEY: "oseo_leak123" }, mcpFactory: s.mcpFactory }))
      .toEqual({ ok: false, error: "CONFIGURATION" });
    expect(s.rpc).not.toHaveBeenCalled(); expect(s.callTool).not.toHaveBeenCalled();
  });
  it("refuses revoked or foreign scope before provider access, and rejects a provider property mismatch", async () => {
    const revoked = setup("search-console", gscReply, { state: "NONE" });
    expect(await runManualGoogleReport(revoked.client, projectId, gscQuery, { env, mcpFactory: revoked.mcpFactory }))
      .toEqual({ ok: false, error: "NOT_CONNECTED" });
    expect(revoked.callTool).not.toHaveBeenCalled();
    const foreign = setup("search-console", gscReply);
    expect(await runManualGoogleReport(foreign.client, "22222222-2222-4222-8222-222222222222", gscQuery,
      { env, mcpFactory: foreign.mcpFactory })).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(foreign.callTool).not.toHaveBeenCalled();
    const mismatch = setup("search-console", { structuredContent: { ...gscReply.structuredContent, siteUrl: "https://other.es/" } });
    const r = await runManualGoogleReport(mismatch.client, projectId, gscQuery, { env, mcpFactory: mismatch.mcpFactory });
    expect(r).toMatchObject({ ok: true, result: { status: "ERROR", data: [] } });
  });
});
