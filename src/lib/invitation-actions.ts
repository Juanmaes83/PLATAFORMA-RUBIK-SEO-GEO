"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { loadProjectRef } from "@/lib/imports/repository";
import { acceptInvitation, createInvitation, revokeInvitation, type InvitationError } from "@/lib/invitations";
import { createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";

// Invitation Server Actions (ADR 0011). The tenant/project fields are only a lookup key: the
// RPCs decide who may invite (organization owners) and who may accept (the confirmed address).
const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;

async function projectContext(formData: FormData) {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) return null;
  const tenant = field(formData, "tenant"), project = field(formData, "project");
  if (!SLUG.test(tenant) || !SLUG.test(project)) return null;
  // Membership first: a non-member learns nothing, whatever the slugs.
  if (!(await myProjectMembership(supabase, user.id, tenant, project))) return null;
  const ref = await loadProjectRef(supabase, { tenantId: tenant, projectId: project });
  return ref ? { supabase, ref, tenant, project } : null;
}

export type CreateInvitationState = { ok: true; link: string; email: string; expiresAt: string } | { ok: false; error: InvitationError } | null;

export async function createInvitationAction(_prev: CreateInvitationState, formData: FormData): Promise<CreateInvitationState> {
  const context = await projectContext(formData);
  if (!context) return { ok: false, error: "INVITATION_FORBIDDEN" };
  const email = field(formData, "email").toLowerCase();
  const created = await createInvitation(context.supabase, context.ref.projectId, email, field(formData, "role"));
  if (!created.ok) return created;
  revalidatePath(`/proyectos/${context.tenant}/${context.project}/invitaciones`);
  const origin = (await headers()).get("origin");
  const path = `/invitacion/${created.token}`;
  return { ok: true, link: origin && /^https?:\/\/[^/\s]+$/.test(origin) ? `${origin}${path}` : path, email, expiresAt: created.expiresAt };
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const context = await projectContext(formData);
  if (!context) redirect("/panel");
  const base = `/proyectos/${context.tenant}/${context.project}/invitaciones`;
  const r = await revokeInvitation(context.supabase, context.ref.projectId, field(formData, "invitation"));
  redirect(`${base}?${r.ok ? "aviso=revocada" : "error=revocar"}`);
}

export async function acceptInvitationAction(formData: FormData): Promise<void> {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  const token = field(formData, "token");
  if (!user || !supabase) redirect("/acceso");
  const r = await acceptInvitation(supabase, token);
  if (r.ok) redirect(`/proyectos/${r.tenantId}/${r.projectId}?aviso=invitacion`);
  redirect(`/invitacion/${/^[0-9a-f]{64}$/.test(token) ? token : "no-valida"}?error=${r.error === "ALREADY_MEMBER" ? "miembro" : r.error === "INVITATION_UNAVAILABLE" ? "fallo" : "no-valida"}`);
}
