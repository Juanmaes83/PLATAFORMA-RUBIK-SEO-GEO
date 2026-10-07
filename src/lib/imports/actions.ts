"use server";

import { redirect } from "next/navigation";
import { projectAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";
import type { Role } from "@/lib/core";
import { serverKeyring } from "@/lib/provenance/keyring";
import { createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";
import { MAX_IMPORT_BYTES } from "./contract";
import { eraseImport, importFile, loadProjectRef } from "./repository";

// CORE-9.3 Server Actions (ADR 0005). Each one authenticates, loads the membership through RLS
// and asks the Core whether the role may perform the action; then RLS decides again in the
// database. The form fields are untrusted input: the hidden tenant/project fields are only a
// lookup key. A value pointing at a project the user does not belong to finds no membership
// (RLS) and is sent back to /proyectos; for a project they do belong to, their role in THAT
// project is what the Core authorizes.
const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

async function context(formData: FormData, action: "draft" | "delete-data") {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) redirect("/acceso");
  const tenantId = field(formData, "tenant");
  const projectId = field(formData, "project");
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) redirect("/proyectos");
  const base = `/proyectos/${access.project.tenantId}/${access.project.projectId}/importaciones`;
  if (!access.permissions.find((p) => p.action === action)?.decision.allowed) redirect(`${base}?error=no-permitido`);
  const keyring = serverKeyring();
  if (!keyring) redirect(`${base}?error=firma-no-configurada`);
  const project = await loadProjectRef(supabase, { tenantId: access.project.tenantId, projectId: access.project.projectId });
  if (!project) redirect("/proyectos");
  return { supabase, keyring, project, base, actor: { role: access.role as Role, id: user.id } };
}

export async function uploadImport(formData: FormData): Promise<void> {
  const { supabase, keyring, project, base, actor } = await context(formData, "draft");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(`${base}?error=EMPTY`);
  if (file.size > MAX_IMPORT_BYTES) redirect(`${base}?error=TOO_LARGE`);
  const outcome = await importFile(supabase, project, new Uint8Array(await file.arrayBuffer()), actor, keyring);
  if (outcome.ok) redirect(`${base}/${outcome.id}?importada=${outcome.status}`);
  if (outcome.error === "DUPLICATE" && outcome.existingId) redirect(`${base}/${outcome.existingId}?aviso=duplicado`);
  redirect(`${base}?error=${outcome.error}`);
}

export async function deleteImport(formData: FormData): Promise<void> {
  const { supabase, keyring, project, base, actor } = await context(formData, "delete-data");
  if (field(formData, "confirm") !== "borrar") redirect(`${base}/${field(formData, "id")}?error=confirmacion`);
  const result = await eraseImport(supabase, project, field(formData, "id"), actor, keyring);
  redirect(result.ok ? `${base}?borrada=1` : `${base}?error=no-borrada`);
}
