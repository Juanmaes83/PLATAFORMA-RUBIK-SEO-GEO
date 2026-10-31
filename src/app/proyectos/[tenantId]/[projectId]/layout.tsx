import { notFound } from "next/navigation";
import { ProjectCrumbs } from "@/components/ProjectCrumbs";
import { StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { roleLabel } from "@/lib/labels";
import { myProjectMembership } from "@/lib/tenancy";

// F1 project shell: every project page opens with the same context bar (where the project lives,
// its domain and the visitor's role) and a breadcrumb back to the portfolio, so the "Back"
// button and deep links always land somewhere meaningful. Access is enforced here and in each
// page: unknown projects answer 404 before any project chrome renders.
export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenantId: string; projectId: string }> }) {
  const [{ tenantId, projectId }, { user, supabase }] = await Promise.all([params, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project, role } = access;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;

  return (
    <>
      <div className="context-bar">
        <ProjectCrumbs base={base} tenantName={project.tenantName} projectName={project.name} />
        <p className="context-meta">
          <span>{project.tenantName}</span>
          {project.domain && <span className="break"> · {project.domain}</span>}
          <span className="context-role">Tu rol: <StatusPill tone="neutral">{roleLabel(role)}</StatusPill></span>
        </p>
      </div>
      {children}
    </>
  );
}
