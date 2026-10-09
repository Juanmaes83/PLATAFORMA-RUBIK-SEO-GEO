"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import type { Role } from "@/lib/core";
import { loadProjectRef } from "@/lib/imports/repository";
import { removePerson } from "@/lib/project-people";
import { serverKeyring } from "@/lib/provenance/keyring";
import { appendAudit } from "@/lib/provenance/repository";
import { createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";

// Withdrawing a person (decision D3). The tenant/project fields are only a lookup key: the RPC
// decides who may withdraw (organization owners) and whom (never an owner). Access is withdrawn
// first, because that is what protects the project; the signed audit entry follows and only
// carries the person's UUID, never their address.
const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

export async function removePersonAction(formData: FormData): Promise<void> {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) redirect("/acceso");
  const tenant = field(formData, "tenant"), project = field(formData, "project");
  const membership = await myProjectMembership(supabase, user.id, tenant, project);
  if (!membership) redirect("/proyectos");
  const ref = await loadProjectRef(supabase, { tenantId: membership.project.tenantId, projectId: membership.project.projectId });
  if (!ref) redirect("/proyectos");
  const base = `/proyectos/${ref.scope.tenantId}/${ref.scope.projectId}/personas`;
  if (field(formData, "confirm") !== "retirar") redirect(`${base}?error=confirmacion`);
  const target = field(formData, "person");
  const r = await removePerson(supabase, ref.projectId, target);
  if (!r.ok) redirect(`${base}?error=${r.error.toLowerCase()}`);
  revalidatePath(base);
  const keyring = serverKeyring();
  const logged = keyring
    ? await appendAudit(supabase, ref, { actor: { role: membership.role as Role, id: user.id }, action: "member.withdraw", target, outcome: "allowed",
      details: { leftOrganization: r.leftOrganization, revokedInvitations: r.revokedInvitations } }, keyring)
    : null;
  redirect(`${base}?aviso=${logged?.ok ? "retirada" : "retirada-sin-auditoria"}`);
}
