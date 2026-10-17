import "server-only";

import { notFound } from "next/navigation";
import { projectAccess, type ProjectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { serverKeyring } from "@/lib/provenance/keyring";
import { listPeople } from "@/lib/project-people";
import { myProjectMembership } from "@/lib/tenancy";
import { writerReady } from "./audit";
import { loadContentProject, type ContentProject } from "./repository";

// Resolves session, membership (RLS) and project before anything streams, so an unknown or
// foreign project answers 404 with a real 404 status (a route-level loading.tsx would turn it
// into 200; see N2-11). Pages render their data inside <Suspense> afterwards.
export async function contentPage(params: Promise<{ tenantId: string; projectId: string }>) {
  const [{ tenantId, projectId }, { user, supabase }] = await Promise.all([params, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const project = await loadContentProject(supabase, { tenantId: access.project.tenantId, projectId: access.project.projectId });
  if (!project) notFound();
  const allowed = (action: string) => access.permissions.find((p) => p.action === action)?.decision.allowed === true;
  const signing = serverKeyring() !== null && writerReady();
  return {
    user, supabase, access, project, signing, allowed,
    base: `/proyectos/${access.project.tenantId}/${access.project.projectId}`,
    hidden: { tenant: access.project.tenantId, project: access.project.projectId },
  };
}
export type ContentPageContext = Awaited<ReturnType<typeof contentPage>>;
export type { ContentProject, ProjectAccess };

/**
 * A readable name for a user id: "tú", the email when the viewer is an organization owner (the
 * people RPC only answers owners), otherwise a short id that matches the audit trail.
 */
export async function peopleNamer(ctx: ContentPageContext): Promise<(id: string | null) => string> {
  const people = ctx.allowed("manage-members") ? await listPeople(ctx.supabase, ctx.project.projectId) : null;
  const emails = new Map(people?.ok ? people.people.map((p) => [p.userId, p.email]) : []);
  return (id) => {
    if (!id) return "—";
    if (id === ctx.user.id) return "tú";
    return emails.get(id) ?? `persona ${id.slice(0, 8)}`;
  };
}
