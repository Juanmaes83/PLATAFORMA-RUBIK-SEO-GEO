"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isSlug, normalizeDomain } from "./tenancy-rules";

// Creating organizations and projects. The form fields are only input: RLS decides whether the
// signed-in user may insert (anyone signed in can create an organization and becomes its
// owner; only an organization owner can create projects in it). A manipulated hidden field
// pointing at another organization is rejected by the database, not by this code.
const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

export async function createOrganization(formData: FormData): Promise<void> {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) redirect("/acceso");
  const slug = field(formData, "slug");
  const name = field(formData, "name");
  if (!isSlug(slug) || !name || name.length > 120) redirect("/organizaciones?error=datos-organizacion");
  const { error } = await supabase.from("organizations").insert({ slug, name });
  if (error) redirect(`/organizaciones?error=${error.code === "23505" ? "identificador-ocupado" : "no-permitido"}`);
  redirect("/organizaciones?creada=organizacion");
}

export async function createProject(formData: FormData): Promise<void> {
  const [user, supabase] = await Promise.all([currentUser(), createClient()]);
  if (!user || !supabase) redirect("/acceso");
  const organizationSlug = field(formData, "organization");
  const slug = field(formData, "slug");
  const name = field(formData, "name");
  const domain = normalizeDomain(field(formData, "domain"));
  if (!isSlug(organizationSlug) || !isSlug(slug) || !name || name.length > 120 || domain === false) {
    redirect("/organizaciones?error=datos-proyecto");
  }
  // Only organizations visible to this user under RLS can be found here.
  const { data: org } = await supabase.from("organizations").select("id").eq("slug", organizationSlug).maybeSingle();
  if (!org) redirect("/organizaciones?error=no-permitido");
  const { error } = await supabase.from("projects").insert({ organization_id: org.id, slug, name, domain });
  if (error) redirect(`/organizaciones?error=${error.code === "23505" ? "identificador-ocupado" : "no-permitido"}`);
  redirect(`/proyectos/${organizationSlug}/${slug}`);
}
