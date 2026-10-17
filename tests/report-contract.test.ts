import { describe, expect, it } from "vitest";
import { buildOutline, SECTION_IDS, SECTION_SOURCE } from "@/lib/reports/contract";

const base = { scope: { tenantId: "agencia", projectId: "cliente" }, generatedAt: "2026-10-16T08:00:00Z", generatedBy: "u1" };

describe("manual report contract (design increment)", () => {
  it("modules not in main are always 'pending integration', whatever the caller claims", () => {
    const outline = buildOutline({ ...base, availability: { geo: { state: "available", items: 9, period: null }, keywords: { state: "available", items: 3, period: null } } });
    for (const id of SECTION_IDS.filter((s) => !SECTION_SOURCE[s].inMain)) {
      const s = outline.sections.find((x) => x.id === id)!;
      expect(s.availability.state).toBe("pending-integration");
      expect(s.limitations.join(" ")).toMatch(/no se muestra contenido/);
    }
  });
  it("missing data is 'empty', never zero findings; a partial report is not complete", () => {
    const outline = buildOutline({ ...base, availability: { "technical-audit": { state: "available", items: 0, period: null } } });
    const audit = outline.sections.find((s) => s.id === "technical-audit")!;
    expect(audit.availability).toEqual({ state: "empty" });
    expect(audit.limitations.join(" ")).toContain("no equivale a «sin problemas»");
    expect(outline.complete).toBe(false);
  });
  it("a report of only available sections is complete", () => {
    const outline = buildOutline({ ...base, include: ["technical-audit", "audit-trail"], availability: {
      "technical-audit": { state: "available", items: 12, period: { from: "2026-10-01", to: "2026-10-15" } },
      "audit-trail": { state: "available", items: 40, period: null } } });
    expect(outline.complete).toBe(true);
    expect(outline.sections.map((s) => s.id)).toEqual(["technical-audit", "audit-trail"]);
  });
  it("every section carries at least one limitation and the report has no external effect", () => {
    const outline = buildOutline({ ...base, availability: {} });
    expect(outline.sections.every((s) => s.limitations.length > 0)).toBe(true);
    expect(outline.effects).toEqual({ sends: false, schedules: false, publishes: false, callsProviders: false });
    expect(outline.format).toBe("rubik-manual-report-v0");
  });
  it("unknown or repeated section ids are ignored", () => {
    const outline = buildOutline({ ...base, availability: {}, include: ["imports", "imports", "made-up" as never] });
    expect(outline.sections.map((s) => s.id)).toEqual(["imports"]);
  });
});
