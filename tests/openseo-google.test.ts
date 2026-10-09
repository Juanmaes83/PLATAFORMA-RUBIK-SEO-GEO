import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { providers } from "@/lib/core";
import { checkGoogleCatalog, EXPECTED_REQUIRED } from "@/lib/openseo/google/catalog";
import { createOpenSeoSearchConsoleTransport, searchConsoleFailure } from "@/lib/openseo/google/search-console";
import { createOpenSeoMcpClient, GOOGLE_READ_TOOLS, googleReadsEnabled, type ListedTool } from "@/lib/openseo/mcp-client";
import type { ProjectRef } from "@/lib/provenance/audit";
import { loadKeyring } from "@/lib/provenance/keyring";
import { openProviderResult, sealProviderResult } from "@/lib/provenance/results";

// Search Console through OpenSEO (owner decision of 09/10/2026), simulated: an in-memory MCP that
// answers like the reference code open-seo@0ffff93. No network, no key, no Google token.
const clock = () => new Date("2026-10-09T10:00:00Z");
const budget = { maxUnits: 5, maxRequests: 5 };
const SITE = "sc-domain:cliente.example";
const input = { siteUrl: SITE, startDate: "2026-09-01", endDate: "2026-09-28", dimensions: ["query", "page"], rowLimit: 2, type: "web" };
const ok = (over: Record<string, unknown> = {}) => ({
  structuredContent: { ok: true, siteUrl: SITE, startDate: input.startDate, endDate: input.endDate, dimensions: input.dimensions, rowCount: 1,
    rows: [{ keys: ["pisos lujo", "https://www.cliente.example/"], clicks: 4, impressions: 120, ctr: 0.0333, position: 7.2 }], hasMore: false, nextStartRow: 1, ...over },
});
const fakeMcp = (reply: unknown | (() => unknown)) => {
  const callTool = vi.fn<(name: string, args: Record<string, unknown>) => Promise<never>>(async () => (typeof reply === "function" ? (reply as () => unknown)() : reply) as never);
  return { callTool };
};
const transport = (mcp: ReturnType<typeof fakeMcp>, over: Partial<{ openseoProjectId: string; expectedSiteUrl: string; projectDomain: string | null }> = {}) =>
  createOpenSeoSearchConsoleTransport({ mcp, openseoProjectId: "oseo-project-a", expectedSiteUrl: SITE, projectDomain: "www.cliente.example", ...over });
const run = (t: unknown, body: unknown = input) =>
  providers.runProviderRequest({ provider: "search-console", operation: "searchAnalytics", input: body, transport: t, budget, clock });

describe("Search Console via OpenSEO", () => {
  it("calls the read-only tool with this project's OpenSEO id and returns Core rows", async () => {
    const mcp = fakeMcp(ok());
    const r = await run(transport(mcp));
    expect(mcp.callTool).toHaveBeenCalledWith("get_search_console_performance", {
      projectId: "oseo-project-a", dimensions: ["query", "page"], startDate: "2026-09-01", endDate: "2026-09-28", rowLimit: 2, type: "web",
    });
    expect(r).toMatchObject({ status: "OK", provenance: { evidence: { rowCount: 1, sourceUrl: SITE }, requestContext: { siteUrl: SITE } } });
    expect(r.data[0]).toMatchObject({ query: "pisos lujo", clicks: 4, averagePosition: 7.2 });
  });

  it("the result is signed for this project and refused for any other", async () => {
    const keys = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-a:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-a" });
    if (!keys.ok) throw new Error(keys.error);
    const project: ProjectRef = { projectId: "11111111-1111-4111-8111-111111111111", organizationId: "22222222-2222-4222-8222-222222222222", scope: { tenantId: "agencia-a", projectId: "proyecto-a1" } };
    const sealed = sealProviderResult(await run(transport(fakeMcp(ok()))), project, keys.keyring);
    if (!sealed.ok) throw new Error(sealed.error);
    expect(openProviderResult(sealed.row, project, keys.keyring).verified).toBe(true);
    expect(openProviderResult(sealed.row, { ...project, projectId: "44444444-4444-4444-8444-444444444444" }, keys.keyring).verified).toBe(false);
  });

  it("isolation: an answer for another property is discarded entirely", async () => {
    const r = await run(transport(fakeMcp(ok({ siteUrl: "sc-domain:otro.example" }))));
    expect(r).toMatchObject({ status: "ERROR", errors: [{ code: "FORBIDDEN" }], data: [] });
  });

  it("isolation: refuses before calling for a foreign property, a mismatched request or no project connection", async () => {
    const mcp = fakeMcp(ok());
    expect(await run(transport(mcp, { expectedSiteUrl: "sc-domain:otro.example" }), { ...input, siteUrl: "sc-domain:otro.example" })).toMatchObject({ errors: [{ code: "FORBIDDEN" }] });
    expect(await run(transport(mcp), { ...input, siteUrl: "https://www.cliente.example/" })).toMatchObject({ errors: [{ code: "FORBIDDEN" }] });
    expect(await run(transport(mcp, { openseoProjectId: "" }))).toMatchObject({ status: "NOT_CONNECTED" });
    expect(await run(transport(mcp), { ...input, rowLimit: 1001 })).toMatchObject({ errors: [{ code: "HTTP_400" }] });
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("maps OpenSEO's error results to honest states", async () => {
    const cases: [unknown, string][] = [
      [{ structuredContent: { ok: false, reason: "not_connected", connectUrl: "https://app.openseo.so/p/x/search-performance" } }, "NOT_CONNECTED"],
      [{ structuredContent: { ok: false, reason: "api_error" }, content: [{ type: "text", text: "Search Console rate limit reached. Retry shortly." }] }, "RATE_LIMITED"],
      [{ structuredContent: { ok: false, reason: "api_error" }, content: [{ type: "text", text: "The Search Console connection has expired or was revoked. Reconnect it." }] }, "NOT_CONNECTED"],
      [{ structuredContent: { ok: false, reason: "api_error" }, content: [{ type: "text", text: "Search Console denied access to this property" }] }, "ERROR"],
      [{ isError: true, content: [{ type: "text", text: "FORBIDDEN" }] }, "ERROR"],
    ];
    for (const [reply, status] of cases) expect(await run(transport(fakeMcp(reply))), JSON.stringify(reply)).toMatchObject({ status, data: [] });
    expect(searchConsoleFailure("api_error", "Search Console property not found.")).toMatchObject({ httpStatus: 404 });
    expect(searchConsoleFailure("invalid_request", "")).toMatchObject({ httpStatus: 400 });
  });

  it("a thrown FORBIDDEN or transport failure never yields rows", async () => {
    expect(await run(transport(fakeMcp(() => { throw new Error("FORBIDDEN"); })))).toMatchObject({ status: "ERROR", errors: [{ code: "FORBIDDEN" }] });
    expect(await run(transport(fakeMcp(() => { throw Object.assign(new Error("down"), { status: 503 }); })))).toMatchObject({ status: "ERROR", data: [] });
  });

  it("more rows available is PARTIAL; a different window is refused", async () => {
    expect(await run(transport(fakeMcp(ok({ hasMore: true }))))).toMatchObject({ status: "PARTIAL" });
    expect(await run(transport(fakeMcp(ok({ startDate: "2026-08-01" }))))).toMatchObject({ status: "ERROR" });
  });
});

describe("OpenSEO MCP client guard for Google tools", () => {
  const fetchImpl = vi.fn(async () => new Response("{}"));
  it("Google tools are unreachable unless the server enables them, and no request is sent", async () => {
    const client = createOpenSeoMcpClient({ mcpUrl: "https://mcp.example/mcp", apiKey: "k".repeat(12), maxPages: 10, fetchImpl });
    for (const tool of GOOGLE_READ_TOOLS) await expect(client.callTool(tool, { projectId: "p" })).rejects.toMatchObject({ code: "TOOL_NOT_ALLOWED" });
    const enabled = createOpenSeoMcpClient({ mcpUrl: "https://mcp.example/mcp", apiKey: "k".repeat(12), maxPages: 10, fetchImpl, googleReads: true });
    await expect(enabled.callTool("get_domain_overview", {})).rejects.toMatchObject({ code: "TOOL_NOT_ALLOWED" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(googleReadsEnabled({})).toBe(false);
    expect(googleReadsEnabled({ OPENSEO_GOOGLE_READS_ENABLED: "1" })).toBe(false);
    expect(googleReadsEnabled({ OPENSEO_GOOGLE_READS_ENABLED: "true" })).toBe(true);
  });
});

describe("hosted catalog check", () => {
  const tool = (name: string, over: Partial<ListedTool> = {}): ListedTool => ({
    name, annotations: { readOnlyHint: true, destructiveHint: false }, inputSchema: { required: [...EXPECTED_REQUIRED[name as keyof typeof EXPECTED_REQUIRED]] }, ...over,
  });
  it("is available only when every tool is present, read-only and with the expected required input", () => {
    const full = GOOGLE_READ_TOOLS.map((n) => tool(n));
    expect(checkGoogleCatalog(full)).toMatchObject({ searchConsole: true, analytics: true });
    const missing = checkGoogleCatalog(full.filter((t) => t.name !== "inspect_urls"));
    expect(missing.searchConsole).toBe(false);
    expect(missing.checks.find((c) => c.tool === "inspect_urls")).toEqual({ tool: "inspect_urls", state: "missing" });
    const writable = checkGoogleCatalog(full.map((t) => t.name === "get_google_analytics_site_search" ? tool(t.name, { annotations: { readOnlyHint: false } }) : t));
    expect(writable.analytics).toBe(false);
    const changed = checkGoogleCatalog(full.map((t) => t.name === "get_search_console_performance" ? tool(t.name, { inputSchema: { required: ["projectId", "siteUrl"] } }) : t));
    expect(changed.checks.find((c) => c.tool === "get_search_console_performance")).toMatchObject({ state: "input-changed", detail: "projectId, siteUrl" });
    expect(checkGoogleCatalog([])).toMatchObject({ searchConsole: false, analytics: false });
  });
});
