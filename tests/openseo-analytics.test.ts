import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { providers } from "@/lib/core";
import { createOpenSeoAnalyticsTransport } from "@/lib/openseo/google/analytics";
import { loadKeyring } from "@/lib/provenance/keyring";
import { openProviderResult, sealProviderResult } from "@/lib/provenance/results";
import type { ProjectRef } from "@/lib/provenance/audit";
const input = { report: "organic_landing_pages", propertyId: "properties/123", startDate: "2026-09-01", endDate: "2026-09-28", limit: 100, offset: 0 };
const payload = () => ({ status: "ok", source: { provider: "google_analytics", propertyId: "properties/123" },
  request: { reportKind: "landing_pages", channel: "organic_search", resolvedDateRange: { startDate: input.startDate, endDate: input.endDate }, limit: 100, offset: 0 },
  rows: [{ hostName: "cliente.example", landingPage: "/", sessions: 10, activeUsers: 8,
    engagedSessions: 7, engagementRate: 0.7, keyEvents: 1, sessionKeyEventRate: 0.1,
    transactions: 0, purchaseRevenue: 0 }], rowCount: 1, totalRowCount: 1,
  pageInfo: { limit: 100, offset: 0, hasMore: false, nextOffset: null }, reportMetadata: { hasLimitedData: false, subjectToThresholding: false, dataLossFromOtherRow: false, sampling: [], restrictedMetrics: [] }, warnings: [] });
const setup = (reply: unknown = { structuredContent: payload() }, opts = {}) => {
  const callTool = vi.fn(async () => reply as { structuredContent?: unknown; isError?: boolean; content?: unknown });
  const transport = createOpenSeoAnalyticsTransport({ mcp: { callTool }, openseoProjectId: "project-a", expectedPropertyId: "properties/123", ...opts });
  const run = (body: unknown = input, operation = "report") => providers.runProviderRequest({ provider: "google-analytics", operation, input: body, transport,
    budget: { maxUnits: 5, maxRequests: 5 }, clock: () => new Date("2026-10-09T16:00:00Z") });
  return { callTool, transport, run };
};
describe("GA4 via OpenSEO, in-memory simulations only", () => {
  it("calls only the fixed organic landing-page report with server-bound project and property evidence", async () => {
    const s = setup(); const r = await s.run();
    expect(s.callTool).toHaveBeenCalledWith("get_google_analytics_organic_landing_pages", { projectId: "project-a", startDate: input.startDate, endDate: input.endDate, limit: 100, offset: 0 });
    expect(r).toMatchObject({ status: "OK", provenance: { sourceType: "ANALYTICS", evidence: { sourceUrl: "properties/123" }, requestContext: input } });
    expect(r.data).toEqual(payload().rows);
  });
  it("refuses wrong property, missing binding, unsupported options and invalid date/pagination before calling", async () => {
    const s = setup();
    for (const body of [{ ...input, propertyId: "properties/999" }, { ...input, report: "measurement_health" },
      { ...input, startDate: "2026-02-30" }, { ...input, limit: 1001 }, { ...input, offset: -1 },
      { ...input, channel: "all" }, { ...input, dimensions: ["email"] }]) expect((await s.run(body)).data).toEqual([]);
    expect(s.callTool).not.toHaveBeenCalled();
    const missing = setup(undefined, { openseoProjectId: "" }); expect(await missing.run()).toMatchObject({ status: "NOT_CONNECTED" });
    expect(missing.callTool).not.toHaveBeenCalled();
  });
  it("rejects an answer with another property or date/report/pagination context", async () => {
    for (const mutate of [
      (p: ReturnType<typeof payload>) => { p.source.propertyId = "properties/999"; },
      (p: ReturnType<typeof payload>) => { p.request.resolvedDateRange.endDate = "2026-09-27"; },
      (p: ReturnType<typeof payload>) => { p.request.reportKind = "site_search"; },
      (p: ReturnType<typeof payload>) => { p.pageInfo.offset = 1; },
    ]) { const p = payload(); mutate(p); expect(await setup({ structuredContent: p }).run()).toMatchObject({ status: "ERROR", data: [] }); }
  });
  it("missing or malformed rows never become an empty verified report", async () => {
    for (const over of [{ rows: undefined }, { rowCount: 3 }, { totalRowCount: -1 }, { pageInfo: {} }, { rows: [null] }, { warnings: "bad" },
      { totalRowCount: 2 }, { pageInfo: { ...payload().pageInfo, hasMore: true } },
      { pageInfo: { ...payload().pageInfo, nextOffset: 1 } }]) {
      expect(await setup({ structuredContent: { ...payload(), ...over } }).run()).toMatchObject({ status: "ERROR", data: [] });
    }
    expect(await setup({ structuredContent: { ...payload(), rows: [], rowCount: 0, totalRowCount: 0 } }).run()).toMatchObject({ status: "EMPTY" });
  });
  it("rejects empty and semantically invalid rows before they can be verified", async () => {
    const rows = [{}, { landingPage: "/", sessions: -1, activeUsers: "8", keyEvents: true }];
    const r = await setup({ structuredContent: { ...payload(), rows, rowCount: 2, totalRowCount: 2 } }).run();
    expect(r).toMatchObject({ status: "ERROR", connection: "NOT_VERIFIED", data: [] });
  });
  it("normalizes through Core allowlist and only permits null for explicitly restricted metrics", async () => {
    const p = payload();
    const row = { ...p.rows[0], purchaseRevenue: null, privateDimension: "discard me" };
    const reportMetadata = { ...p.reportMetadata, restrictedMetrics: ["purchaseRevenue"] };
    const r = await setup({ structuredContent: { ...p, rows: [row], reportMetadata } }).run();
    expect(r.status).toBe("PARTIAL");
    expect(r.data).toEqual([{ ...p.rows[0], purchaseRevenue: null }]);
    expect(JSON.stringify(r)).not.toContain("privateDimension");
    expect(await setup({ structuredContent: { ...p, rows: [row] } }).run()).toMatchObject({ status: "ERROR", data: [] });
  });
  it("paging, thresholding and provider warnings remain PARTIAL", async () => {
    for (const over of [{ pageInfo: { ...payload().pageInfo, hasMore: true, nextOffset: 1 }, totalRowCount: 101 }, { reportMetadata: { ...payload().reportMetadata, hasLimitedData: true } }, { reportMetadata: { ...payload().reportMetadata, sampling: [{}] } },
      { warnings: ["some private upstream detail"] }]) {
      const r = await setup({ structuredContent: { ...payload(), ...over } }).run();
      expect(r.status).toBe("PARTIAL"); expect(JSON.stringify(r)).not.toContain("private upstream detail");
    }
  });
  it("maps stable authentication/permission/quota errors without copying messages or action URLs", async () => {
    for (const [code, status] of [["ga4_not_connected", "NOT_CONNECTED"], ["ga4_reconnect_required", "NOT_CONNECTED"],
      ["ga4_property_inaccessible", "ERROR"], ["ga4_quota_exhausted", "RATE_LIMITED"], ["ga4_upstream_unavailable", "ERROR"]]) {
      const r = await setup({ structuredContent: { status: "error", error: { code, message: "private detail", actionUrl: "https://private.example", retryAfterSeconds: 30 } } }).run();
      expect(r.status).toBe(status); expect(r.data).toEqual([]); expect(JSON.stringify(r)).not.toContain("private");
      if (status === "RATE_LIMITED") expect(r.errors[0].retryAfterSeconds).toBe(30);
    }
  });
  it("signature binds the simulated result to this project and rejects another project", async () => {
    const keys = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-a:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-a" });
    if (!keys.ok) throw new Error(keys.error);
    const project: ProjectRef = { projectId: "11111111-1111-4111-8111-111111111111", organizationId: "22222222-2222-4222-8222-222222222222", scope: { tenantId: "agencia-a", projectId: "proyecto-a" } };
    const sealed = sealProviderResult(await setup().run(), project, keys.keyring); if (!sealed.ok) throw new Error(sealed.error);
    expect(openProviderResult(sealed.row, project, keys.keyring).verified).toBe(true);
    expect(openProviderResult(sealed.row, { ...project, projectId: "44444444-4444-4444-8444-444444444444" }, keys.keyring).verified).toBe(false);
  });
});
