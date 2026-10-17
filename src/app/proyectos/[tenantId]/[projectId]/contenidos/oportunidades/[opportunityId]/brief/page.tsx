import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BriefPill, Hidden, market } from "@/components/content";
import { Notice } from "@/components/Notice";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead } from "@/components/ui";
import { pick } from "@/lib/auth/messages";
import { deleteBrief, reviewBrief, saveBrief, startBrief } from "@/lib/content/actions";
import { EVIDENCE_KIND_LABEL, INTENT_LABEL, INTENTS, linksText, outlineText } from "@/lib/content/contract";
import { briefReadiness, clusterLinks } from "@/lib/content/insights";
import { AUDIT_PENDING, CONTENT_ERRORS, CONTENT_NOTICES } from "@/lib/content/labels";
import { contentPage, peopleNamer, type ContentPageContext } from "@/lib/content/page-context";
import { getBriefFor, getOpportunity, listEvidence, listOpportunities, type Brief, type Opportunity } from "@/lib/content/repository";
import { formatDateTime } from "@/lib/format";
import { ContentGeoUnavailable } from "@/components/ContentGeoUnavailable";
import { contentGeoSchemaAvailable } from "@/lib/n2/availability";

type Search = { error?: string; aviso?: string; auditoria?: string };

export default async function BriefPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string; opportunityId: string }>;
  searchParams: Promise<Search>;
}) {
  if (!contentGeoSchemaAvailable()) return <ContentGeoUnavailable params={params} title="Contenidos" current="contenidos" />;
  const [ctx, { opportunityId }, search] = await Promise.all([contentPage(params), params, searchParams]);
  const opportunity = await getOpportunity(ctx.supabase, ctx.project, opportunityId);
  if (!opportunity) notFound();
  const brief = await getBriefFor(ctx.supabase, ctx.project, opportunity.id);
  return (
    <>
      <p className="muted small">{ctx.access.project.name}</p>
      <ProjectNav base={ctx.base} current="contenidos" />
      <p><Link href={`${ctx.base}/contenidos/oportunidades/${opportunity.id}`}>← Volver a la oportunidad</Link></p>
      <PageHead title={`Brief: ${brief?.mainTopic ?? opportunity.topic}`}>
        <BriefPill status={brief?.status ?? null} />
      </PageHead>
      <Notice tone="error" text={pick(CONTENT_ERRORS, search.error)} />
      <Notice tone="info" text={pick(CONTENT_NOTICES, search.aviso)} />
      <Notice tone="info" text={search.auditoria === "pendiente" ? AUDIT_PENDING : null} />
      <p className="notice notice-info" role="note">
        Un brief es una propuesta editorial para redactar, no un artículo verificado. Aprobarlo no publica nada.
      </p>
      {brief ? (
        <Suspense fallback={<p role="status" className="muted">Cargando el brief…</p>}>
          <BriefView ctx={ctx} o={opportunity} b={brief} />
        </Suspense>
      ) : ctx.allowed("draft") && ctx.signing ? (
        <form action={startBrief}>
          <Hidden values={{ ...ctx.hidden, opportunity: opportunity.id }} />
          <EmptyState title="Sin brief"><p>Esta oportunidad todavía no tiene brief.</p></EmptyState>
          <button type="submit" className="btn">Preparar brief</button>
        </form>
      ) : (
        <EmptyState title="Sin brief"><p>Esta oportunidad todavía no tiene brief.</p></EmptyState>
      )}
    </>
  );
}

async function BriefView({ ctx, o, b }: { ctx: ContentPageContext; o: Opportunity; b: Brief }) {
  const { supabase, project, base, allowed, signing, hidden } = ctx;
  const [evidence, siblings, who] = await Promise.all([
    listEvidence(supabase, project, o.id), o.clusterId ? listOpportunities(supabase, project, { clusterId: o.clusterId }) : Promise.resolve([]), peopleNamer(ctx),
  ]);
  const readiness = briefReadiness(b, evidence.length);
  const suggested = clusterLinks(siblings).filter((l) => l.from.id === o.id);
  const ids = { ...hidden, opportunity: o.id, id: b.id };
  const editable = b.status === "draft" && allowed("draft") && signing;
  const canPropose = allowed("propose-action") && signing;
  const canReview = allowed("review-action") && signing;

  return (
    <>
      <section aria-labelledby="b-revision" className="section">
        <h2 id="b-revision">Revisión</h2>
        <dl className="facts">
          <div><dt>Versión</dt><dd>{b.version}</dd></div>
          <div><dt>Creado</dt><dd>{who(b.createdBy)} · {formatDateTime(b.createdAt)}</dd></div>
          {b.submittedAt && <div><dt>Enviado a revisión</dt><dd>{who(b.submittedBy)} · {formatDateTime(b.submittedAt)}</dd></div>}
          {b.reviewedAt && <div><dt>Última revisión</dt><dd>{who(b.reviewedBy)} · {formatDateTime(b.reviewedAt)}</dd></div>}
          {b.approvedAt && <div><dt>Aprobado</dt><dd>{who(b.approvedBy)} · {formatDateTime(b.approvedAt)}</dd></div>}
          {b.archivedAt && <div><dt>Archivado</dt><dd>{formatDateTime(b.archivedAt)}</dd></div>}
          {b.reviewNote && <div><dt>Nota de revisión</dt><dd>{b.reviewNote}</dd></div>}
        </dl>
        {b.status === "draft" && (
          readiness.missing.length > 0 ? (
            <div className="empty" role="note">
              <p className="empty-title">{readiness.ready ? "Listo para revisión, con recomendaciones" : "Falta para enviarlo a revisión"}</p>
              <ul>{readiness.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          ) : <p className="muted">Completo: puede enviarse a revisión.</p>
        )}
        <div className="actions">
          {b.status === "draft" && canPropose && readiness.ready && (
            <form action={reviewBrief}><Hidden values={{ ...ids, step: "submit" }} /><button type="submit" className="btn">Enviar a revisión</button></form>
          )}
          {b.status === "in-review" && canReview && (
            <form action={reviewBrief}><Hidden values={{ ...ids, step: "approve" }} /><button type="submit" className="btn">Aprobar brief</button></form>
          )}
          {b.status !== "archived" && canReview && (
            <form action={reviewBrief}><Hidden values={{ ...ids, step: "archive" }} /><button type="submit" className="btn btn-ghost">Archivar</button></form>
          )}
          {b.status === "archived" && canReview && (
            <form action={reviewBrief}><Hidden values={{ ...ids, step: "restore" }} /><button type="submit" className="btn btn-ghost">Restaurar a borrador</button></form>
          )}
        </div>
        {b.status === "in-review" && canReview && (
          <form action={reviewBrief} className="card form">
            <Hidden values={{ ...ids, step: "return" }} />
            <div className="field">
              <label htmlFor="b-note">Nota para devolverlo a borrador</label>
              <textarea id="b-note" name="note" required maxLength={500} rows={2} />
            </div>
            <button type="submit" className="btn btn-block">Devolver a borrador</button>
          </form>
        )}
        {b.status === "in-review" && !canReview && <p className="muted">En revisión: lo aprueba o lo devuelve una persona con permiso de revisión (titular o gestor de cuenta).</p>}
      </section>

      <section aria-labelledby="b-contenido" className="section">
        <h2 id="b-contenido">Contenido del brief</h2>
        <dl className="facts">
          <div><dt>Objetivo</dt><dd>{b.objective ?? <em>Sin definir</em>}</dd></div>
          <div><dt>Audiencia</dt><dd>{b.audience ?? <em>Sin definir</em>}</dd></div>
          <div><dt>Intención y mercado</dt><dd>{INTENT_LABEL[b.searchIntent]} · {market(b)}</dd></div>
          <div><dt>Página objetivo</dt><dd className="break">{b.targetUrl ?? "Página nueva, sin dirección todavía"}</dd></div>
          <div><dt>Responsable</dt><dd>{b.assignee ?? <em>Sin asignar</em>}</dd></div>
          <div><dt>Llamada a la acción</dt><dd>{b.cta ?? <em>Sin definir</em>}</dd></div>
        </dl>
        <h3>Estructura propuesta</h3>
        {b.outline.length === 0 ? <p className="muted">Sin estructura.</p> : (
          <ul className="plain">{b.outline.map((i, n) => <li key={n} style={{ paddingLeft: `${(i.level - 1) * 1.25}rem` }}><span className="muted small">H{i.level}</span> {i.text}</li>)}</ul>
        )}
        <h3>Preguntas que debe responder</h3>
        {b.questions.length === 0 ? <p className="muted">Ninguna todavía.</p> : <ul>{b.questions.map((q) => <li key={q}>{q}</li>)}</ul>}
        <h3>Enlaces internos candidatos</h3>
        {b.internalLinks.length === 0 && suggested.length === 0 ? <p className="muted">Ninguno todavía.</p> : (
          <ul>
            {b.internalLinks.map((l) => <li key={l.url} className="break">{l.anchor || "(sin texto)"} → {l.url}</li>)}
            {suggested.map((l) => (
              <li key={l.to.id}>Sugerido por el clúster: <Link href={`${base}/contenidos/oportunidades/${l.to.id}`}>{l.to.topic}</Link>{l.to.pageUrl ? ` (${l.to.pageUrl})` : " (página propuesta)"}</li>
            ))}
          </ul>
        )}
        <h3>Fuentes consultadas</h3>
        {evidence.length === 0 && !b.sourcesConsulted ? <p className="muted">Ninguna: el brief se apoya solo en la justificación de la oportunidad.</p> : (
          <ul>
            {evidence.map((e) => <li key={e.id}>{EVIDENCE_KIND_LABEL[e.kind]}: {e.title}</li>)}
            {b.sourcesConsulted && <li>{b.sourcesConsulted}</li>}
          </ul>
        )}
        <h3>Datos originales necesarios</h3>
        <p>{b.originalData ?? <em className="muted">Sin indicar</em>}</p>
        <h3>Riesgos y afirmaciones por verificar</h3>
        <p>{b.risks ?? <em className="muted">Sin indicar</em>}</p>
      </section>

      {editable && (
        <section aria-labelledby="b-editar" className="section">
          <h2 id="b-editar">Editar el brief</h2>
          <form action={saveBrief} className="card form">
            <Hidden values={ids} />
            <div className="field"><label htmlFor="bf-objective">Objetivo</label><textarea id="bf-objective" name="objective" maxLength={1000} rows={2} defaultValue={b.objective ?? ""} /></div>
            <div className="field"><label htmlFor="bf-audience">Audiencia</label><textarea id="bf-audience" name="audience" maxLength={500} rows={2} defaultValue={b.audience ?? ""} /></div>
            <div className="field"><label htmlFor="bf-topic">Tema principal</label><input id="bf-topic" name="mainTopic" required maxLength={160} defaultValue={b.mainTopic} autoComplete="off" /></div>
            <div className="grid-2">
              <div className="field"><label htmlFor="bf-language">Idioma</label><input id="bf-language" name="language" required maxLength={2} defaultValue={b.marketLanguage} autoComplete="off" /></div>
              <div className="field"><label htmlFor="bf-country">País (opcional)</label><input id="bf-country" name="country" maxLength={2} defaultValue={b.marketCountry ?? ""} autoComplete="off" /></div>
            </div>
            <div className="field">
              <label htmlFor="bf-intent">Intención</label>
              <select id="bf-intent" name="intent" defaultValue={b.searchIntent}>{INTENTS.map((t) => <option key={t} value={t}>{INTENT_LABEL[t]}</option>)}</select>
            </div>
            <div className="field"><label htmlFor="bf-target">Página objetivo (opcional)</label><input id="bf-target" name="targetUrl" maxLength={2048} inputMode="url" defaultValue={b.targetUrl ?? ""} autoComplete="off" /></div>
            <div className="field">
              <label htmlFor="bf-outline">Estructura (H1/H2/H3)</label>
              <textarea id="bf-outline" name="outline" rows={6} defaultValue={outlineText(b.outline)} aria-describedby="bf-outline-help" />
              <p id="bf-outline-help" className="muted small">Una línea por encabezado: «# Título», «## Sección», «### Apartado». Un solo H1.</p>
            </div>
            <div className="field">
              <label htmlFor="bf-questions">Preguntas que debe responder</label>
              <textarea id="bf-questions" name="questions" rows={4} defaultValue={b.questions.join("\n")} aria-describedby="bf-questions-help" />
              <p id="bf-questions-help" className="muted small">Una pregunta por línea.</p>
            </div>
            <div className="field">
              <label htmlFor="bf-links">Enlaces internos candidatos</label>
              <textarea id="bf-links" name="internalLinks" rows={3} defaultValue={linksText(b.internalLinks)} aria-describedby="bf-links-help" />
              <p id="bf-links-help" className="muted small">Uno por línea: «/ruta | texto del enlace».</p>
            </div>
            <div className="field"><label htmlFor="bf-sources">Otras fuentes consultadas</label><textarea id="bf-sources" name="sourcesConsulted" maxLength={2000} rows={2} defaultValue={b.sourcesConsulted ?? ""} /></div>
            <div className="field"><label htmlFor="bf-data">Datos originales necesarios</label><textarea id="bf-data" name="originalData" maxLength={2000} rows={2} defaultValue={b.originalData ?? ""} /></div>
            <div className="field"><label htmlFor="bf-risks">Riesgos y afirmaciones por verificar</label><textarea id="bf-risks" name="risks" maxLength={2000} rows={2} defaultValue={b.risks ?? ""} /></div>
            <div className="field"><label htmlFor="bf-cta">Llamada a la acción prevista</label><input id="bf-cta" name="cta" maxLength={300} defaultValue={b.cta ?? ""} autoComplete="off" /></div>
            <div className="field"><label htmlFor="bf-assignee">Responsable</label><input id="bf-assignee" name="assignee" maxLength={120} defaultValue={b.assignee ?? ""} autoComplete="off" /></div>
            <button type="submit" className="btn btn-block">Guardar brief</button>
          </form>
        </section>
      )}
      {b.status !== "draft" && allowed("draft") && <p className="muted">Solo un brief en borrador se puede editar.</p>}

      {allowed("delete-data") && signing && (
        <section aria-labelledby="b-borrar" className="section">
          <h2 id="b-borrar">Borrar brief</h2>
          <form action={deleteBrief} className="card form">
            <Hidden values={ids} />
            <div className="field"><label htmlFor="b-confirm">Escribe «borrar» para confirmar</label><input id="b-confirm" name="confirm" autoComplete="off" required /></div>
            <button type="submit" className="btn btn-block">Borrar brief</button>
          </form>
        </section>
      )}
    </>
  );
}
