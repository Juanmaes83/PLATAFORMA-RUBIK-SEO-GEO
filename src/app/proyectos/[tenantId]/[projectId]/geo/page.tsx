import Link from "next/link";
import { Suspense } from "react";
import { Hidden, ObservationFields, PresencePill, PriorityPill, VerificationPill, formatDay, market } from "@/components/geo";
import { Notice } from "@/components/Notice";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { pick } from "@/lib/auth/messages";
import { createProposal, recordObservation } from "@/lib/geo/actions";
import { ENGINE_LABEL, ENGINES, queryKey, type Engine } from "@/lib/geo/contract";
import { AUDIT_PENDING, GEO_ERRORS, GEO_NOTICES } from "@/lib/geo/labels";
import { geoPage, type GeoPageContext } from "@/lib/geo/page-context";
import { OBSERVATION_LIMIT, listObservations, listProposals } from "@/lib/geo/repository";
import { RULE_LABEL, groupObservations, opportunities } from "@/lib/geo/rules";
import { ENGINE_CONNECTIONS, competitorNames, contentTarget, keywordQuestions } from "@/lib/geo/sources";

type Search = { error?: string; aviso?: string; auditoria?: string; motor?: string; estado?: string; q?: string };
const PROPOSAL_STATUS: Record<string, string> = { proposed: "Pendiente de revisión", accepted: "Aceptada", rejected: "Rechazada", done: "Hecha" };

export default async function GeoPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string }>;
  searchParams: Promise<Search>;
}) {
  const [ctx, search] = await Promise.all([geoPage(params), searchParams]);
  return (
    <>
      <p className="muted small">{ctx.access.project.name}</p>
      <ProjectNav base={ctx.base} current="geo" />
      <PageHead title="GEO e IA">
        <StatusPill tone="neutral">Observaciones manuales · ningún motor conectado</StatusPill>
      </PageHead>
      <Notice tone="error" text={pick(GEO_ERRORS, search.error)} />
      <Notice tone="info" text={pick(GEO_NOTICES, search.aviso)} />
      <Notice tone="info" text={search.auditoria === "pendiente" ? AUDIT_PENDING : null} />
      <p className="lead">¿Dónde y cómo aparece la marca en respuestas de motores generativos, qué evidencia lo respalda y qué conviene mejorar?</p>
      <p>
        Registra lo que ves al preguntar a un motor (ChatGPT, Gemini, Perplexity, AI Overviews…): la consulta exacta, la fecha, si la
        marca aparece o se cita y qué fuentes enlaza. Cada registro es una <strong>observación declarada</strong> hasta que una
        persona con permiso la verifica. No se calculan rankings ni porcentajes de visibilidad.
      </p>
      <Suspense fallback={<p role="status" className="muted">Cargando observaciones y oportunidades…</p>}>
        <GeoView ctx={ctx} search={search} />
      </Suspense>
    </>
  );
}

async function GeoView({ ctx, search }: { ctx: GeoPageContext; search: Search }) {
  const { supabase, project, base, allowed, signing, hidden } = ctx;
  const [observations, proposals] = await Promise.all([listObservations(supabase, project), listProposals(supabase, project)]);
  const canDraft = allowed("draft") && signing;
  const engine = (ENGINES as readonly string[]).includes(search.motor ?? "") ? (search.motor as Engine) : null;
  const state = search.estado === "declared" || search.estado === "verified" ? search.estado : null;
  const q = (search.q ?? "").trim().slice(0, 200);
  const filtered = observations.filter((o) => (!engine || o.engine === engine) && (!state || o.verification === state)
    && (!q || queryKey(o.queryText).includes(queryKey(q))));
  const groups = groupObservations(observations);
  const opps = opportunities(observations, project.domain);
  const openKeys = new Set(proposals.filter((p) => p.status === "proposed" || p.status === "accepted").map((p) => `${p.rule}|${queryKey(p.queryText)}`));
  const today = new Date().toISOString().slice(0, 10);
  const filterHref = (patch: Partial<Search>) => {
    const next = { motor: engine ?? undefined, estado: state ?? undefined, q: q || undefined, ...patch };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
    return `${base}/geo${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <dl className="facts">
        <div><dt>Observaciones</dt><dd>{observations.length} ({observations.filter((o) => o.verification === "verified").length} verificadas)</dd></div>
        <div><dt>Consultas distintas</dt><dd>{groups.length}</dd></div>
        <div><dt>Propuestas pendientes de revisión</dt><dd>{proposals.filter((p) => p.status === "proposed").length}</dd></div>
      </dl>

      {observations.length === 0 ? (
        <section aria-labelledby="g-inicio" className="section">
          <h2 id="g-inicio">Cómo empezar</h2>
          <EmptyState title="Sin observaciones" nextStep="Registra la primera observación: pregunta a un motor lo que preguntaría un cliente y anota la respuesta tal cual.">
            <p>Este proyecto todavía no tiene observaciones GEO. Sin observaciones no hay oportunidades: no se inventan resultados.</p>
          </EmptyState>
        </section>
      ) : (
        <>
          <section aria-labelledby="g-oportunidades" className="section">
            <h2 id="g-oportunidades">Oportunidades</h2>
            {opps.length === 0 ? <p className="muted">Las observaciones actuales no sugieren ninguna oportunidad.</p> : (
              <ul className="cards">
                {opps.map((o) => {
                  const saved = openKeys.has(`${o.rule}|${queryKey(o.queryText)}`);
                  return (
                    <li key={`${o.rule}-${o.key}`} className="card">
                      <div className="card-head"><h3>{o.title}</h3><PriorityPill p={o.priority} /></div>
                      <p className="small"><StatusPill tone="neutral">{RULE_LABEL[o.rule]}</StatusPill> · {o.priorityReason}</p>
                      <dl className="facts">
                        <div><dt>Problema</dt><dd>{o.problem}</dd></div>
                        <div><dt>Hipótesis</dt><dd>{o.hypothesis}</dd></div>
                        <div><dt>Acción sugerida</dt><dd>{o.suggestedAction}</dd></div>
                        <div><dt>Evidencia</dt><dd>{o.evidence.map((e, i) => (
                          <span key={e.id}>{i > 0 && ", "}<Link href={`${base}/geo/observaciones/${e.id}`}>{ENGINE_LABEL[e.engine]} {formatDay(e.observedOn)}</Link></span>
                        ))}</dd></div>
                      </dl>
                      {saved ? <p className="muted small">Ya hay una propuesta abierta para esta oportunidad.</p> : canDraft && (
                        <form action={createProposal}>
                          <Hidden values={{ ...hidden, rule: o.rule, key: o.key }} />
                          <button type="submit" className="btn btn-ghost">Guardar como propuesta</button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="muted small">Reglas deterministas sobre las observaciones registradas. No garantizan aparecer ni ser citado en un motor.</p>
          </section>

          <section aria-labelledby="g-consultas" className="section">
            <h2 id="g-consultas">Consultas observadas</h2>
            {groups.map((g) => (
              <table key={g.key} className="rtable">
                <caption>«{g.queryText}» · {market(g)}</caption>
                <thead><tr><th scope="col">Motor y método</th><th scope="col">Última presencia</th><th scope="col">Fecha</th><th scope="col">Estado</th></tr></thead>
                <tbody>
                  {g.latest.map((o) => (
                    <tr key={o.id}>
                      <th scope="row"><Link href={`${base}/geo/observaciones/${o.id}`}>{ENGINE_LABEL[o.engine]}{o.engineDetail ? ` (${o.engineDetail})` : ""}</Link></th>
                      <td data-label="Presencia"><PresencePill presence={o.presence} /></td>
                      <td data-label="Fecha">{formatDay(o.observedOn)}</td>
                      <td data-label="Estado"><VerificationPill v={o.verification} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
            <p className="muted small">Cada fila es una serie comparable (misma consulta, mercado, motor y método). Filas de motores distintos no se comparan entre sí.</p>
          </section>

          <section aria-labelledby="g-observaciones" className="section">
            <h2 id="g-observaciones">Observaciones</h2>
            <nav aria-label="Filtrar por motor" className="subnav">
              <ul>
                <li><Link href={filterHref({ motor: undefined })} aria-current={engine ? undefined : "page"}>Todos los motores</Link></li>
                {ENGINES.filter((e) => observations.some((o) => o.engine === e)).map((e) => (
                  <li key={e}><Link href={filterHref({ motor: e })} aria-current={engine === e ? "page" : undefined}>{ENGINE_LABEL[e]}</Link></li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Filtrar por estado" className="subnav">
              <ul>
                <li><Link href={filterHref({ estado: undefined })} aria-current={state ? undefined : "page"}>Todas</Link></li>
                <li><Link href={filterHref({ estado: "declared" })} aria-current={state === "declared" ? "page" : undefined}>Declaradas</Link></li>
                <li><Link href={filterHref({ estado: "verified" })} aria-current={state === "verified" ? "page" : undefined}>Verificadas</Link></li>
              </ul>
            </nav>
            <form action={`${base}/geo`} method="get" className="form" role="search">
              {engine && <input type="hidden" name="motor" value={engine} />}
              {state && <input type="hidden" name="estado" value={state} />}
              <div className="field"><label htmlFor="g-q">Buscar en las consultas</label><input id="g-q" name="q" defaultValue={q} maxLength={200} autoComplete="off" /></div>
              <button type="submit" className="btn btn-ghost">Buscar</button>
            </form>
            {filtered.length === 0 ? <p className="muted">Ninguna observación coincide con el filtro.</p> : (
              <ul className="cards">
                {filtered.map((o) => (
                  <li key={o.id} className="card">
                    <div className="card-head"><h3><Link href={`${base}/geo/observaciones/${o.id}`}>«{o.queryText}»</Link></h3><PresencePill presence={o.presence} /></div>
                    <p className="small">{o.entityName} · {ENGINE_LABEL[o.engine]} · {formatDay(o.observedOn)} · {market(o)}</p>
                    <p className="small"><VerificationPill v={o.verification} />{o.citedSources.length > 0 ? ` · ${o.citedSources.length} fuente(s) citada(s)` : ""}{o.supersedesId ? " · corrige una observación anterior" : ""}</p>
                  </li>
                ))}
              </ul>
            )}
            {observations.length >= OBSERVATION_LIMIT && <p className="muted small">Se muestran las {OBSERVATION_LIMIT} observaciones más recientes.</p>}
          </section>
        </>
      )}

      <section aria-labelledby="g-propuestas" className="section">
        <h2 id="g-propuestas">Propuestas para revisión</h2>
        {proposals.length === 0 ? <p className="muted">Ninguna propuesta guardada. Guarda una oportunidad para someterla a revisión humana.</p> : (
          <ul className="plain">
            {proposals.map((p) => (
              <li key={p.id}><Link href={`${base}/geo/propuestas/${p.id}`}>{p.title}</Link> <StatusPill tone={p.status === "accepted" || p.status === "done" ? "ok" : p.status === "rejected" ? "no" : "warn"}>{PROPOSAL_STATUS[p.status]}</StatusPill></li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="g-nueva" className="section">
        <h2 id="g-nueva">Registrar una observación</h2>
        {!allowed("draft") ? (
          <p className="muted">Tu rol en este proyecto permite consultar las observaciones, no registrarlas.</p>
        ) : !signing ? (
          <EmptyState title="Registro no disponible" requires={["Claves de firma de auditoría y escritor de auditoría configurados en el servidor (ADR 0004, S1)"]}>
            <p>Cada registro deja una entrada de auditoría firmada. Sin la firma configurada no se guarda nada.</p>
          </EmptyState>
        ) : (
          <form action={recordObservation} className="card form">
            <Hidden values={hidden} />
            <ObservationFields idPrefix="ob" today={today} />
            <button type="submit" className="btn btn-block">Registrar observación</button>
          </form>
        )}
      </section>

      <section aria-labelledby="g-fuentes" className="section">
        <h2 id="g-fuentes">Fuentes y límites</h2>
        <table className="rtable">
          <caption>De dónde salen los datos de esta sección</caption>
          <thead><tr><th scope="col">Fuente</th><th scope="col">Estado</th><th scope="col">Detalle</th></tr></thead>
          <tbody>
            <tr><th scope="row">Consultas automáticas a motores</th><td data-label="Estado"><StatusPill tone="neutral">No conectado</StatusPill></td><td data-label="Detalle" className="explain">{ENGINE_CONNECTIONS.reason}</td></tr>
            <tr><th scope="row">Observaciones manuales</th><td data-label="Estado"><StatusPill tone="ok">Disponible</StatusPill></td><td data-label="Detalle" className="explain">Declaradas por el equipo; verificables por titular o aprobador del cliente.</td></tr>
            <tr><th scope="row">Contenidos y briefs</th><td data-label="Estado"><StatusPill tone="neutral">No integrado</StatusPill></td><td data-label="Detalle" className="explain">Pendiente de {contentTarget.state.integrated ? "" : contentTarget.state.pendingOn}.</td></tr>
            <tr><th scope="row">Competidores</th><td data-label="Estado"><StatusPill tone="neutral">No integrado</StatusPill></td><td data-label="Detalle" className="explain">Pendiente de {competitorNames.state.integrated ? "" : competitorNames.state.pendingOn}.</td></tr>
            <tr><th scope="row">Palabras clave</th><td data-label="Estado"><StatusPill tone="neutral">No integrado</StatusPill></td><td data-label="Detalle" className="explain">Pendiente de {keywordQuestions.state.integrated ? "" : keywordQuestions.state.pendingOn}.</td></tr>
            <tr><th scope="row">Visibilidad, ranking o frecuencia de cita</th><td data-label="Estado"><StatusPill tone="neutral">No disponible</StatusPill></td><td data-label="Detalle" className="explain">Unas pocas observaciones manuales no permiten calcularlos; no se estiman.</td></tr>
          </tbody>
        </table>
        <p className="muted small">llms.txt, datos estructurados o fichas en Wikidata/Wikipedia no garantizan aparecer en respuestas de IA; no se recomiendan como tal.</p>
      </section>
    </>
  );
}
