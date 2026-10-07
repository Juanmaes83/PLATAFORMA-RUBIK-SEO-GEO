import { describe, expect, it } from "vitest";
import { parseImport } from "@/lib/imports/contract";
import { lighthouseToImport, type LighthouseResult } from "@/lib/imports/lighthouse";

// Lighthouse → rubik-import-v1 (ADR 0005). Fictitious report, anonymised data only.
const scope = { tenantId: "agencia-a", projectId: "proyecto-a1" };
const lhr = (formFactor = "mobile"): LighthouseResult => ({
  lighthouseVersion: "13.5.0",
  fetchTime: "2026-10-07T15:40:00.000Z",
  finalDisplayedUrl: "http://localhost:3100/preview/home",
  configSettings: { formFactor },
  categories: {
    performance: { auditRefs: [{ id: "largest-contentful-paint", weight: 25 }, { id: "total-blocking-time", weight: 30 }, { id: "diagnostics", weight: 0 }] },
    accessibility: { auditRefs: [{ id: "color-contrast", weight: 7 }, { id: "image-alt", weight: 10 }, { id: "aria-unknown", weight: 7 }] },
    "best-practices": { auditRefs: [] },
    seo: { auditRefs: [{ id: "is-crawlable", weight: 4.04 }] },
  },
  audits: {
    "largest-contentful-paint": { title: "Largest Contentful Paint", score: 0.62, displayValue: "3.7 s", description: "LCP marks the time. [Learn more](https://example.test/lcp)." },
    "total-blocking-time": { title: "Total Blocking Time", score: 0.95, displayValue: "120 ms" },
    diagnostics: { title: "Diagnostics", score: 0 },
    "color-contrast": { title: "Insufficient contrast", score: 0, description: "Low-contrast text is hard to read." },
    "image-alt": { title: "Images have alt", score: 1 },
    "aria-unknown": { title: "Not applicable", score: null, scoreDisplayMode: "notApplicable" },
    "is-crawlable": { title: "Page is blocked from indexing", score: 0 },
  },
});

describe("lighthouseToImport", () => {
  it("keeps only weighted audits scored below the pass threshold", () => {
    const out = lighthouseToImport(lhr(), { scope, environment: "LOCAL", findingUrl: "https://preview.ejemplo.test/preview/home" });
    expect(out.findings.map((f) => f.ruleId)).toEqual(["lh.mobile.largest-contentful-paint", "lh.mobile.color-contrast", "lh.mobile.is-crawlable"]);
  });

  it("never turns an unscored audit into a failure", () => {
    const out = lighthouseToImport(lhr(), { scope, environment: "LOCAL", findingUrl: "https://preview.ejemplo.test/" });
    expect(out.findings.some((f) => f.ruleId.endsWith("aria-unknown"))).toBe(false);
  });

  it("maps severity from the score and records environment and measured URL", () => {
    const out = lighthouseToImport(lhr(), { scope, environment: "LOCAL", findingUrl: "https://preview.ejemplo.test/preview/home" });
    const lcp = out.findings[0];
    expect(lcp.severity).toBe("medium");
    expect(out.findings[1].severity).toBe("high");
    expect(lcp.observation).toContain("entorno LOCAL");
    expect(lcp.observation).toContain("http://localhost:3100/preview/home");
    expect(lcp.proposal).toBe("LCP marks the time. Learn more.");
    expect(out.source).toEqual({ kind: "audit", label: "Lighthouse 13.5.0 · mobile · LOCAL", url: null, tool: "lighthouse@13.5.0" });
  });

  it("marks owner-accepted rules as accepted-risk", () => {
    const out = lighthouseToImport(lhr(), {
      scope,
      environment: "PREVIEW",
      findingUrl: "https://preview.ejemplo.test/preview/home",
      acceptedRuleIds: ["lh.mobile.is-crawlable"],
    });
    expect(out.findings.find((f) => f.ruleId === "lh.mobile.is-crawlable")?.status).toBe("accepted-risk");
    expect(out.findings.find((f) => f.ruleId === "lh.mobile.color-contrast")?.status).toBe("open");
  });

  it("produces a file the import contract accepts as complete", () => {
    const out = lighthouseToImport(lhr("desktop"), { scope, environment: "LOCAL", findingUrl: "https://preview.ejemplo.test/preview/home", evidenceRef: "lh-home-desktop.json" });
    const parsed = parseImport(JSON.stringify(out), scope);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.import.status).toBe("complete");
      expect(parsed.import.findings).toHaveLength(3);
      expect(parsed.import.findings[0].ruleId).toBe("lh.desktop.largest-contentful-paint");
    }
  });

  it("is refused by the contract when a local URL is not mapped to a public one", () => {
    const out = lighthouseToImport(lhr(), { scope, environment: "LOCAL" });
    const parsed = parseImport(JSON.stringify(out), scope);
    expect(parsed.ok && parsed.import.status).toBe("failed");
  });
});
