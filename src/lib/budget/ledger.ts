import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Budget and spend ledger per project and provider (migration 20261010090000). Owner-only RPC
// through the session client; fail closed without a budget. Paid tools must reserve before the
// call and settle with the cost the provider reports, or release when nothing was spent. Nothing
// is wired to a provider yet: each paid tool is a separate, approved step.

export type BudgetProvider = "openseo";
export interface BudgetState {
  provider: BudgetProvider;
  periodStart: string;
  monthlyLimit: number | null;
  used: number;
  available: number | null;
  /** An actual cost above the reserved maximum blocked the provider until the owner sets the limit again. */
  blocked: boolean;
  spend: {
    spendId: string; state: "RESERVED" | "SETTLED" | "RELEASED"; operation: string; estimated: number; actual: number | null;
    /** The reservation already existed for this idempotency key: nothing new was charged. */
    replayed: boolean;
    overrun: boolean;
  } | null;
}
export type BudgetError = "BUDGET_FORBIDDEN" | "BUDGET_INVALID" | "BUDGET_EXCEEDED" | "BUDGET_UNAVAILABLE" | "BUDGET_INVALID_RESPONSE";
type Outcome = { ok: true; budget: BudgetState } | { ok: false; error: BudgetError };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATION = /^[a-z][a-z0-9_]{0,63}$/;
const REFERENCE = /^[A-Za-z0-9_:.-]{1,120}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_:.-]{8,120}$/;
const MAX = 100_000_000;
const credits = (v: unknown, min = 0) => Number.isInteger(v) && (v as number) >= min && (v as number) <= MAX;
const isTime = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));

function parse(data: unknown): Outcome {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "BUDGET_INVALID_RESPONSE" };
  const b = data as Record<string, unknown>;
  const s = b.spend as Record<string, unknown> | null;
  if (b.provider !== "openseo" || !isTime(b.periodStart) || !(b.monthlyLimit === null || credits(b.monthlyLimit))
    || !credits(b.used) || !(b.available === null || credits(b.available)) || (b.monthlyLimit === null) !== (b.available === null)
    || typeof b.blocked !== "boolean"
    || !(s === null || (s && typeof s === "object" && typeof s.spendId === "string" && UUID.test(s.spendId)
      && ["RESERVED", "SETTLED", "RELEASED"].includes(String(s.state)) && typeof s.operation === "string" && OPERATION.test(s.operation)
      && credits(s.estimated, 1) && (s.actual === null || credits(s.actual)) && (s.state === "SETTLED") === (s.actual !== null)
      && typeof s.replayed === "boolean" && typeof s.overrun === "boolean"))) {
    return { ok: false, error: "BUDGET_INVALID_RESPONSE" };
  }
  return { ok: true, budget: data as BudgetState };
}

const errorOf = (code: string | undefined): BudgetError =>
  code === "42501" ? "BUDGET_FORBIDDEN" : code === "23514" ? "BUDGET_EXCEEDED" : code === "22023" ? "BUDGET_INVALID" : "BUDGET_UNAVAILABLE";

async function rpc(client: SupabaseClient<Database>, projectId: string, p_command: "get" | "set" | "reserve" | "settle" | "release" | "summary",
  p_payload: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; error: BudgetError }> {
  if (!UUID.test(projectId)) return { ok: false, error: "BUDGET_INVALID" };
  try {
    const { data, error } = await client.rpc("provider_budget", { p_project_id: projectId, p_provider: "openseo", p_command, p_payload: p_payload as never });
    return error ? { ok: false, error: errorOf(error.code) } : { ok: true, data };
  } catch { return { ok: false, error: "BUDGET_UNAVAILABLE" }; }
}

async function command(client: SupabaseClient<Database>, projectId: string, p_command: "get" | "set" | "reserve" | "settle" | "release",
  p_payload: Record<string, unknown> = {}): Promise<Outcome> {
  const r = await rpc(client, projectId, p_command, p_payload);
  return r.ok ? parse(r.data) : r;
}

export const getBudget = (client: SupabaseClient<Database>, projectId: string) => command(client, projectId, "get");

/** Setting the limit again is also the owner's review that clears an overrun block. */
export const setMonthlyLimit = (client: SupabaseClient<Database>, projectId: string, monthlyLimit: number, conversion?: Record<string, unknown>) =>
  credits(monthlyLimit) && (conversion === undefined || (conversion !== null && typeof conversion === "object" && !Array.isArray(conversion)))
    ? command(client, projectId, "set", { monthlyLimit, ...(conversion ? { conversion } : {}) })
    : Promise.resolve<Outcome>({ ok: false, error: "BUDGET_INVALID" });

export interface ReserveInput {
  operation: string;
  /** The verifiable MAXIMUM cost of the call, not a guess: going over it blocks the provider. */
  estimated: number;
  reference?: string;
  /** Same key on a retry returns the original reservation instead of charging again. */
  idempotencyKey?: string;
}

/** Reserve before a paid call. No budget, a block or not enough left: BUDGET_EXCEEDED, and the call must not happen. */
export function reserveSpend(client: SupabaseClient<Database>, projectId: string, input: ReserveInput) {
  if (!OPERATION.test(input.operation) || !credits(input.estimated, 1) || (input.reference !== undefined && !REFERENCE.test(input.reference))
    || (input.idempotencyKey !== undefined && !IDEMPOTENCY_KEY.test(input.idempotencyKey))) {
    return Promise.resolve<Outcome>({ ok: false, error: "BUDGET_INVALID" });
  }
  return command(client, projectId, "reserve", {
    operation: input.operation, estimated: input.estimated,
    ...(input.reference ? { reference: input.reference } : {}),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  });
}

export const settleSpend = (client: SupabaseClient<Database>, projectId: string, spendId: string, actual: number) =>
  UUID.test(spendId) && credits(actual) ? command(client, projectId, "settle", { spendId, actual }) : Promise.resolve<Outcome>({ ok: false, error: "BUDGET_INVALID" });

export const releaseSpend = (client: SupabaseClient<Database>, projectId: string, spendId: string) =>
  UUID.test(spendId) ? command(client, projectId, "release", { spendId }) : Promise.resolve<Outcome>({ ok: false, error: "BUDGET_INVALID" });

/**
 * Runs a paid call inside a reservation: reserve the maximum, call, then settle with the reported
 * cost or release if the call failed before spending. If settling fails the reservation stays
 * RESERVED, so it keeps counting against the month instead of silently disappearing.
 * A retry with the same idempotency key never calls the provider again: a settled call answers
 * ALREADY_SETTLED (read the stored result instead) and an open one RESERVATION_OPEN (reconcile it
 * first), so a timeout followed by a retry cannot pay twice.
 */
export async function withSpend<T>(client: SupabaseClient<Database>, projectId: string,
  input: ReserveInput,
  call: () => Promise<{ ok: true; value: T; actualCost: number } | { ok: false; spent: false; error: string }>):
  Promise<{ ok: true; value: T; budget: BudgetState } | { ok: false; error: BudgetError | "ALREADY_SETTLED" | "RESERVATION_OPEN" | string; settled?: false }> {
  const reserved = await reserveSpend(client, projectId, input);
  if (!reserved.ok) return reserved;
  const spend = reserved.budget.spend!;
  if (spend.replayed) return { ok: false, error: spend.state === "SETTLED" ? "ALREADY_SETTLED" : "RESERVATION_OPEN" };
  const result = await call();
  if (!result.ok) {
    await releaseSpend(client, projectId, spend.spendId);
    return { ok: false, error: result.error };
  }
  const settled = await settleSpend(client, projectId, spend.spendId, result.actualCost);
  if (!settled.ok) return { ok: false, error: settled.error, settled: false };
  return { ok: true, value: result.value, budget: settled.budget };
}

export interface MonthlyOperation {
  operation: string;
  reserved: number;
  settled: number;
  released: number;
  /** Settled actual cost plus the maximum of reservations still open. */
  credits: number;
  overruns: number;
  references: string[];
}
export interface MonthlySummary {
  provider: BudgetProvider;
  periodStart: string;
  monthlyLimit: number | null;
  conversion: Record<string, unknown> | null;
  blocked: boolean;
  operations: MonthlyOperation[];
}

const count = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;

/** Owner-only summary of one calendar month (UTC); `month` is YYYY-MM, default the current one. */
export async function monthlySummary(client: SupabaseClient<Database>, projectId: string, month?: string):
  Promise<{ ok: true; summary: MonthlySummary } | { ok: false; error: BudgetError }> {
  if (month !== undefined && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "BUDGET_INVALID" };
  const r = await rpc(client, projectId, "summary", month ? { month } : {});
  if (!r.ok) return r;
  const d = r.data as Record<string, unknown> | null;
  const valid = !!d && d.provider === "openseo" && isTime(d.periodStart) && (d.monthlyLimit === null || credits(d.monthlyLimit))
    && (d.conversion === null || (typeof d.conversion === "object" && !Array.isArray(d.conversion))) && typeof d.blocked === "boolean"
    && Array.isArray(d.operations) && d.operations.every((o: Record<string, unknown>) => o && typeof o.operation === "string" && OPERATION.test(o.operation)
      && count(o.reserved) && count(o.settled) && count(o.released) && count(o.credits) && count(o.overruns)
      && Array.isArray(o.references) && o.references.every((x: unknown) => typeof x === "string" && REFERENCE.test(x)));
  return valid ? { ok: true, summary: d as unknown as MonthlySummary } : { ok: false, error: "BUDGET_INVALID_RESPONSE" };
}
