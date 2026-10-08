import { notFound } from "next/navigation";
import { connection } from "next/server";
import { OpenSeoConsole } from "@/components/OpenSeoConsole";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { projectAuditable } from "@/lib/openseo/bridge";
import { describeOpenSeoConfig, readOpenSeoConfig } from "@/lib/openseo/config";
import { myProjectMembership } from "@/lib/tenancy";

// Technical audit through OpenSEO (ADR 0006). The page itself never calls OpenSEO: it only
// reads which configuration STATES exist on the server. Every call to OpenSEO is a Server
// Action triggered by an explicit click of a project owner (`manage-connectors`).
export default async function TechnicalAuditPage({ params }: { params: Promise<{ tenantId: string; projectId: string }> }) {
  const [{ tenantId, projectId }, { user, supabase }] = await Promise.all([params, requireSession()]);
  await connection();
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;
  const canManage = access.permissions.find((p) => p.action === "manage-connectors")?.decision.allowed === true;
  const view = describeOpenSeoConfig(readOpenSeoConfig());
  const auditable = projectAuditable(project.domain);
  const domain = (project.domain ?? "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "");

  return (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current="auditoria-tecnica" />
      <PageHead title="Auditoría técnica">
        <StatusPill tone={view.state === "configured" ? "warn" : "neutral"}>{view.state === "configured" ? "Configurada, sin verificar" : "No conectada"}</StatusPill>
      </PageHead>
      <p>
        Rastreo técnico del sitio con OpenSEO, lanzado a mano y sin Lighthouse ni funciones de pago. La conexión se hace solo
        desde el servidor: las credenciales nunca llegan al navegador ni se guardan en el proyecto. La plataforma no da la
        conexión por buena hasta que una prueba con credenciales reales la verifica.
      </p>

      {!canManage ? (
        <EmptyState title="Solo la persona titular del proyecto la gestiona">
          <p>Tu rol en este proyecto no incluye gestionar conectores. Los resultados se compartirán cuando se guarden en el proyecto.</p>
        </EmptyState>
      ) : view.state !== "configured" ? (
        <EmptyState
          title={view.state === "invalid" ? "Configuración no válida" : "OpenSEO no está configurado"}
          requires={["Instancia de OpenSEO, clave y proyecto de OpenSEO configurados en el servidor por el propietario (docs/ENVIRONMENT.md)", "Dominio de este proyecto autorizado para auditorías en el servidor"]}
          nextStep="Probar la conexión, lanzar una auditoría manual y consultar su estado y sus incidencias."
        >
          {view.problems.length > 0 ? <ul>{view.problems.map((p) => <li key={p}>{p}</li>)}</ul> : <p>El servidor no tiene ninguna instancia de OpenSEO configurada.</p>}
        </EmptyState>
      ) : !auditable ? (
        <EmptyState
          title="Este proyecto no está autorizado para auditorías"
          requires={[domain ? `Autorizar ${domain} en la lista de hosts auditables del servidor` : "Definir el dominio del proyecto", "Nunca previews ni entornos protegidos"]}
        >
          <p>OpenSEO está configurado, pero el dominio de este proyecto no figura entre los hosts que el servidor permite auditar.</p>
        </EmptyState>
      ) : (
        <OpenSeoConsole tenant={project.tenantId} project={project.projectId} defaultUrl={`https://${domain}/`} maxPages={view.maxPages ?? 10} />
      )}
    </>
  );
}
