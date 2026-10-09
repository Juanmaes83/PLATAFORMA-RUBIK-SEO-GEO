import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuditComparisonView } from "@/components/AuditComparisonView";
import { auditSide, chronological, compareAudits } from "@/lib/openseo/compare";

const result = (auditId: string, capturedAt: string, data: unknown[], extra: Record<string, unknown> = {}) => ({
  provider: "openseo",
  operation: "auditIssues",
  status: "OK",
  partial: null,
  data,
  provenance: { capturedAt, evidence: { auditId } },
  ...extra,
});

const before = result("a-1", "2026-10-01T10:00:00.000Z", [
  { url: "https://example.com/", category: "missing-title", severity: "ERROR" },
  { url: "https://example.com/a", category: "thin-content", severity: "WARNING" },
  { url: "https://example.com/b", category: "slow-page", severity: "OPPORTUNITY" },
  { url: "https://example.com/b#x", category: "slow-page", severity: "OPPORTUNITY" },
]);
const after = result("a-2", "2026-10-08T10:00:00.000Z", [
  { url: "https://EXAMPLE.com/a", category: "thin-content", severity: "ERROR" },
  { url: "https://example.com/b", category: "slow-page", severity: "OPPORTUNITY" },
  { url: "https://example.com/c", category: "missing-title", severity: "ERROR" },
  { url: "http://example.com/insecure", category: "x", severity: "ERROR" },
  { url: "https://example.com/d", category: "", severity: "ERROR" },
  { url: "https://example.com/e", category: "odd", severity: "BLOCKER" },
]);

describe("OpenSEO audit comparison", () => {
  it("reads only verified OpenSEO issue results", () => {
    expect(auditSide(null)).toBeNull();
    expect(auditSide({ ...before, operation: "auditPages" })).toBeNull();
    expect(auditSide({ ...before, provider: "other" })).toBeNull();
    expect(auditSide({ ...before, data: "rows" })).toBeNull();
    const side = auditSide(after)!;
    // Non-HTTPS rows and rows without category are dropped; unknown severities are kept as UNKNOWN.
    expect(side.issues.map((i) => i.url)).toEqual(["https://example.com/a", "https://example.com/b", "https://example.com/c", "https://example.com/e"]);
    expect(side.issues[3].severity).toBe("UNKNOWN");
    expect(side).toMatchObject({ auditId: "a-2", partial: false });
  });

  it("classifies new, resolved, severity changes and unchanged issues by category and URL", () => {
    const c = compareAudits(auditSide(before)!, auditSide(after)!);
    expect(c.resolved).toEqual([{ url: "https://example.com/", category: "missing-title", severity: "ERROR" }]);
    expect(c.added.map((i) => i.url)).toEqual(["https://example.com/c", "https://example.com/e"]);
    expect(c.changed).toEqual([{ url: "https://example.com/a", category: "thin-content", severity: "ERROR", before: "WARNING" }]);
    expect(c.unchanged).toBe(1);
    // The fragment duplicate counts once.
    expect(c.before.total).toBe(3);
    expect(c.after.total).toBe(4);
    expect(c.bySeverity.ERROR).toEqual({ before: 1, after: 2 });
    expect(c.bySeverity.WARNING).toEqual({ before: 1, after: 0 });
    expect(c.caveats).toEqual([]);
  });

  it("states why a partial or same-audit comparison may not reflect the site", () => {
    const partial = auditSide(result("a-2", "2026-10-08T10:00:00.000Z", [], { status: "PARTIAL" }))!;
    const c = compareAudits(auditSide(before)!, partial);
    expect(c.caveats.join(" ")).toContain("posterior es parcial");
    const same = compareAudits(auditSide(before)!, auditSide(before)!);
    expect(same.caveats.join(" ")).toContain("misma auditoría");
    expect(same.resolved).toHaveLength(0);
  });

  it("orders captures chronologically regardless of the link order", () => {
    const [a, b] = chronological(auditSide(after)!, auditSide(before)!);
    expect([a.auditId, b.auditId]).toEqual(["a-1", "a-2"]);
  });

  it("renders exact counts, caveats and severity transitions without signatures", () => {
    const html = renderToStaticMarkup(<AuditComparisonView comparison={compareAudits(auditSide(before)!, auditSide(after)!)} />);
    expect(html).toContain("Nuevas (2)");
    expect(html).toContain("Ya no aparecen (1)");
    expect(html).toContain("Aviso → Crítica");
    expect(html).toContain("Sin clasificar");
    expect(html).not.toMatch(/signature|signed_payload|data_hash/);
  });

  it("cuts long groups but keeps the exact total", () => {
    const many = result("a-3", "2026-10-09T10:00:00.000Z", Array.from({ length: 60 }, (_, i) => ({ url: `https://example.com/p${i}`, category: "x", severity: "WARNING" })));
    const html = renderToStaticMarkup(<AuditComparisonView comparison={compareAudits(auditSide(before)!, auditSide(many)!)} />);
    expect(html).toContain("Nuevas (60)");
    expect(html).toContain("Se muestran 50 de 60");
  });
});
