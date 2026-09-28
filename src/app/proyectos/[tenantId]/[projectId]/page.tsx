import { notFound, redirect } from "next/navigation";
import { PermissionTable } from "@/components/PermissionTable";
import { ProjectNav } from "@/components/ProjectNav";
import { DemoBadge, EmptyState, PageHead, StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";
import { MEASUREMENT_STATES, roleLabel } from "@/lib/labels";

export default async function ProjectPage({ params }: { params: Promise<{ tenantId: string; projectId: string }> }) {
  const [{ tenantId, projectId }, user] = await Promise.all([params, currentUser()]);
  if (!user) redirect("/acceso");
  const access = projectAccess(user, tenantId, projectId);
  // Unknown project and no membership look the same: no information about other tenants leaks.
  if (!access) notFound();
  const { project, role, permissions } = access;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;

  return (
    <>
      <PageHead title={project.name}><DemoBadge /></PageHead>
      <p className="muted small">{project.domain} · {project.vertical} · tu rol: {roleLabel(role)}</p>
      <ProjectNav base={base} current={null} />

      <section aria-labelledby="s-estado" className="section">
        <h2 id="s-estado">Estado de medición</h2>
        <EmptyState title="Sin mediciones">
          <p>
            <StatusPill tone="neutral">Desconocido</StatusPill> Este proyecto no tiene observaciones. La importación manual llega en
            CORE-9.3, y los conectores de solo lectura en 9.4 y 9.5.
          </p>
        </EmptyState>
        <details className="legend">
          <summary>Cómo se mostrarán los datos</summary>
          <dl>
            {MEASUREMENT_STATES.map((s) => (
              <div key={s.id}><dt>{s.label}</dt><dd>{s.description}</dd></div>
            ))}
          </dl>
        </details>
      </section>

      <section aria-labelledby="s-permisos" className="section">
        <h2 id="s-permisos">Tus permisos en este proyecto</h2>
        <p className="muted small">Los decide el servidor con los contratos del Core; ocultar un botón no es autorización.</p>
        <PermissionTable permissions={permissions} />
      </section>
    </>
  );
}
