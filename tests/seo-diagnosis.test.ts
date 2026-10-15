import { describe, expect, it } from "vitest";
import { diagnoseAudit, urlPath } from "@/lib/seo/diagnosis";
import { keywordOverlaps, normalizeKeyword } from "@/lib/seo/keywords";

describe("N2-09 diagnosis uses only verified Core-shaped data", () => {
  it("classifies observed noindex without claiming it is unintended", () => {
    const rows = diagnoseAudit({ provider: "openseo", operation: "auditIssues", data: [{ url: "https://example.test/a", category: "noindex-page", severity: "ERROR", status: "OPEN" }] });
    expect(rows).toHaveLength(1);
    expect(rows[0].group).toBe("Indexabilidad");
    expect(rows[0].recommendation).toContain("intencionada");
    expect(rows[0].priority).toBe("Revisión alta");
    expect(rows[0].status).toBe("OPEN");
  });
  it("rejects other provider operations and malformed URLs", () => {
    expect(diagnoseAudit({ provider: "google", operation: "auditIssues", data: [{ url: "https://example.test", category: "x" }] })).toEqual([]);
    expect(diagnoseAudit({ provider: "openseo", operation: "auditIssues", data: [{ url: "javascript:alert(1)", category: "x" }] })).toEqual([]);
  });
  it("keeps URL paths readable", () => expect(urlPath("https://example.test/a?x=1")).toBe("/a?x=1"));
});

describe("declared keywords", () => {
  const raw = { phrase: "  zapatos   rojos  ", language: "es", country: "es", intent: "commercial", topic: "Calzado", targetUrl: "https://example.test/zapatos#intro" };
  it("normalizes user input and limits page targets to this project", () => {
    expect(normalizeKeyword(raw, "example.test")).toMatchObject({ phrase: "zapatos rojos", country_code: "ES", target_url: "https://example.test/zapatos" });
    expect(normalizeKeyword({ ...raw, targetUrl: "https://other.test/zapatos" }, "example.test")).toBeNull();
    expect(normalizeKeyword({ ...raw, targetUrl: "https://example.test@other.test/zapatos" }, "example.test")).toBeNull();
  });
  it("flags the same declared query and market assigned to two pages", () => {
    const first = { id: "1", phrase: "zapatos rojos", language_code: "es", country_code: "ES", intent: "unknown", topic: "", target_url: "https://example.test/a", created_at: "" };
    expect(keywordOverlaps([first, { ...first, id: "2", target_url: "https://example.test/b" }])).toEqual(["zapatos rojos"]);
    expect(keywordOverlaps([first, { ...first, id: "2", country_code: "MX", target_url: "https://example.test/b" }])).toEqual([]);
  });
});
