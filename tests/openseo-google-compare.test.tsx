import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoogleComparisonView, WARNING_MESSAGES } from "@/components/GoogleComparisonView";
import { compareGoogleCaptures, type CaptureSide } from "@/lib/openseo/google/compare";

// Comparison of two stored Google captures: pure, no network, no database. Each side carries the
// signed requestContext the capture used, as runProviderRequest stores it in the provenance.
const gscQuery = { siteUrl: "https://sarah.es/", startDate: "2026-08-01", endDate: "2026-08-28", dimensions: ["page"], rowLimit: 25, startRow: 0 };
const ga4Query = { propertyId: "properties/519462393", startDate: "2026-08-01", endDate: "2026-08-28", limit: 25, offset: 0 };
const side = (id: string, request: Record<string, unknown>, data: unknown[], over: Partial<CaptureSide> = {}): CaptureSide => ({
  id, provider: "siteUrl" in request ? "search-console" : "google-analytics", status: data.length ? "OK" : "EMPTY", verified: true,
  signedPayload: { provenance: { requestContext: request } }, data, ...over,
});
const page = (p: string, clicks: number, impressions = clicks * 10) => ({ page: p, clicks, impressions, ctr: clicks / impressions, averagePosition: 3 });
const sept = { ...gscQuery, startDate: "2026-09-01", endDate: "2026-09-28" };

describe("compareGoogleCaptures", () => {
  it("matches rows by dimension values, computes deltas and keeps one-sided rows as not observed (never zero)", () => {
    const c = compareGoogleCaptures(side("a", gscQuery, [page("/", 10), page("/old", 4)]), side("b", sept, [page("/", 16), page("/new", 2)]));
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.warnings).toEqual([]);
    expect(c.swapped).toBe(false);
    expect(c.rows.map((r) => [r.label.join(), r.presence])).toEqual([["/", "both"], ["/new", "only-after"], ["/old", "only-before"]]);
    expect(c.rows[0].metrics[0]).toEqual({ metric: "clicks", before: 10, after: 16, delta: 6 });
    expect(c.rows[1].metrics[0]).toEqual({ metric: "clicks", before: null, after: 2, delta: null });
  });

  it("orders the sides by period start whatever order they arrive in", () => {
    const c = compareGoogleCaptures(side("late", sept, [page("/", 16)]), side("early", gscQuery, [page("/", 10)]));
    expect(c.ok && [c.swapped, c.before.id, c.after.id, c.rows[0].metrics[0].delta]).toEqual([true, "early", "late", 6]);
  });

  it("blocks different providers, properties, GSC dimensions, invalid periods and unverified captures", () => {
    const a = side("a", gscQuery, [page("/", 1)]);
    expect(compareGoogleCaptures(a, side("b", ga4Query, []))).toEqual({ ok: false, reason: "PROVIDER_DIFFERS" });
    expect(compareGoogleCaptures(a, side("b", { ...sept, siteUrl: "sc-domain:otra.es" }, []))).toEqual({ ok: false, reason: "PROPERTY_DIFFERS" });
    expect(compareGoogleCaptures(a, side("b", { ...sept, dimensions: ["page", "query"] }, []))).toEqual({ ok: false, reason: "DIMENSIONS_DIFFER" });
    expect(compareGoogleCaptures(a, side("b", { ...sept, endDate: "2026-08-01" }, []))).toEqual({ ok: false, reason: "INVALID_QUERY" });
    expect(compareGoogleCaptures(a, side("b", sept, [], { verified: false }))).toEqual({ ok: false, reason: "UNVERIFIED" });
    expect(compareGoogleCaptures(a, side("b", sept, [], { provider: "openseo-audit" }))).toEqual({ ok: false, reason: "NOT_GOOGLE" });
    expect(compareGoogleCaptures(a, side("b", { ...sept, siteUrl: undefined }, []))).toEqual({ ok: false, reason: "PROPERTY_DIFFERS" });
  });

  it("warns about period length, overlap, same period, pagination, partial and empty captures", () => {
    const warn = (b: CaptureSide, a = side("a", gscQuery, [page("/", 1)])) => { const c = compareGoogleCaptures(a, b); return c.ok ? c.warnings : c.reason; };
    expect(warn(side("b", { ...sept, endDate: "2026-09-30" }, [page("/", 1)]))).toEqual(["PERIOD_LENGTH_DIFFERS"]);
    expect(warn(side("b", { ...gscQuery, startDate: "2026-08-15", endDate: "2026-09-11" }, [page("/", 1)]))).toEqual(["PERIODS_OVERLAP"]);
    expect(warn(side("b", gscQuery, [page("/", 1)]))).toEqual(["SAME_PERIOD"]);
    expect(warn(side("b", { ...sept, rowLimit: 100 }, [page("/", 1)]))).toEqual(["PAGINATION_DIFFERS"]);
    expect(warn(side("b", sept, [page("/", 1)], { status: "PARTIAL" }))).toEqual(["PARTIAL_AFTER"]);
    expect(warn(side("b", sept, []))).toEqual(["EMPTY_AFTER"]);
    expect(warn(side("b", sept, [page("/", 1)]), side("a", gscQuery, [page("/", 1)], { status: "PARTIAL" }))).toEqual(["PARTIAL_BEFORE"]);
  });

  it("compares GA4 rows by host and landing page with every normalized metric", () => {
    const row = (sessions: number) => ({ hostName: "sarah.es", landingPage: "/", sessions, activeUsers: 1, engagedSessions: 1, engagementRate: 0.5,
      keyEvents: 0, sessionKeyEventRate: 0, transactions: 0, purchaseRevenue: 0 });
    const c = compareGoogleCaptures(side("a", ga4Query, [row(5)]), side("b", { ...ga4Query, startDate: "2026-09-01", endDate: "2026-09-28", offset: 25 }, [row(8)]));
    expect(c.ok && c.warnings).toEqual(["PAGINATION_DIFFERS"]);
    expect(c.ok && c.rows[0]).toMatchObject({ label: ["sarah.es", "/"], presence: "both", metrics: expect.arrayContaining([{ metric: "sessions", before: 5, after: 8, delta: 3 }]) });
    expect(c.ok && c.rows[0].metrics).toHaveLength(8);
  });
});

describe("GoogleComparisonView", () => {
  const html = (a: CaptureSide, b: CaptureSide) => renderToStaticMarkup(<GoogleComparisonView base="/proyectos/t/p" comparison={compareGoogleCaptures(a, b)} />);
  it("shows warnings above the rows, links both captures and labels one-sided rows", () => {
    const out = html(side("a", gscQuery, [page("/", 10)], { status: "PARTIAL" }), side("b", sept, [page("/", 16, 200), page("/new", 2)]));
    expect(out).toContain(WARNING_MESSAGES.PARTIAL_BEFORE);
    expect(out.indexOf("Avisos antes de leer")).toBeLessThan(out.indexOf("Filas ("));
    expect(out).toContain('href="/proyectos/t/p/google/a"');
    expect(out).toContain("Solo en la posterior");
    expect(out).toContain("no equivale a cero");
    expect(out).toContain("10 → 16 (+6)");
    expect(out).toContain("10.0 % → 8.0 % (-2.0 p.p.)");
  });
  it("blocking reasons render no rows", () => {
    const out = html(side("a", gscQuery, [page("/", 10)]), side("b", { ...sept, dimensions: ["query"] }, [page("/", 16)]));
    expect(out).toContain("no se pueden comparar");
    expect(out).toContain("dimensiones distintas");
    expect(out).not.toContain("Filas (");
  });
});
