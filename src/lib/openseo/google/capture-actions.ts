"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import type { Role } from "@/lib/core";
import { loadProjectRef } from "@/lib/imports/repository";
import { serverKeyring } from "@/lib/provenance/keyring";
import { createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";
import { captureGoogleReport } from "./capture";
import type { ManualGoogleQuery } from "./manual-report";
import { connectGoogleProperty, revokeGoogleProperty, type GoogleProvider } from "./properties";

// Manual Google capture from the project page. The form fields are untrusted: tenant/project
// are a lookup key, the query is validated again by the service, and the source (connection and
// property) is always resolved on the server. The idempotency key is issued with the form, so a
// double submit or a resubmitted page stores the capture once.
const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const int = (v: string) => (/^\d{1,7}$/.test(v) ? Number(v) : NaN);

export async function captureGoogleAction(formData: FormData): Promise<void> {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) redirect("/acceso");
  const membership = await myProjectMembership(supabase, user.id, field(formData, "tenant"), field(formData, "project"));
  if (!membership) redirect("/proyectos");
  const ref = await loadProjectRef(supabase, { tenantId: membership.project.tenantId, projectId: membership.project.projectId });
  if (!ref) redirect("/proyectos");
  const base = `/proyectos/${ref.scope.tenantId}/${ref.scope.projectId}/google`;
  const provider = field(formData, "provider");
  const common = { startDate: field(formData, "startDate"), endDate: field(formData, "endDate") };
  const query: ManualGoogleQuery = provider === "google-analytics"
    ? { provider, ...common, limit: int(field(formData, "limit")), offset: int(field(formData, "offset") || "0") }
    : { provider: "search-console", ...common, dimensions: formData.getAll("dimensions").map(String), rowLimit: int(field(formData, "rowLimit")) };
  const r = await captureGoogleReport(supabase, ref, query, field(formData, "key"), { role: membership.role as Role, id: user.id }, serverKeyring());
  if (!r.ok) redirect(`${base}?error=${r.error}`);
  redirect(`${base}/${r.resultId}?aviso=${r.replayed ? "repetida" : r.audited ? "guardada" : "guardada-sin-auditoria"}`);
}

async function ownerProject(formData: FormData) {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) redirect("/acceso");
  const membership = await myProjectMembership(supabase, user.id, field(formData, "tenant"), field(formData, "project"));
  if (!membership) redirect("/proyectos");
  const ref = await loadProjectRef(supabase, { tenantId: membership.project.tenantId, projectId: membership.project.projectId });
  if (!ref) redirect("/proyectos");
  return { supabase, ref, base: `/proyectos/${ref.scope.tenantId}/${ref.scope.projectId}/google` };
}

const providerOf = (v: string): GoogleProvider | null => (v === "search-console" || v === "google-analytics" ? v : null);

/** Owner-declared binding of an OpenSEO Google property (the RPC checks ownership and the connection). */
export async function connectGooglePropertyAction(formData: FormData): Promise<void> {
  const { supabase, ref, base } = await ownerProject(formData);
  const provider = providerOf(field(formData, "provider"));
  if (!provider) redirect(`${base}?error=propiedad`);
  const r = await connectGoogleProperty(supabase, ref.projectId, provider, { externalPropertyId: field(formData, "externalPropertyId"), consent: field(formData, "consent") === "si" });
  redirect(`${base}?${r.ok ? "aviso=propiedad" : `error=propiedad-${r.error.toLowerCase()}`}`);
}

export async function revokeGooglePropertyAction(formData: FormData): Promise<void> {
  const { supabase, ref, base } = await ownerProject(formData);
  const provider = providerOf(field(formData, "provider"));
  if (!provider) redirect(`${base}?error=propiedad`);
  const r = await revokeGoogleProperty(supabase, ref.projectId, provider);
  redirect(`${base}?${r.ok ? "aviso=revocada" : "error=revocar"}`);
}
