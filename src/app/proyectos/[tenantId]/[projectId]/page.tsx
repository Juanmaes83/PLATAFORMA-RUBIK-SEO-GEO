import { notFound, redirect } from "next/navigation";
import { PermissionTable } from "@/components/PermissionTable";
import { projectAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";

const NEXT_STAGES = [
  ["Importación manual", "CORE-9.3"],
  ["Google Search Console (lectura)", "CORE-9.4"],
  ["Bing Webmaster (lectura)", "CORE-9.5"],
  ["Observación y borradores", "CORE-9.6"],
  ["IA asistida", "CORE-9.7"],
  ["IndexNow con aprobación por envío", "CORE-9.8"],
] as const;

export default async function ProjectPage({ params }: { params: Promise<{ tenantId: string; projectId: string }> }) {
  const [{ tenantId, projectId }, user] = await Promise.all([params, currentUser()]);
  if (!user) redirect("/acceso");
  const access = projectAccess(user, tenantId, projectId);
  // Unknown project and no membership look the same: no information about other tenants leaks.
  if (!access) notFound();
  const { project, role, permissions } = access;

  return (
    <>
      <h1>{project.name}</h1>
      <p className="muted">
        {project.tenantId}/{project.projectId} · {project.domain} · vertical {project.vertical} · tu rol: {role}
      </p>
      <PermissionTable permissions={permissions} />
      <section aria-labelledby="etapas">
        <h2 id="etapas">Módulos pendientes</h2>
        <p>No hay datos del proyecto: estas secciones se construyen en etapas posteriores.</p>
        <ul>
          {NEXT_STAGES.map(([name, stage]) => (
            <li key={stage}>{name} — <span className="muted">{stage}, no implementado</span></li>
          ))}
        </ul>
      </section>
    </>
  );
}
