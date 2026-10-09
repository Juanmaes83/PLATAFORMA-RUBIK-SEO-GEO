import { describe, expect, it } from "vitest";
import { ceilingToCredits, creditsToEur, OWNER_CEILING_EUR, type ConversionInput } from "@/lib/budget/conversion";
import { paidToolDecision, PAID_TOOLS } from "@/lib/budget/paid-tools";

// Illustrative inputs only: real values must come from the hosted account and a dated rate.
const base: ConversionInput = {
  ceilingEur: OWNER_CEILING_EUR,
  tariff: { creditsPerUnit: 1000, currency: "USD", source: "fixture", confirmed: true },
  rate: { perEur: 1.1, date: "2026-10-08", source: "fixture" },
  tax: { rate: 0.21, basis: "fixture", confirmed: true },
  fxMargin: 0.05,
  maxRateAgeDays: 7,
  now: new Date("2026-10-09T12:00:00Z"),
};

describe("euro ceiling to credits", () => {
  it("never equates 10 EUR to 10,000 credits: tax, margin and exchange rate are applied and rounded down", () => {
    const r = ceilingToCredits(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 10 / 1.21 = 8.2645 EUR net; × 0.95 = 7.8512; × 1.1 = 8.6364 USD; × 1000 = 8636 credits.
    expect(r.conversion.monthlyLimitCredits).toBe(8636);
    expect(r.conversion.monthlyLimitCredits).not.toBe(10_000);
    expect(r.conversion.basis).toMatchObject({ ceilingEur: 10, currency: "USD", taxRate: 0.21, perEur: 1.1, rateDate: "2026-10-08" });
    // Spending the whole limit stays under the ceiling.
    expect(creditsToEur(r.conversion.monthlyLimitCredits, r.conversion.basis)!).toBeLessThanOrEqual(10);
  });

  it("refuses to produce a limit from unconfirmed or missing inputs", () => {
    expect(ceilingToCredits({ ...base, tariff: null })).toEqual({ ok: false, missing: ["TARIFF"] });
    expect(ceilingToCredits({ ...base, tariff: { ...base.tariff!, confirmed: false } })).toEqual({ ok: false, missing: ["TARIFF_NOT_CONFIRMED"] });
    expect(ceilingToCredits({ ...base, tax: { ...base.tax!, confirmed: false } })).toEqual({ ok: false, missing: ["TAX_NOT_CONFIRMED"] });
    expect(ceilingToCredits({ ...base, tax: null, rate: null })).toEqual({ ok: false, missing: ["TAX", "RATE"] });
    expect(ceilingToCredits({ ...base, rate: { ...base.rate!, date: "2026-09-01" } })).toEqual({ ok: false, missing: ["RATE_STALE"] });
    expect(ceilingToCredits({ ...base, fxMargin: 0.6 })).toEqual({ ok: false, missing: ["INVALID"] });
  });

  it("does not need an exchange rate when the provider bills in euros", () => {
    const r = ceilingToCredits({ ...base, tariff: { ...base.tariff!, currency: "EUR" }, rate: null, fxMargin: 0 });
    expect(r).toMatchObject({ ok: true, conversion: { monthlyLimitCredits: 8264, basis: { perEur: null } } });
    expect(creditsToEur(1000, null)).toBeNull();
  });
});

describe("paid tool policy", () => {
  it("keeps tools without a verifiable maximum blocked", () => {
    expect(paidToolDecision("get_domain_overview", {})).toEqual({ ok: false, reason: "BLOCKED_NO_CAP" });
    // maxCostCredits caps the estimate, not the real charge: still no verifiable maximum.
    expect(paidToolDecision("run_rank_tracker", { maxCostCredits: 500 })).toEqual({ ok: false, reason: "BLOCKED_NO_CAP" });
    expect(paidToolDecision("get_search_console_performance", {})).toEqual({ ok: false, reason: "NOT_A_PAID_TOOL" });
    expect(paidToolDecision("constructor", {})).toEqual({ ok: false, reason: "NOT_A_PAID_TOOL" });
    expect(Object.values(PAID_TOOLS).every((p) => p.state !== "ALLOWED")).toBe(true);
  });

  it("reserves the maximum, never an estimate, once a tool is allowed", () => {
    const capped = { state: "ALLOWED" as const, cap: "fixture", maxCredits: (i: Record<string, unknown>) => Number.isSafeInteger(i.max) ? i.max as number : null };
    expect(paidToolDecision("fixture_tool", { max: 500 }, { fixture_tool: capped })).toEqual({ ok: true, maxCredits: 500 });
    expect(paidToolDecision("fixture_tool", {}, { fixture_tool: capped })).toEqual({ ok: false, reason: "NO_MAXIMUM_FOR_INPUT" });
  });
});
