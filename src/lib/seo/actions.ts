"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { projectAccess } from "@/lib/access";
import { loadProjectRef } from "@/lib/imports/repository";
import { createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";
import { normalizeKeyword } from "./keywords";

const field = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export async function saveKeywordAction(data: FormData): Promise<void> {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) redirect("/acceso");
  const membership = await myProjectMembership(supabase, user.id, field(data, "tenant"), field(data, "project"));
  const access = projectAccess(membership);
  if (!access) redirect("/proyectos");
  const base = `/proyectos/${access.project.tenantId}/${access.project.projectId}/seo`;
  if (!access.permissions.some((p) => p.action === "draft" && p.decision.allowed)) redirect(`${base}?error=permiso`);
  const ref = await loadProjectRef(supabase, { tenantId: access.project.tenantId, projectId: access.project.projectId });
  if (!ref) redirect("/proyectos");
  const parsed = normalizeKeyword({ phrase: field(data, "phrase"), language: field(data, "language"), country: field(data, "country"), intent: field(data, "intent"), topic: field(data, "topic"), targetUrl: field(data, "targetUrl") }, access.project.domain);
  if (!parsed) redirect(`${base}?error=datos`);
  const id = field(data, "id");
  if (id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(`${base}?error=datos`);
    const { error, count } = await supabase.from("seo_keywords").update({ intent: parsed.intent, topic: parsed.topic, target_url: parsed.target_url, updated_at: new Date().toISOString() }, { count: "exact" }).eq("id", id).eq("project_id", ref.projectId).eq("organization_id", ref.organizationId);
    redirect(`${base}?${error || !count ? "error=guardar" : "aviso=actualizada"}`);
  }
  const { error } = await supabase.from("seo_keywords").insert({ project_id: ref.projectId, organization_id: ref.organizationId, ...parsed });
  redirect(`${base}?${error ? error.code === "23505" ? "error=duplicada" : "error=guardar" : "aviso=guardada"}`);
}

export async function deleteKeywordAction(data: FormData): Promise<void> {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) redirect("/acceso");
  const membership = await myProjectMembership(supabase, user.id, field(data, "tenant"), field(data, "project"));
  const access = projectAccess(membership);
  if (!access) redirect("/proyectos");
  const base = `/proyectos/${access.project.tenantId}/${access.project.projectId}/seo`;
  if (!access.permissions.some((p) => p.action === "draft" && p.decision.allowed)) redirect(`${base}?error=permiso`);
  const id = field(data, "id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect(`${base}?error=datos`);
  const ref = await loadProjectRef(supabase, { tenantId: access.project.tenantId, projectId: access.project.projectId });
  if (!ref) redirect("/proyectos");
  const { error, count } = await supabase.from("seo_keywords").delete({ count: "exact" }).eq("id", id).eq("project_id", ref.projectId).eq("organization_id", ref.organizationId);
  redirect(`${base}?${error || !count ? "error=borrar" : "aviso=borrada"}`);
}
