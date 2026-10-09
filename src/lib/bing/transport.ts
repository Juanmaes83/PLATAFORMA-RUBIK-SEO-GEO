import "server-only";
import { apexOf, requestJson, type FetchLike } from "@/lib/webmaster/http";

// Bing Webmaster Tools, read only (ADR 0009). Server-side transport for the Core's
// `bing-webmaster.urlInfo` operation. Documented contract (learn.microsoft.com, 09/10/2026):
//   GetUrlInfo(siteUrl, url) → UrlInfo { AnchorCount, DiscoveryDate, DocumentSize, HttpStatus,
//   IsPage, LastCrawledDate, TotalChildUrlCount, Url }, JSON GET
//   https://ssl.bing.com/webmaster/api.svc/json/GetUrlInfo?siteUrl=…&url=…&apikey=…, wrapped in `d`.
// Microsoft recommends OAuth; the API key option puts the key in the query string, so this
// module never reports a URL. The site must be verified in Bing for the API to answer.

const ENDPOINT = "https://ssl.bing.com/webmaster/api.svc/json/GetUrlInfo";

/** The site and the URL must both belong to the project's domain (apex or www). */
export function bingTargetFor(projectDomain: string | null, siteUrl: string, url: string): boolean {
  const apex = apexOf(projectDomain);
  if (!apex) return false;
  const hosts = [apex, `www.${apex}`];
  try {
    const site = new URL(siteUrl);
    const page = new URL(url);
    return site.protocol === "https:" && page.protocol === "https:" && !site.username && !page.username
      && hosts.includes(site.hostname) && hosts.includes(page.hostname) && site.pathname === "/" && !site.search && !page.search && !page.hash;
  } catch {
    return false;
  }
}

/** WCF dates arrive as "/Date(1696838400000)/" or "/Date(1696838400000+0200)/"; ISO is accepted too. */
export function parseBingDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const wcf = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/.exec(value);
  const ms = wcf ? Number(wcf[1]) : Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  // Bing returns 0001-01-01 style sentinels for "never": no date, not year 1.
  return d.getUTCFullYear() < 1995 ? null : d.toISOString();
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function mapUrlInfo(json: unknown) {
  const d = (json as { d?: unknown })?.d;
  if (d === null || d === undefined) return [];
  if (typeof d !== "object" || Array.isArray(d)) return null;
  const u = d as Record<string, unknown>;
  return [{
    url: typeof u.Url === "string" ? u.Url : null,
    isPage: typeof u.IsPage === "boolean" ? u.IsPage : null,
    httpStatus: num(u.HttpStatus),
    anchorCount: num(u.AnchorCount),
    documentSize: num(u.DocumentSize),
    discoveryDate: parseBingDate(u.DiscoveryDate),
    lastCrawledDate: parseBingDate(u.LastCrawledDate),
    totalChildUrlCount: num(u.TotalChildUrlCount),
  }];
}

export function createBingTransport(opts: { projectDomain: string | null; apiKey: () => Promise<string | null>; fetchImpl?: FetchLike; timeoutMs?: number }) {
  return {
    kind: "live" as const,
    async request(operation: string, input: unknown) {
      if (operation !== "urlInfo") return { httpStatus: 400, message: "Operation not allowed by the platform transport" };
      const v = (input ?? {}) as { siteUrl?: unknown; url?: unknown };
      if (typeof v.siteUrl !== "string" || typeof v.url !== "string") return { httpStatus: 400, message: "Invalid URL info request" };
      if (!bingTargetFor(opts.projectDomain, v.siteUrl, v.url)) return { httpStatus: 403, message: "Target outside the project domain" };
      const key = await opts.apiKey();
      if (!key) return { httpStatus: 401, message: "No server-side authorization" };
      const query = new URLSearchParams({ siteUrl: v.siteUrl, url: v.url, apikey: key });
      const out = await requestJson(`${ENDPOINT}?${query}`, { method: "GET", headers: { accept: "application/json" } }, opts);
      if (!out.ok) return { httpStatus: out.httpStatus, retryAfter: out.retryAfter, message: out.message };
      const rows = mapUrlInfo(out.json);
      if (rows === null) return { httpStatus: 502, message: "Unexpected UrlInfo response" };
      return { rows, sourceUrl: v.url };
    },
  };
}
