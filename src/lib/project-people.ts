import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Project people and data inventory (migration 20261012100000; decision D3 of
// docs/RETENCION-Y-BORRADO.md). A person leaves by losing access, never by deleting their account.
// Organization owners only: the RPCs refuse everyone else. Every call goes through the session
// client, and every response is checked before the UI shows it.

export interface ProjectPerson {
  userId: string;
  email: string | null;
  role: string;
  organizationRole: "owner" | "member";
  since: string;
  isSelf: boolean;
}

export interface DatedCount { count: number; first: string | null; last: string | null }

export interface ProjectInventory {
  auditEvents: DatedCount;
  providerResults: DatedCount;
  imports: DatedCount;
  projectMembers: number;
  organizationMembers: number;
  invitations: { open: number; closed: number };
  openseoJobs: number;
  openseoConnections: number;
  webmasterProperties: number;
  googleProperties: number;
  googleCaptures: number;
  budgets: number;
  spendEntries: number;
  generatedAt: string;
}

export type PeopleError = "PEOPLE_FORBIDDEN" | "PEOPLE_INVALID" | "PEOPLE_NOT_MEMBER" | "PEOPLE_OWNER" | "PEOPLE_UNAVAILABLE" | "PEOPLE_INVALID_RESPONSE";

type Client = SupabaseClient<Database>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ["owner", "account-manager", "analyst", "client-approver", "viewer"];
const isTime = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
const isDated = (v: unknown) => {
  const d = v as DatedCount | null;
  return !!d && isCount(d.count) && (d.first === null || isTime(d.first)) && (d.last === null || isTime(d.last));
};

const errorOf = (code: string | undefined): PeopleError =>
  code === "42501" ? "PEOPLE_FORBIDDEN" : code === "22023" ? "PEOPLE_INVALID" : code === "P0002" ? "PEOPLE_NOT_MEMBER"
    : code === "23514" ? "PEOPLE_OWNER" : "PEOPLE_UNAVAILABLE";

async function people(client: Client, projectId: string, p_command: "list" | "remove", payload: Record<string, unknown>) {
  if (!UUID.test(projectId)) return { ok: false as const, error: "PEOPLE_INVALID" as const };
  try {
    const { data, error } = await client.rpc("project_people", { p_project_id: projectId, p_command, p_payload: payload as never });
    return error ? { ok: false as const, error: errorOf(error.code) } : { ok: true as const, data: data as unknown };
  } catch {
    return { ok: false as const, error: "PEOPLE_UNAVAILABLE" as const };
  }
}

export async function listPeople(client: Client, projectId: string): Promise<{ ok: true; people: ProjectPerson[] } | { ok: false; error: PeopleError }> {
  const r = await people(client, projectId, "list", {});
  if (!r.ok) return r;
  if (!Array.isArray(r.data)) return { ok: false, error: "PEOPLE_INVALID_RESPONSE" };
  const valid = r.data.every((p: Record<string, unknown>) => p && typeof p.userId === "string" && UUID.test(p.userId)
    && (p.email === null || typeof p.email === "string") && ROLES.includes(String(p.role))
    && (p.organizationRole === "owner" || p.organizationRole === "member") && isTime(p.since) && typeof p.isSelf === "boolean");
  return valid ? { ok: true, people: r.data as ProjectPerson[] } : { ok: false, error: "PEOPLE_INVALID_RESPONSE" };
}

/** Withdraws a non-owner from the project (and from the organization if it was their last project there). */
export async function removePerson(client: Client, projectId: string, userId: string):
  Promise<{ ok: true; leftOrganization: boolean; revokedInvitations: number } | { ok: false; error: PeopleError }> {
  if (!UUID.test(userId)) return { ok: false, error: "PEOPLE_INVALID" };
  const r = await people(client, projectId, "remove", { userId });
  if (!r.ok) return r;
  const d = r.data as Record<string, unknown> | null;
  return d && d.removed === true && typeof d.leftOrganization === "boolean" && isCount(d.revokedInvitations)
    ? { ok: true, leftOrganization: d.leftOrganization, revokedInvitations: d.revokedInvitations as number }
    : { ok: false, error: "PEOPLE_INVALID_RESPONSE" };
}

export async function projectInventory(client: Client, projectId: string): Promise<{ ok: true; inventory: ProjectInventory } | { ok: false; error: PeopleError }> {
  if (!UUID.test(projectId)) return { ok: false, error: "PEOPLE_INVALID" };
  try {
    const { data, error } = await client.rpc("project_data_inventory", { p_project_id: projectId });
    if (error) return { ok: false, error: errorOf(error.code) };
    const d = data as Record<string, unknown> | null;
    const inv = d?.invitations as Record<string, unknown> | undefined;
    const valid = !!d && isDated(d.auditEvents) && isDated(d.providerResults) && isDated(d.imports)
      && ["projectMembers", "organizationMembers", "openseoJobs", "openseoConnections", "webmasterProperties", "googleProperties", "googleCaptures", "budgets", "spendEntries"].every((k) => isCount(d[k]))
      && !!inv && isCount(inv.open) && isCount(inv.closed) && isTime(d.generatedAt);
    return valid ? { ok: true, inventory: d as unknown as ProjectInventory } : { ok: false, error: "PEOPLE_INVALID_RESPONSE" };
  } catch {
    return { ok: false, error: "PEOPLE_UNAVAILABLE" };
  }
}
