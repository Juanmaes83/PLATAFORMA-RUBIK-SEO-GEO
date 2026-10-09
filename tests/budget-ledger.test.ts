import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getBudget, releaseSpend, reserveSpend, setMonthlyLimit, settleSpend, withSpend } from "@/lib/budget/ledger";

const projectId = "00000000-0000-4000-8000-000000000001";
const spendId = "00000000-0000-4000-8000-0000000000aa";
const state = (over: Record<string, unknown> = {}) => ({ provider: "openseo", periodStart: "2026-10-01T00:00:00+00:00", monthlyLimit: 300, used: 0, available: 300, spend: null, ...over });
const reserved = state({ used: 200, available: 100, spend: { spendId, state: "RESERVED", operation: "get_domain_overview", estimated: 200, actual: null } });
const settled = state({ used: 250, available: 50, spend: { spendId, state: "SETTLED", operation: "get_domain_overview", estimated: 200, actual: 250 } });
const released = state({ spend: { spendId, state: "RELEASED", operation: "get_domain_overview", estimated: 200, actual: null } });
const fake = (...results: { data?: unknown; error?: { code: string } }[]) => {
  const rpc = vi.fn();
  for (const r of results) rpc.mockResolvedValueOnce({ data: r.data ?? null, error: r.error ?? null });
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
};

describe("budget ledger client (owner RPC, fail closed)", () => {
  it("reads and sets the monthly limit through the RPC only", async () => {
    const { client, rpc } = fake({ data: state({ monthlyLimit: null, available: null }) }, { data: state() });
    expect(await getBudget(client, projectId)).toMatchObject({ ok: true, budget: { monthlyLimit: null } });
    expect(await setMonthlyLimit(client, projectId, 300)).toMatchObject({ ok: true, budget: { available: 300 } });
    expect(rpc).toHaveBeenLastCalledWith("provider_budget", { p_project_id: projectId, p_provider: "openseo", p_command: "set", p_payload: { monthlyLimit: 300 } });
  });

  it("rejects malformed input before calling the database", async () => {
    const { client, rpc } = fake();
    for (const r of await Promise.all([
      setMonthlyLimit(client, projectId, -1), setMonthlyLimit(client, projectId, 1.5),
      reserveSpend(client, projectId, { operation: "Bad Op", estimated: 1 }), reserveSpend(client, projectId, { operation: "x", estimated: 0 }),
      reserveSpend(client, projectId, { operation: "x", estimated: 1, reference: "bad ref;" }),
      settleSpend(client, projectId, "nope", 1), releaseSpend(client, projectId, "nope"), getBudget(client, "not-a-uuid"),
    ])) expect(r).toEqual({ ok: false, error: "BUDGET_INVALID" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps refusals to fixed codes and refuses inconsistent responses", async () => {
    for (const [code, error] of [["42501", "BUDGET_FORBIDDEN"], ["23514", "BUDGET_EXCEEDED"], ["22023", "BUDGET_INVALID"], ["XX000", "BUDGET_UNAVAILABLE"]]) {
      expect(await getBudget(fake({ error: { code } }).client, projectId)).toEqual({ ok: false, error });
    }
    for (const data of [null, [], state({ provider: "dataforseo" }), state({ available: null }), state({ used: -1 }),
      state({ spend: { spendId, state: "SETTLED", operation: "x", estimated: 1, actual: null } })]) {
      expect(await getBudget(fake({ data }).client, projectId)).toEqual({ ok: false, error: "BUDGET_INVALID_RESPONSE" });
    }
  });

  it("withSpend never calls the provider without a reservation", async () => {
    const call = vi.fn();
    expect(await withSpend(fake({ error: { code: "23514" } }).client, projectId, { operation: "get_domain_overview", estimated: 200 }, call))
      .toEqual({ ok: false, error: "BUDGET_EXCEEDED" });
    expect(call).not.toHaveBeenCalled();
  });

  it("withSpend settles with the reported cost, or releases when nothing was spent", async () => {
    const ok = fake({ data: reserved }, { data: settled });
    expect(await withSpend(ok.client, projectId, { operation: "get_domain_overview", estimated: 200 }, async () => ({ ok: true, value: "rows", actualCost: 250 })))
      .toMatchObject({ ok: true, value: "rows", budget: { used: 250 } });
    expect(ok.rpc.mock.calls[1][1]).toMatchObject({ p_command: "settle", p_payload: { spendId, actual: 250 } });
    const failed = fake({ data: reserved }, { data: released });
    expect(await withSpend(failed.client, projectId, { operation: "get_domain_overview", estimated: 200 }, async () => ({ ok: false, spent: false, error: "TIMEOUT" })))
      .toEqual({ ok: false, error: "TIMEOUT" });
    expect(failed.rpc.mock.calls[1][1]).toMatchObject({ p_command: "release", p_payload: { spendId } });
  });

  it("a failed settlement is reported and the reservation keeps counting", async () => {
    const r = fake({ data: reserved }, { error: { code: "XX000" } });
    expect(await withSpend(r.client, projectId, { operation: "get_domain_overview", estimated: 200 }, async () => ({ ok: true, value: 1, actualCost: 200 })))
      .toEqual({ ok: false, error: "BUDGET_UNAVAILABLE", settled: false });
    expect(r.rpc).toHaveBeenCalledTimes(2);
  });
});
