import "server-only";

import { notFound } from "next/navigation";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { serverKeyring } from "@/lib/provenance/keyring";
import { listPeople } from "@/lib/project-people";
import { myProjectMembership } from "@/lib/tenancy";
import { writerReady } from "./audit";
import { loadGeoProject } from "./repository";

// Resolves session, membership (RLS) and project BEFORE anything streams, so a foreign or
// unknown project answers a real 404; pages render their data inside <Suspense> afterwards.
export async function geoPage(params: Promise<{ tenantId: string; projectId: string }>) {
  const [{ tenantId, projectId }, { user, supabase }] = await Promise.all([params, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const project = await loadGeoProject(supabase, { tenantId: access.project.tenantId, projectId: access.project.projectId });
  if (!project) notFound();
  const allowed = (action: string) => access.permissions.find((p) => p.action === action)?.decision.allowed === true;
  return {
    user, supabase, access, project, allowed, signing: serverKeyring() !== null && writerReady(),
    base: `/proyectos/${access.project.tenantId}/${access.project.projectId}`,
    hidden: { tenant: access.project.tenantId, project: access.project.projectId },
  };
}
export type GeoPageContext = Awaited<ReturnType<typeof geoPage>>;

/** "tú", the email (organization owners only: the people RPC answers only them) or a short id. */
export async function peopleNamer(ctx: GeoPageContext): Promise<(id: string | null) => string> {
  const people = ctx.allowed("manage-members") ? await listPeople(ctx.supabase, ctx.project.projectId) : null;
  const emails = new Map(people?.ok ? people.people.map((p) => [p.userId, p.email]) : []);
  return (id) => (!id ? "—" : id === ctx.user.id ? "tú" : emails.get(id) ?? `persona ${id.slice(0, 8)}`);
}
