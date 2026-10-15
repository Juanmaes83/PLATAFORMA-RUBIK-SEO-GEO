"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth/session";
import { loadProjectRef } from "@/lib/imports/repository";
import { removePerson } from "@/lib/project-people";
import { serverKeyring } from "@/lib/provenance/keyring";
import { processAuditOutbox } from "@/lib/provenance/outbox";
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
  const logged = keyring && r.auditReceiptId ? await processAuditOutbox(r.auditReceiptId, keyring) : null;
  redirect(`${base}?aviso=${logged?.ok ? "retirada" : "retirada-sin-auditoria"}`);
}
