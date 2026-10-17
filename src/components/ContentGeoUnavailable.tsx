import { notFound } from "next/navigation";
import { N2ModuleUnavailable } from "@/components/N2ModuleUnavailable";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { myProjectMembership } from "@/lib/tenancy";

/**
 * Shown instead of Contenidos/GEO while their schema is not declared available. Membership is
 * checked first, so a foreign or unknown project still answers 404; no module table is read.
 */
export async function ContentGeoUnavailable({ params, title, current }: {
  params: Promise<{ tenantId: string; projectId: string }>; title: string; current: "contenidos" | "geo";
}) {
  const [{ tenantId, projectId }, { user, supabase }] = await Promise.all([params, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  return <N2ModuleUnavailable title={title} projectName={project.name} base={`/proyectos/${project.tenantId}/${project.projectId}`} current={current} />;
}
