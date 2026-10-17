import { describe, expect, it } from "vitest";
import { isOwnUrl, parseEntities, parseObservation, parseSources, queryKey } from "@/lib/geo/contract";
import { comparable, current, groupObservations, opportunities, type GeoObservation } from "@/lib/geo/rules";
import { competitorNames, contentTarget, coreCitation, ENGINE_CONNECTIONS, keywordQuestions } from "@/lib/geo/sources";

const today = "2026-10-16";
const base = { entity: "Restaurante Sol", engine: "chatgpt", query: "¿Dónde comer un buen menú del día en Madrid?", observedOn: "2026-10-10",
  method: "manual-copy", presence: "mentioned" };

describe("observation contract (declared, never fetched)", () => {
  it("accepts a declared observation and normalises market and query spacing", () => {
    const r = parseObservation({ ...base, query: "  ¿Dónde  comer?  ", language: "ES", country: "es", sources: "https://sol.es/menu | Menú", entities: "Bar Luna\nBar Luna" }, today);
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ queryText: "¿Dónde comer?", marketLanguage: "es", marketCountry: "ES",
      citedSources: [{ url: "https://sol.es/menu", title: "Menú" }], mentionedEntities: ["Bar Luna"], supersedesId: null }) });
  });
  it("refuses incomplete, future or hostile input", () => {
    expect(parseObservation({ ...base, observedOn: "2026-10-17" }, today)).toEqual({ ok: false, error: "DATE_FUTURE" });
    expect(parseObservation({ ...base, observedOn: "2022-12-31" }, today)).toEqual({ ok: false, error: "DATE" });
    expect(parseObservation({ ...base, engine: "bard-x" }, today)).toEqual({ ok: false, error: "ENGINE" });
    expect(parseObservation({ ...base, presence: "cited" }, today)).toEqual({ ok: false, error: "CITED_NEEDS_SOURCE" });
    expect(parseObservation({ ...base, query: "" }, today)).toEqual({ ok: false, error: "QUERY" });
    expect(parseObservation({ ...base, excerpt: "x".repeat(4001) }, today)).toEqual({ ok: false, error: "EXCERPT" });
    expect(parseSources("javascript:alert(1) | x")).toEqual({ ok: false });
    expect(parseSources("file:///etc/passwd")).toEqual({ ok: false });
    expect(parseSources("https://user:pw@sol.es/")).toEqual({ ok: false });
    expect(parseSources(Array.from({ length: 21 }, (_, i) => `https://s${i}.es/`).join("\n"))).toEqual({ ok: false });
    expect(parseEntities("x".repeat(121))).toEqual({ ok: false });
  });
  it("query keys ignore case, accents and punctuation; own URLs ignore www and include subdomains", () => {
    expect(queryKey("¿Dónde COMER, menú?")).toBe(queryKey("donde comer menu"));
    expect(isOwnUrl("https://www.sol.es/menu", "sol.es")).toBe(true);
    expect(isOwnUrl("https://blog.sol.es/", "https://sol.es")).toBe(true);
    expect(isOwnUrl("https://solar.es/", "sol.es")).toBe(false);
    expect(isOwnUrl("https://sol.es/", null)).toBe(false);
  });
});

let n = 0;
const obs = (o: Partial<GeoObservation>): GeoObservation => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, entityName: "Restaurante Sol", engine: "chatgpt", engineDetail: null,
  queryText: "menú del día en Madrid", observedOn: "2026-10-10", marketLanguage: "es", marketCountry: "ES", method: "manual-copy", presence: "absent",
  citedSources: [], mentionedEntities: [], supersedesId: null, verification: "declared", createdAt: `2026-10-10T00:00:${String(n % 60).padStart(2, "0")}Z`, ...o,
});
const rules = (list: GeoObservation[], domain: string | null = "sol.es") => opportunities(list, domain).map((o) => `${o.rule}:${o.priority}`);

describe("opportunity engine (deterministic, explainable)", () => {
  it("no observations → no opportunities (nothing is invented)", () => {
    expect(opportunities([], "sol.es")).toEqual([]);
  });
  it("one declared absence: answer gap capped at medium, and a single reading asks for repetition", () => {
    const r = opportunities([obs({})], "sol.es");
    expect(r.map((o) => `${o.rule}:${o.priority}`)).toEqual(["answer-gap:medium", "repeat-measurement:low"]);
    expect(r[0].priorityReason).toContain("hasta verificar");
    expect(r[0].hypothesis).not.toMatch(/garantiza(?! )/);
    expect(r[0].limitations).toContain("No garantiza");
  });
  it("absence verified in two engines is high priority", () => {
    expect(rules([obs({ verification: "verified" }), obs({ engine: "gemini", verification: "verified" })])).toEqual(["answer-gap:high"]);
  });
  it("a mention without an own citation is not a citation; other cited domains are a gap to review", () => {
    expect(rules([obs({ presence: "mentioned", citedSources: [{ url: "https://guia.es/top", title: "" }] }), obs({ engine: "gemini", presence: "mentioned" })]))
      .toEqual(["competitor-cited:medium", "mentioned-not-cited:medium"]);
  });
  it("'cited' pointing to another domain is not an own citation", () => {
    expect(rules([obs({ presence: "cited", citedSources: [{ url: "https://otro.es/", title: "" }] }), obs({ engine: "gemini", presence: "absent" })]))
      .toEqual(["competitor-cited:medium", "mentioned-not-cited:medium"]);
  });
  it("an own citation is kept as maintenance, low priority", () => {
    expect(rules([obs({ presence: "cited", citedSources: [{ url: "https://www.sol.es/menu", title: "" }] }), obs({ engine: "gemini", presence: "cited", citedSources: [{ url: "https://sol.es/", title: "" }] })]))
      .toEqual(["keep-cited:low"]);
  });
  it("changes within 31 days in one comparable series are flagged as volatile", () => {
    expect(rules([obs({ observedOn: "2026-10-01", presence: "absent" }), obs({ observedOn: "2026-10-20", presence: "mentioned" })]))
      .toEqual(["mentioned-not-cited:medium", "volatile:low"]);
  });
  it("a correction replaces the observation it supersedes in the analysis", () => {
    const old = obs({ presence: "absent" });
    const fixed = obs({ presence: "cited", citedSources: [{ url: "https://sol.es/", title: "" }], supersedesId: old.id });
    expect(current([old, fixed]).map((o) => o.id)).toEqual([fixed.id]);
    expect(rules([old, fixed])).toEqual(["keep-cited:low", "repeat-measurement:low"]);
  });
  it("groups the same question across accents and punctuation, separating markets", () => {
    const groups = groupObservations([obs({ queryText: "Menú del día, Madrid?" }), obs({ queryText: "menu del dia madrid", engine: "gemini" }), obs({ marketCountry: "MX" })]);
    expect(groups.map((g) => g.latest.length).sort()).toEqual([1, 2]);
  });
  it("comparison rejects different engines, methods, markets or questions", () => {
    expect(comparable(obs({}), obs({}))).toEqual({ ok: true });
    expect(comparable(obs({}), obs({ engine: "gemini", method: "screenshot" }))).toEqual({ ok: false, reasons: ["motores o modelos distintos", "métodos de obtención distintos"] });
    expect(comparable(obs({}), obs({ queryText: "otra", marketLanguage: "en" }))).toEqual({ ok: false, reasons: ["consultas distintas", "mercados distintos"] });
  });
});

describe("Core contract and disconnected sources", () => {
  it("uses the Core Release E record: a mention without citation is not a citation", () => {
    const c = coreCitation({ queryText: "q", engine: "chatgpt", engineDetail: null, presence: "mentioned", observedOn: "2026-10-10", citedSources: [] });
    expect(c).toMatchObject({ mentioned: true, cited: false, provenance: expect.objectContaining({ sourceType: "MANUAL", method: "manual" }) });
    expect(coreCitation({ queryText: "q", engine: "chatgpt", engineDetail: null, presence: "absent", observedOn: "2026-10-10", citedSources: [] }))
      .toMatchObject({ mentioned: false, cited: false, status: "UNKNOWN" });
  });
  it("no engine is connected and modules not merged report 'not integrated'", async () => {
    expect(ENGINE_CONNECTIONS.connected).toBe(false);
    for (const s of [contentTarget, competitorNames, keywordQuestions]) expect(s.state.integrated).toBe(false);
    expect(await competitorNames.list()).toEqual([]);
    expect(await keywordQuestions.list()).toEqual([]);
  });
});
