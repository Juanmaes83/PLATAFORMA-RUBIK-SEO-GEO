import "server-only";

// Tenant data access. Every query runs with the signed-in user's session (publishable key),
// so Postgres RLS returns only rows of organizations and projects the user belongs to. The
// explicit `user_id` filters narrow the result to the user's own membership rows (an org
// owner can also read other members' rows); they are not the security boundary, RLS is.
import { platform } from "@/lib/core";
import type { ProjectMembership } from "@/lib/access";
import type { ServerClient } from "@/lib/supabase/server";

const PROJECT_FIELDS = "role, projects!inner(slug, name, domain, vertical, organizations!inner(slug, name))";

interface Row {
  role: string;
  projects: { slug: string; name: string; domain: string | null; vertical: string | null; organizations: { slug: string; name: string } };
}

const toMembership = (userId: string, row: Row): ProjectMembership => ({
  userId,
  role: row.role,
  project: {
    tenantId: row.projects.organizations.slug,
    tenantName: row.projects.organizations.name,
    projectId: row.projects.slug,
    name: row.projects.name,
    domain: row.projects.domain,
    vertical: row.projects.vertical,
  },
});

export async function myProjectMemberships(supabase: ServerClient, userId: string): Promise<ProjectMembership[]> {
  const { data, error } = await supabase.from("project_members").select(PROJECT_FIELDS).eq("user_id", userId);
  if (error) throw new Error(`No se pudieron leer los proyectos (${error.code}).`);
  return (data as unknown as Row[])
    .map((row) => toMembership(userId, row))
    .sort((a, b) => `${a.project.tenantId}/${a.project.projectId}`.localeCompare(`${b.project.tenantId}/${b.project.projectId}`));
}

/**
 * The user's membership for the project addressed by URL slugs, or null. Malformed slugs, an
 * unknown project and another tenant's project all give the same null (the page answers 404).
 */
export async function myProjectMembership(supabase: ServerClient, userId: string, tenantId: string, projectId: string): Promise<ProjectMembership | null> {
  if (!platform.scope({ tenantId, projectId }).ok) return null;
  const { data, error } = await supabase
    .from("project_members")
    .select(PROJECT_FIELDS)
    .eq("user_id", userId)
    .eq("projects.slug", projectId)
    .eq("projects.organizations.slug", tenantId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el proyecto (${error.code}).`);
  return data ? toMembership(userId, data as unknown as Row) : null;
}

export interface OrganizationMembership {
  id: string;
  slug: string;
  name: string;
  role: "owner" | "member" | string;
}

export async function myOrganizations(supabase: ServerClient, userId: string): Promise<OrganizationMembership[]> {
  const { data, error } = await supabase.from("organization_members").select("role, organizations!inner(id, slug, name)").eq("user_id", userId);
  if (error) throw new Error(`No se pudieron leer las organizaciones (${error.code}).`);
  return data
    .map((row) => ({ ...row.organizations, role: row.role }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
