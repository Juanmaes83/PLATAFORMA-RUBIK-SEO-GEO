import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoBadge, EmptyState, PageHead } from "@/components/ui";
import { accessibleProjects } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";
import { roleLabel } from "@/lib/labels";

export default async function ProjectsPage() {
  const user = await currentUser();
  if (!user) redirect("/acceso");
  const projects = accessibleProjects(user);

  return (
    <>
      <PageHead title="Proyectos"><DemoBadge /></PageHead>
      <p>
        Solo aparecen los proyectos en los que <strong>{user.displayName}</strong> tiene pertenencia; el Core deniega el
        resto (<code>NOT_A_MEMBER_OF_SCOPE</code>).
      </p>
      {projects.length === 0 ? (
        <EmptyState title="Sin proyectos">
          <p>Este usuario no tiene pertenencia a ningún proyecto.</p>
        </EmptyState>
      ) : (
        <ul className="cards">
          {projects.map(({ project, role }) => (
            <li key={`${project.tenantId}/${project.projectId}`} className="card">
              <div className="card-head">
                <h2 className="h3">{project.name}</h2>
                <DemoBadge />
              </div>
              <p className="muted small">{project.domain} · {project.vertical} · {roleLabel(role)}</p>
              <Link className="btn btn-block" href={`/proyectos/${project.tenantId}/${project.projectId}`}>Abrir proyecto</Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
