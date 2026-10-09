import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Project invitations by single-use link (ADR 0020, migration 20261012090000). The platform sends
// no email: the organization owner copies the link and delivers it personally. Each invitation
// is bound to one address, one project and one non-owner role, expires after seven days and
// works once; only its SHA-256 is stored. Every call goes through the session client and RPCs.

export const INVITABLE_ROLES = ["account-manager", "analyst", "client-approver", "viewer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];
export type InvitationState = "OPEN" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export interface Invitation {
  invitationId: string;
  email: string;
  role: InvitableRole;
  createdAt: string;
  expiresAt: string;
  state: InvitationState;
  acceptedAt: string | null;
}

export type InvitationError = "INVITATION_FORBIDDEN" | "INVITATION_INVALID" | "INVITATION_DUPLICATE" | "INVITATION_LIMIT" | "INVITATION_UNAVAILABLE" | "INVITATION_INVALID_RESPONSE";
export type AcceptError = "SIGN_IN_REQUIRED" | "INVITATION_NOT_USABLE" | "ALREADY_MEMBER" | "INVITATION_UNAVAILABLE";

type Client = SupabaseClient<Database>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,255}$/;
const TOKEN = /^[0-9a-f]{64}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
const isTime = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));
const isRole = (v: unknown): v is InvitableRole => (INVITABLE_ROLES as readonly unknown[]).includes(v);

export const validEmail = (v: string) => EMAIL.test(v) && v.length <= 320;
export const validToken = (v: string) => TOKEN.test(v);

const errorOf = (code: string | undefined): InvitationError =>
  code === "42501" ? "INVITATION_FORBIDDEN" : code === "22023" ? "INVITATION_INVALID" : code === "23505" ? "INVITATION_DUPLICATE"
    : code === "23514" ? "INVITATION_LIMIT" : "INVITATION_UNAVAILABLE";

async function command(client: Client, projectId: string, p_command: "list" | "create" | "revoke", payload: Record<string, unknown>) {
  if (!UUID.test(projectId)) return { ok: false as const, error: "INVITATION_INVALID" as const };
  try {
    const { data, error } = await client.rpc("project_invitations", { p_project_id: projectId, p_command, p_payload: payload as never });
    return error ? { ok: false as const, error: errorOf(error.code) } : { ok: true as const, data: data as unknown };
  } catch {
    return { ok: false as const, error: "INVITATION_UNAVAILABLE" as const };
  }
}

/** Organization owners only; the RPC refuses everyone else with INVITATION_FORBIDDEN. */
export async function listInvitations(client: Client, projectId: string): Promise<{ ok: true; invitations: Invitation[] } | { ok: false; error: InvitationError }> {
  const r = await command(client, projectId, "list", {});
  if (!r.ok) return r;
  if (!Array.isArray(r.data)) return { ok: false, error: "INVITATION_INVALID_RESPONSE" };
  const valid = r.data.every((i: Record<string, unknown>) => i && typeof i.invitationId === "string" && UUID.test(i.invitationId)
    && typeof i.email === "string" && isRole(i.role) && isTime(i.createdAt) && isTime(i.expiresAt)
    && ["OPEN", "ACCEPTED", "REVOKED", "EXPIRED"].includes(String(i.state)) && (i.acceptedAt === null || isTime(i.acceptedAt)));
  return valid ? { ok: true, invitations: r.data as Invitation[] } : { ok: false, error: "INVITATION_INVALID_RESPONSE" };
}

/** Returns the token once; it is never stored or shown again. */
export async function createInvitation(client: Client, projectId: string, email: string, role: string):
  Promise<{ ok: true; token: string; expiresAt: string } | { ok: false; error: InvitationError }> {
  const address = email.trim().toLowerCase();
  if (!validEmail(address) || !isRole(role)) return { ok: false, error: "INVITATION_INVALID" };
  const r = await command(client, projectId, "create", { email: address, role });
  if (!r.ok) return r;
  const d = r.data as Record<string, unknown> | null;
  return d && typeof d.token === "string" && validToken(d.token) && isTime(d.expiresAt)
    ? { ok: true, token: d.token, expiresAt: d.expiresAt as string }
    : { ok: false, error: "INVITATION_INVALID_RESPONSE" };
}

export async function revokeInvitation(client: Client, projectId: string, invitationId: string): Promise<{ ok: true } | { ok: false; error: InvitationError }> {
  if (!UUID.test(invitationId)) return { ok: false, error: "INVITATION_INVALID" };
  const r = await command(client, projectId, "revoke", { invitationId });
  return r.ok ? { ok: true } : r;
}

/**
 * Any signed-in person may try a token; it only works for the confirmed address it was issued
 * to. Unknown, expired, revoked, used and other-address tokens give the same answer.
 */
export async function acceptInvitation(client: Client, token: string):
  Promise<{ ok: true; tenantId: string; projectId: string; role: InvitableRole } | { ok: false; error: AcceptError }> {
  if (!validToken(token)) return { ok: false, error: "INVITATION_NOT_USABLE" };
  try {
    const { data, error } = await client.rpc("accept_project_invitation", { p_token: token });
    if (error) {
      return { ok: false, error: error.code === "42501" ? "SIGN_IN_REQUIRED" : error.code === "P0002" ? "INVITATION_NOT_USABLE" : error.code === "23505" ? "ALREADY_MEMBER" : "INVITATION_UNAVAILABLE" };
    }
    const d = data as Record<string, unknown> | null;
    return d && typeof d.tenantId === "string" && SLUG.test(d.tenantId) && typeof d.projectId === "string" && SLUG.test(d.projectId) && isRole(d.role)
      ? { ok: true, tenantId: d.tenantId, projectId: d.projectId, role: d.role }
      : { ok: false, error: "INVITATION_UNAVAILABLE" };
  } catch {
    return { ok: false, error: "INVITATION_UNAVAILABLE" };
  }
}
