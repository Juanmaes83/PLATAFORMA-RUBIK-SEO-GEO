import { notFound } from "next/navigation";
import { connection } from "next/server";
import { OpenSeoConsole } from "@/components/OpenSeoConsole";
import { OpenSeoHistory } from "@/components/OpenSeoHistory";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { projectAuditable } from "@/lib/openseo/bridge";
import { describeOpenSeoConfig, readOpenSeoConfig } from "@/lib/openseo/config";
import { loadProjectRef } from "@/lib/imports/repository";
import { serverKeyring } from "@/lib/provenance/keyring";
import { listProviderResults } from "@/lib/provenance/repository";
import { myProjectMembership } from "@/lib/tenancy";
import { projectJobsEnabled } from "@/lib/openseo/jobs";
import { connectionMode, resolveOpenSeoTarget } from "@/lib/openseo/target";
import { getProjectConnection } from "@/lib/openseo/connections";
import { OpenSeoConnectionPanel, type ConnectionPanelView } from "@/components/OpenSeoConnectionPanel";

// Technical audit through OpenSEO (ADR 0006). The page itself never calls OpenSEO: it only
// reads which configuration STATES exist on the server. Every call to OpenSEO is a Server
// Action triggered by an explicit click of a project owner (`manage-connectors`).
export default async function TechnicalAuditPage({ params }: { params: Promise<{ tenantId: string; projectId: string }> }) {
  const [{ tenantId, projectId }, { user, supabase }] = await Promise.all([params, requireSession()]);
  await connection();
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  const ref = await loadProjectRef(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  if (!ref) notFound();
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;
  const canManage = access.permissions.find((p) => p.action === "manage-connectors")?.decision.allowed === true;
  // Legacy mode reads the global server configuration; project mode reads only this project's
  // ACTIVE connection (owner-only RPC), so nothing is resolved for other roles.
  const target = canManage ? await resolveOpenSeoTarget(supabase, ref.projectId) : null;
  const targetEnv = target && "env" in target ? target.env : undefined;
  const view = describeOpenSeoConfig(readOpenSeoConfig(targetEnv));
  const auditable = projectAuditable(project.domain, targetEnv);
  const domain = (project.domain ?? "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const connectionView = canManage ? await panelView(supabase, ref.projectId, domain) : null;
  const keyring = serverKeyring();
  const listed = keyring ? await listProviderResults(supabase, ref) : null;
  const historyState = !keyring ? "signing-missing" : listed?.ok ? "ready" : "unavailable";
  const historyRows = listed?.ok ? listed.rows : [];

  return (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current="auditoria-tecnica" />
      <PageHead title="Auditoría técnica">
        <StatusPill tone={view.state === "configured" ? "warn" : "neutral"}>{view.state === "configured" ? "Configuración disponible" : "No conectada"}</StatusPill>
      </PageHead>
      <p>
        Rastreo técnico del sitio con OpenSEO, lanzado a mano y sin Lighthouse. El consumo de créditos depende del plan de la instancia de OpenSEO. La conexión se hace solo
        desde el servidor: las credenciales nunca llegan al navegador ni se guardan en el proyecto. La plataforma no da la
        conexión por buena hasta que una prueba con credenciales reales la verifica.
      </p>

      {connectionView && <OpenSeoConnectionPanel tenant={project.tenantId} project={project.projectId} view={connectionView} projectMode={connectionMode() === "project"} />}

      {!canManage ? (
        <EmptyState title="Solo la persona titular del proyecto la gestiona">
          <p>Tu rol en este proyecto no incluye gestionar conectores. Los resultados se compartirán cuando se guarden en el proyecto.</p>
        </EmptyState>
      ) : target && "error" in target ? (
        <EmptyState
          title="Este proyecto no tiene una conexión de OpenSEO activa"
          requires={["Conexión de OpenSEO del proyecto creada por su titular, con consentimiento explícito"]}
        >
          <p>{target.error.message}</p>
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
        <OpenSeoConsole tenant={project.tenantId} project={project.projectId} defaultUrl={`https://${domain}/`} maxPages={view.maxPages ?? 10} savingEnabled={projectJobsEnabled() && !!keyring} />
      )}
      <OpenSeoHistory base={base} state={historyState} rows={historyRows} />
    </>
  );
}

/** Owner view of the connection: hosts and the last characters of the OpenSEO id, nothing else. */
async function panelView(supabase: Parameters<typeof getProjectConnection>[0], projectId: string, domain: string): Promise<ConnectionPanelView> {
  const found = await getProjectConnection(supabase, projectId);
  if (!found.ok) return { state: "unavailable" };
  if (found.connection?.state === "ACTIVE") {
    const id = found.connection.openseoProjectId;
    return { state: "active", hosts: found.connection.allowedHosts, grantedAt: found.connection.grantedAt, providerHint: id.length > 4 ? `…${id.slice(-4)}` : "…" };
  }
  const host = domain.toLowerCase();
  if (!host) return { state: "none", hostOptions: [], defaultHost: null };
  const apex = host.replace(/^www\./, "");
  return { state: "none", hostOptions: [host, host === apex ? `www.${apex}` : apex], defaultHost: host };
}
