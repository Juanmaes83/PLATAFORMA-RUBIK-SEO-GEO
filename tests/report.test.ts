import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REPORT_SECTION_IDS, UNAVAILABLE, auditSection, competitorsSection, contentSection, coverageOf, geoSection, importsSection, keywordsSection,
  measurementSection, technicalSection, type ReportSection,
} from "@/lib/reports/report";
import { readReportSections } from "@/lib/reports/sources";

// N2-14 manual report: each section is honest about how much it read, a missing source is never
// shown as zero, the report is complete only when every section was read in full, and an N2 table
// is never queried while its schema is not accredited.
const base = (id: ReportSection["id"]) => ({ id, title: id, source: "test", link: null });
const day = "2026-10-17";

describe("section states", () => {
  it("an unavailable section carries its reason and no facts; an empty one says it is not zero", () => {
    const off = keywordsSection({ kind: "unavailable", reason: UNAVAILABLE.n2Schema }, base("keywords"));
    expect(off).toMatchObject({ state: "unavailable", reason: UNAVAILABLE.n2Schema, facts: [], natures: [] });
    const none = importsSection({ kind: "read", rows: [] }, base("imports"));
    expect(none.state).toBe("empty");
    expect(none.natures).toEqual([]);
    expect(none.facts).toEqual([]);
    expect(none.reason).toContain("No equivale a «sin problemas» ni a valores cero");
    for (const s of [off, none]) expect(s.notes.length).toBeGreaterThan(0);
  });

  it("technical SEO: unverified signature shows nothing, a PARTIAL result is partial, no audit beyond the scan cap is partial", () => {
    expect(technicalSection({ kind: "unverified", capturedAt: day }, base("technical"))).toMatchObject({ state: "partial", facts: [] });
    const partial = technicalSection({ kind: "verified", capturedAt: day, status: "PARTIAL", auditId: "a1",
      issues: [{ severity: "ERROR", group: "Canonical" }, { severity: "WARNING", group: "On-Page" }] }, base("technical"));
    expect(partial.state).toBe("partial");
    expect(partial.facts).toContainEqual({ label: "Por gravedad", value: "Errores: 1 · Avisos: 1", nature: "observed" });
    expect(technicalSection({ kind: "none", scanned: 100, capped: true }, base("technical")).state).toBe("partial");
    expect(technicalSection({ kind: "none", scanned: 3, capped: false }, base("technical")).state).toBe("empty");
    const clean = technicalSection({ kind: "verified", capturedAt: day, status: "OK", auditId: null, issues: [] }, base("technical"));
    expect(clean.state).toBe("available");
    expect(clean.notes.join(" ")).toContain("no implica que el sitio no tenga problemas");
  });

  it("measurement: without the keyring nothing is shown as verified; unverified captures stay hidden and make it partial", () => {
    const capture = { provider: "search-console" as const, capturedAt: day, status: "OK", period: { start: "2026-09-01", end: "2026-09-28" }, rows: 4 };
    expect(measurementSection({ kind: "read", limit: 25, keyring: false, captures: [{ ...capture, verified: false }] }, base("measurement")))
      .toMatchObject({ state: "partial", reason: UNAVAILABLE.noKeyring, natures: [] });
    const mixed = measurementSection({ kind: "read", limit: 25, keyring: true, captures: [{ ...capture, verified: true }, { ...capture, verified: false }] }, base("measurement"));
    expect(mixed.state).toBe("partial");
    expect(mixed.facts).toContainEqual({ label: "Google Search Console: última, periodo", value: "2026-09-01 – 2026-09-28", nature: "observed" });
    expect(mixed.facts).toContainEqual({ label: "Capturas sin verificar (ocultas)", value: "1" });
    const full = measurementSection({ kind: "read", limit: 25, keyring: true, captures: [{ ...capture, verified: true }] }, base("measurement"));
    expect(full.state).toBe("available");
    expect(full.facts.map((f) => f.label).join(" ")).not.toContain("Analytics");
    const empty = measurementSection({ kind: "read", limit: 25, keyring: true, captures: [{ ...capture, verified: true, status: "EMPTY", rows: 0 }] }, base("measurement"));
    expect(empty.facts).toContainEqual({ label: "Google Search Console: última, filas", value: "Consulta sin filas", nature: "observed" });
  });

  it("a read that reaches the module's own cap is partial, never presented as the whole", () => {
    const rows = Array.from({ length: 3 }, () => ({ intent: "unknown", target_url: null, created_at: day }));
    expect(keywordsSection({ kind: "read", limit: 3, rows }, base("keywords")).state).toBe("partial");
    expect(keywordsSection({ kind: "read", limit: 500, rows }, base("keywords")).state).toBe("available");
    expect(competitorsSection({ kind: "read", limits: { competitors: 1, observations: 10 }, competitors: [{ status: "active" }], observations: [] }, base("competitors")).state).toBe("partial");
  });

  it("competitors separate verified readings (observed) from unverified ones (declared)", () => {
    const s = competitorsSection({ kind: "read", limits: { competitors: 200, observations: 1000 }, competitors: [{ status: "active" }, { status: "archived" }],
      observations: [{ competitorId: null, verification: "verified", observedOn: day }, { competitorId: randomUUID(), verification: "unverified", observedOn: "2026-10-01" }] }, base("competitors"));
    expect(s.state).toBe("available");
    expect(s.natures.sort()).toEqual(["declared", "observed"]);
    expect(s.facts).toContainEqual({ label: "Lecturas verificadas por una persona", value: "1", nature: "observed" });
    expect(s.latest).toBe(day);
  });

  it("content support follows the Contenidos rule; an opportunity without evidence is a hypothesis", () => {
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    const s = contentSection({ kind: "read", limits: { clusters: 200, opportunities: 500, evidence: 2000, briefs: 500 }, clusters: 1,
      opportunities: [{ id: a, status: "open" }, { id: b, status: "planned" }, { id: c, status: "open" }],
      evidenceKinds: [{ opportunityId: a, kind: "provider-result" }, { opportunityId: b, kind: "import-finding" }],
      briefs: [{ status: "approved", updatedAt: day }], counts: { evidence: 2, briefs: 1 } }, base("content"));
    expect(s.facts).toContainEqual({ label: "Oportunidades por respaldo", value: "Con dato observado: 1 · Con fuente declarada: 1 · Solo hipótesis: 1" });
    expect(s.natures).toEqual(["observed", "declared", "hypothesis"]);
    expect(s.facts).toContainEqual({ label: "Briefs", value: "Aprobados: 1" });
  });

  it("GEO counts only current observations and marks proposals as hypotheses", () => {
    const old = randomUUID(), current = randomUUID();
    const s = geoSection({ kind: "read", limits: { observations: 500, proposals: 300 },
      observations: [{ id: old, supersedesId: null, verification: "declared", presence: "absent", engine: "chatgpt", observedOn: "2026-10-01" },
        { id: current, supersedesId: old, verification: "verified", presence: "cited", engine: "chatgpt", observedOn: day }],
      proposals: [{ status: "proposed" }] }, base("geo"));
    expect(s.facts).toContainEqual({ label: "Observaciones vigentes", value: "1" });
    expect(s.facts).toContainEqual({ label: "Presencia de la marca", value: "Citada: 1" });
    expect(s.facts).toContainEqual({ label: "Propuestas", value: "Pendientes de revisión: 1", nature: "hypothesis" });
    expect(s.natures).toEqual(["observed", "hypothesis"]);
  });

  it("a broken audit chain is partial and is not presented as proof", () => {
    const s = auditSection({ kind: "read", length: 3, lastAt: day, verification: { valid: false, reason: "HASH" } }, base("audit"));
    expect(s).toMatchObject({ state: "partial", natures: [] });
    expect(s.reason).toContain("no verifica (HASH)");
    expect(auditSection({ kind: "read", length: 3, lastAt: day, verification: { valid: true } }, base("audit")).facts)
      .toContainEqual({ label: "Cadena", value: "Verificada" });
  });
});

describe("coverage", () => {
  const section = (id: ReportSection["id"], state: ReportSection["state"]): ReportSection =>
    ({ ...base(id), state, reason: null, natures: [], facts: [], notes: ["n"], latest: null });
  it("is complete only when no section is partial or unavailable; empty sections read in full do not break it", () => {
    expect(coverageOf([section("imports", "available"), section("geo", "empty")])).toMatchObject({ complete: true, empty: ["geo"] });
    expect(coverageOf([section("imports", "available"), section("geo", "unavailable")])).toMatchObject({ complete: false, unavailable: ["geo"] });
    expect(coverageOf([section("imports", "partial")])).toMatchObject({ complete: false, partial: ["imports"] });
    expect(coverageOf([]).complete).toBe(false);
  });
});

describe("reading the sources", () => {
  afterEach(() => vi.unstubAllEnvs());
  const project = { projectId: randomUUID(), organizationId: randomUUID(), scope: { tenantId: "agencia", projectId: "site" } };
  /** Records every table and RPC touched; every read answers "no rows" (or fails, when told to). */
  function recorder(fail = false) {
    const touched: string[] = [];
    const result = fail ? { data: null, error: { code: "XX000" }, count: null } : { data: [], error: null, count: 0 };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "gt", "order", "limit", "range", "maybeSingle", "single"]) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => void) => resolve(result);
    return { touched, client: { from: (t: string) => { touched.push(t); return chain; }, rpc: (f: string) => { touched.push(`rpc:${f}`); return chain; } } as never };
  }

  it("with the N2 flags off, no N2 table is queried and those sections are unavailable", async () => {
    vi.stubEnv("RUBIK_N2_SCHEMA_AVAILABLE", "false");
    vi.stubEnv("RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE", "true");
    const { touched, client } = recorder();
    const sections = await readReportSections(client, project, "/p", null);
    expect(sections.map((s) => s.id)).toEqual([...REPORT_SECTION_IDS]);
    const n2Tables = /^(seo_keywords|competitors|competitor_observations|content_|geo_)/;
    expect(touched.filter((t) => n2Tables.test(t))).toEqual([]);
    for (const id of ["keywords", "competitors", "content", "geo"]) expect(sections.find((s) => s.id === id)?.state).toBe("unavailable");
    expect(sections.find((s) => s.id === "keywords")?.reason).toBe(UNAVAILABLE.n2Schema);
    expect(sections.find((s) => s.id === "content")?.reason).toBe(UNAVAILABLE.contentGeoSchema);
    expect(sections.filter((s) => s.link?.href.includes("/competidores") || s.link?.href.includes("/geo"))).toEqual([]);
    expect(coverageOf(sections).complete).toBe(false);
  });

  it("with the content flag off, competitors are read but Contenidos/GEO tables are not", async () => {
    vi.stubEnv("RUBIK_N2_SCHEMA_AVAILABLE", "true");
    vi.stubEnv("RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE", "false");
    const { touched, client } = recorder();
    await readReportSections(client, project, "/p", null);
    expect(touched).toEqual(expect.arrayContaining(["seo_keywords", "competitors", "competitor_observations"]));
    expect(touched.filter((t) => /^(content_|geo_)/.test(t))).toEqual([]);
  });

  it("a failing database makes every section unavailable, never empty", async () => {
    vi.stubEnv("RUBIK_N2_SCHEMA_AVAILABLE", "true");
    vi.stubEnv("RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE", "true");
    const { client } = recorder(true);
    const sections = await readReportSections(client, project, "/p", null);
    expect(sections.filter((s) => s.state === "empty").map((s) => s.id)).toEqual([]);
    expect(sections.every((s) => s.state === "unavailable")).toBe(true);
  });
});
