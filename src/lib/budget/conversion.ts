// Conversion of the owner's euro ceiling into provider credits (decision of 09/10/2026: at most
// 10 EUR of variable spend per calendar month and project; a ceiling, not a target). Pure: every
// input is explicit and carries its source. Nothing is inferred: without a confirmed tariff, a
// dated exchange rate and a confirmed tax treatment there is no limit, and the ledger stays closed
// (no budget = no reservation). See docs/CONSUMO-Y-PRESUPUESTO.md.

export const OWNER_CEILING_EUR = 10;

export interface Tariff {
  /** Credits the provider sells per unit of its billing currency (OpenSEO reference code: 1000 per USD). */
  creditsPerUnit: number;
  currency: "USD" | "EUR";
  /** Where it was read: plan page, invoice or account billing screen, with its date. */
  source: string;
  /** Confirmed against the hosted account (not only the open-source code). */
  confirmed: boolean;
}

export interface ExchangeRate {
  /** Units of the billing currency per 1 EUR, e.g. USD per EUR. Not needed when billing is in EUR. */
  perEur: number;
  date: string;
  source: string;
}

export interface TaxTreatment {
  /** Tax added on top of the provider's price that the owner actually pays (e.g. 0.21), or 0 under reverse charge. */
  rate: number;
  basis: string;
  confirmed: boolean;
}

export interface ConversionInput {
  ceilingEur: number;
  tariff: Tariff | null;
  rate: ExchangeRate | null;
  tax: TaxTreatment | null;
  /** Share of the ceiling kept back for exchange-rate movement between the rate date and the charge. */
  fxMargin: number;
  /** Rates older than this are stale. */
  maxRateAgeDays: number;
  now: Date;
}

export type Missing = "TARIFF" | "TARIFF_NOT_CONFIRMED" | "RATE" | "RATE_STALE" | "TAX" | "TAX_NOT_CONFIRMED" | "INVALID";

export interface Conversion {
  monthlyLimitCredits: number;
  /** Stored with the limit so the summary can show the basis of every euro figure. */
  basis: {
    ceilingEur: number;
    netOfTaxEur: number;
    afterMarginEur: number;
    billingAmount: number;
    currency: Tariff["currency"];
    creditsPerUnit: number;
    taxRate: number;
    fxMargin: number;
    perEur: number | null;
    rateDate: string | null;
    sources: { tariff: string; rate: string | null; tax: string };
  };
}

const positive = (n: number) => Number.isFinite(n) && n > 0;

export function ceilingToCredits(input: ConversionInput): { ok: true; conversion: Conversion } | { ok: false; missing: Missing[] } {
  const missing: Missing[] = [];
  const { tariff, rate, tax } = input;
  if (!positive(input.ceilingEur) || !(input.fxMargin >= 0 && input.fxMargin < 0.5) || !positive(input.maxRateAgeDays)) return { ok: false, missing: ["INVALID"] };
  if (!tariff) missing.push("TARIFF");
  else if (!positive(tariff.creditsPerUnit) || !tariff.source) missing.push("INVALID");
  else if (!tariff.confirmed) missing.push("TARIFF_NOT_CONFIRMED");
  if (!tax) missing.push("TAX");
  else if (!(tax.rate >= 0 && tax.rate < 1) || !tax.basis) missing.push("INVALID");
  else if (!tax.confirmed) missing.push("TAX_NOT_CONFIRMED");
  const needsRate = tariff?.currency !== "EUR";
  if (needsRate) {
    if (!rate) missing.push("RATE");
    else if (!positive(rate.perEur) || !rate.source || Number.isNaN(Date.parse(rate.date))) missing.push("INVALID");
    else if ((input.now.getTime() - Date.parse(rate.date)) / 86_400_000 > input.maxRateAgeDays) missing.push("RATE_STALE");
  }
  if (missing.length || !tariff || !tax) return { ok: false, missing: missing.length ? missing : ["INVALID"] };

  // Euros the owner pays include the tax; the provider charges credits on the pre-tax price.
  const netOfTaxEur = input.ceilingEur / (1 + tax.rate);
  const afterMarginEur = netOfTaxEur * (1 - input.fxMargin);
  const billingAmount = needsRate ? afterMarginEur * rate!.perEur : afterMarginEur;
  // Always round down: the ceiling is never exceeded by rounding.
  const monthlyLimitCredits = Math.floor(billingAmount * tariff.creditsPerUnit + 1e-9);
  return {
    ok: true,
    conversion: {
      monthlyLimitCredits,
      basis: {
        ceilingEur: input.ceilingEur,
        netOfTaxEur: round(netOfTaxEur),
        afterMarginEur: round(afterMarginEur),
        billingAmount: round(billingAmount),
        currency: tariff.currency,
        creditsPerUnit: tariff.creditsPerUnit,
        taxRate: tax.rate,
        fxMargin: input.fxMargin,
        perEur: needsRate ? rate!.perEur : null,
        rateDate: needsRate ? rate!.date : null,
        sources: { tariff: tariff.source, rate: needsRate ? rate!.source : null, tax: tax.basis },
      },
    },
  };
}

/** Euros for a number of credits under a stored basis, including tax; null if there is no basis. */
export function creditsToEur(credits: number, basis: Conversion["basis"] | null): number | null {
  if (!basis || !positive(basis.creditsPerUnit)) return null;
  const billing = credits / basis.creditsPerUnit;
  const eur = basis.currency === "EUR" ? billing : basis.perEur ? billing / basis.perEur : null;
  return eur === null ? null : round(eur * (1 + basis.taxRate));
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;
