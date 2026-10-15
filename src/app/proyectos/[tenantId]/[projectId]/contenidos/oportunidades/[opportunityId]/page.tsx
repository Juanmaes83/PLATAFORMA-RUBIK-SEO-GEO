import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BriefPill, Hidden, OpportunityFields, PriorityPill, formatDay, market } from "@/components/content";
import { Notice } from "@/components/Notice";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { pick } from "@/lib/auth/messages";
import { addEvidence, changeOpportunityStatus, deleteEvidence, deleteOpportunity, startBrief } from "@/lib/content/actions";
import { editOpportunity } from "@/lib/content/actions";
import {
  CLUSTER_ROLE_LABEL, EVIDENCE_KIND_LABEL, EVIDENCE_KINDS, INTENT_LABEL, OPPORTUNITY_STATUS_LABEL, OPPORTUNITY_STATUSES, OPPORTUNITY_TYPE_LABEL,
  PRIORITY_LABEL,
} from "@/lib/content/contract";
import { SUPPORT_LABEL, supportOf } from "@/lib/content/insights";
import { AUDIT_PENDING, CONTENT_ERRORS, CONTENT_NOTICES } from "@/lib/content/labels";
import { contentPage, peopleNamer, type ContentPageContext } from "@/lib/content/page-context";
import { getBriefFor, getCluster, getOpportunity, linkableSources, listClusters, listEvidence, type Evidence, type Opportunity } from "@/lib/content/repository";
import { formatDateTime } from "@/lib/format";
import { serverKeyring } from "@/lib/provenance/keyring";
import { loadProviderResult } from "@/lib/provenance/repository";

type Search = { error?: string; aviso?: string; auditoria?: string };

export default async function OpportunityPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string; opportunityId: string }>;
  searchParams: Promise<Search>;
}) {
  const [ctx, { opportunityId }, search] = await Promise.all([contentPage(params), params, searchParams]);
  // Bound to this project: an id of another project's opportunity answers 404, like an unknown one.
  const opportunity = await getOpportunity(ctx.supabase, ctx.project, opportunityId);
  if (!opportunity) notFound();
  const evidence = await listEvidence(ctx.supabase, ctx.project, opportunity.id);
  const support = supportOf(evidence.map((e) => e.kind));
  return (
    <>
      <p className="muted small">{ctx.access.project.name}</p>
      <ProjectNav base={ctx.base} current="contenidos" />
      <p><Link href={`${ctx.base}/contenidos`}>← Volver a contenidos</Link></p>
      <PageHead title={opportunity.topic}>
        <PriorityPill priority={opportunity.priority} support={support} />
      </PageHead>
      <Notice tone="error" text={pick(CONTENT_ERRORS, search.error)} />
      <Notice tone="info" text={pick(CONTENT_NOTICES, search.aviso)} />
      <Notice tone="info" text={search.auditoria === "pendiente" ? AUDIT_PENDING : null} />
      <Suspense fallback={<p role="status" className="muted">Cargando evidencias y brief…</p>}>
        <OpportunityView ctx={ctx} o={opportunity} evidence={evidence} />
      </Suspense>
    </>
  );
}

async function verification(ctx: ContentPageContext, e: Evidence): Promise<{ tone: "ok" | "warn" | "no" | "neutral"; text: string }> {
  if (e.kind === "provider-result") {
    if (!e.providerResultId) return { tone: "no", text: "Fuente original borrada; se conserva la referencia" };
    const keyring = serverKeyring();
    if (!keyring) return { tone: "neutral", text: "Firma no comprobable: claves no configuradas" };
    const r = await loadProviderResult(ctx.supabase, ctx.project, e.providerResultId, keyring);
    if (!r.ok) return { tone: "no", text: "Resultado no disponible" };
    return r.verification.verified ? { tone: "ok", text: "Firma verificada" } : { tone: "no", text: "Firma no válida" };
  }
  if (e.kind === "import-finding") return e.importId ? { tone: "neutral", text: "Dato declarado, no verificado" } : { tone: "no", text: "Importación borrada; se conserva la referencia" };
  if (e.kind === "manual-source") return { tone: "neutral", text: "Fuente no verificada por la plataforma" };
  return { tone: "warn", text: "Propuesta del analista, sin datos" };
}

async function OpportunityView({ ctx, o, evidence }: { ctx: ContentPageContext; o: Opportunity; evidence: Evidence[] }) {
  const { supabase, project, base, allowed, signing, hidden } = ctx;
  const [cluster, clusters, brief, sources, who] = await Promise.all([
    o.clusterId ? getCluster(supabase, project, o.clusterId) : null, listClusters(supabase, project), getBriefFor(supabase, project, o.id),
    linkableSources(supabase, project), peopleNamer(ctx),
  ]);
  const checks = await Promise.all(evidence.map((e) => verification(ctx, e)));
  const canDraft = allowed("draft") && signing;
  const canErase = allowed("delete-data") && signing;
  const support = supportOf(evidence.map((e) => e.kind));
  const ids = { ...hidden, opportunity: o.id };
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <dl className="facts">
        <div><dt>Tipo</dt><dd>{OPPORTUNITY_TYPE_LABEL[o.opportunityType]}</dd></div>
        <div><dt>Intención declarada y mercado</dt><dd>{INTENT_LABEL[o.searchIntent]} · {market(o)}</dd></div>
        <div><dt>Página</dt><dd className="break">{o.pageUrl ?? "Página nueva, sin dirección todavía"} ({o.pageKind === "existing" ? "existente" : "propuesta"})</dd></div>
        <div><dt>Estado</dt><dd>{OPPORTUNITY_STATUS_LABEL[o.status]}</dd></div>
        <div><dt>Clúster</dt><dd>{cluster ? <Link href={`${base}/contenidos/clusteres/${cluster.id}`}>{cluster.name}</Link> : "Sin clúster"}{o.clusterRole ? ` · ${CLUSTER_ROLE_LABEL[o.clusterRole]}` : ""}</dd></div>
        <div><dt>Prioridad propuesta</dt><dd>{PRIORITY_LABEL[o.priority]}{o.priorityReason ? `: ${o.priorityReason}` : ""} ({SUPPORT_LABEL[support].toLowerCase()})</dd></div>
        <div><dt>Propuesta por</dt><dd>{who(o.createdBy)} · {formatDateTime(o.createdAt)}</dd></div>
      </dl>
      <h2>Justificación</h2>
      <p>{o.rationale}</p>
      <p className="muted small">Volumen, dificultad, posiciones y CTR: no disponibles (sin fuente válida en la plataforma).</p>

      <section aria-labelledby="o-evidencias" className="section" id="evidencias">
        <h2 id="o-evidencias">Evidencias</h2>
        {evidence.length === 0 ? (
          <EmptyState title="Sin evidencias">
            <p>Esta oportunidad es, por ahora, una hipótesis. Vincula un resultado guardado, una importación o una fuente consultada.</p>
          </EmptyState>
        ) : (
          <ul className="cards">
            {evidence.map((e, i) => (
              <li key={e.id} className="card">
                <div className="card-head"><h3>{e.title}</h3><StatusPill tone={checks[i].tone}>{checks[i].text}</StatusPill></div>
                <p className="small">{EVIDENCE_KIND_LABEL[e.kind]}{e.sourceDate ? ` · ${formatDay(e.sourceDate)}` : ""}</p>
                {e.detail && <p>{e.detail}</p>}
                {e.sourceUrl && <p className="small break">Dirección (no se visita): {e.sourceUrl}</p>}
                <p className="small muted">Añadida por {who(e.createdBy)} · {formatDateTime(e.createdAt)}</p>
                {canErase && (
                  <form action={deleteEvidence}>
                    <Hidden values={{ ...ids, id: e.id }} />
                    <button type="submit" className="btn btn-ghost" aria-label={`Borrar la evidencia «${e.title}»`}>Borrar evidencia</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {canDraft && (
          <details className="legend">
            <summary>Añadir evidencia</summary>
            <form action={addEvidence} className="card form">
              <Hidden values={ids} />
              <div className="field">
                <label htmlFor="ev-kind">Tipo de evidencia</label>
                <select id="ev-kind" name="kind" defaultValue="manual-source">
                  {EVIDENCE_KINDS.map((k) => <option key={k} value={k}>{EVIDENCE_KIND_LABEL[k]}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ev-result">Resultado de proveedor guardado (solo para ese tipo)</label>
                <select id="ev-result" name="providerResult" defaultValue="">
                  <option value="">{sources.results.length === 0 ? "No hay resultados guardados" : "Elige un resultado"}</option>
                  {sources.results.map((r) => <option key={r.id} value={r.id}>{r.label} · {formatDay(r.date)}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ev-import">Importación (solo para ese tipo)</label>
                <select id="ev-import" name="import" defaultValue="">
                  <option value="">{sources.imports.length === 0 ? "No hay importaciones" : "Elige una importación"}</option>
                  {sources.imports.map((r) => <option key={r.id} value={r.id}>{r.label} · {formatDay(r.date)}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ev-title">Título (fuente consultada o propuesta)</label>
                <input id="ev-title" name="title" maxLength={200} autoComplete="off" />
              </div>
              <div className="field">
                <label htmlFor="ev-detail">Detalle</label>
                <textarea id="ev-detail" name="detail" maxLength={2000} rows={3} aria-describedby="ev-detail-help" />
                <p id="ev-detail-help" className="muted small">Qué muestra la fuente o en qué se basa la propuesta. Obligatorio para una propuesta del analista.</p>
              </div>
              <div className="field">
                <label htmlFor="ev-url">Dirección de la fuente (opcional, no se visita)</label>
                <input id="ev-url" name="sourceUrl" maxLength={2048} inputMode="url" autoComplete="off" />
              </div>
              <div className="field">
                <label htmlFor="ev-date">Fecha de consulta (fuente consultada)</label>
                <input id="ev-date" name="sourceDate" type="date" max={today} min="2000-01-01" />
              </div>
              <p className="muted small">En resultados e importaciones, el título y la fecha se toman de la fuente guardada.</p>
              <button type="submit" className="btn btn-block">Añadir evidencia</button>
            </form>
          </details>
        )}
      </section>

      <section aria-labelledby="o-brief" className="section">
        <h2 id="o-brief">Brief editorial</h2>
        {brief ? (
          <p><BriefPill status={brief.status} /> <Link href={`${base}/contenidos/oportunidades/${o.id}/brief`}>Abrir el brief (versión {brief.version})</Link></p>
        ) : canDraft ? (
          <form action={startBrief}>
            <Hidden values={ids} />
            <p>Todavía no hay brief. Se crea en borrador con el tema, la intención y el mercado de esta oportunidad.</p>
            <button type="submit" className="btn">Preparar brief</button>
          </form>
        ) : (
          <p className="muted">Todavía no hay brief.</p>
        )}
      </section>

      {canDraft && (
        <section aria-labelledby="o-seguimiento" className="section">
          <h2 id="o-seguimiento">Seguimiento</h2>
          <form action={changeOpportunityStatus} className="card form">
            <Hidden values={{ ...hidden, id: o.id }} />
            <div className="field">
              <label htmlFor="o-status">Estado de la oportunidad</label>
              <select id="o-status" name="status" defaultValue={o.status}>
                {OPPORTUNITY_STATUSES.map((s) => <option key={s} value={s}>{OPPORTUNITY_STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-block">Actualizar estado</button>
          </form>
          <details className="legend">
            <summary>Editar la oportunidad</summary>
            <form action={editOpportunity} className="card form">
              <Hidden values={{ ...hidden, id: o.id }} />
              <OpportunityFields o={o} clusters={clusters} idPrefix="eo" defaultLanguage="es" />
              <button type="submit" className="btn btn-block">Guardar cambios</button>
            </form>
          </details>
        </section>
      )}

      {canErase && (
        <section aria-labelledby="o-borrar" className="section">
          <h2 id="o-borrar">Borrar</h2>
          <form action={deleteOpportunity} className="card form">
            <Hidden values={{ ...hidden, id: o.id }} />
            <p>Borra la oportunidad, sus {evidence.length} evidencias y su brief. El registro de auditoría conserva que se borró.</p>
            <div className="field">
              <label htmlFor="o-confirm">Escribe «borrar» para confirmar</label>
              <input id="o-confirm" name="confirm" autoComplete="off" required />
            </div>
            <button type="submit" className="btn btn-block">Borrar oportunidad</button>
          </form>
        </section>
      )}
      {!allowed("draft") && <p className="muted">Tu rol en este proyecto permite consultar esta oportunidad, no modificarla.</p>}
    </>
  );
}
