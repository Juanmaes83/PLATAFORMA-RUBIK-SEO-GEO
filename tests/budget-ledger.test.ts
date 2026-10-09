import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getBudget, monthlySummary, releaseSpend, reserveSpend, setMonthlyLimit, settleSpend, withSpend } from "@/lib/budget/ledger";

const projectId = "00000000-0000-4000-8000-000000000001";
const spendId = "00000000-0000-4000-8000-0000000000aa";
const state = (over: Record<string, unknown> = {}) => ({ provider: "openseo", periodStart: "2026-10-01T00:00:00+00:00", monthlyLimit: 300, used: 0, available: 300, blocked: false, spend: null, ...over });
const reserved = state({ used: 200, available: 100, spend: { spendId, state: "RESERVED", operation: "get_domain_overview", estimated: 200, actual: null, replayed: false, overrun: false } });
const settled = state({ used: 250, available: 50, spend: { spendId, state: "SETTLED", operation: "get_domain_overview", estimated: 200, actual: 250, replayed: false, overrun: true } });
const released = state({ spend: { spendId, state: "RELEASED", operation: "get_domain_overview", estimated: 200, actual: null, replayed: false, overrun: false } });
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

  it("passes the idempotency key and stores the conversion with the limit", async () => {
    const { client, rpc } = fake({ data: reserved }, { data: state() });
    await reserveSpend(client, projectId, { operation: "get_domain_overview", estimated: 200, idempotencyKey: "audit:1234abcd" });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_command: "reserve", p_payload: { idempotencyKey: "audit:1234abcd" } });
    await setMonthlyLimit(client, projectId, 300, { ceilingEur: 10 });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_command: "set", p_payload: { monthlyLimit: 300, conversion: { ceilingEur: 10 } } });
    expect(await reserveSpend(client, projectId, { operation: "x", estimated: 1, idempotencyKey: "short" })).toEqual({ ok: false, error: "BUDGET_INVALID" });
    expect(await setMonthlyLimit(client, projectId, 300, [] as never)).toEqual({ ok: false, error: "BUDGET_INVALID" });
  });

  it("a retry never calls the provider again", async () => {
    const call = vi.fn();
    const settledReplay = state({ spend: { ...(settled.spend as unknown as object), replayed: true, overrun: false } });
    expect(await withSpend(fake({ data: settledReplay }).client, projectId, { operation: "get_domain_overview", estimated: 200, idempotencyKey: "audit:1234abcd" }, call))
      .toEqual({ ok: false, error: "ALREADY_SETTLED" });
    const openReplay = state({ spend: { ...(reserved.spend as unknown as object), replayed: true } });
    expect(await withSpend(fake({ data: openReplay }).client, projectId, { operation: "get_domain_overview", estimated: 200, idempotencyKey: "audit:1234abcd" }, call))
      .toEqual({ ok: false, error: "RESERVATION_OPEN" });
    expect(call).not.toHaveBeenCalled();
  });

  it("an unexpected failure of the call keeps the reservation open at its maximum", async () => {
    const r = fake({ data: reserved });
    await expect(withSpend(r.client, projectId, { operation: "get_domain_overview", estimated: 200 }, async () => { throw new Error("socket closed"); })).rejects.toThrow();
    expect(r.rpc).toHaveBeenCalledTimes(1);
  });

  it("reads a validated monthly summary", async () => {
    const summary = { provider: "openseo", periodStart: "2026-10-01T00:00:00+00:00", monthlyLimit: 300, conversion: null, blocked: false,
      operations: [{ operation: "get_domain_overview", reserved: 0, settled: 1, released: 0, credits: 250, overruns: 1, references: ["result:abc"] }] };
    const { client, rpc } = fake({ data: summary }, { data: { ...summary, operations: [{ operation: "x", credits: -1 }] } });
    expect(await monthlySummary(client, projectId, "2026-10")).toMatchObject({ ok: true, summary: { operations: [{ credits: 250 }] } });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_command: "summary", p_payload: { month: "2026-10" } });
    expect(await monthlySummary(client, projectId)).toEqual({ ok: false, error: "BUDGET_INVALID_RESPONSE" });
    expect(await monthlySummary(client, projectId, "2026-13")).toEqual({ ok: false, error: "BUDGET_INVALID" });
  });
});
