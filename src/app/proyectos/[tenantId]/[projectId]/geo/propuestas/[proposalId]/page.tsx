import Link from "next/link";
import { notFound } from "next/navigation";
import { Hidden, PresencePill, PriorityPill, VerificationPill, formatDay } from "@/components/geo";
import { Notice } from "@/components/Notice";
import { ProjectNav } from "@/components/ProjectNav";
import { PageHead, StatusPill } from "@/components/ui";
import { pick } from "@/lib/auth/messages";
import { deleteProposal, reviewProposal } from "@/lib/geo/actions";
import { ENGINE_LABEL } from "@/lib/geo/contract";
import { AUDIT_PENDING, GEO_ERRORS, GEO_NOTICES } from "@/lib/geo/labels";
import { geoPage, peopleNamer } from "@/lib/geo/page-context";
import { getProposal, listObservations } from "@/lib/geo/repository";
import { RULE_LABEL } from "@/lib/geo/rules";
import { contentTarget } from "@/lib/geo/sources";
import { formatDateTime } from "@/lib/format";

type Search = { error?: string; aviso?: string; auditoria?: string };
const STATUS: Record<string, string> = { proposed: "Pendiente de revisión", accepted: "Aceptada", rejected: "Rechazada", done: "Hecha" };

export default async function ProposalPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string; proposalId: string }>;
  searchParams: Promise<Search>;
}) {
  const [ctx, { proposalId }, search] = await Promise.all([geoPage(params), params, searchParams]);
  const p = await getProposal(ctx.supabase, ctx.project, proposalId);
  if (!p) notFound();
  const [observations, who] = await Promise.all([listObservations(ctx.supabase, ctx.project), peopleNamer(ctx)]);
  const byId = new Map(observations.map((o) => [o.id, o]));
  const { base, allowed, signing, hidden } = ctx;
  const canReview = allowed("review-action") && signing;
  const step = (name: string, label: string, ghost = false) => (
    <form action={reviewProposal}><Hidden values={{ ...hidden, id: p.id, step: name }} /><button type="submit" className={ghost ? "btn btn-ghost" : "btn"}>{label}</button></form>
  );

  return (
    <>
      <p className="muted small">{ctx.access.project.name}</p>
      <ProjectNav base={base} current="geo" />
      <p><Link href={`${base}/geo`}>← Volver a GEO e IA</Link></p>
      <PageHead title={p.title}><PriorityPill p={p.priority} /></PageHead>
      <Notice tone="error" text={pick(GEO_ERRORS, search.error)} />
      <Notice tone="info" text={pick(GEO_NOTICES, search.aviso)} />
      <Notice tone="info" text={search.auditoria === "pendiente" ? AUDIT_PENDING : null} />
      <dl className="facts">
        <div><dt>Estado</dt><dd>{STATUS[p.status]}{p.reviewedAt ? ` · ${who(p.reviewedBy)} · ${formatDateTime(p.reviewedAt)}` : ""}</dd></div>
        <div><dt>Regla</dt><dd>{RULE_LABEL[p.rule]}</dd></div>
        <div><dt>Consulta</dt><dd>«{p.queryText}»</dd></div>
        <div><dt>Problema</dt><dd>{p.problem}</dd></div>
        <div><dt>Hipótesis (no comprobada)</dt><dd>{p.hypothesis}</dd></div>
        <div><dt>Acción sugerida</dt><dd>{p.suggestedAction}</dd></div>
        <div><dt>Prioridad y motivo</dt><dd>{p.priorityReason}</dd></div>
        {p.limitations && <div><dt>Limitaciones y riesgos</dt><dd>{p.limitations}</dd></div>}
        {p.reviewNote && <div><dt>Nota de revisión</dt><dd>{p.reviewNote}</dd></div>}
        <div><dt>Propuesta por</dt><dd>{who(p.createdBy)} · {formatDateTime(p.createdAt)}</dd></div>
      </dl>

      <section aria-labelledby="pr-evidencia" className="section">
        <h2 id="pr-evidencia">Evidencia</h2>
        <ul className="plain">
          {p.evidenceIds.map((id) => {
            const o = byId.get(id);
            return o ? (
              <li key={id}><Link href={`${base}/geo/observaciones/${id}`}>{ENGINE_LABEL[o.engine]} · {formatDay(o.observedOn)}</Link> <PresencePill presence={o.presence} /> <VerificationPill v={o.verification} /></li>
            ) : <li key={id} className="muted">Observación borrada después de crear la propuesta.</li>;
          })}
        </ul>
      </section>

      <section aria-labelledby="pr-contenidos" className="section">
        <h2 id="pr-contenidos">Llevar a contenidos</h2>
        <p><StatusPill tone="neutral">No integrado</StatusPill> Crear una oportunidad o un brief desde aquí queda pendiente de {contentTarget.state.integrated ? "" : contentTarget.state.pendingOn}.</p>
      </section>

      {canReview && (
        <section aria-labelledby="pr-revision" className="section">
          <h2 id="pr-revision">Revisión</h2>
          <div className="actions">
            {p.status === "proposed" && step("accept", "Aceptar propuesta")}
            {p.status === "proposed" && step("reject", "Rechazar", true)}
            {p.status === "accepted" && step("done", "Marcar como hecha")}
            {p.status === "accepted" && step("reject", "Rechazar", true)}
            {p.status === "rejected" && step("reopen", "Reabrir", true)}
          </div>
        </section>
      )}
      {!canReview && p.status === "proposed" && <p className="muted">Pendiente de revisión por el titular o la gestora de la cuenta.</p>}

      {allowed("delete-data") && signing && (
        <section aria-labelledby="pr-borrar" className="section">
          <h2 id="pr-borrar">Borrar</h2>
          <form action={deleteProposal} className="card form">
            <Hidden values={{ ...hidden, id: p.id }} />
            <div className="field"><label htmlFor="pr-confirm">Escribe «borrar» para confirmar</label><input id="pr-confirm" name="confirm" autoComplete="off" required /></div>
            <button type="submit" className="btn btn-block">Borrar propuesta</button>
          </form>
        </section>
      )}
    </>
  );
}
