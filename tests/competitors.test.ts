import { describe, expect, it } from "vitest";
import { normalizeCompetitorDomain } from "@/lib/competitors/domain";
import { parseCompetitorDetails, parseObservation, parseValue } from "@/lib/competitors/contract";
import { buildSeries, compareMetric, mismatches, type Observation } from "@/lib/competitors/compare";

const ok = (input: string) => {
  const r = normalizeCompetitorDomain(input);
  if (!r.ok) throw new Error(`${input}: ${r.error}`);
  return r.domain;
};
const err = (input: string) => {
  const r = normalizeCompetitorDomain(input);
  return r.ok ? `accepted:${r.domain}` : r.error;
};

describe("competitor domain normalisation (no fetch, no DNS)", () => {
  it("reduces URLs and spellings of one site to the same host", () => {
    for (const input of ["rival.es", "RIVAL.ES", " https://www.rival.es/tienda?utm=1#x ", "http://rival.es:8080/", "www.rival.es", "rival.es.", "//rival.es/a", "rival.es:443"]) {
      expect(ok(input)).toBe("rival.es");
    }
  });
  it("keeps subdomains other than www and converts IDN to punycode", () => {
    expect(ok("https://blog.rival.es")).toBe("blog.rival.es");
    expect(ok("www.wwwrival.es")).toBe("wwwrival.es");
    expect(ok("españa-rival.es")).toBe("xn--espaa-rival-4db.es");
  });
  it("refuses what is not a public domain", () => {
    expect(err("")).toBe("EMPTY");
    expect(err("   ")).toBe("EMPTY");
    expect(err("rival .es")).toBe("INVALID");
    expect(err("ftp://rival.es")).toBe("UNSUPPORTED_SCHEME");
    expect(err("javascript:alert(1)")).toBe("UNSUPPORTED_SCHEME");
    expect(err("mailto:info@rival.es")).toBe("UNSUPPORTED_SCHEME");
    expect(err("file:///etc/passwd")).toBe("UNSUPPORTED_SCHEME");
    expect(err("https://user:pw@rival.es")).toBe("CREDENTIALS");
    expect(err("127.0.0.1")).toBe("IP_ADDRESS");
    expect(err("http://2130706433/")).toBe("IP_ADDRESS");
    expect(err("http://0x7f.1/")).toBe("IP_ADDRESS");
    expect(err("http://[::1]/")).toBe("IP_ADDRESS");
    expect(err("169.254.169.254")).toBe("IP_ADDRESS");
    expect(err("localhost")).toBe("SINGLE_LABEL");
    expect(err("intranet")).toBe("SINGLE_LABEL");
    expect(err("app.localhost")).toBe("RESERVED");
    expect(err("rival.test")).toBe("RESERVED");
    expect(err("printer.local")).toBe("RESERVED");
    expect(err("svc.internal")).toBe("RESERVED");
    expect(err("rival.e")).toBe("INVALID");
    expect(err("-rival.es")).toBe("INVALID");
    expect(err("rival_es.es")).toBe("INVALID");
    expect(err(`${"a".repeat(64)}.es`)).toBe("INVALID");
    expect(err("a".repeat(3000))).toBe("TOO_LONG");
  });
  it("only produces values the database check accepts", () => {
    const db = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
    for (const input of ["rival.es", "https://Blog.Rival.CO.uk/x", "españa-rival.es", "a.io"]) expect(ok(input)).toMatch(db);
  });
});

describe("observation contract", () => {
  const base = { metric: "referring-domains", method: "observed", availability: "available", value: "120", source: "Ahrefs", observedOn: "2026-10-01" };
  it("parses values without guessing thousands separators", () => {
    expect(parseValue("1234")).toBe(1234);
    expect(parseValue("12,5")).toBe(12.5);
    expect(parseValue("12.5")).toBe(12.5);
    expect(parseValue("1.234")).toBeNull();
    expect(parseValue("1,234")).toBeNull();
    expect(parseValue("-3")).toBeNull();
    expect(parseValue("1e5")).toBeNull();
    expect(parseValue("abc")).toBeNull();
  });
  it("accepts a sourced, dated observation and normalises the market", () => {
    const r = parseObservation({ ...base, country: "es", language: "ES", device: "mobile", competitor: "project" }, "2026-10-15");
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ competitorId: null, value: 120, marketCountry: "ES", marketLanguage: "es", device: "mobile" }) });
  });
  it("stores 'not available' without a value: unknown is not zero", () => {
    const r = parseObservation({ ...base, availability: "not-available", value: "0" }, "2026-10-15");
    expect(r.ok && r.value.value).toBeNull();
    expect(r.ok && r.value.availability).toBe("not-available");
  });
  it("refuses incomplete or inconsistent readings", () => {
    const today = "2026-10-15";
    expect(parseObservation({ ...base, value: "" }, today)).toEqual({ ok: false, error: "VALUE_REQUIRED" });
    expect(parseObservation({ ...base, metric: "pagerank" }, today)).toEqual({ ok: false, error: "METRIC" });
    expect(parseObservation({ ...base, method: "guessed" }, today)).toEqual({ ok: false, error: "METHOD" });
    expect(parseObservation({ ...base, source: " " }, today)).toEqual({ ok: false, error: "SOURCE" });
    expect(parseObservation({ ...base, observedOn: "2026-10-16" }, today)).toEqual({ ok: false, error: "DATE_FUTURE" });
    expect(parseObservation({ ...base, observedOn: "2026-02-30" }, today)).toEqual({ ok: false, error: "DATE" });
    expect(parseObservation({ ...base, observedOn: "1999-12-31" }, today)).toEqual({ ok: false, error: "DATE" });
    expect(parseObservation({ ...base, metric: "authority-score", value: "101" }, today)).toEqual({ ok: false, error: "VALUE_RANGE" });
    expect(parseObservation({ ...base, value: "12,5" }, today)).toEqual({ ok: false, error: "VALUE_NOT_INTEGER" });
    expect(parseObservation({ ...base, country: "ESP" }, today)).toEqual({ ok: false, error: "COUNTRY" });
    expect(parseObservation({ ...base, device: "tablet" }, today)).toEqual({ ok: false, error: "DEVICE" });
    expect(parseObservation({ ...base, reference: "x".repeat(501) }, today)).toEqual({ ok: false, error: "REFERENCE" });
  });
  it("validates competitor details", () => {
    expect(parseCompetitorDetails({ name: " Rival ", relation: "indirect" })).toEqual({ ok: true, value: { name: "Rival", notes: null, relation: "indirect" } });
    expect(parseCompetitorDetails({ relation: "enemy" })).toEqual({ ok: false, error: "RELATION" });
    expect(parseCompetitorDetails({ name: "x".repeat(121) })).toEqual({ ok: false, error: "NAME" });
  });
});

let n = 0;
const obs = (o: Partial<Observation>): Observation => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, competitorId: "c1", metric: "referring-domains", availability: "available", value: 100,
  method: "observed", sourceName: "Ahrefs", sourceReference: null, observedOn: "2026-10-01", marketCountry: "ES", marketLanguage: "es",
  device: null, verification: "unverified", notes: null, createdAt: `2026-10-01T00:00:${String(n % 60).padStart(2, "0")}Z`, ...o,
});
const own = (o: Partial<Observation>) => obs({ competitorId: null, ...o });

describe("honest comparison", () => {
  it("says what is missing instead of inventing a value", () => {
    expect(compareMetric([], [own({})]).kind).toBe("missing-competitor");
    expect(compareMetric([obs({})], []).kind).toBe("missing-project");
    const na = compareMetric([obs({ availability: "not-available", value: null })], [own({})]);
    expect(na).toMatchObject({ kind: "not-available", side: "competitor" });
  });
  it("compares only same metric source, method, market, device and period", () => {
    const r = compareMetric([obs({ value: 150, sourceName: "AHREFS" })], [own({ value: 100, observedOn: "2026-09-20" })]);
    expect(r).toMatchObject({ kind: "comparable", difference: 50, verified: false, declared: false });
  });
  it("lists every reason a comparison is not valid", () => {
    const r = compareMetric([obs({ sourceName: "Semrush", method: "declared", marketCountry: "MX", device: "mobile", observedOn: "2026-10-01" })],
      [own({ observedOn: "2026-05-01" })]);
    expect(r.kind).toBe("not-comparable");
    expect(r.kind === "not-comparable" && r.reasons).toEqual(["source", "method", "market", "device", "period"]);
  });
  it("prefers the most recent valid pair over the latest invalid one", () => {
    const r = compareMetric(
      [obs({ observedOn: "2026-10-10", sourceName: "Semrush", value: 999 }), obs({ observedOn: "2026-09-01", value: 140 })],
      [own({ observedOn: "2026-09-03", value: 90 })]);
    expect(r).toMatchObject({ kind: "comparable", difference: 50 });
  });
  it("a difference is verified only when both readings are verified", () => {
    const r = compareMetric([obs({ verification: "verified" })], [own({ verification: "verified" })]);
    expect(r.kind === "comparable" && r.verified).toBe(true);
    const partial = compareMetric([obs({ verification: "verified" })], [own({})]);
    expect(partial.kind === "comparable" && partial.verified).toBe(false);
  });
  it("31 days apart is comparable, 32 is not", () => {
    expect(mismatches(obs({ observedOn: "2026-10-01" }), own({ observedOn: "2026-08-31" }))).toEqual([]);
    expect(mismatches(obs({ observedOn: "2026-10-01" }), own({ observedOn: "2026-08-30" }))).toEqual(["period"]);
  });
});

describe("history", () => {
  it("one reading is not a trend", () => {
    const [s] = buildSeries([obs({})]);
    expect(s.points).toHaveLength(1);
    expect(s.change).toBeNull();
  });
  it("separates series by source and keeps gaps as gaps", () => {
    const series = buildSeries([
      obs({ observedOn: "2026-08-01", value: 100 }),
      obs({ observedOn: "2026-09-01", availability: "not-available", value: null }),
      obs({ observedOn: "2026-10-01", value: 130 }),
      obs({ observedOn: "2026-10-01", sourceName: "Semrush", value: 5000 }),
    ]);
    expect(series).toHaveLength(2);
    const ahrefs = series.find((s) => s.sourceName === "Ahrefs")!;
    expect(ahrefs.points.map((p) => p.value)).toEqual([100, null, 130]);
    expect(ahrefs.change?.delta).toBe(30);
    expect(series.find((s) => s.sourceName === "Semrush")!.change).toBeNull();
  });
  it("two readings on the same day are not an evolution", () => {
    const [s] = buildSeries([obs({ value: 1 }), obs({ value: 2 })]);
    expect(s.change).toBeNull();
  });
});

describe("future sources stay disabled (no API, no credits)", async () => {
  const { CAPABILITIES, rankLabel, backlinkLabel } = await import("@/lib/competitors/capabilities");
  const { ALLOWED_TOOLS, GOOGLE_READ_TOOLS } = await import("@/lib/openseo/mcp-client");
  it("no competitor, backlink or rank tool is reachable from the OpenSEO client", () => {
    for (const c of CAPABILITIES) {
      expect(c.enabled).toBe(false);
      expect([...ALLOWED_TOOLS, ...GOOGLE_READ_TOOLS] as string[]).not.toContain(c.tool);
    }
  });
  it("unknown position is not position zero; absent backlinks are not zero backlinks", () => {
    expect(rankLabel({ state: "unknown", reason: "not-measured" })).toBe("Posición desconocida");
    expect(rankLabel({ state: "not-in-top", checkedDepth: 100 })).toBe("Fuera de las primeras 100 posiciones");
    expect(backlinkLabel({ state: "unknown", reason: "not-configured" })).toBe("Sin datos de backlinks");
    expect(backlinkLabel({ state: "unknown", reason: "not-configured" })).not.toMatch(/\b0\b/);
  });
});
