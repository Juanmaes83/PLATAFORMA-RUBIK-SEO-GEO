import Link from "next/link";
import { notFound } from "next/navigation";
import { Hidden, ObservationFields, PresencePill, VerificationPill, formatDay, market } from "@/components/geo";
import { Notice } from "@/components/Notice";
import { ProjectNav } from "@/components/ProjectNav";
import { PageHead, StatusPill } from "@/components/ui";
import { pick } from "@/lib/auth/messages";
import { deleteObservation, recordObservation, verifyObservation } from "@/lib/geo/actions";
import { ENGINE_LABEL, METHOD_LABEL, hostOf, isOwnUrl } from "@/lib/geo/contract";
import { AUDIT_PENDING, GEO_ERRORS, GEO_NOTICES } from "@/lib/geo/labels";
import { geoPage, peopleNamer } from "@/lib/geo/page-context";
import { getObservation, listObservations } from "@/lib/geo/repository";
import { coreCitation } from "@/lib/geo/sources";
import { formatDateTime } from "@/lib/format";
import { ContentGeoUnavailable } from "@/components/ContentGeoUnavailable";
import { contentGeoSchemaAvailable } from "@/lib/n2/availability";

type Search = { error?: string; aviso?: string; auditoria?: string };

export default async function ObservationPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string; observationId: string }>;
  searchParams: Promise<Search>;
}) {
  if (!contentGeoSchemaAvailable()) return <ContentGeoUnavailable params={params} title="GEO e IA" current="geo" />;
  const [ctx, { observationId }, search] = await Promise.all([geoPage(params), params, searchParams]);
  // Bound to this project: an id of another project answers 404, like an unknown one.
  const o = await getObservation(ctx.supabase, ctx.project, observationId);
  if (!o) notFound();
  const [all, who] = await Promise.all([listObservations(ctx.supabase, ctx.project), peopleNamer(ctx)]);
  const correctedBy = all.filter((x) => x.supersedesId === o.id);
  const core = coreCitation(o);
  const { base, allowed, signing, hidden } = ctx;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <p className="muted small">{ctx.access.project.name}</p>
      <ProjectNav base={base} current="geo" />
      <p><Link href={`${base}/geo`}>← Volver a GEO e IA</Link></p>
      <PageHead title={`«${o.queryText}»`}><PresencePill presence={o.presence} /></PageHead>
      <Notice tone="error" text={pick(GEO_ERRORS, search.error)} />
      <Notice tone="info" text={pick(GEO_NOTICES, search.aviso)} />
      <Notice tone="info" text={search.auditoria === "pendiente" ? AUDIT_PENDING : null} />
      {correctedBy.length > 0 && (
        <p className="notice notice-info" role="note">
          Esta observación fue corregida por <Link href={`${base}/geo/observaciones/${correctedBy[0].id}`}>otra posterior</Link>; se conserva como historial y no se usa en el análisis.
        </p>
      )}
      <dl className="facts">
        <div><dt>Marca o entidad</dt><dd>{o.entityName}</dd></div>
        <div><dt>Motor declarado</dt><dd>{ENGINE_LABEL[o.engine]}{o.engineDetail ? ` · ${o.engineDetail}` : ""}</dd></div>
        <div><dt>Fecha observada</dt><dd>{formatDay(o.observedOn)}</dd></div>
        <div><dt>Registrada</dt><dd>{who(o.createdBy)} · {formatDateTime(o.createdAt)}</dd></div>
        <div><dt>Mercado</dt><dd>{market(o)}</dd></div>
        <div><dt>Método</dt><dd>{METHOD_LABEL[o.method]}</dd></div>
        <div><dt>Verificación</dt><dd><VerificationPill v={o.verification} />{o.verifiedAt ? ` · ${who(o.verifiedBy)} · ${formatDateTime(o.verifiedAt)}` : ""}</dd></div>
        <div><dt>Mención y cita</dt><dd>Mencionada: {core.mentioned ? "sí" : "no"} · Citada: {core.cited ? "sí" : "no"} <span className="muted small">(una mención sin cita no cuenta como cita)</span></dd></div>
        {o.evidenceReference && <div><dt>Evidencia original</dt><dd>{o.evidenceReference}</dd></div>}
        {o.supersedesId && <div><dt>Corrige</dt><dd><Link href={`${base}/geo/observaciones/${o.supersedesId}`}>la observación anterior</Link></dd></div>}
      </dl>

      <section aria-labelledby="ob-respuesta" className="section">
        <h2 id="ob-respuesta">Fragmento de la respuesta</h2>
        {o.answerExcerpt ? (
          <blockquote className="card" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{o.answerExcerpt}<footer className="muted small">— {ENGINE_LABEL[o.engine]}, {formatDay(o.observedOn)} (declarado)</footer></blockquote>
        ) : <p className="muted">No se registró fragmento.</p>}
      </section>

      <section aria-labelledby="ob-fuentes" className="section">
        <h2 id="ob-fuentes">Fuentes citadas</h2>
        {o.citedSources.length === 0 ? <p className="muted">La respuesta observada no citaba fuentes (o no se registraron).</p> : (
          <ul className="plain">
            {o.citedSources.map((s) => (
              <li key={s.url} className="break">
                <StatusPill tone={isOwnUrl(s.url, ctx.project.domain) ? "ok" : "neutral"}>{isOwnUrl(s.url, ctx.project.domain) ? "Dominio del proyecto" : hostOf(s.url) ?? "Otro dominio"}</StatusPill>{" "}
                {s.title || "(sin título)"} — <span className="small">{s.url}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">Las URLs se muestran como texto: la plataforma no las visita.</p>
        <h3>Otras entidades mencionadas</h3>
        {o.mentionedEntities.length === 0 ? <p className="muted">Ninguna registrada.</p> : <ul>{o.mentionedEntities.map((e) => <li key={e}>{e}</li>)}</ul>}
        {o.notes && <><h3>Notas</h3><p>{o.notes}</p></>}
      </section>

      {o.verification === "declared" && allowed("approve-fact") && signing && (
        <section aria-labelledby="ob-verificar" className="section">
          <h2 id="ob-verificar">Verificar</h2>
          <form action={verifyObservation} className="card form">
            <Hidden values={{ ...hidden, id: o.id }} />
            <p>Verifica solo si has comprobado la evidencia original (captura, exportación o enlace). La verificación queda atribuida a ti.</p>
            <button type="submit" className="btn btn-block">Marcar como verificada</button>
          </form>
        </section>
      )}

      {allowed("draft") && signing && (
        <details className="legend">
          <summary>Registrar una corrección</summary>
          <form action={recordObservation} className="card form">
            <Hidden values={{ ...hidden, supersedes: o.id }} />
            <p className="muted small">La observación actual no se modifica: la corrección queda como una nueva que la sustituye en el análisis.</p>
            <ObservationFields idPrefix="co" today={today} d={{ entity: o.entityName, engine: o.engine, engineDetail: o.engineDetail, query: o.queryText,
              language: o.marketLanguage, country: o.marketCountry, method: o.method }} />
            <button type="submit" className="btn btn-block">Registrar corrección</button>
          </form>
        </details>
      )}

      {allowed("delete-data") && signing && (
        <section aria-labelledby="ob-borrar" className="section">
          <h2 id="ob-borrar">Borrar</h2>
          <form action={deleteObservation} className="card form">
            <Hidden values={{ ...hidden, id: o.id }} />
            <div className="field"><label htmlFor="ob-confirm">Escribe «borrar» para confirmar</label><input id="ob-confirm" name="confirm" autoComplete="off" required /></div>
            <button type="submit" className="btn btn-block">Borrar observación</button>
          </form>
        </section>
      )}
      {!allowed("draft") && !allowed("approve-fact") && <p className="muted">Tu rol en este proyecto permite consultar esta observación, no modificarla.</p>}
    </>
  );
}
