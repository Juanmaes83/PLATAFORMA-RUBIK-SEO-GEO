import Link from "next/link";
import { EmptyState, PageHead } from "@/components/ui";
import { accessibleProjects } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { roleLabel } from "@/lib/labels";
import { myProjectMemberships } from "@/lib/tenancy";

export default async function ProjectsPage() {
  const { user, supabase } = await requireSession();
  const projects = accessibleProjects(await myProjectMemberships(supabase, user.id));

  return (
    <>
      <PageHead title="Proyectos" />
      <p>
        Solo ves los proyectos de los que eres miembro. Los demás no aparecen, y si alguien intenta abrirlos obtiene la
        misma página que para un proyecto inexistente.
      </p>
      <details className="tech">
        <summary>Información técnica</summary>
        <p className="diag">
          La base de datos filtra cada consulta por organización (RLS) y el Core deniega el resto con <code>NOT_A_MEMBER_OF_SCOPE</code>
        </p>
      </details>
      {projects.length === 0 ? (
        <EmptyState
          title="Sin proyectos"
          requires={["Ser miembro de un proyecto: créalo en tu organización o pide a una persona titular que te añada"]}
          nextStep="Cuando tengas acceso, el proyecto aparecerá aquí con tu rol."
        >
          <p>Todavía no eres miembro de ningún proyecto.</p>
          <p><Link className="btn" href="/organizaciones">Ir a organizaciones</Link></p>
        </EmptyState>
      ) : (
        <ul className="cards">
          {projects.map(({ project, role }) => (
            <li key={`${project.tenantId}/${project.projectId}`} className="card">
              <div className="card-head">
                <h2 className="h3">{project.name}</h2>
              </div>
              <p className="muted small">{project.tenantName}{project.domain ? ` · ${project.domain}` : ""} · {roleLabel(role)}</p>
              <Link className="btn btn-block" href={`/proyectos/${project.tenantId}/${project.projectId}`}>Abrir proyecto</Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
