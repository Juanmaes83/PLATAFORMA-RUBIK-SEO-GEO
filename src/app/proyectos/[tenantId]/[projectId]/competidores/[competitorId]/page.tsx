import Link from "next/link";
import { notFound } from "next/navigation";
import { MethodPill, ObservationForm, VerificationPill, formatDay, formatValue, market } from "@/components/competitors";
import { Notice } from "@/components/Notice";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { pick } from "@/lib/auth/messages";
import { requireSession } from "@/lib/auth/session";
import {
  changeCompetitorStatus, confirmObservation, deleteCompetitor, deleteObservation, editCompetitor, recordObservation,
} from "@/lib/competitors/actions";
import { writerReady } from "@/lib/competitors/audit";
import { buildSeries } from "@/lib/competitors/compare";
import { METHOD_LABEL, METRIC_LABEL, RELATION_LABEL } from "@/lib/competitors/contract";
import { AUDIT_PENDING, COMPETITOR_ERRORS, COMPETITOR_NOTICES } from "@/lib/competitors/labels";
import { getCompetitor, listObservations, loadCompetitorProject } from "@/lib/competitors/repository";
import { formatDateTime } from "@/lib/format";
import { serverKeyring } from "@/lib/provenance/keyring";
import { myProjectMembership } from "@/lib/tenancy";

export default async function CompetitorPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string; competitorId: string }>;
  searchParams: Promise<{ error?: string; aviso?: string; auditoria?: string }>;
}) {
  const [{ tenantId, projectId, competitorId }, { error, aviso, auditoria }, { user, supabase }] = await Promise.all([params, searchParams, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  const ref = await loadCompetitorProject(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  if (!ref) notFound();
  // Bound to this project: an id of another project's competitor answers 404, like an unknown one.
  const competitor = await getCompetitor(supabase, ref, competitorId);
  if (!competitor) notFound();
  const observations = await listObservations(supabase, ref, competitor.id);
  const series = buildSeries(observations);
  const allowed = (action: string) => access.permissions.find((p) => p.action === action)?.decision.allowed === true;
  const signing = serverKeyring() !== null && writerReady();
  const canDraft = allowed("draft") && signing;
  const canReview = allowed("review-action") && signing;
  const canVerify = allowed("approve-fact") && signing;
  const canErase = allowed("delete-data") && signing;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;
  const list = `${base}/competidores`;
  const today = new Date().toISOString().slice(0, 10);
  const archived = competitor.status === "archived";
  const hidden = (
    <>
      <input type="hidden" name="tenant" value={project.tenantId} />
      <input type="hidden" name="project" value={project.projectId} />
      <input type="hidden" name="competitor" value={competitor.id} />
    </>
  );

  return (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current="competidores" />
      <p><Link href={list}>← Volver a competidores</Link></p>
      <PageHead title={competitor.name ?? competitor.domain}>
        {archived ? <StatusPill tone="no">Archivado</StatusPill> : <StatusPill tone="neutral">{RELATION_LABEL[competitor.relation]}</StatusPill>}
      </PageHead>
      <Notice tone="error" text={pick(COMPETITOR_ERRORS, error)} />
      <Notice tone="info" text={pick(COMPETITOR_NOTICES, aviso)} />
      <Notice tone="info" text={auditoria === "pendiente" ? AUDIT_PENDING : null} />

      <dl className="facts">
        <div><dt>Dominio</dt><dd className="break">{competitor.domain}</dd></div>
        <div><dt>Tipo</dt><dd>{RELATION_LABEL[competitor.relation]}</dd></div>
        {competitor.notes && <div><dt>Descripción</dt><dd>{competitor.notes}</dd></div>}
        <div><dt>Añadido</dt><dd>{formatDateTime(competitor.createdAt)}</dd></div>
        <div><dt>Última modificación</dt><dd>{formatDateTime(competitor.updatedAt)}</dd></div>
        {archived && <div><dt>Archivado</dt><dd>{formatDateTime(competitor.archivedAt)}</dd></div>}
      </dl>

      <section aria-labelledby="o-historial" className="section" id="observaciones">
        <h2 id="o-historial">Observaciones e historial</h2>
        {observations.length === 0 ? (
          <EmptyState title="Sin mediciones">
            <p>Este competidor todavía no tiene observaciones. No se muestra ninguna cifra estimada.</p>
          </EmptyState>
        ) : (
          series.map((s) => (
            <table key={s.key} className="rtable">
              <caption>
                {METRIC_LABEL[s.metric]} · {s.sourceName} · {METHOD_LABEL[s.method].toLowerCase()} · {market(s)}
              </caption>
              <thead>
                <tr><th scope="col">Fecha</th><th scope="col">Valor</th><th scope="col">Estado</th><th scope="col">Detalle</th><th scope="col">Acciones</th></tr>
              </thead>
              <tbody>
                {[...s.points].reverse().map((o) => (
                  <tr key={o.id}>
                    <th scope="row">{formatDay(o.observedOn)}</th>
                    <td data-label="Valor">{o.availability === "available" ? formatValue(o.value as number) : <em>No disponible</em>}</td>
                    <td data-label="Estado"><MethodPill o={o} /> <VerificationPill o={o} /></td>
                    <td data-label="Detalle" className="explain">
                      <span className="small">Registrado {formatDateTime(o.createdAt)}{o.sourceReference ? ` · Referencia: ${o.sourceReference}` : ""}{o.notes ? ` · ${o.notes}` : ""}</span>
                    </td>
                    <td data-label="Acciones">
                      {canVerify && o.verification === "unverified" && (
                        <form action={confirmObservation}>
                          {hidden}
                          <input type="hidden" name="id" value={o.id} />
                          <button type="submit" className="btn btn-ghost">Verificar</button>
                        </form>
                      )}
                      {canErase && (
                        <form action={deleteObservation}>
                          {hidden}
                          <input type="hidden" name="id" value={o.id} />
                          <button type="submit" className="btn btn-ghost" aria-label={`Borrar la observación del ${formatDay(o.observedOn)}`}>Borrar</button>
                        </form>
                      )}
                      {!canVerify && !canErase && <span className="muted small">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="explain">
                    {s.change
                      ? `Evolución en esta serie: ${s.change.delta > 0 ? "+" : ""}${formatValue(s.change.delta)} entre el ${formatDay(s.change.from.observedOn)} y el ${formatDay(s.change.to.observedOn)} (misma fuente, método y mercado).`
                      : "Una sola medición disponible en esta serie: todavía no hay evolución."}
                  </td>
                </tr>
              </tfoot>
            </table>
          ))
        )}
        {series.length > 1 && (
          <p className="muted small">Cada tabla es una serie distinta (fuente, método o mercado). No se mezclan entre sí.</p>
        )}
      </section>

      {canDraft && !archived && (
        <section aria-labelledby="o-nueva" className="section">
          <h2 id="o-nueva">Registrar una observación</h2>
          <ObservationForm action={recordObservation} tenant={project.tenantId} project={project.projectId} competitor={competitor.id} today={today} idPrefix="obs" />
        </section>
      )}
      {archived && <p className="muted">Competidor archivado: consulta su historial; para registrar observaciones, restáuralo.</p>}

      {canDraft && (
        <section aria-labelledby="c-editar" className="section">
          <h2 id="c-editar">Editar datos</h2>
          <form action={editCompetitor} className="card form">
            {hidden}
            <input type="hidden" name="id" value={competitor.id} />
            <div className="field">
              <label htmlFor="e-name">Nombre</label>
              <input id="e-name" name="name" maxLength={120} defaultValue={competitor.name ?? ""} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="e-relation">Tipo de competidor</label>
              <select id="e-relation" name="relation" defaultValue={competitor.relation}>
                <option value="direct">Directo</option>
                <option value="indirect">Indirecto</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="e-notes">Descripción</label>
              <input id="e-notes" name="notes" maxLength={1000} defaultValue={competitor.notes ?? ""} autoComplete="off" />
            </div>
            <p className="muted small">El dominio no se puede cambiar: para otro dominio, añade otro competidor.</p>
            <button type="submit" className="btn btn-block">Guardar cambios</button>
          </form>
        </section>
      )}

      {(canReview || canErase) && (
        <section aria-labelledby="c-gestion" className="section">
          <h2 id="c-gestion">Archivar o borrar</h2>
          {canReview && (
            <form action={changeCompetitorStatus} className="card form">
              {hidden}
              <input type="hidden" name="id" value={competitor.id} />
              <input type="hidden" name="status" value={archived ? "active" : "archived"} />
              <p>{archived ? "Restaurar permite volver a registrar observaciones." : "Archivar lo retira de la comparación y conserva todas sus observaciones."}</p>
              <button type="submit" className="btn btn-block">{archived ? "Restaurar competidor" : "Archivar competidor"}</button>
            </form>
          )}
          {canErase && (
            <form action={deleteCompetitor} className="card form">
              {hidden}
              <input type="hidden" name="id" value={competitor.id} />
              <p>Borrar elimina el competidor y sus {observations.length} observaciones. El registro de auditoría conserva que se borró.</p>
              <div className="field">
                <label htmlFor="d-confirm">Escribe «borrar» para confirmar</label>
                <input id="d-confirm" name="confirm" autoComplete="off" required />
              </div>
              <button type="submit" className="btn btn-block">Borrar competidor</button>
            </form>
          )}
        </section>
      )}
      {!signing && (allowed("draft") || allowed("review-action")) && (
        <EmptyState title="Edición no disponible" requires={["Claves de firma de auditoría y escritor de auditoría configurados en el servidor (ADR 0004, S1)"]}>
          <p>Sin la firma configurada no se guarda ningún cambio.</p>
        </EmptyState>
      )}
      {!allowed("draft") && !allowed("approve-fact") && (
        <p className="muted">Tu rol en este proyecto permite consultar este competidor, no modificarlo.</p>
      )}
    </>
  );
}
