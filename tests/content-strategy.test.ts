import { describe, expect, it } from "vitest";
import {
  httpUrl, linksText, onProjectDomain, outlineText, parseBrief, parseCluster, parseEvidence, parseLinks, parseOpportunity, parseOutline, parseQuestions,
} from "@/lib/content/contract";
import { briefReadiness, clusterLinks, possibleOverlaps, similarity, supportOf, type OpportunityView } from "@/lib/content/insights";
import { competitorSource, keywordSource } from "@/lib/content/sources";

const opp = { topic: "Menú del día en Madrid", intent: "local", language: "es", country: "es", pageKind: "proposed", pageUrl: "", type: "create",
  rationale: "No hay página para esta búsqueda local.", priority: "unset" };

describe("opportunity contract", () => {
  it("accepts a proposal and normalises the market", () => {
    const r = parseOpportunity(opp, "restaurante.es");
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ marketLanguage: "es", marketCountry: "ES", pageUrl: null, priority: "unset", priorityReason: null }) });
  });
  it("keeps type, page and priority consistent", () => {
    expect(parseOpportunity({ ...opp, type: "improve" }, null)).toEqual({ ok: false, error: "TYPE_NEEDS_EXISTING" });
    expect(parseOpportunity({ ...opp, pageKind: "existing" }, null)).toEqual({ ok: false, error: "PAGE_URL_REQUIRED" });
    expect(parseOpportunity({ ...opp, pageKind: "existing", pageUrl: "https://restaurante.es/carta" }, "restaurante.es")).toEqual({ ok: false, error: "TYPE_NEEDS_PROPOSED" });
    expect(parseOpportunity({ ...opp, priority: "high" }, null)).toEqual({ ok: false, error: "PRIORITY_REASON" });
    expect(parseOpportunity({ ...opp, clusterRole: "pillar" }, null)).toEqual({ ok: false, error: "CLUSTER_ROLE" });
    expect(parseOpportunity({ ...opp, topic: " " }, null)).toEqual({ ok: false, error: "TOPIC" });
    expect(parseOpportunity({ ...opp, language: "esp" }, null)).toEqual({ ok: false, error: "LANGUAGE" });
    expect(parseOpportunity({ ...opp, intent: "viral" }, null)).toEqual({ ok: false, error: "INTENT" });
  });
  it("only accepts pages of the project's own domain (www ignored), never fetched", () => {
    const existing = { ...opp, type: "update", pageKind: "existing" };
    expect(parseOpportunity({ ...existing, pageUrl: "https://www.restaurante.es/carta" }, "restaurante.es").ok).toBe(true);
    expect(parseOpportunity({ ...existing, pageUrl: "https://otro.es/carta" }, "restaurante.es")).toEqual({ ok: false, error: "PAGE_URL_FOREIGN" });
    expect(parseOpportunity({ ...existing, pageUrl: "javascript:alert(1)" }, null)).toEqual({ ok: false, error: "PAGE_URL" });
    expect(parseOpportunity({ ...existing, pageUrl: "https://user:pw@restaurante.es/" }, null)).toEqual({ ok: false, error: "PAGE_URL" });
    expect(onProjectDomain("https://restaurante.es/x", null)).toBe(true);
    expect(httpUrl("ftp://restaurante.es")).toBeNull();
  });
  it("validates clusters", () => {
    expect(parseCluster({ name: "Carta", mainTopic: "menús" }).ok).toBe(true);
    expect(parseCluster({ name: "", mainTopic: "x" })).toEqual({ ok: false, error: "NAME" });
  });
});

describe("evidence contract", () => {
  const today = "2026-10-16";
  it("stored sources only need the reference (label and date come from the database)", () => {
    expect(parseEvidence({ kind: "import-finding", import: "00000000-0000-4000-8000-000000000001" }, today))
      .toEqual({ ok: true, value: expect.objectContaining({ importId: "00000000-0000-4000-8000-000000000001", providerResultId: null }) });
    expect(parseEvidence({ kind: "provider-result" }, today)).toEqual({ ok: false, error: "SOURCE_REQUIRED" });
  });
  it("a consulted source needs title and a past date; a proposal needs its reasoning", () => {
    expect(parseEvidence({ kind: "manual-source", title: "Estudio", sourceDate: "2026-10-01", sourceUrl: "https://ejemplo.es/estudio" }, today).ok).toBe(true);
    expect(parseEvidence({ kind: "manual-source", title: "Estudio", sourceDate: "2026-10-17" }, today)).toEqual({ ok: false, error: "SOURCE_DATE_FUTURE" });
    expect(parseEvidence({ kind: "manual-source", title: "Estudio" }, today)).toEqual({ ok: false, error: "SOURCE_DATE" });
    expect(parseEvidence({ kind: "manual-source", title: "Estudio", sourceDate: "2026-10-01", sourceUrl: "file:///etc" }, today)).toEqual({ ok: false, error: "SOURCE_URL" });
    expect(parseEvidence({ kind: "analyst-proposal", title: "Hipótesis" }, today)).toEqual({ ok: false, error: "DETAIL" });
    expect(parseEvidence({ kind: "rumour", title: "x" }, today)).toEqual({ ok: false, error: "KIND" });
  });
});

describe("brief contract", () => {
  it("parses the outline H1/H2/H3, one H1 at most, and round-trips", () => {
    const r = parseOutline("# Menú del día\n## Qué incluye\n### Precio\n\n");
    expect(r).toEqual({ ok: true, value: [{ level: 1, text: "Menú del día" }, { level: 2, text: "Qué incluye" }, { level: 3, text: "Precio" }] });
    expect(r.ok && outlineText(r.value)).toBe("# Menú del día\n## Qué incluye\n### Precio");
    expect(parseOutline("# A\n# B")).toEqual({ ok: false, error: "OUTLINE" });
    expect(parseOutline("#### Demasiado profundo")).toEqual({ ok: false, error: "OUTLINE" });
    expect(parseOutline("Sin almohadilla")).toEqual({ ok: false, error: "OUTLINE" });
  });
  it("parses questions and internal links", () => {
    expect(parseQuestions("¿Cuánto cuesta?\n\n¿Hay opción sin gluten?")).toEqual({ ok: true, value: ["¿Cuánto cuesta?", "¿Hay opción sin gluten?"] });
    const links = parseLinks("/carta | Carta de temporada\nhttps://restaurante.es/reservas");
    expect(links).toEqual({ ok: true, value: [{ url: "/carta", anchor: "Carta de temporada" }, { url: "https://restaurante.es/reservas", anchor: "" }] });
    expect(links.ok && linksText(links.value)).toBe("/carta | Carta de temporada\nhttps://restaurante.es/reservas");
    expect(parseLinks("javascript:alert(1) | x")).toEqual({ ok: false, error: "LINKS" });
  });
  it("a target page must be on the project domain", () => {
    expect(parseBrief({ mainTopic: "x", language: "es", targetUrl: "https://otro.es/" }, "restaurante.es")).toEqual({ ok: false, error: "TARGET_URL_FOREIGN" });
    expect(parseBrief({ mainTopic: "x", language: "es" }, "restaurante.es")).toEqual({ ok: true, value: expect.objectContaining({ outline: [], questions: [], internalLinks: [] }) });
  });
});

const view = (o: Partial<OpportunityView> & { id: string; topic: string }): OpportunityView => ({
  pageUrl: null, pageKind: "proposed", opportunityType: "create", priority: "unset", status: "open", clusterId: "c", clusterRole: null,
  marketLanguage: "es", marketCountry: "ES", ...o,
});

describe("insights: support, overlaps, cluster links, readiness", () => {
  it("names the strength of the support, hypothesis by default", () => {
    expect(supportOf([])).toBe("hypothesis");
    expect(supportOf(["analyst-proposal"])).toBe("hypothesis");
    expect(supportOf(["manual-source"])).toBe("declared");
    expect(supportOf(["import-finding", "provider-result"])).toBe("observed");
  });
  it("flags POSSIBLE overlaps by page or very similar topic, within the same market only", () => {
    expect(similarity("Menú del día en Madrid", "menu del dia Madrid")).toBe(1);
    const list = [
      view({ id: "a", topic: "Menú del día en Madrid" }),
      view({ id: "b", topic: "El menú del día de Madrid" }),
      view({ id: "c", topic: "Menú del día en Madrid", marketCountry: "MX" }),
      view({ id: "d", topic: "Carta de vinos", pageUrl: "https://r.es/carta/", pageKind: "existing", opportunityType: "improve" }),
      view({ id: "e", topic: "Postres caseros", pageUrl: "https://www.r.es/carta", pageKind: "existing", opportunityType: "update" }),
      view({ id: "f", topic: "Menú del día en Madrid", status: "discarded" }),
    ];
    const found = possibleOverlaps(list).map((x) => `${x.a.id}${x.b.id}:${x.reason}`);
    expect(found).toEqual(["ab:similar-topic", "de:same-page"]);
  });
  it("consolidation opportunities on the same page are not an overlap", () => {
    const list = [view({ id: "a", topic: "A", pageUrl: "https://r.es/x", opportunityType: "consolidate" }), view({ id: "b", topic: "B", pageUrl: "https://r.es/x" })];
    expect(possibleOverlaps(list)).toEqual([]);
  });
  it("derives support ↔ pillar links from the cluster", () => {
    const links = clusterLinks([view({ id: "p", topic: "Pilar", clusterRole: "pillar" }), view({ id: "s", topic: "Soporte", clusterRole: "support" }), view({ id: "x", topic: "Otra" })]);
    expect(links.map((l) => `${l.from.id}>${l.to.id}`)).toEqual(["s>p", "p>s"]);
  });
  it("a brief is ready for review only with objective, audience and outline", () => {
    expect(briefReadiness({ objective: null, audience: "x", outline: [], questions: [] }, 0)).toEqual({ ready: false, missing: ["Objetivo", "Estructura de encabezados", "Un H1 (recomendado)", "Preguntas que debe responder (recomendado)", "Alguna evidencia en la oportunidad (recomendado)"] });
    expect(briefReadiness({ objective: "o", audience: "a", outline: [{ level: 1 }], questions: ["q"] }, 1)).toEqual({ ready: true, missing: [] });
  });
});

describe("modules not yet merged are adapters that report 'not integrated'", () => {
  it("keywords (N2-09) and competitors (N2-11) return nothing until integrated", async () => {
    expect(keywordSource.state).toEqual({ integrated: false, pendingOn: expect.stringContaining("N2-09") });
    expect(competitorSource.state).toEqual({ integrated: false, pendingOn: expect.stringContaining("N2-11") });
    expect(await keywordSource.list("p")).toEqual([]);
    expect(await competitorSource.list("p")).toEqual([]);
  });
});
