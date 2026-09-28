import Link from "next/link";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { accessibleProjects } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { roleLabel } from "@/lib/labels";
import { myProjectMemberships } from "@/lib/tenancy";

// D-27 dashboard: projects first, then pending approvals and activity, then the date/state
// of the last observation. Only projects come from the database (RLS); every other slot is
// an honest empty state, never a number.
export default async function PanelPage() {
  const { user, supabase } = await requireSession();
  const projects = accessibleProjects(await myProjectMemberships(supabase, user.id));

  return (
    <>
      <PageHead title="Panel" />
      <p className="lead">
        {projects.length === 0 ? "Aún no tienes acceso a ningún proyecto." : `Tienes acceso a ${projects.length === 1 ? "1 proyecto" : `${projects.length} proyectos`}.`}
      </p>

      <section aria-labelledby="p-proyectos" className="section">
        <h2 id="p-proyectos">Proyectos</h2>
        {projects.length === 0 ? (
          <EmptyState title="Sin proyectos" nextStep="Crea tu organización y su primer proyecto, o pide a una persona titular que te añada.">
            <p>Una cuenta nueva no pertenece a ninguna organización.</p>
            <p><Link className="btn" href="/organizaciones">Ir a organizaciones</Link></p>
          </EmptyState>
        ) : (
          <ul className="cards">
            {projects.map(({ project, role }) => (
              <li key={`${project.tenantId}/${project.projectId}`} className="card">
                <div className="card-head">
                  <h3>{project.name}</h3>
                </div>
                <p className="muted small">{project.tenantName}{project.domain ? ` · ${project.domain}` : ""}</p>
                <dl className="facts">
                  <div><dt>Tu rol</dt><dd>{roleLabel(role)}</dd></div>
                  <div><dt>Última observación</dt><dd><StatusPill tone="neutral">Desconocido</StatusPill> Sin observaciones registradas</dd></div>
                </dl>
                <Link className="btn btn-block" href={`/proyectos/${project.tenantId}/${project.projectId}`}>Abrir proyecto</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid-2">
        <section aria-labelledby="p-aprobaciones" className="section">
          <h2 id="p-aprobaciones">Pendiente de aprobación</h2>
          <EmptyState
            title="Sin bandeja de aprobaciones todavía"
            requires={["Registro auditado de aprobaciones (CORE-9.2)", "Borradores y acciones propuestas (CORE-9.6)"]}
            nextStep="Aquí aparecerá cada borrador o acción externa que espera una decisión, con enlace a su evidencia."
          >
            <p>No se muestra ningún pendiente porque la revisión y aprobación humana se construyen en CORE-9.6 y 9.8.</p>
          </EmptyState>
        </section>
        <section aria-labelledby="p-actividad" className="section">
          <h2 id="p-actividad">Actividad reciente</h2>
          <EmptyState
            title="Sin actividad registrada"
            requires={["Registro de auditoría (CORE-9.2)"]}
            nextStep="Aquí se verán las importaciones, las revisiones y las aprobaciones recientes de tus proyectos, con fecha y autor."
          >
            <p>Todavía no se guarda auditoría. El historial llega en CORE-9.2.</p>
          </EmptyState>
        </section>
      </div>
    </>
  );
}
