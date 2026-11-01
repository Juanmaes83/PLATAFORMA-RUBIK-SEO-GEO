import { notFound } from "next/navigation";
import { ProjectCrumbs } from "@/components/ProjectCrumbs";
import { ProjectSwitcher, type SwitcherItem } from "@/components/ProjectSwitcher";
import { StatusPill } from "@/components/ui";
import { accessibleProjects, projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { roleLabel } from "@/lib/labels";
import { myProjectMembership, myProjectMemberships } from "@/lib/tenancy";

// F1 project shell: every project page opens with the same context bar (where the project lives,
// its domain and the visitor's role), a breadcrumb back to the portfolio and — when the user
// belongs to more than one project — a switcher over exactly the authorized projects, so the
// "Back" button and deep links always land somewhere meaningful. Access is enforced here and in
// each page: unknown projects answer 404 before any project chrome renders.
export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenantId: string; projectId: string }> }) {
  const [{ tenantId, projectId }, { user, supabase }] = await Promise.all([params, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project, role } = access;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;

  const portfolio = accessibleProjects(await myProjectMemberships(supabase, user.id));
  const switcherItems: SwitcherItem[] = portfolio.map((a) => ({
    key: `${a.project.tenantId}/${a.project.projectId}`,
    name: a.project.name,
    tenantName: a.project.tenantName,
    href: `/proyectos/${a.project.tenantId}/${a.project.projectId}`,
    role: a.role,
  }));
  const showSwitcher = switcherItems.length > 1 && switcherItems.some((i) => i.key === `${project.tenantId}/${project.projectId}`);

  return (
    <>
      <div className="context-bar">
        <div className="context-bar-row">
          <ProjectCrumbs base={base} tenantName={project.tenantName} projectName={project.name} />
          {showSwitcher && <ProjectSwitcher items={switcherItems} currentKey={`${project.tenantId}/${project.projectId}`} currentBase={base} />}
        </div>
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
