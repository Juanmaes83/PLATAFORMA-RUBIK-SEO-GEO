import Link from "next/link";
import { Suspense } from "react";
import { Hidden, OpportunityCard, OpportunityFields } from "@/components/content";
import { Notice } from "@/components/Notice";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { pick } from "@/lib/auth/messages";
import { createCluster, createOpportunity } from "@/lib/content/actions";
import { OPPORTUNITY_STATUS_LABEL, OPPORTUNITY_STATUSES, type OpportunityStatus } from "@/lib/content/contract";
import { OVERLAP_LABEL, possibleOverlaps, supportOf, type Support } from "@/lib/content/insights";
import { AUDIT_PENDING, CONTENT_ERRORS, CONTENT_NOTICES } from "@/lib/content/labels";
import { contentPage, type ContentPageContext } from "@/lib/content/page-context";
import { linkableSources, listBriefs, listClusters, listEvidence, listOpportunities } from "@/lib/content/repository";
import { competitorSource, keywordSource, UNAVAILABLE_METRICS } from "@/lib/content/sources";

type Search = { error?: string; aviso?: string; auditoria?: string; estado?: string };

export default async function ContentPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string }>;
  searchParams: Promise<Search>;
}) {
  const [ctx, search] = await Promise.all([contentPage(params), searchParams]);
  return (
    <>
      <p className="muted small">{ctx.access.project.name}</p>
      <ProjectNav base={ctx.base} current="contenidos" />
      <PageHead title="Contenidos">
        <StatusPill tone="neutral">Propuestas editoriales · nada se publica</StatusPill>
      </PageHead>
      <Notice tone="error" text={pick(CONTENT_ERRORS, search.error)} />
      <Notice tone="info" text={pick(CONTENT_NOTICES, search.aviso)} />
      <Notice tone="info" text={search.auditoria === "pendiente" ? AUDIT_PENDING : null} />
      <p className="lead">¿Qué contenido deberíamos crear o mejorar, por qué y qué evidencia lo respalda?</p>
      <Suspense fallback={<p role="status" className="muted">Cargando oportunidades, clústeres y briefs…</p>}>
        <ContentView ctx={ctx} estado={search.estado} />
      </Suspense>
    </>
  );
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, unset: 3 } as const;
const SUPPORT_ORDER: Record<Support, number> = { observed: 0, declared: 1, hypothesis: 2 };

async function ContentView({ ctx, estado }: { ctx: ContentPageContext; estado?: string }) {
  const { supabase, project, base, allowed, signing, hidden } = ctx;
  const [opportunities, clusters, evidence, briefs, sources] = await Promise.all([
    listOpportunities(supabase, project), listClusters(supabase, project), listEvidence(supabase, project), listBriefs(supabase, project),
    linkableSources(supabase, project),
  ]);
  const canDraft = allowed("draft") && signing;
  const filter = (OPPORTUNITY_STATUSES as readonly string[]).includes(estado ?? "") ? (estado as OpportunityStatus) : null;
  const kinds = new Map<string, typeof evidence>();
  for (const e of evidence) kinds.set(e.opportunityId, [...(kinds.get(e.opportunityId) ?? []), e]);
  const support = (id: string) => supportOf((kinds.get(id) ?? []).map((e) => e.kind));
  const briefOf = new Map(briefs.map((b) => [b.opportunityId, b.status]));
  const clusterOf = new Map(clusters.map((c) => [c.id, c]));
  const shown = opportunities
    .filter((o) => (filter ? o.status === filter : o.status !== "discarded" && o.status !== "done"))
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || SUPPORT_ORDER[support(a.id)] - SUPPORT_ORDER[support(b.id)]
      || a.topic.localeCompare(b.topic));
  const overlaps = possibleOverlaps(opportunities);
  const count = (s: OpportunityStatus) => opportunities.filter((o) => o.status === s).length;
  const hypotheses = opportunities.filter((o) => o.status === "open" && support(o.id) === "hypothesis").length;
  const local = opportunities.filter((o) => o.searchIntent === "local" && o.status !== "discarded");

  return (
    <>
      <dl className="facts">
        <div><dt>Oportunidades abiertas</dt><dd>{count("open")}{hypotheses > 0 ? ` (${hypotheses} solo con hipótesis)` : ""}</dd></div>
        <div><dt>Planificadas</dt><dd>{count("planned")}</dd></div>
        <div><dt>Briefs en revisión / aprobados</dt><dd>{briefs.filter((b) => b.status === "in-review").length} / {briefs.filter((b) => b.status === "approved").length}</dd></div>
      </dl>

      <section aria-labelledby="c-oportunidades" className="section">
        <h2 id="c-oportunidades">Oportunidades de contenido</h2>
        <nav aria-label="Filtrar por estado" className="subnav">
          <ul>
            <li><Link href={`${base}/contenidos`} aria-current={filter ? undefined : "page"}>Activas</Link></li>
            {OPPORTUNITY_STATUSES.map((s) => (
              <li key={s}><Link href={`${base}/contenidos?estado=${s}`} aria-current={filter === s ? "page" : undefined}>{OPPORTUNITY_STATUS_LABEL[s]}</Link></li>
            ))}
          </ul>
        </nav>
        {opportunities.length === 0 ? (
          <EmptyState title="Sin oportunidades">
            <p>Este proyecto todavía no tiene oportunidades de contenido.{canDraft ? " Registra la primera más abajo con su justificación." : ""}</p>
          </EmptyState>
        ) : shown.length === 0 ? (
          <p className="muted">No hay oportunidades en este estado.</p>
        ) : (
          <ul className="cards">
            {shown.map((o) => (
              <OpportunityCard key={o.id} o={o} href={`${base}/contenidos/oportunidades/${o.id}`} support={support(o.id)}
                evidence={kinds.get(o.id)?.length ?? 0} brief={briefOf.get(o.id) ?? null} cluster={o.clusterId ? clusterOf.get(o.clusterId) ?? null : null} />
            ))}
          </ul>
        )}
        <p className="muted small">
          La prioridad es una propuesta con su motivo. «Basada en hipótesis» significa que la oportunidad no tiene todavía datos
          observados ni fuentes declaradas.
        </p>
      </section>

      {overlaps.length > 0 && (
        <section aria-labelledby="c-solapamientos" className="section">
          <h2 id="c-solapamientos">Posibles solapamientos</h2>
          <ul className="plain">
            {overlaps.map((x) => (
              <li key={`${x.a.id}-${x.b.id}`}>
                <StatusPill tone="warn">{OVERLAP_LABEL[x.reason]}</StatusPill>{" "}
                <Link href={`${base}/contenidos/oportunidades/${x.a.id}`}>{x.a.topic}</Link> y{" "}
                <Link href={`${base}/contenidos/oportunidades/${x.b.id}`}>{x.b.topic}</Link>
              </li>
            ))}
          </ul>
          <p className="muted small">
            No es una canibalización confirmada: confirmarla requiere datos de posiciones o de Search Console por consulta, que
            no están disponibles. Revisa si conviene consolidar o diferenciar la intención.
          </p>
        </section>
      )}

      <section aria-labelledby="c-clusteres" className="section">
        <h2 id="c-clusteres">Clústeres temáticos</h2>
        {clusters.length === 0 ? (
          <EmptyState title="Sin clústeres">
            <p>Agrupa oportunidades por tema para proponer una página pilar, sus páginas de soporte y los enlaces entre ellas.</p>
          </EmptyState>
        ) : (
          <ul className="cards">
            {clusters.map((c) => {
              const members = opportunities.filter((o) => o.clusterId === c.id);
              return (
                <li key={c.id} className="card">
                  <div className="card-head"><h3><Link href={`${base}/contenidos/clusteres/${c.id}`}>{c.name}</Link></h3></div>
                  <dl className="facts">
                    <div><dt>Tema principal</dt><dd>{c.mainTopic}</dd></div>
                    <div><dt>Oportunidades</dt><dd>{members.length} · {members.filter((o) => o.clusterRole === "pillar").length} posible(s) pilar</dd></div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
        {canDraft && (
          <details className="legend">
            <summary>Crear un clúster</summary>
            <form action={createCluster} className="card form">
              <Hidden values={hidden} />
              <div className="field"><label htmlFor="cl-name">Nombre del clúster</label><input id="cl-name" name="name" required maxLength={120} autoComplete="off" /></div>
              <div className="field"><label htmlFor="cl-topic">Tema principal</label><input id="cl-topic" name="mainTopic" required maxLength={160} autoComplete="off" /></div>
              <div className="field"><label htmlFor="cl-desc">Descripción (opcional)</label><textarea id="cl-desc" name="description" maxLength={1000} rows={2} /></div>
              <button type="submit" className="btn btn-block">Crear clúster</button>
            </form>
          </details>
        )}
      </section>

      <section aria-labelledby="c-nueva" className="section">
        <h2 id="c-nueva">Nueva oportunidad</h2>
        {!allowed("draft") ? (
          <p className="muted">Tu rol en este proyecto permite consultar las oportunidades, no proponerlas.</p>
        ) : !signing ? (
          <EmptyState title="Edición no disponible" requires={["Claves de firma de auditoría y escritor de auditoría configurados en el servidor (ADR 0004, S1)"]}>
            <p>Cada cambio deja un registro de auditoría firmado. Sin la firma configurada no se guarda nada.</p>
          </EmptyState>
        ) : (
          <form action={createOpportunity} className="card form">
            <Hidden values={hidden} />
            <OpportunityFields clusters={clusters} idPrefix="op" defaultLanguage="es" />
            <button type="submit" className="btn btn-block">Crear oportunidad</button>
          </form>
        )}
      </section>

      <section aria-labelledby="c-fuentes" className="section">
        <h2 id="c-fuentes">Fuentes de datos</h2>
        <table className="rtable">
          <caption>Qué datos respaldan hoy las oportunidades de este proyecto</caption>
          <thead><tr><th scope="col">Fuente</th><th scope="col">Estado</th><th scope="col">Cómo se usa</th></tr></thead>
          <tbody>
            <tr><th scope="row">Resultados de proveedor guardados (OpenSEO, firmados)</th>
              <td data-label="Estado">{sources.results.length > 0 ? `${sources.results.length} disponibles` : "Ninguno guardado"}</td>
              <td data-label="Uso" className="explain">Se vinculan como dato observado; la firma se comprueba al consultarlos.</td></tr>
            <tr><th scope="row">Importaciones (rubik-import-v1)</th>
              <td data-label="Estado">{sources.imports.length > 0 ? `${sources.imports.length} disponibles` : "Ninguna"}</td>
              <td data-label="Uso" className="explain">Se vinculan como hallazgo declarado, con su fuente y fecha de captura.</td></tr>
            <tr><th scope="row">Palabras clave declaradas</th><td data-label="Estado"><StatusPill tone="neutral">No integrado</StatusPill></td>
              <td data-label="Uso" className="explain">Pendiente de {keywordSource.state.integrated ? "" : keywordSource.state.pendingOn}.</td></tr>
            <tr><th scope="row">Observaciones de competidores</th><td data-label="Estado"><StatusPill tone="neutral">No integrado</StatusPill></td>
              <td data-label="Uso" className="explain">Pendiente de {competitorSource.state.integrated ? "" : competitorSource.state.pendingOn}.</td></tr>
            <tr><th scope="row">{UNAVAILABLE_METRICS.join(", ")}</th><td data-label="Estado"><StatusPill tone="neutral">No disponible</StatusPill></td>
              <td data-label="Uso" className="explain">Sin fuente válida en la plataforma: no se muestran ni se estiman.</td></tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="c-local" className="section">
        <h2 id="c-local">SEO local y reputación</h2>
        <p>
          {local.length === 0 ? "No hay oportunidades con intención local." : `${local.length} oportunidad(es) con intención local.`}
          {" "}Las páginas de ubicación y las áreas de servicio se proponen como oportunidades con intención «Local».
        </p>
        <EmptyState
          title="Perfil de empresa, reseñas y directorios: no conectados"
          requires={["Acceso autorizado y contrato verificado de Google Business Profile", "Decisión del propietario sobre reseñas y directorios", "Datos de negocio (NAP) declarados por el cliente: siguiente paquete"]}
          nextStep="Declarar nombre, dirección y teléfono, áreas de servicio y páginas de ubicación, y comparar su consistencia con observaciones documentadas. Nada se publicará en perfiles ni directorios."
        >
          <p>No se consultan ni se publican fichas, reseñas, respuestas ni citas.</p>
        </EmptyState>
      </section>
    </>
  );
}
