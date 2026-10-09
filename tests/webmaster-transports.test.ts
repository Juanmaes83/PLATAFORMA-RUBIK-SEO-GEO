import { describe, expect, it } from "vitest";
import intelligence from "@rubik/seo-geo-core/intelligence";
import { providers } from "@/lib/core";
import { createSearchConsoleTransport, searchConsolePropertyFor } from "@/lib/search-console/transport";
import { createBingTransport, parseBingDate } from "@/lib/bing/transport";

// ADR 0009: read-only Search Console and Bing transports, exercised through the Core's
// runProviderRequest against in-memory mocks. No network, no real token or key: both are
// assembled at run time so the secrets guard never sees a credential-shaped literal.
const TOKEN = ["ya29", "test".repeat(5)].join(".");
const BING_KEY = "bingtestkey".repeat(3);
const budget = { maxUnits: 5, maxRequests: 5 };
const DOMAIN = "www.cliente.example";
const clock = () => new Date("2026-10-09T10:00:00Z");
const input = { siteUrl: "sc-domain:cliente.example", startDate: "2026-09-01", endDate: "2026-09-28", dimensions: ["query", "page"], rowLimit: 2, dataState: "final", type: "web" };

type Call = { url: string; init: RequestInit };
function mockFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    const call = { url, init };
    calls.push(call);
    return respond(call);
  };
  return { calls, fetchImpl };
}
const noLeak = (value: unknown) => {
  const text = JSON.stringify(value);
  expect(text).not.toContain(TOKEN);
  expect(text).not.toContain(BING_KEY);
  expect(text).not.toContain("apikey");
};
const gsc = (fetchImpl: (u: string, i: RequestInit) => Promise<Response>, over: { siteUrl?: string; token?: string | null } = {}) =>
  createSearchConsoleTransport({ siteUrl: over.siteUrl ?? "sc-domain:cliente.example", projectDomain: DOMAIN, accessToken: async () => (over.token === undefined ? TOKEN : over.token), fetchImpl });
const run = (transport: unknown, operation = "searchAnalytics", body: unknown = input, provider = "search-console") =>
  providers.runProviderRequest({ provider, operation, input: body, transport, budget, clock });

describe("Search Console searchAnalytics transport", () => {
  it("posts the documented request with a bearer token and maps rows for the Core", async () => {
    const mock = mockFetch(() => Response.json({ rows: [{ keys: ["pisos lujo", "https://www.cliente.example/"], clicks: 4, impressions: 120, ctr: 0.0333, position: 7.2 }], responseAggregationType: "byPage" }));
    const r = await run(gsc(mock.fetchImpl));
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].url).toBe("https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Acliente.example/searchAnalytics/query");
    expect(mock.calls[0].init.method).toBe("POST");
    expect((mock.calls[0].init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    const sentBody = { startDate: input.startDate, endDate: input.endDate, dimensions: input.dimensions,
      rowLimit: input.rowLimit, dataState: input.dataState, type: input.type };
    expect(JSON.parse(String(mock.calls[0].init.body))).toEqual(sentBody);
    expect(r).toMatchObject({ status: "OK", connection: "VERIFIED", provenance: { method: "api", evidence: { rowCount: 1, sourceUrl: input.siteUrl }, requestContext: { siteUrl: input.siteUrl, startDate: input.startDate, endDate: input.endDate, dimensions: input.dimensions, rowLimit: input.rowLimit, searchType: "web" } } });
    // Same mapping as the Core's toReleaseC for search-console (not declared in its types).
    const mapped = new intelligence.SearchConsoleAdapter({}).normalize([...r.data]);
    expect(mapped[0]).toMatchObject({ query: "pisos lujo", page: "https://www.cliente.example/", clicks: 4, impressions: 120, ctr: 0.0333, averagePosition: 7.2, provider: "searchConsole" });
    noLeak(r);
  });

  it("a full page is reported as partial (more rows may follow), never as complete", async () => {
    const row = { keys: ["a", "https://cliente.example/"], clicks: 1, impressions: 1, ctr: 1, position: 1 };
    const r = await run(gsc(mockFetch(() => Response.json({ rows: [row, row] })).fetchImpl));
    expect(r).toMatchObject({ status: "PARTIAL", partial: { truncated: true } });
  });

  it("no rows is EMPTY, not zero clicks", async () => {
    const r = await run(gsc(mockFetch(() => Response.json({ responseAggregationType: "byProperty" })).fetchImpl));
    expect(r).toMatchObject({ status: "EMPTY", data: [] });
  });

  it("maps 401, 403 and 429 to honest states without leaking the token", async () => {
    const statuses: [number, string, string][] = [[401, "NOT_CONNECTED", "AUTH"], [403, "ERROR", "FORBIDDEN"], [429, "RATE_LIMITED", "RATE_LIMITED"], [500, "ERROR", "HTTP_500"]];
    for (const [http, status, code] of statuses) {
      const r = await run(gsc(mockFetch(() => new Response(`denied ${TOKEN}`, { status: http, headers: http === 429 ? { "retry-after": "30" } : {} })).fetchImpl));
      expect(r, String(http)).toMatchObject({ status, errors: [{ code }] });
      if (http === 429) expect(r.errors[0]).toMatchObject({ retryAfterSeconds: 30 });
      noLeak(r);
    }
  });

  it("refuses before any request: foreign property, missing token, invalid input, other operations, no budget", async () => {
    const mock = mockFetch(() => Response.json({ rows: [] }));
    expect(await run(gsc(mock.fetchImpl, { siteUrl: "sc-domain:otro.example" }))).toMatchObject({ errors: [{ code: "FORBIDDEN" }] });
    expect(await run(gsc(mock.fetchImpl, { token: null }))).toMatchObject({ status: "NOT_CONNECTED" });
    for (const bad of [
      { ...input, rowLimit: 25_001 }, { ...input, rowLimit: 0 }, { ...input, dimensions: ["hour"] }, { ...input, dimensions: ["query", "query"] },
      { ...input, startDate: "2026-09-29", endDate: "2026-09-01" }, { ...input, startDate: "2026-02-30" }, { ...input, dataState: "hourly_all" }, { ...input, type: "maps" },
    ]) expect(await run(gsc(mock.fetchImpl), "searchAnalytics", bad), JSON.stringify(bad)).toMatchObject({ status: "ERROR", errors: [{ code: "HTTP_400" }] });
    expect(await run(gsc(mock.fetchImpl), "urlInspection")).toMatchObject({ errors: [{ code: "HTTP_400" }] });
    expect(await providers.runProviderRequest({ provider: "search-console", operation: "searchAnalytics", input, transport: gsc(mock.fetchImpl), clock }))
      .toMatchObject({ status: "BUDGET_REQUIRED" });
    expect(mock.calls).toHaveLength(0);
  });

  it("a timeout is a retryable TIMEOUT", async () => {
    const r = await run(gsc(async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; }));
    expect(r).toMatchObject({ status: "ERROR", errors: [{ code: "TIMEOUT", retryable: true }] });
  });

  it("only the project's Domain or https URL-prefix property is accepted", () => {
    expect(searchConsolePropertyFor(DOMAIN, "sc-domain:cliente.example")).toBe(true);
    expect(searchConsolePropertyFor(DOMAIN, "https://cliente.example/")).toBe(true);
    expect(searchConsolePropertyFor(DOMAIN, "https://www.cliente.example/")).toBe(true);
    for (const site of ["http://cliente.example/", "https://blog.cliente.example/", "sc-domain:otro.example", "https://cliente.example/es/", "sc-domain:www.cliente.example"]) {
      expect(searchConsolePropertyFor(DOMAIN, site), site).toBe(false);
    }
    expect(searchConsolePropertyFor(null, "sc-domain:cliente.example")).toBe(false);
  });

  it("rejects a request whose signed property differs from the transport property", async () => {
    const mock = mockFetch(() => Response.json({ rows: [] }));
    const r = await run(gsc(mock.fetchImpl), "searchAnalytics", { ...input, siteUrl: "https://www.cliente.example/" });
    expect(r).toMatchObject({ status: "ERROR", errors: [{ code: "FORBIDDEN" }] });
    expect(mock.calls).toHaveLength(0);
  });
});

describe("Bing Webmaster urlInfo transport", () => {
  const bing = (fetchImpl: (u: string, i: RequestInit) => Promise<Response>, key: string | null = BING_KEY) =>
    createBingTransport({ projectDomain: DOMAIN, apiKey: async () => key, fetchImpl });
  const urlInput = { siteUrl: "https://www.cliente.example/", url: "https://www.cliente.example/pisos" };

  it("calls the documented JSON GET and maps the UrlInfo object", async () => {
    const mock = mockFetch(() => Response.json({ d: { Url: urlInput.url, IsPage: true, HttpStatus: 200, AnchorCount: 3, DocumentSize: 51234,
      DiscoveryDate: "/Date(1696838400000)/", LastCrawledDate: "/Date(1727568000000+0200)/", TotalChildUrlCount: 0 } }));
    const r = await run(bing(mock.fetchImpl), "urlInfo", urlInput, "bing-webmaster");
    const called = new URL(mock.calls[0].url);
    expect(called.origin + called.pathname).toBe("https://ssl.bing.com/webmaster/api.svc/json/GetUrlInfo");
    expect(called.searchParams.get("siteUrl")).toBe(urlInput.siteUrl);
    expect(called.searchParams.get("url")).toBe(urlInput.url);
    expect(called.searchParams.get("apikey")).toBe(BING_KEY);
    expect(r).toMatchObject({ status: "OK", data: [{ url: urlInput.url, isPage: true, httpStatus: 200, anchorCount: 3, documentSize: 51234,
      discoveryDate: "2023-10-09T08:00:00.000Z", lastCrawledDate: "2024-09-29T00:00:00.000Z", totalChildUrlCount: 0 }], provenance: { evidence: { sourceUrl: urlInput.url }, requestContext: urlInput } });
    noLeak(r);
  });

  it("errors never carry the URL with the key", async () => {
    for (const http of [401, 403, 429, 500]) {
      const r = await run(bing(mockFetch(() => new Response("error", { status: http })).fetchImpl), "urlInfo", urlInput, "bing-webmaster");
      expect(r.status).not.toBe("OK");
      noLeak(r);
    }
    const thrown = await run(bing(async () => { throw new Error(`failed https://ssl.bing.com/...?apikey=${BING_KEY}`); }), "urlInfo", urlInput, "bing-webmaster");
    expect(thrown).toMatchObject({ errors: [{ code: "TRANSPORT_ERROR" }] });
    noLeak(thrown);
  });

  it("refuses targets outside the project and requests without a key, before any request", async () => {
    const mock = mockFetch(() => Response.json({ d: null }));
    for (const target of [{ ...urlInput, url: "https://otro.example/" }, { ...urlInput, siteUrl: "https://otro.example/" }, { ...urlInput, url: "http://www.cliente.example/" },
      { ...urlInput, siteUrl: "https://www.cliente.example/es/" }, { ...urlInput, url: "https://www.cliente.example/?q=1" }]) {
      expect(await run(bing(mock.fetchImpl), "urlInfo", target, "bing-webmaster"), JSON.stringify(target)).toMatchObject({ errors: [{ code: "FORBIDDEN" }] });
    }
    expect(await run(bing(mock.fetchImpl, null), "urlInfo", urlInput, "bing-webmaster")).toMatchObject({ status: "NOT_CONNECTED" });
    expect(mock.calls).toHaveLength(0);
  });

  it("a null UrlInfo is EMPTY; dates outside the documented forms or 'never' sentinels are null", async () => {
    expect(await run(bing(mockFetch(() => Response.json({ d: null })).fetchImpl), "urlInfo", urlInput, "bing-webmaster")).toMatchObject({ status: "EMPTY" });
    expect(parseBingDate("/Date(-62135596800000)/")).toBeNull();
    expect(parseBingDate("ayer")).toBeNull();
    expect(parseBingDate(123)).toBeNull();
    expect(parseBingDate("2026-10-01T00:00:00Z")).toBe("2026-10-01T00:00:00.000Z");
  });
});
