import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { acceptInvitation, createInvitation, listInvitations, revokeInvitation } from "@/lib/invitations";

// ADR 0011: invitations through RPCs only; malformed input never reaches the database, refusals
// map to fixed codes and a malformed answer never shows a link.
const projectId = "00000000-0000-4000-8000-000000000001";
const invitationId = "00000000-0000-4000-8000-0000000000aa";
const token = "a".repeat(64);
const fake = (...results: { data?: unknown; error?: { code: string } }[]) => {
  const rpc = vi.fn();
  for (const r of results) rpc.mockResolvedValueOnce({ data: r.data ?? null, error: r.error ?? null });
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
};
const row = { invitationId, email: "persona@ejemplo.test", role: "analyst", createdAt: "2026-10-09T10:00:00Z", expiresAt: "2026-10-16T10:00:00Z", state: "OPEN", acceptedAt: null };

describe("project invitations client", () => {
  it("creates with a normalized address and returns the token once", async () => {
    const { client, rpc } = fake({ data: { invitationId, token, expiresAt: row.expiresAt } });
    expect(await createInvitation(client, projectId, " Persona@Ejemplo.TEST ", "analyst")).toEqual({ ok: true, token, expiresAt: row.expiresAt });
    expect(rpc).toHaveBeenCalledWith("project_invitations", { p_project_id: projectId, p_command: "create", p_payload: { email: "persona@ejemplo.test", role: "analyst" } });
  });

  it("refuses malformed input and the owner role before any call", async () => {
    const { client, rpc } = fake();
    for (const r of await Promise.all([
      createInvitation(client, projectId, "no-at", "analyst"), createInvitation(client, projectId, "a@b.test", "owner"),
      createInvitation(client, "not-a-uuid", "a@b.test", "viewer"), revokeInvitation(client, projectId, "nope"),
    ])) expect(r).toEqual({ ok: false, error: "INVITATION_INVALID" });
    expect(await acceptInvitation(client, "short")).toEqual({ ok: false, error: "INVITATION_NOT_USABLE" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps refusals to fixed codes and rejects malformed answers", async () => {
    for (const [code, error] of [["42501", "INVITATION_FORBIDDEN"], ["23505", "INVITATION_DUPLICATE"], ["23514", "INVITATION_LIMIT"], ["22023", "INVITATION_INVALID"], ["XX000", "INVITATION_UNAVAILABLE"]]) {
      expect(await listInvitations(fake({ error: { code } }).client, projectId)).toEqual({ ok: false, error });
    }
    expect(await createInvitation(fake({ data: { token: "x" } }).client, projectId, "a@b.test", "viewer")).toEqual({ ok: false, error: "INVITATION_INVALID_RESPONSE" });
    expect(await listInvitations(fake({ data: [{ ...row, role: "owner" }] }).client, projectId)).toEqual({ ok: false, error: "INVITATION_INVALID_RESPONSE" });
    expect(await listInvitations(fake({ data: [row] }).client, projectId)).toEqual({ ok: true, invitations: [row] });
  });

  it("accepting gives the same answer for every unusable token", async () => {
    expect(await acceptInvitation(fake({ error: { code: "P0002" } }).client, token)).toEqual({ ok: false, error: "INVITATION_NOT_USABLE" });
    expect(await acceptInvitation(fake({ error: { code: "23505" } }).client, token)).toEqual({ ok: false, error: "ALREADY_MEMBER" });
    expect(await acceptInvitation(fake({ error: { code: "42501" } }).client, token)).toEqual({ ok: false, error: "SIGN_IN_REQUIRED" });
    expect(await acceptInvitation(fake({ data: { tenantId: "agencia", projectId: "proyecto", role: "analyst" } }).client, token))
      .toEqual({ ok: true, tenantId: "agencia", projectId: "proyecto", role: "analyst" });
    expect(await acceptInvitation(fake({ data: { tenantId: "../x", projectId: "p", role: "analyst" } }).client, token)).toEqual({ ok: false, error: "INVITATION_UNAVAILABLE" });
  });
});
