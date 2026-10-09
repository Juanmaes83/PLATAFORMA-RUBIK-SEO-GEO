import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { providers } from "@/lib/core";
import { auditResponseShape, checkAuditTarget, followSiteAudit, startSiteAudit, testOpenSeoConnection, whoamiVerifier, type CompletedAuditCapture } from "@/lib/openseo/bridge";
import { MAX_PAGES_CEILING, describeOpenSeoConfig, publicOpenSeoLeak, readOpenSeoConfig } from "@/lib/openseo/config";
import { ALLOWED_TOOLS, OpenSeoTransportError, createOpenSeoMcpClient } from "@/lib/openseo/mcp-client";
import { prepareCompletedAuditResults } from "@/lib/openseo/persistence";
import { loadKeyring } from "@/lib/provenance/keyring";
import { openProviderResult } from "@/lib/provenance/results";
import type { ProjectRef } from "@/lib/provenance/audit";

// OpenSEO bridge (ADR 0006), exercised only against an in-memory mock of the OpenSEO MCP
// server: no network, no real key. The fake key is assembled at run time so the secrets guard
// never sees a key-shaped literal in the repository.
const KEY = ["oseo", "test".repeat(6)].join("_");
const ENDPOINT = "https://openseo.example.test";
const OSEO_PROJECT = "oseo-project-123";
const ENV = {
  OPENSEO_ENDPOINT: ENDPOINT,
  OPENSEO_API_KEY: KEY,
  OPENSEO_PROJECT_ID: OSEO_PROJECT,
  OPENSEO_AUDIT_ALLOWED_HOSTS: "www.cliente.example",
  OPENSEO_AUDIT_MAX_PAGES: "100",
  OPENSEO_AUDIT_STATUS_COMPLETED: "completed",
  OPENSEO_AUDIT_STATUS_FAILED: "failed",
  OPENSEO_AUDIT_STATUS_PENDING: "pending,running",
};
const DOMAIN = "www.cliente.example";
const clock = () => new Date("2026-10-08T10:00:00Z");
const PROJECT_REF: ProjectRef = {
  projectId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  scope: { tenantId: "fixture", projectId: "client" },
};

const signingKeyring = () => {
  const loaded = loadKeyring({
    PROVENANCE_SIGNING_KEYS: `capture:${randomBytes(32).toString("base64")}`,
    PROVENANCE_ACTIVE_KEY_ID: "capture",
  });
  if (!loaded.ok) throw new Error(loaded.error);
  return loaded.keyring;
};

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: { method?: string; id?: number; params?: { name?: string; arguments?: Record<string, unknown> } } | null;
}
type ToolHandler = (args: Record<string, unknown>) => { structuredContent?: unknown; isError?: boolean } | { httpStatus: number; retryAfter?: string } | { rpcError: number };

function mockOpenSeo(tools: Record<string, ToolHandler>, opts: { health?: unknown; sse?: boolean } = {}) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method ?? "GET", headers, body });
    expect(init.redirect).toBe("error");
    if (url === `${ENDPOINT}/api/health`) return Response.json(opts.health ?? { status: "ok" });
    if (url !== `${ENDPOINT}/mcp`) return new Response("not found", { status: 404 });
    if (headers.authorization !== `Bearer ${KEY}`) return new Response("unauthorized", { status: 401 });
    if (init.method === "DELETE") return new Response(null, { status: 200 });
    if (body.method === "initialize") {
      return Response.json({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "mock" } } }, { headers: { "mcp-session-id": "sess-1" } });
    }
    expect(headers["mcp-session-id"]).toBe("sess-1");
    expect(headers["mcp-protocol-version"]).toBe("2025-06-18");
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    const name = body.params?.name ?? "";
    const handler = tools[name];
    if (!handler) return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32602, message: "unknown tool" } });
    const out = handler(body.params?.arguments ?? {});
    if ("httpStatus" in out) return new Response("limited", { status: out.httpStatus, headers: out.retryAfter ? { "retry-after": out.retryAfter } : {} });
    if ("rpcError" in out) return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: out.rpcError, message: `boom ${KEY}` } });
    const message = { jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: `secret text ${KEY}` }], ...out } };
    if (opts.sse) return new Response(`event: message\ndata: ${JSON.stringify(message)}\n\n`, { headers: { "content-type": "text/event-stream" } });
    return Response.json(message);
  };
  return { calls, fetchImpl, toolCalls: () => calls.filter((c) => c.body?.method === "tools/call").map((c) => ({ name: c.body?.params?.name, args: c.body?.params?.arguments })) };
}

const noLeak = (value: unknown) => {
  const text = JSON.stringify(value);
  expect(text).not.toContain(KEY);
  expect(text).not.toContain(ENDPOINT);
  expect(text).not.toContain(OSEO_PROJECT);
  expect(text).not.toContain("secret text");
};

describe("OpenSEO configuration (server-only variables)", () => {
  it("is not configured without variables, and the public view carries no values", () => {
    const s = readOpenSeoConfig({});
    expect(s.state).toBe("not-configured");
    expect(describeOpenSeoConfig(s)).toMatchObject({ state: "not-configured", maxPages: null, allowedHostCount: 0 });
  });

  it("parses a valid configuration and never exposes the key in its view", () => {
    const s = readOpenSeoConfig(ENV);
    expect(s.state).toBe("configured");
    if (s.state !== "configured") return;
    expect(s.config.mcpUrl).toBe(`${ENDPOINT}/mcp`);
    expect(s.config.maxPages).toBe(100);
    expect(s.config.allowedHosts).toEqual([DOMAIN]);
    noLeak(describeOpenSeoConfig(s));
  });

  it.each([
    ["an http endpoint", { OPENSEO_ENDPOINT: "http://openseo.example.test" }],
    ["an endpoint with credentials", { OPENSEO_ENDPOINT: "https://u:p@openseo.example.test" }],
    ["a key that is not an OpenSEO key", { OPENSEO_API_KEY: "not-a-key" }],
    ["a preview host in the allow-list", { OPENSEO_AUDIT_ALLOWED_HOSTS: "sarah-preview.vercel.app" }],
    ["an IP in the allow-list", { OPENSEO_AUDIT_ALLOWED_HOSTS: "10.0.0.1" }],
    ["a page limit above the ceiling", { OPENSEO_AUDIT_MAX_PAGES: String(MAX_PAGES_CEILING + 1) }],
    ["a page limit below 10", { OPENSEO_AUDIT_MAX_PAGES: "5" }],
    ["a missing project id", { OPENSEO_PROJECT_ID: "" }],
  ])("refuses %s", (_label, patch) => {
    expect(readOpenSeoConfig({ ...ENV, ...patch }).state).toBe("invalid");
  });

  it("refuses any OpenSEO data in a NEXT_PUBLIC_ variable (it would reach the browser)", () => {
    expect(publicOpenSeoLeak({ NEXT_PUBLIC_OPENSEO_ENDPOINT: ENDPOINT })).toBe("NEXT_PUBLIC_OPENSEO_ENDPOINT");
    expect(publicOpenSeoLeak({ NEXT_PUBLIC_ANYTHING: KEY })).toBe("NEXT_PUBLIC_ANYTHING");
    const s = readOpenSeoConfig({ ...ENV, NEXT_PUBLIC_X: KEY });
    expect(s.state).toBe("invalid");
    noLeak(s);
  });
});

describe("MCP Streamable HTTP client", () => {
  const make = (fetchImpl: (u: string, i: RequestInit) => Promise<Response>) => createOpenSeoMcpClient({ mcpUrl: `${ENDPOINT}/mcp`, apiKey: KEY, maxPages: 100, fetchImpl });

  it("only knows the five free audit tools", () => {
    expect([...ALLOWED_TOOLS]).toEqual(["whoami", "run_site_audit", "get_audit_status", "get_audit_issues", "get_audit_pages"]);
  });

  it.each(["keyword_research", "get_serp_results", "get_backlinks", "track_rankings", "run_lighthouse", "list_site_audits", "delete_site_audit", "create_project"])(
    "refuses %s before any network request",
    async (tool) => {
      const mock = mockOpenSeo({});
      await expect(make(mock.fetchImpl).callTool(tool, {})).rejects.toMatchObject({ code: "TOOL_NOT_ALLOWED" });
      expect(mock.calls).toHaveLength(0);
    },
  );

  it("refuses Lighthouse and page limits above the server ceiling, before any request", async () => {
    const mock = mockOpenSeo({});
    const c = make(mock.fetchImpl);
    await expect(c.callTool("run_site_audit", { projectId: "p", url: "https://x.example/", maxPages: 50, runLighthouse: true })).rejects.toMatchObject({ code: "LIGHTHOUSE_NOT_ALLOWED" });
    await expect(c.callTool("run_site_audit", { projectId: "p", url: "https://x.example/", maxPages: 50 })).rejects.toMatchObject({ code: "LIGHTHOUSE_NOT_ALLOWED" });
    await expect(c.callTool("run_site_audit", { projectId: "p", url: "https://x.example/", maxPages: 101, runLighthouse: false })).rejects.toMatchObject({ code: "MAX_PAGES_NOT_ALLOWED" });
    expect(mock.calls).toHaveLength(0);
  });

  it("initializes a session, acknowledges it and calls the tool with the bearer key only in the header", async () => {
    const mock = mockOpenSeo({ whoami: () => ({ structuredContent: { userId: "u1" } }) });
    const c = make(mock.fetchImpl);
    const res = await c.callTool("whoami", {});
    await c.close();
    expect(res.structuredContent).toEqual({ userId: "u1" });
    expect(mock.calls.map((x) => x.body?.method ?? x.method)).toEqual(["initialize", "notifications/initialized", "tools/call", "DELETE"]);
    for (const call of mock.calls) expect(JSON.stringify(call.body ?? {})).not.toContain(KEY);
  });

  it("reads responses sent as Server-Sent Events", async () => {
    const mock = mockOpenSeo({ whoami: () => ({ structuredContent: { userId: "u1" } }) }, { sse: true });
    expect((await make(mock.fetchImpl).callTool("whoami", {})).structuredContent).toEqual({ userId: "u1" });
  });

  it("turns HTTP and JSON-RPC failures into errors the Core understands, without the key", async () => {
    const mock = mockOpenSeo({ get_audit_status: () => ({ httpStatus: 429, retryAfter: "30" }), get_audit_pages: () => ({ rpcError: -32000 }) });
    const c = make(mock.fetchImpl);
    const limited = await c.callTool("get_audit_status", { projectId: "p", auditId: "a" }).catch((e) => e);
    expect(limited).toBeInstanceOf(OpenSeoTransportError);
    expect(limited).toMatchObject({ status: 429, retryAfter: 30 });
    const rpc = await c.callTool("get_audit_pages", { projectId: "p", auditId: "a" }).catch((e) => e);
    expect(rpc).toMatchObject({ code: -32000 });
    expect(String(rpc.message)).not.toContain(KEY);
    const wrongKey = createOpenSeoMcpClient({ mcpUrl: `${ENDPOINT}/mcp`, apiKey: "oseo_wrong", maxPages: 100, fetchImpl: mock.fetchImpl });
    await expect(wrongKey.callTool("whoami", {})).rejects.toMatchObject({ status: 401 });
  });

  it("reports a timeout as a timeout", async () => {
    const slow = () => Promise.reject(Object.assign(new Error("t"), { name: "TimeoutError" }));
    await expect(make(slow).callTool("whoami", {})).rejects.toMatchObject({ code: "ETIMEDOUT", name: "AbortError" });
  });
});

describe("connection test: CONNECTED only with health ok and a verified whoami", () => {
  it("does nothing without configuration", async () => {
    const mock = mockOpenSeo({});
    const r = await testOpenSeoConnection({ env: {}, fetchImpl: mock.fetchImpl });
    expect(r.status).toBe("NOT_CONFIGURED");
    expect(mock.calls).toHaveLength(0);
  });

  it("stays NOT_CONNECTED without a whoami verifier, and shows only field names", async () => {
    const mock = mockOpenSeo({ whoami: () => ({ structuredContent: { userId: "u-123", email: "persona@cliente.example" } }) });
    const r = await testOpenSeoConnection({ env: ENV, fetchImpl: mock.fetchImpl, clock });
    expect(r).toMatchObject({ status: "NOT_CONNECTED", health: "ok", authorization: "NOT_VERIFIED", reason: "WHOAMI_UNVERIFIED", whoamiFields: ["userId", "email"] });
    expect(JSON.stringify(r)).not.toMatch(/u-123|persona@/);
    noLeak(r);
    // The health check never carries the key.
    expect(mock.calls.find((c) => c.url.endsWith("/api/health"))?.headers.authorization).toBeUndefined();
  });

  it("is CONNECTED when the configured whoami field is a non-empty string", async () => {
    const mock = mockOpenSeo({ whoami: () => ({ structuredContent: { userId: "u-123" } }) });
    const r = await testOpenSeoConnection({ env: { ...ENV, OPENSEO_WHOAMI_IDENTITY_FIELD: "userId" }, fetchImpl: mock.fetchImpl, clock });
    expect(r).toMatchObject({ status: "CONNECTED", authorization: "VERIFIED", whoamiFields: [] });
    noLeak(r);
  });

  it("is NOT_CONNECTED when whoami lacks the field or OpenSEO rejects the key", async () => {
    const env = { ...ENV, OPENSEO_WHOAMI_IDENTITY_FIELD: "userId" };
    const empty = mockOpenSeo({ whoami: () => ({ structuredContent: { userId: "" } }) });
    expect(await testOpenSeoConnection({ env, fetchImpl: empty.fetchImpl })).toMatchObject({ status: "NOT_CONNECTED", authorization: "REJECTED" });
    const rejected = mockOpenSeo({ whoami: () => ({ httpStatus: 401 }) });
    const r = await testOpenSeoConnection({ env, fetchImpl: rejected.fetchImpl });
    expect(r).toMatchObject({ status: "NOT_CONNECTED", authorization: "REJECTED", error: { code: "AUTH" } });
  });

  it("reports health issues as ERROR without calling whoami", async () => {
    const mock = mockOpenSeo({ whoami: () => ({ structuredContent: { userId: "u" } }) }, { health: { status: "issues", checks: { dataforseo: { status: "error" } } } });
    const r = await testOpenSeoConnection({ env: ENV, fetchImpl: mock.fetchImpl });
    expect(r).toMatchObject({ status: "ERROR", health: "issues", failingChecks: ["dataforseo"] });
    expect(mock.toolCalls()).toEqual([]);
  });

  it("the verifier never accepts non-strings", () => {
    const v = whoamiVerifier("userId")!;
    expect(v({ userId: "a" })).toBe(true);
    for (const value of [undefined, null, 1, true, "  ", { id: "a" }]) expect(v({ userId: value })).toBe(false);
    expect(whoamiVerifier(null)).toBeUndefined();
  });
});

describe("audit target: only the project's own allow-listed public domain", () => {
  const allowed = [DOMAIN];
  it.each([
    ["not a URL", "cliente", "INVALID_URL"],
    ["http", `http://${DOMAIN}/`, "NOT_HTTPS"],
    ["credentials", `https://u:p@${DOMAIN}/`, "INVALID_URL"],
    ["a port", `https://${DOMAIN}:8443/`, "INVALID_URL"],
    ["a Vercel preview", "https://sarah-git-feat.vercel.app/", "HOST_NOT_AUDITABLE"],
    ["localhost", "https://localhost/", "HOST_NOT_AUDITABLE"],
    ["an IP", "https://127.0.0.1/", "HOST_NOT_AUDITABLE"],
    ["a host not allowed", "https://otro.example/", "HOST_NOT_ALLOWED"],
  ])("refuses %s", (_l, url, code) => {
    expect(checkAuditTarget(url, allowed, DOMAIN)).toEqual({ ok: false, code });
  });

  it("refuses an allowed host that is not this project's domain", () => {
    expect(checkAuditTarget(`https://${DOMAIN}/`, allowed, "otro.example")).toEqual({ ok: false, code: "NOT_PROJECT_DOMAIN" });
    expect(checkAuditTarget(`https://${DOMAIN}/`, allowed, null)).toEqual({ ok: false, code: "NOT_PROJECT_DOMAIN" });
  });

  it("accepts the project domain and drops query and fragment", () => {
    expect(checkAuditTarget(`https://${DOMAIN.toUpperCase()}/es/?utm=x#top`, allowed, `https://${DOMAIN}`)).toEqual({ ok: true, url: `https://${DOMAIN}/es/` });
  });
});

describe("manual site audit", () => {
  it("starts run_site_audit with runLighthouse false, the explicit limit and the server-side project id", async () => {
    const mock = mockOpenSeo({ run_site_audit: () => ({ structuredContent: { auditId: "aud_1" } }) });
    const r = await startSiteAudit({ url: `https://${DOMAIN}/`, maxPages: 40, projectDomain: DOMAIN }, { env: ENV, fetchImpl: mock.fetchImpl, clock });
    expect(r).toMatchObject({ ok: true, auditId: "aud_1", maxPages: 40, url: `https://${DOMAIN}/` });
    expect(mock.toolCalls()).toEqual([{ name: "run_site_audit", args: { projectId: OSEO_PROJECT, url: `https://${DOMAIN}/`, maxPages: 40, runLighthouse: false } }]);
    noLeak(r);
  });

  it("reuses a valid active project job without calling an OpenSEO tool", async () => {
    const mock = mockOpenSeo({ run_site_audit: () => ({ structuredContent: { auditId: "other" } }) });
    const activeJob = { jobId: "aud_active", auditId: "aud_active", state: "SYNCING" as const };
    const r = await startSiteAudit(
      { url: `https://${DOMAIN}/`, maxPages: 20, projectDomain: DOMAIN },
      { env: ENV, fetchImpl: mock.fetchImpl, activeJob },
    );
    expect(r).toMatchObject({ ok: true, auditId: "aud_active", reused: true });
    expect(mock.toolCalls()).toEqual([]);
  });

  it("refuses a malformed active job before opening an MCP session", async () => {
    const mock = mockOpenSeo({});
    const activeJob = { jobId: "different", auditId: "aud_active", state: "SYNCING" as const };
    const r = await startSiteAudit(
      { url: `https://${DOMAIN}/`, maxPages: 20, projectDomain: DOMAIN },
      { env: ENV, fetchImpl: mock.fetchImpl, activeJob },
    );
    expect(r).toMatchObject({ ok: false, reused: false, error: { code: "INVALID_ACTIVE_JOB" } });
    expect(mock.calls).toEqual([]);
  });

  it.each([
    ["above the server limit", 101, "MAX_PAGES_NOT_ALLOWED"],
    ["below 10", 9, "MAX_PAGES_NOT_ALLOWED"],
    ["not an integer", Number.NaN, "MAX_PAGES_NOT_ALLOWED"],
  ])("refuses a page limit %s without calling OpenSEO", async (_l, maxPages, code) => {
    const mock = mockOpenSeo({});
    const r = await startSiteAudit({ url: `https://${DOMAIN}/`, maxPages, projectDomain: DOMAIN }, { env: ENV, fetchImpl: mock.fetchImpl });
    expect(r).toMatchObject({ ok: false, error: { code } });
    expect(mock.calls).toHaveLength(0);
  });

  it("refuses a protected preview without calling OpenSEO", async () => {
    const mock = mockOpenSeo({});
    const r = await startSiteAudit({ url: "https://sarah-katerina-git-x.vercel.app/", maxPages: 20, projectDomain: DOMAIN }, { env: ENV, fetchImpl: mock.fetchImpl });
    expect(r).toMatchObject({ ok: false, error: { code: "HOST_NOT_AUDITABLE" } });
    expect(mock.calls).toHaveLength(0);
  });

  it("reports capacity and already-running refusals", async () => {
    for (const code of ["AUDIT_CAPACITY_REACHED", "AUDIT_ALREADY_RUNNING"]) {
      const mock = mockOpenSeo({ run_site_audit: () => ({ isError: true, structuredContent: { code } }) });
      const r = await startSiteAudit({ url: `https://${DOMAIN}/`, maxPages: 20, projectDomain: DOMAIN }, { env: ENV, fetchImpl: mock.fetchImpl });
      expect(r).toMatchObject({ ok: false, auditId: null, error: { code } });
    }
  });

  it("does nothing without configuration", async () => {
    const mock = mockOpenSeo({});
    expect(await startSiteAudit({ url: `https://${DOMAIN}/`, maxPages: 20, projectDomain: DOMAIN }, { env: {}, fetchImpl: mock.fetchImpl })).toMatchObject({ ok: false, error: { code: "NOT_CONFIGURED" } });
    expect(mock.calls).toHaveLength(0);
  });
});

describe("audit follow-up and normalization through the Core", () => {
  // Mirrors src/server/mcp/tools/site-audit-tools.ts in OpenSEO: the audit row is nested.
  const status = (s: string) => () => ({ structuredContent: { status: { status: s, currentPhase: "crawl", pagesCrawled: 12, pagesTotal: 40 } } });

  it("an audit in progress stays SYNCING and fetches no results", async () => {
    const mock = mockOpenSeo({ get_audit_status: status("running") });
    const r = await followSiteAudit("aud_1", DOMAIN, { env: ENV, fetchImpl: mock.fetchImpl, clock });
    expect(r.progress).toMatchObject({ ok: true, state: "SYNCING", providerStatus: "running", pagesCrawled: 12, pagesTotal: 40 });
    expect(r.report).toBeNull();
    expect(mock.toolCalls().map((c) => c.name)).toEqual(["get_audit_status"]);
  });

  it("an unknown status is never READY: it stays in progress with a diagnostic", async () => {
    const mock = mockOpenSeo({ get_audit_status: status("crawling-deep") });
    const r = await followSiteAudit("aud_1", DOMAIN, { env: ENV, fetchImpl: mock.fetchImpl });
    expect(r.progress).toMatchObject({ state: "UNCLASSIFIED", error: { code: "UNCLASSIFIED_STATUS" } });
    expect(r.report).toBeNull();
  });

  it("a failed audit is reported as failed", async () => {
    const mock = mockOpenSeo({ get_audit_status: status("failed") });
    const r = await followSiteAudit("aud_1", DOMAIN, { env: ENV, fetchImpl: mock.fetchImpl });
    expect(r.progress).toMatchObject({ ok: false, state: "FAILED", error: { code: "AUDIT_FAILED" } });
  });

  it("a completed audit returns issues and pages normalized by the Core, only for the project's domain", async () => {
    let captured: CompletedAuditCapture | null = null;
    const mock = mockOpenSeo({
      get_audit_status: status("completed"),
      get_audit_issues: (args) => {
        expect(args).toEqual({ projectId: OSEO_PROJECT, auditId: "aud_1", limit: 200 });
        return {
          structuredContent: {
            issues: [
              { issueType: "missing-title", severity: "critical", url: `https://${DOMAIN}/a` },
              { issueType: "thin-content", severity: "warning", url: `https://${DOMAIN}/b` },
              { issueType: "blocked-page", severity: "info", url: `https://${DOMAIN}/c` },
              { issueType: "missing-title", severity: "critical", url: "https://other.example/x" },
              { issueType: "Bad Type", severity: "critical", url: `https://${DOMAIN}/d` },
            ],
          },
        };
      },
      get_audit_pages: () => ({ structuredContent: { pages: [{ url: `https://${DOMAIN}/a`, html: "<html>secret text</html>" }, { url: "https://other.example/x" }], total: 2 } }),
    });
    const r = await followSiteAudit("aud_1", DOMAIN, {
      env: ENV,
      fetchImpl: mock.fetchImpl,
      clock,
      captureCompletedResults: (value) => { captured = value; },
    });
    expect(r.progress.state).toBe("COMPLETED");
    expect(r.report?.issues).toEqual([
      { id: `openseo:aud_1:missing-title:https://${DOMAIN}/a`, url: `https://${DOMAIN}/a`, category: "missing-title", severity: "ERROR", crawlAccess: null },
      { id: `openseo:aud_1:thin-content:https://${DOMAIN}/b`, url: `https://${DOMAIN}/b`, category: "thin-content", severity: "WARNING", crawlAccess: null },
      { id: `openseo:aud_1:blocked-page:https://${DOMAIN}/c`, url: `https://${DOMAIN}/c`, category: "blocked-page", severity: "OPPORTUNITY", crawlAccess: "BLOCKED" },
    ]);
    expect(r.report?.issuesPartial).toMatchObject({ reason: "invalid-rows", rejected: 2 });
    expect(r.report?.pages).toEqual([{ url: `https://${DOMAIN}/a` }]);
    expect(r.report?.pagesTotal).toBe(2);
    expect(r.report?.outsideProject).toBe(2);
    expect(r.report?.hiddenPages).toBe(1);
    expect(r.report?.hiddenIssues).toBe(1);
    expect(r.report?.method).toBe("api");
    expect(r.captureError).toBeNull();
    expect(captured).not.toBeNull();
    const original = captured as unknown as CompletedAuditCapture;
    expect(providers.isTrustedResult(original.issues)).toBe(true);
    expect(providers.isTrustedResult(original.pages)).toBe(true);
    expect(original.issues.data).toHaveLength(3);
    expect(original.pages.data).toHaveLength(1);
    const keyring = signingKeyring();
    const prepared = prepareCompletedAuditResults(original, PROJECT_REF, keyring);
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(openProviderResult(prepared.prepared.issues, PROJECT_REF, keyring)).toMatchObject({ trust: "SIGNED_PROVENANCE", verified: true });
      expect(openProviderResult(prepared.prepared.pages, PROJECT_REF, keyring)).toMatchObject({ trust: "SIGNED_PROVENANCE", verified: true });
      expect(JSON.stringify(prepared)).not.toContain("other.example");
    }
    noLeak(r);
    expect(mock.toolCalls().map((c) => c.name)).toEqual(["get_audit_status", "get_audit_issues", "get_audit_pages"]);
  });

  it("keeps a capture failure separate from the completed OpenSEO report and redacts its cause", async () => {
    const mock = mockOpenSeo({
      get_audit_status: status("completed"),
      get_audit_issues: () => ({ structuredContent: { issues: [] } }),
      get_audit_pages: () => ({ structuredContent: { pages: [], total: 0 } }),
    });
    const r = await followSiteAudit("aud_1", DOMAIN, {
      env: ENV,
      fetchImpl: mock.fetchImpl,
      captureCompletedResults: async () => { throw new Error(KEY); },
    });
    expect(r.progress.state).toBe("COMPLETED");
    expect(r.report).not.toBeNull();
    expect(r.captureError).toEqual({ code: "CAPTURE_FAILED", message: "El resultado terminó, pero no pudo prepararse para guardarlo.", retryable: true });
    noLeak(r);
  });

  it("refuses to sign a copied or cross-audit result", async () => {
    let captured: CompletedAuditCapture | null = null;
    const mock = mockOpenSeo({
      get_audit_status: status("completed"),
      get_audit_issues: () => ({ structuredContent: { issues: [] } }),
      get_audit_pages: () => ({ structuredContent: { pages: [], total: 0 } }),
    });
    await followSiteAudit("aud_1", DOMAIN, { env: ENV, fetchImpl: mock.fetchImpl, captureCompletedResults: (value) => { captured = value; } });
    const original = captured as unknown as CompletedAuditCapture;
    const keyring = signingKeyring();
    expect(prepareCompletedAuditResults({ ...original, auditId: "aud_other" }, PROJECT_REF, keyring)).toEqual({ ok: false, error: "RESULT_AUDIT_MISMATCH" });
    expect(prepareCompletedAuditResults({ ...original, issues: JSON.parse(JSON.stringify(original.issues)) }, PROJECT_REF, keyring)).toEqual({ ok: false, error: "RESULT_AUDIT_MISMATCH" });
  });

  it.each([false, true])("includes the www/apex companion only with explicit authorization (%s)", async (allowCompanion) => {
    const companion = DOMAIN.slice(4);
    const mock = mockOpenSeo({
      get_audit_status: status("completed"),
      get_audit_issues: () => ({ structuredContent: { issues: [] } }),
      get_audit_pages: () => ({ structuredContent: { pages: [
        { url: `https://${DOMAIN}/` }, { url: `https://${companion}/about` },
        { url: `https://shop.${companion}/` }, { url: "https://other.example/" },
      ], total: 4 } }),
    });
    const env = { ...ENV, OPENSEO_AUDIT_ALLOWED_HOSTS: allowCompanion ? `${DOMAIN},${companion},shop.${companion}` : DOMAIN };
    const r = await followSiteAudit("aud_1", DOMAIN, { env, fetchImpl: mock.fetchImpl });
    expect(r.report?.pages).toEqual(allowCompanion ? [{ url: `https://${DOMAIN}/` }, { url: `https://${companion}/about` }] : [{ url: `https://${DOMAIN}/` }]);
    expect(r.report?.hiddenPages).toBe(allowCompanion ? 2 : 3);
    noLeak(r);
  });

  it("rejects two pasted UUIDs before making a network request", async () => {
    const mock = mockOpenSeo({});
    const id = "02f2f04d-c7ea-4fe9-bb05-be1c39509938";
    const r = await followSiteAudit(id + id, DOMAIN, { env: ENV, fetchImpl: mock.fetchImpl });
    expect(r.progress.error?.code).toBe("INVALID_AUDIT_ID");
    expect(mock.calls).toHaveLength(0);
  });

  it("refuses a malformed audit id without calling OpenSEO", async () => {
    const mock = mockOpenSeo({});
    const r = await followSiteAudit("../../x", DOMAIN, { env: ENV, fetchImpl: mock.fetchImpl });
    expect(r.progress.error?.code).toBe("INVALID_AUDIT_ID");
    expect(mock.calls).toHaveLength(0);
  });

  it("refuses an audit id not bound to this project before calling OpenSEO", async () => {
    const mock = mockOpenSeo({});
    const r = await followSiteAudit("aud_other", DOMAIN, { env: ENV, fetchImpl: mock.fetchImpl, boundAuditId: "aud_project" });
    expect(r.progress.error?.code).toBe("AUDIT_NOT_BOUND");
    expect(mock.calls).toEqual([]);
  });

  it("fails closed when the project has no bound audit", async () => {
    const mock = mockOpenSeo({});
    const r = await followSiteAudit("aud_other", DOMAIN, { env: ENV, fetchImpl: mock.fetchImpl, boundAuditId: null });
    expect(r.progress.error?.code).toBe("AUDIT_NOT_BOUND");
    expect(mock.calls).toEqual([]);
  });
});

describe("static guarantees", () => {
  const root = join(__dirname, "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  it("the browser component only reaches OpenSEO through Server Actions", () => {
    const ui = read("src/components/OpenSeoConsole.tsx");
    expect(ui).toMatch(/^"use client";/);
    expect(ui).not.toMatch(/openseo\/(config|bridge|mcp-client)|process\.env|OPENSEO_/);
    expect(read("src/lib/openseo/actions.ts")).toMatch(/^"use server";/);
    for (const f of ["config.ts", "bridge.ts", "mcp-client.ts"]) expect(read(`src/lib/openseo/${f}`), f).toMatch(/^import "server-only";/);
  });

  it("every OpenSEO action checks the session and manage-connectors first", () => {
    const actions = read("src/lib/openseo/actions.ts");
    expect(actions).toMatch(/currentUser\(\)/);
    expect(actions).toMatch(/"manage-connectors"/);
    expect(actions.match(/await authorized\(formData\)/g)).toHaveLength(3);
  });

  it("the bridge never logs and never writes OpenSEO data to the Project State or the database", () => {
    for (const f of ["config.ts", "bridge.ts", "mcp-client.ts", "actions.ts"]) {
      const src = read(`src/lib/openseo/${f}`);
      expect(src, f).not.toMatch(/console\.|\.from\(|\.insert\(|\.rpc\(|seo\.integrations/);
    }
  });

  it("the history detail verifies the stored row before rendering provider data", () => {
    const detail = read("src/app/proyectos/[tenantId]/[projectId]/auditoria-tecnica/resultados/[resultId]/page.tsx");
    expect(detail).toMatch(/loadProviderResult\(supabase, ref, resultId, keyring\)/);
    expect(detail).toMatch(/verification\.verified \? verification\.result/);
    expect(detail).toMatch(/!verification\.verified/);
    expect(detail).not.toMatch(/signed_payload|row\.data\b/);
  });

  it(".env.example lists only empty, server-only OpenSEO names", () => {
    const lines = read(".env.example").split("\n").filter((l) => /OPENSEO/.test(l) && !l.startsWith("#"));
    expect(lines.map((l) => l.split("=")[0])).toEqual([
      "OPENSEO_ENDPOINT",
      "OPENSEO_API_KEY",
      "OPENSEO_PROJECT_ID",
      "OPENSEO_AUDIT_ALLOWED_HOSTS",
      "OPENSEO_AUDIT_MAX_PAGES",
      "OPENSEO_WHOAMI_IDENTITY_FIELD",
      "OPENSEO_AUDIT_STATUS_COMPLETED",
      "OPENSEO_AUDIT_STATUS_FAILED",
      "OPENSEO_AUDIT_STATUS_PENDING",
    ]);
    for (const l of lines) expect(l, l).toMatch(/^[A-Z_]+=$/);
  });
});

describe("safe diagnostics for real audit status contract mismatches", () => {
  it("reports only bounded field names and types, never values", () => {
    const result = auditResponseShape({ status: { status: KEY, userEmail: "private@example.test", pagesCrawled: 10 }, meta: { projectId: OSEO_PROJECT, url: ENDPOINT }, [KEY]: "hidden" });
    expect(result).toContain("root.status.status=string");
    expect(result).toContain("root.status.pagesCrawled=number");
    expect(result).not.toContain("private@example.test");
    noLeak(result);
    expect(result.length).toBeLessThanOrEqual(1000);
  });
  it("adds shape only to INVALID_RESPONSE and makes just one status call", async () => {
    const mock = mockOpenSeo({ get_audit_status: () => ({ structuredContent: { data: { state: KEY, pagesCrawled: 3 }, meta: { projectId: OSEO_PROJECT } } }) });
    const result = await followSiteAudit("aud_1", DOMAIN, { env: ENV, fetchImpl: mock.fetchImpl });
    expect(result.progress.error).toMatchObject({ code: "INVALID_RESPONSE", diagnostic: expect.stringContaining("root.data.state=string") });
    expect(result.report).toBeNull();
    expect(mock.toolCalls()).toHaveLength(1);
    noLeak(result);
  });
  it("preserves valid status without exposing any diagnostic", async () => {
    const mock = mockOpenSeo({ get_audit_status: () => ({ structuredContent: { status: { status: "running", pagesCrawled: 3 } } }) });
    const result = await followSiteAudit("aud_1", DOMAIN, { env: ENV, fetchImpl: mock.fetchImpl });
    expect(result.progress.state).toBe("SYNCING");
    expect(result.progress.error).toBeNull();
  });
});
