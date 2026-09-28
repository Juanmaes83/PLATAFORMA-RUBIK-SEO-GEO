import Link from "next/link";
import { redirect } from "next/navigation";
import { DemoBadge, EmptyState, PageHead, StatusPill } from "@/components/ui";
import { accessibleProjects } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";
import { roleLabel } from "@/lib/labels";

// D-27 dashboard: projects first, then pending approvals and activity, then the date/state
// of the last observation. CORE-9.0 has no persistence: every data slot is an honest empty
// state, never a number.
export default async function PanelPage() {
  const user = await currentUser();
  if (!user) redirect("/acceso");
  const projects = accessibleProjects(user);

  return (
    <>
      <PageHead title="Panel">
        <DemoBadge />
      </PageHead>
      <p className="lead">Hola, {user.displayName}. Tienes acceso a {projects.length === 1 ? "1 proyecto" : `${projects.length} proyectos`} de demostración.</p>

      <section aria-labelledby="p-proyectos" className="section">
        <h2 id="p-proyectos">Proyectos</h2>
        <ul className="cards">
          {projects.map(({ project, role }) => (
            <li key={`${project.tenantId}/${project.projectId}`} className="card">
              <div className="card-head">
                <h3>{project.name}</h3>
                <DemoBadge />
              </div>
              <p className="muted small">{project.domain} · {project.vertical}</p>
              <dl className="facts">
                <div><dt>Tu rol</dt><dd>{roleLabel(role)}</dd></div>
                <div><dt>Última observación</dt><dd><StatusPill tone="neutral">Desconocido</StatusPill> Sin observaciones registradas</dd></div>
              </dl>
              <Link className="btn btn-block" href={`/proyectos/${project.tenantId}/${project.projectId}`}>Abrir proyecto</Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid-2">
        <section aria-labelledby="p-aprobaciones" className="section">
          <h2 id="p-aprobaciones">Pendiente de aprobación</h2>
          <EmptyState
            title="Sin bandeja de aprobaciones todavía"
            requires={["Cuentas reales con rol de aprobación (CORE-9.1)", "Registro auditado de aprobaciones (CORE-9.2)", "Borradores y acciones propuestas (CORE-9.6)"]}
            nextStep="Aquí aparecerá cada borrador o acción externa que espera una decisión, con enlace a su evidencia."
          >
            <p>No se muestra ningún pendiente porque la revisión y aprobación humana se construyen en CORE-9.6 y 9.8.</p>
          </EmptyState>
        </section>
        <section aria-labelledby="p-actividad" className="section">
          <h2 id="p-actividad">Actividad reciente</h2>
          <EmptyState
            title="Sin actividad registrada"
            requires={["Persistencia y registro de auditoría (CORE-9.2)"]}
            nextStep="Aquí se verán las importaciones, las revisiones y las aprobaciones recientes de tus proyectos, con fecha y autor."
          >
            <p>CORE-9.0 no guarda datos ni auditoría. El historial llega con la persistencia (CORE-9.2).</p>
          </EmptyState>
        </section>
      </div>
    </>
  );
}
