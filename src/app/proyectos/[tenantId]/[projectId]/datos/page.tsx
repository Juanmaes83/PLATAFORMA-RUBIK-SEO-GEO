import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { loadProjectRef } from "@/lib/imports/repository";
import { PEOPLE_ERRORS } from "@/lib/people-messages";
import { projectInventory, type DatedCount } from "@/lib/project-people";
import { myProjectMembership } from "@/lib/tenancy";

// Read-only inventory of what the project stores (docs/RETENCION-Y-BORRADO.md §3), to answer an
// access request. Counts and dates only: no content is shown here and nothing can be changed.
export default async function DataInventoryPage({ params }: { params: Promise<{ tenantId: string; projectId: string }> }) {
  const [{ tenantId, projectId }, { user, supabase }] = await Promise.all([params, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;
  const ref = await loadProjectRef(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  if (!ref) notFound();
  const r = await projectInventory(supabase, ref.projectId);
  const span = (d: DatedCount) => d.count === 0 ? "—" : `${formatDateTime(d.first)} – ${formatDateTime(d.last)}`;

  return (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current={null} />
      <PageHead title="Datos guardados del proyecto" />
      {!r.ok ? (
        r.error === "PEOPLE_FORBIDDEN" ? (
          <EmptyState title="Solo la titularidad de la organización ve el inventario">
            <p>Tu rol no permite consultar el inventario de datos de este proyecto.</p>
          </EmptyState>
        ) : (
          <EmptyState title="Inventario no disponible" requires={["Migración 20261012100000 aplicada al Supabase alojado"]}>
            <p>{PEOPLE_ERRORS[r.error]}</p>
          </EmptyState>
        )
      ) : (
        <>
          <p>
            Recuento de lo que este proyecto guarda en la plataforma, para responder a una solicitud de acceso. Solo lectura: aquí no se muestra el
            contenido ni se puede borrar nada. La exportación completa está en <Link href={`${base}/exportar`}>Exportar</Link>.
          </p>
          <section aria-labelledby="d-registros" className="section">
            <h2 id="d-registros">Registros con fecha</h2>
            <dl className="facts">
              <div><dt>Eventos de auditoría firmada</dt><dd>{r.inventory.auditEvents.count} · {span(r.inventory.auditEvents)}</dd></div>
              <div><dt>Resultados de proveedores</dt><dd>{r.inventory.providerResults.count} · {span(r.inventory.providerResults)}</dd></div>
              <div><dt>Importaciones manuales</dt><dd>{r.inventory.imports.count} · {span(r.inventory.imports)}</dd></div>
            </dl>
          </section>
          <section aria-labelledby="d-acceso" className="section">
            <h2 id="d-acceso">Acceso</h2>
            <dl className="facts">
              <div><dt>Personas en el proyecto</dt><dd>{r.inventory.projectMembers}</dd></div>
              <div><dt>Personas en la organización</dt><dd>{r.inventory.organizationMembers}</dd></div>
              <div><dt>Invitaciones abiertas</dt><dd>{r.inventory.invitations.open}</dd></div>
              <div><dt>Invitaciones cerradas (aceptadas, revocadas o caducadas)</dt><dd>{r.inventory.invitations.closed}</dd></div>
            </dl>
          </section>
          <section aria-labelledby="d-operacion" className="section">
            <h2 id="d-operacion">Operación</h2>
            <dl className="facts">
              <div><dt>Trabajos de OpenSEO</dt><dd>{r.inventory.openseoJobs}</dd></div>
              <div><dt>Conexiones de OpenSEO</dt><dd>{r.inventory.openseoConnections}</dd></div>
              <div><dt>Propiedades de Search Console y Bing (directas)</dt><dd>{r.inventory.webmasterProperties}</dd></div>
              <div><dt>Propiedades de Google asociadas en OpenSEO</dt><dd>{r.inventory.googleProperties}</dd></div>
              <div><dt>Capturas manuales de Google (registro)</dt><dd>{r.inventory.googleCaptures}</dd></div>
              <div><dt>Presupuestos</dt><dd>{r.inventory.budgets}</dd></div>
              <div><dt>Movimientos de consumo</dt><dd>{r.inventory.spendEntries}</dd></div>
            </dl>
          </section>
          <p className="muted small">
            Generado el {formatDateTime(r.inventory.generatedAt)}. No incluye lo que guardan fuera de la plataforma Supabase Auth (cuentas), Vercel
            (registros) ni OpenSEO (OAuth de Google y auditorías).
          </p>
        </>
      )}
      <p><Link href={base}>← Volver al proyecto</Link></p>
    </>
  );
}
