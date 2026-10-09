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
  spend: { spendId: string; state: "RESERVED" | "SETTLED" | "RELEASED"; operation: string; estimated: number; actual: number | null } | null;
}
export type BudgetError = "BUDGET_FORBIDDEN" | "BUDGET_INVALID" | "BUDGET_EXCEEDED" | "BUDGET_UNAVAILABLE" | "BUDGET_INVALID_RESPONSE";
type Outcome = { ok: true; budget: BudgetState } | { ok: false; error: BudgetError };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATION = /^[a-z][a-z0-9_]{0,63}$/;
const REFERENCE = /^[A-Za-z0-9_:.-]{1,120}$/;
const MAX = 100_000_000;
const credits = (v: unknown, min = 0) => Number.isInteger(v) && (v as number) >= min && (v as number) <= MAX;
const isTime = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));

function parse(data: unknown): Outcome {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: "BUDGET_INVALID_RESPONSE" };
  const b = data as Record<string, unknown>;
  const s = b.spend as Record<string, unknown> | null;
  if (b.provider !== "openseo" || !isTime(b.periodStart) || !(b.monthlyLimit === null || credits(b.monthlyLimit))
    || !credits(b.used) || !(b.available === null || credits(b.available)) || (b.monthlyLimit === null) !== (b.available === null)
    || !(s === null || (s && typeof s === "object" && typeof s.spendId === "string" && UUID.test(s.spendId)
      && ["RESERVED", "SETTLED", "RELEASED"].includes(String(s.state)) && typeof s.operation === "string" && OPERATION.test(s.operation)
      && credits(s.estimated, 1) && (s.actual === null || credits(s.actual)) && (s.state === "SETTLED") === (s.actual !== null)))) {
    return { ok: false, error: "BUDGET_INVALID_RESPONSE" };
  }
  return { ok: true, budget: data as BudgetState };
}

async function command(client: SupabaseClient<Database>, projectId: string, p_command: "get" | "set" | "reserve" | "settle" | "release",
  p_payload: Record<string, unknown> = {}): Promise<Outcome> {
  if (!UUID.test(projectId)) return { ok: false, error: "BUDGET_INVALID" };
  try {
    const { data, error } = await client.rpc("provider_budget", { p_project_id: projectId, p_provider: "openseo", p_command, p_payload: p_payload as never });
    if (error) return { ok: false, error: error.code === "42501" ? "BUDGET_FORBIDDEN" : error.code === "23514" ? "BUDGET_EXCEEDED" : error.code === "22023" ? "BUDGET_INVALID" : "BUDGET_UNAVAILABLE" };
    return parse(data);
  } catch { return { ok: false, error: "BUDGET_UNAVAILABLE" }; }
}

export const getBudget = (client: SupabaseClient<Database>, projectId: string) => command(client, projectId, "get");

export const setMonthlyLimit = (client: SupabaseClient<Database>, projectId: string, monthlyLimit: number) =>
  credits(monthlyLimit) ? command(client, projectId, "set", { monthlyLimit }) : Promise.resolve<Outcome>({ ok: false, error: "BUDGET_INVALID" });

/** Reserve before a paid call. No budget or not enough left: BUDGET_EXCEEDED, and the call must not happen. */
export function reserveSpend(client: SupabaseClient<Database>, projectId: string, input: { operation: string; estimated: number; reference?: string }) {
  if (!OPERATION.test(input.operation) || !credits(input.estimated, 1) || (input.reference !== undefined && !REFERENCE.test(input.reference))) {
    return Promise.resolve<Outcome>({ ok: false, error: "BUDGET_INVALID" });
  }
  return command(client, projectId, "reserve", { operation: input.operation, estimated: input.estimated, ...(input.reference ? { reference: input.reference } : {}) });
}

export const settleSpend = (client: SupabaseClient<Database>, projectId: string, spendId: string, actual: number) =>
  UUID.test(spendId) && credits(actual) ? command(client, projectId, "settle", { spendId, actual }) : Promise.resolve<Outcome>({ ok: false, error: "BUDGET_INVALID" });

export const releaseSpend = (client: SupabaseClient<Database>, projectId: string, spendId: string) =>
  UUID.test(spendId) ? command(client, projectId, "release", { spendId }) : Promise.resolve<Outcome>({ ok: false, error: "BUDGET_INVALID" });

/**
 * Runs a paid call inside a reservation: reserve, call, then settle with the reported cost or
 * release if the call failed before spending. If settling fails the reservation stays RESERVED,
 * so it keeps counting against the month instead of silently disappearing.
 */
export async function withSpend<T>(client: SupabaseClient<Database>, projectId: string,
  input: { operation: string; estimated: number; reference?: string },
  call: () => Promise<{ ok: true; value: T; actualCost: number } | { ok: false; spent: false; error: string }>):
  Promise<{ ok: true; value: T; budget: BudgetState } | { ok: false; error: BudgetError | string; settled?: false }> {
  const reserved = await reserveSpend(client, projectId, input);
  if (!reserved.ok) return reserved;
  const spendId = reserved.budget.spend!.spendId;
  const result = await call();
  if (!result.ok) {
    await releaseSpend(client, projectId, spendId);
    return { ok: false, error: result.error };
  }
  const settled = await settleSpend(client, projectId, spendId, result.actualCost);
  if (!settled.ok) return { ok: false, error: settled.error, settled: false };
  return { ok: true, value: result.value, budget: settled.budget };
}
