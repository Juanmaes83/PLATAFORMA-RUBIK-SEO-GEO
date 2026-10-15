// N2-11: turns what a person types ("https://www.Rival.es/tienda?x=1", "rival.es") into the
// registrable host the database stores ("rival.es"). Pure string work: nothing here resolves DNS,
// opens a connection or fetches the address, so there is no SSRF surface. The database repeats
// the shape check (supabase/migrations/20261016100000_n2_11_competitors.sql).

export type DomainError =
  | "EMPTY"
  | "TOO_LONG"
  | "INVALID"
  | "UNSUPPORTED_SCHEME"
  | "CREDENTIALS"
  | "IP_ADDRESS"
  | "SINGLE_LABEL"
  | "RESERVED";

export type DomainResult = { ok: true; domain: string } | { ok: false; error: DomainError };

const MAX_INPUT = 2048;
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
// RFC 2606 / RFC 6761 / RFC 7686 / RFC 8375 names that never identify a public competitor.
const RESERVED_TLDS = new Set(["localhost", "local", "test", "invalid", "example", "internal", "onion", "arpa", "lan", "home", "corp"]);

export function normalizeCompetitorDomain(input: string): DomainResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "EMPTY" };
  if (raw.length > MAX_INPUT) return { ok: false, error: "TOO_LONG" };
  if (/\s/.test(raw)) return { ok: false, error: "INVALID" };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
  // "rival.es:8080" parses as scheme "rival.es"; only a "//" after it means a real scheme.
  const hasScheme = scheme !== null && raw.slice(scheme[0].length).startsWith("//");
  if (scheme && !hasScheme && !/^[^:]+:\d+(\/|$)/.test(raw)) return { ok: false, error: "UNSUPPORTED_SCHEME" };
  if (hasScheme && !/^https?$/i.test(scheme![1])) return { ok: false, error: "UNSUPPORTED_SCHEME" };
  let url: URL;
  try {
    url = new URL(hasScheme ? raw : `http://${raw.replace(/^\/\//, "")}`);
  } catch {
    return { ok: false, error: "INVALID" };
  }
  if (url.username || url.password) return { ok: false, error: "CREDENTIALS" };
  // WHATWG URL lowercases, applies IDNA (punycode) and canonicalises numeric hosts
  // ("2130706433", "0x7f.1") to dotted IPv4, so the IP checks below see the canonical form.
  let host = url.hostname.replace(/\.$/, "");
  if (host.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return { ok: false, error: "IP_ADDRESS" };
  if (host.startsWith("www.")) host = host.slice(4);
  const labels = host.split(".");
  if (labels.length < 2) return { ok: false, error: "SINGLE_LABEL" };
  const tld = labels[labels.length - 1];
  if (RESERVED_TLDS.has(tld)) return { ok: false, error: "RESERVED" };
  if (host.length < 4 || host.length > 253 || !TLD.test(tld) || !labels.every((l) => LABEL.test(l))) return { ok: false, error: "INVALID" };
  return { ok: true, domain: host };
}

