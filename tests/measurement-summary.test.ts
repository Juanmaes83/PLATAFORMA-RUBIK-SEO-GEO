import { describe, expect, it } from "vitest";
import { associationLabel, coverageLabel, measurementRows, unavailableMetrics } from "@/lib/medicion/resumen";

describe("project measurement summary", () => {
  it("preserves GSC rows and does not add average positions or invent missing metrics", () => {
    const rows = measurementRows("search-console", { dimensions: ["page"] }, [
      { page: "https://example.test/a", clicks: 3, averagePosition: 2.4 },
      { page: "https://example.test/b", clicks: 5, averagePosition: 8.2 },
    ]);
    expect(rows).toEqual([
      { label: "https://example.test/a", metrics: [{ key: "clicks", label: "Clics", value: 3 }, { key: "averagePosition", label: "Posición media", value: 2.4 }] },
      { label: "https://example.test/b", metrics: [{ key: "clicks", label: "Clics", value: 5 }, { key: "averagePosition", label: "Posición media", value: 8.2 }] },
    ]);
    expect(unavailableMetrics("search-console", { clicks: 3, averagePosition: 2.4 })).toEqual(["Impresiones", "CTR"]);
  });

  it("keeps GA4 separate and accepts only finite metrics actually present", () => {
    expect(measurementRows("google-analytics", {}, [{ landingPage: "/inicio", sessions: 4, activeUsers: null, purchaseRevenue: Number.NaN }])).toEqual([
      { label: "/inicio", metrics: [{ key: "sessions", label: "Sesiones orgánicas", value: 4 }] },
    ]);
  });

  it("distinguishes absent data, verified empty responses, partial coverage and hidden associations", () => {
    expect(measurementRows("search-console", { dimensions: ["query"] }, null)).toEqual([]);
    expect(coverageLabel("EMPTY")).toBe("Consulta verificada, sin filas");
    expect(coverageLabel("PARTIAL")).toContain("no representa el total");
    expect(associationLabel("REVOKED")).toBe("Propiedad revocada");
    expect(associationLabel("FORBIDDEN")).toBe("Estado no visible para este rol");
  });
});
