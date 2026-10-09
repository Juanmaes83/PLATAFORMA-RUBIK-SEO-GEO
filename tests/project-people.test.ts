import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { listPeople, projectInventory, removePerson } from "@/lib/project-people";

// Decision D3: people and the data inventory through RPCs only; malformed input never reaches the
// database, refusals map to fixed codes and a malformed answer is never shown.
const projectId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-0000000000bb";
const fake = (...results: { data?: unknown; error?: { code: string } }[]) => {
  const rpc = vi.fn();
  for (const r of results) rpc.mockResolvedValueOnce({ data: r.data ?? null, error: r.error ?? null });
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
};
const person = { userId, email: "persona@ejemplo.test", role: "viewer", organizationRole: "member", since: "2026-10-09T10:00:00Z", isSelf: false };
const dated = { count: 2, first: "2026-10-01T10:00:00Z", last: "2026-10-09T10:00:00Z" };
const inventory = {
  auditEvents: dated, providerResults: dated, imports: { count: 0, first: null, last: null }, projectMembers: 3, organizationMembers: 4,
  invitations: { open: 1, closed: 2 }, openseoJobs: 0, openseoConnections: 1, webmasterProperties: 0, googleProperties: 1, budgets: 1, spendEntries: 5, generatedAt: "2026-10-09T12:00:00Z",
};

describe("project people client", () => {
  it("lists and withdraws through the RPC", async () => {
    const { client, rpc } = fake({ data: [person] }, { data: { removed: true, leftOrganization: true, revokedInvitations: 1 } });
    expect(await listPeople(client, projectId)).toEqual({ ok: true, people: [person] });
    expect(await removePerson(client, projectId, userId)).toEqual({ ok: true, leftOrganization: true, revokedInvitations: 1 });
    expect(rpc).toHaveBeenLastCalledWith("project_people", { p_project_id: projectId, p_command: "remove", p_payload: { userId } });
  });

  it("refuses malformed references before any call", async () => {
    const { client, rpc } = fake();
    expect(await removePerson(client, projectId, "nope")).toEqual({ ok: false, error: "PEOPLE_INVALID" });
    expect(await removePerson(client, "nope", userId)).toEqual({ ok: false, error: "PEOPLE_INVALID" });
    expect(await listPeople(client, "nope")).toEqual({ ok: false, error: "PEOPLE_INVALID" });
    expect(await projectInventory(client, "nope")).toEqual({ ok: false, error: "PEOPLE_INVALID" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps refusals to fixed codes and rejects malformed answers", async () => {
    for (const [code, error] of [["42501", "PEOPLE_FORBIDDEN"], ["22023", "PEOPLE_INVALID"], ["P0002", "PEOPLE_NOT_MEMBER"], ["23514", "PEOPLE_OWNER"], ["XX000", "PEOPLE_UNAVAILABLE"]]) {
      expect(await removePerson(fake({ error: { code } }).client, projectId, userId)).toEqual({ ok: false, error });
    }
    expect(await listPeople(fake({ data: [{ ...person, role: "admin" }] }).client, projectId)).toEqual({ ok: false, error: "PEOPLE_INVALID_RESPONSE" });
    expect(await listPeople(fake({ data: { not: "a list" } }).client, projectId)).toEqual({ ok: false, error: "PEOPLE_INVALID_RESPONSE" });
    expect(await removePerson(fake({ data: { removed: false } }).client, projectId, userId)).toEqual({ ok: false, error: "PEOPLE_INVALID_RESPONSE" });
    const rejecting = { rpc: vi.fn().mockRejectedValue(new Error("network")) } as unknown as SupabaseClient<Database>;
    expect(await listPeople(rejecting, projectId)).toEqual({ ok: false, error: "PEOPLE_UNAVAILABLE" });
  });

  it("returns the inventory only when every count is well formed", async () => {
    expect(await projectInventory(fake({ data: inventory }).client, projectId)).toEqual({ ok: true, inventory });
    expect(await projectInventory(fake({ data: { ...inventory, budgets: -1 } }).client, projectId)).toEqual({ ok: false, error: "PEOPLE_INVALID_RESPONSE" });
    const withoutGoogle: Record<string, unknown> = { ...inventory };
    delete withoutGoogle.googleProperties;
    expect(await projectInventory(fake({ data: withoutGoogle }).client, projectId)).toEqual({ ok: false, error: "PEOPLE_INVALID_RESPONSE" });
    expect(await projectInventory(fake({ data: { ...inventory, imports: { count: 1, first: "nope", last: null } } }).client, projectId)).toEqual({ ok: false, error: "PEOPLE_INVALID_RESPONSE" });
    expect(await projectInventory(fake({ error: { code: "42501" } }).client, projectId)).toEqual({ ok: false, error: "PEOPLE_FORBIDDEN" });
  });
});
