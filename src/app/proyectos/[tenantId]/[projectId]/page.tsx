import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { PermissionTable } from "@/components/PermissionTable";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { MEASUREMENT_STATES, roleLabel } from "@/lib/labels";
import { myProjectMembership } from "@/lib/tenancy";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ tenantId: string; projectId: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const [{ tenantId, projectId }, { aviso }, { user, supabase }] = await Promise.all([params, searchParams, requireSession()]);
  // The slugs in the URL are only a lookup key: RLS returns the row only to a member, and the
  // Core decides the permissions for that membership's role.
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  // Unknown project and no membership look the same: no information about other tenants leaks.
  if (!access) notFound();
  const { project, role, permissions } = access;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;

  return (
    <>
      <PageHead title={project.name} />
      <Notice tone="info" text={aviso === "invitacion" ? "Te has unido al proyecto con la invitación." : null} />
      <p className="muted small">{project.tenantName}{project.domain ? ` · ${project.domain}` : ""} · tu rol: {roleLabel(role)}</p>
      <ProjectNav base={base} current={null} />

      <section aria-labelledby="s-estado" className="section">
        <h2 id="s-estado">Estado de medición</h2>
        <EmptyState
          title="Sin mediciones"
          requires={["Una importación manual con fuente, fecha y estado de revisión (CORE-9.3)", "O un conector de solo lectura que el cliente autorice (Search Console o Bing Webmaster, CORE-9.4 y 9.5)"]}
          nextStep="Registrar la primera observación. A partir de ahí aparecerán aquí su fecha, su fuente y su estado de medición."
        >
          <p>
            <StatusPill tone="neutral">Desconocido</StatusPill> Este proyecto aún no tiene observaciones.
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

      {role === "owner" && (
        <section aria-labelledby="s-consumo" className="section">
          <h2 id="s-consumo">Gestión del proyecto</h2>
          <p><Link href={`${base}/consumo`}>Consumo y presupuesto del mes</Link></p>
          <p><Link href={`${base}/invitaciones`}>Invitar a personas</Link></p>
        </section>
      )}

      <section aria-labelledby="s-permisos" className="section">
        <h2 id="s-permisos">Tus permisos en este proyecto</h2>
        <p className="muted small">Los decide el servidor con tu rol guardado en la base de datos y los contratos del Core; ocultar un botón no es autorización.</p>
        <PermissionTable permissions={permissions} role={role} />
      </section>
    </>
  );
}
