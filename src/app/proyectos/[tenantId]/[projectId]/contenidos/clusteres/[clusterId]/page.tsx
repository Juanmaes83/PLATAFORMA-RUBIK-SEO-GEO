import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BriefPill, Hidden } from "@/components/content";
import { Notice } from "@/components/Notice";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { pick } from "@/lib/auth/messages";
import { deleteCluster, editCluster } from "@/lib/content/actions";
import { OPPORTUNITY_TYPE_LABEL } from "@/lib/content/contract";
import { OVERLAP_LABEL, clusterLinks, possibleOverlaps } from "@/lib/content/insights";
import { AUDIT_PENDING, CONTENT_ERRORS, CONTENT_NOTICES } from "@/lib/content/labels";
import { contentPage, type ContentPageContext } from "@/lib/content/page-context";
import { getCluster, listBriefs, listOpportunities, type Cluster } from "@/lib/content/repository";
import { ContentGeoUnavailable } from "@/components/ContentGeoUnavailable";
import { contentGeoSchemaAvailable } from "@/lib/n2/availability";

type Search = { error?: string; aviso?: string; auditoria?: string };

export default async function ClusterPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string; clusterId: string }>;
  searchParams: Promise<Search>;
}) {
  if (!contentGeoSchemaAvailable()) return <ContentGeoUnavailable params={params} title="Contenidos" current="contenidos" />;
  const [ctx, { clusterId }, search] = await Promise.all([contentPage(params), params, searchParams]);
  const cluster = await getCluster(ctx.supabase, ctx.project, clusterId);
  if (!cluster) notFound();
  return (
    <>
      <p className="muted small">{ctx.access.project.name}</p>
      <ProjectNav base={ctx.base} current="contenidos" />
      <p><Link href={`${ctx.base}/contenidos`}>← Volver a contenidos</Link></p>
      <PageHead title={cluster.name}><StatusPill tone="neutral">Clúster temático</StatusPill></PageHead>
      <Notice tone="error" text={pick(CONTENT_ERRORS, search.error)} />
      <Notice tone="info" text={pick(CONTENT_NOTICES, search.aviso)} />
      <Notice tone="info" text={search.auditoria === "pendiente" ? AUDIT_PENDING : null} />
      <Suspense fallback={<p role="status" className="muted">Cargando el clúster…</p>}>
        <ClusterView ctx={ctx} c={cluster} />
      </Suspense>
    </>
  );
}

async function ClusterView({ ctx, c }: { ctx: ContentPageContext; c: Cluster }) {
  const { supabase, project, base, allowed, signing, hidden } = ctx;
  const [members, briefs] = await Promise.all([listOpportunities(supabase, project, { clusterId: c.id }), listBriefs(supabase, project)]);
  const briefOf = new Map(briefs.map((b) => [b.opportunityId, b.status]));
  const pillars = members.filter((o) => o.clusterRole === "pillar");
  const supports = members.filter((o) => o.clusterRole === "support");
  const others = members.filter((o) => !o.clusterRole);
  const links = clusterLinks(members);
  const overlaps = possibleOverlaps(members);
  const group = (title: string, list: typeof members, empty: string) => (
    <>
      <h3>{title}</h3>
      {list.length === 0 ? <p className="muted">{empty}</p> : (
        <ul className="plain">
          {list.map((o) => (
            <li key={o.id}>
              <Link href={`${base}/contenidos/oportunidades/${o.id}`}>{o.topic}</Link>{" "}
              <span className="muted small">{OPPORTUNITY_TYPE_LABEL[o.opportunityType]}{o.pageUrl ? ` · ${o.pageUrl}` : " · página propuesta"}</span>{" "}
              <BriefPill status={briefOf.get(o.id) ?? null} />
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <>
      <dl className="facts">
        <div><dt>Tema principal</dt><dd>{c.mainTopic}</dd></div>
        {c.description && <div><dt>Descripción</dt><dd>{c.description}</dd></div>}
      </dl>

      <section aria-labelledby="cl-estructura" className="section">
        <h2 id="cl-estructura">Estructura</h2>
        {members.length === 0 ? (
          <EmptyState title="Sin oportunidades en este clúster"><p>Asigna oportunidades a este clúster desde su ficha.</p></EmptyState>
        ) : (
          <>
            {group("Posibles páginas pilar", pillars, "Ninguna propuesta como pilar.")}
            {group("Páginas de soporte", supports, "Ninguna página de soporte.")}
            {others.length > 0 && group("Sin papel asignado", others, "")}
          </>
        )}
      </section>

      <section aria-labelledby="cl-enlaces" className="section">
        <h2 id="cl-enlaces">Enlaces internos propuestos</h2>
        {links.length === 0 ? (
          <p className="muted">Hacen falta al menos una posible página pilar y una de soporte para proponer enlaces.</p>
        ) : (
          <ul>{links.map((l) => <li key={`${l.from.id}-${l.to.id}`}>{l.from.topic} → {l.to.topic}</li>)}</ul>
        )}
        <p className="muted small">Propuesta derivada de la estructura del clúster; no comprueba los enlaces que existen hoy en el sitio.</p>
      </section>

      <section aria-labelledby="cl-solapamientos" className="section">
        <h2 id="cl-solapamientos">Posibles solapamientos</h2>
        {overlaps.length === 0 ? <p className="muted">No se detectan solapamientos por tema o página dentro del clúster.</p> : (
          <ul className="plain">{overlaps.map((x) => <li key={`${x.a.id}-${x.b.id}`}><StatusPill tone="warn">{OVERLAP_LABEL[x.reason]}</StatusPill> {x.a.topic} · {x.b.topic}</li>)}</ul>
        )}
        <p className="muted small">Un solapamiento posible no es una canibalización confirmada: no hay datos de posiciones.</p>
      </section>

      {allowed("draft") && signing && (
        <section aria-labelledby="cl-editar" className="section">
          <h2 id="cl-editar">Editar el clúster</h2>
          <form action={editCluster} className="card form">
            <Hidden values={{ ...hidden, id: c.id }} />
            <div className="field"><label htmlFor="ce-name">Nombre</label><input id="ce-name" name="name" required maxLength={120} defaultValue={c.name} autoComplete="off" /></div>
            <div className="field"><label htmlFor="ce-topic">Tema principal</label><input id="ce-topic" name="mainTopic" required maxLength={160} defaultValue={c.mainTopic} autoComplete="off" /></div>
            <div className="field"><label htmlFor="ce-desc">Descripción</label><textarea id="ce-desc" name="description" maxLength={1000} rows={2} defaultValue={c.description ?? ""} /></div>
            <button type="submit" className="btn btn-block">Guardar cambios</button>
          </form>
        </section>
      )}
      {allowed("delete-data") && signing && (
        <section aria-labelledby="cl-borrar" className="section">
          <h2 id="cl-borrar">Borrar el clúster</h2>
          <form action={deleteCluster} className="card form">
            <Hidden values={{ ...hidden, id: c.id }} />
            <p>Las {members.length} oportunidades se conservan, sin clúster.</p>
            <div className="field"><label htmlFor="cl-confirm">Escribe «borrar» para confirmar</label><input id="cl-confirm" name="confirm" autoComplete="off" required /></div>
            <button type="submit" className="btn btn-block">Borrar clúster</button>
          </form>
        </section>
      )}
    </>
  );
}
