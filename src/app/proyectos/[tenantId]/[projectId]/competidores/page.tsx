import Link from "next/link";
import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { ComparisonVerdict, MethodPill, ObservationForm, Reading, VerificationPill, formatDay, market } from "@/components/competitors";
import { Notice } from "@/components/Notice";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { pick } from "@/lib/auth/messages";
import { requireSession } from "@/lib/auth/session";
import { createCompetitor, recordObservation } from "@/lib/competitors/actions";
import { writerReady } from "@/lib/competitors/audit";
import { CAPABILITIES } from "@/lib/competitors/capabilities";
import { COMPARISON_WINDOW_DAYS, compareMetric, type Observation } from "@/lib/competitors/compare";
import { METRIC_SHORT, METRICS, RELATION_LABEL } from "@/lib/competitors/contract";
import { AUDIT_PENDING, COMPETITOR_ERRORS, COMPETITOR_NOTICES } from "@/lib/competitors/labels";
import { listCompetitors, listObservations, loadCompetitorProject, type CompetitorProject } from "@/lib/competitors/repository";
import type { ProjectAccess } from "@/lib/access";
import type { Database } from "@/lib/supabase/database.types";
import { serverKeyring } from "@/lib/provenance/keyring";
import { myProjectMembership } from "@/lib/tenancy";
import { n2SchemaAvailable } from "@/lib/n2/availability";
import { N2ModuleUnavailable } from "@/components/N2ModuleUnavailable";

export default async function CompetitorsPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string }>;
  searchParams: Promise<{ error?: string; aviso?: string; auditoria?: string }>;
}) {
  const [{ tenantId, projectId }, { error, aviso, auditoria }, { user, supabase }] = await Promise.all([params, searchParams, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  if (!n2SchemaAvailable()) return <N2ModuleUnavailable title="Competidores" projectName={project.name} base={`/proyectos/${project.tenantId}/${project.projectId}`} current="competidores" />;
  const ref = await loadCompetitorProject(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  if (!ref) notFound();
  // Access and 404 are decided above, before anything streams (a route-level loading.tsx
  // would turn a 404 into a 200); only the data reads below show a loading state.
  return (
    <Suspense fallback={<p role="status" className="muted">Cargando competidores y observaciones…</p>}>
      <CompetitorsView access={access} ref_={ref} supabase={supabase} error={error} aviso={aviso} auditoria={auditoria} />
    </Suspense>
  );
}

const latest = (list: readonly Observation[]) =>
  [...list].sort((a, b) => b.observedOn.localeCompare(a.observedOn) || b.createdAt.localeCompare(a.createdAt))[0] ?? null;

async function CompetitorsView({ access, ref_: ref, supabase, error, aviso, auditoria }: {
  access: ProjectAccess;
  ref_: CompetitorProject;
  supabase: SupabaseClient<Database>;
  error?: string;
  aviso?: string;
  auditoria?: string;
}) {
  const { project } = access;
  const [competitors, observations] = await Promise.all([listCompetitors(supabase, ref), listObservations(supabase, ref)]);
  const allowed = (action: string) => access.permissions.find((p) => p.action === action)?.decision.allowed === true;
  const canDraft = allowed("draft");
  const signing = serverKeyring() !== null && writerReady();
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;
  const today = new Date().toISOString().slice(0, 10);

  const active = competitors.filter((c) => c.status === "active");
  const archived = competitors.filter((c) => c.status === "archived");
  const own = observations.filter((o) => o.competitorId === null);
  const byCompetitor = new Map<string, typeof observations>();
  for (const o of observations) if (o.competitorId) byCompetitor.set(o.competitorId, [...(byCompetitor.get(o.competitorId) ?? []), o]);
  const metricsWithData = METRICS.filter((m) => observations.some((o) => o.metric === m));
  const partial = active.some((c) => !byCompetitor.has(c.id)) || (active.length > 0 && own.length === 0);

  return (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current="competidores" />
      <PageHead title="Competidores">
        <StatusPill tone="neutral">Datos registrados a mano · sin fuentes automáticas</StatusPill>
      </PageHead>
      <Notice tone="error" text={pick(COMPETITOR_ERRORS, error)} />
      <Notice tone="info" text={pick(COMPETITOR_NOTICES, aviso)} />
      <Notice tone="info" text={auditoria === "pendiente" ? AUDIT_PENDING : null} />
      <p>
        Lista de competidores del proyecto y observaciones con su <strong>fuente</strong>, su <strong>fecha</strong> y su
        {" "}<strong>método</strong> (observado en una herramienta o declarado a mano). Dos datos solo se comparan si tienen la
        misma métrica, fuente, método, mercado y dispositivo, y están separados como mucho {COMPARISON_WINDOW_DAYS} días. La
        plataforma no visita los dominios ni consulta proveedores.
      </p>

      <section aria-labelledby="c-lista" className="section">
        <h2 id="c-lista">Competidores del proyecto</h2>
        {competitors.length === 0 ? (
          <EmptyState title="Sin competidores">
            <p>Este proyecto todavía no tiene competidores.{canDraft ? " Puedes añadir el primero más abajo." : ""}</p>
          </EmptyState>
        ) : (
          <>
            {active.length === 0 && <p className="muted">Todos los competidores están archivados.</p>}
            <ul className="cards">
              {active.map((c) => {
                const list = byCompetitor.get(c.id) ?? [];
                return (
                  <li key={c.id} className="card">
                    <div className="card-head">
                      <h3><Link href={`${base}/competidores/${c.id}`}>{c.name ?? c.domain}</Link></h3>
                      <StatusPill tone="neutral">{RELATION_LABEL[c.relation]}</StatusPill>
                    </div>
                    <dl className="facts">
                      <div><dt>Dominio</dt><dd className="break">{c.domain}</dd></div>
                      <div><dt>Observaciones</dt><dd>{list.length === 0 ? "Sin mediciones" : `${list.length} · última del ${formatDay(list[0].observedOn)}`}</dd></div>
                    </dl>
                  </li>
                );
              })}
            </ul>
            {archived.length > 0 && (
              <>
                <h3>Archivados</h3>
                <ul className="plain">
                  {archived.map((c) => (
                    <li key={c.id}><Link href={`${base}/competidores/${c.id}`}>{c.name ?? c.domain}</Link> <span className="muted small">({c.domain})</span></li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      {active.length > 0 && (
        <section aria-labelledby="c-comparacion" className="section">
          <h2 id="c-comparacion">Comparación con tu sitio</h2>
          {observations.length === 0 ? (
            <EmptyState title="Sin mediciones">
              <p>No hay ninguna observación todavía. Registra una del competidor y otra de tu sitio con la misma fuente para poder compararlas.</p>
            </EmptyState>
          ) : (
            <>
              {partial && (
                <p className="notice notice-info" role="note">
                  Datos parciales: algunos competidores o tu propio sitio no tienen mediciones. Las celdas vacías se indican como tales, nunca como cero.
                </p>
              )}
              {metricsWithData.map((metric) => (
                <table key={metric} className="rtable">
                  <caption>{METRIC_SHORT[metric]}</caption>
                  <thead>
                    <tr><th scope="col">Competidor</th><th scope="col">Competidor (dato)</th><th scope="col">Tu sitio (dato)</th><th scope="col">Comparación</th></tr>
                  </thead>
                  <tbody>
                    {active.map((c) => {
                      const theirs = (byCompetitor.get(c.id) ?? []).filter((o) => o.metric === metric);
                      const mine = own.filter((o) => o.metric === metric);
                      const result = compareMetric(theirs, mine);
                      // Each side shows the reading the verdict used or, when there is no
                      // verdict pair, its own latest reading (a "not available" one included).
                      const shownC = ("competitor" in result ? result.competitor : null) ?? latest(theirs);
                      const shownP = ("project" in result ? result.project : null) ?? latest(mine);
                      return (
                        <tr key={c.id}>
                          <th scope="row">{c.name ?? c.domain}</th>
                          <td data-label="Competidor">{shownC ? <Reading o={shownC} /> : <span className="muted">Sin medición</span>}</td>
                          <td data-label="Tu sitio">{shownP ? <Reading o={shownP} /> : <span className="muted">Sin medición</span>}</td>
                          <td data-label="Comparación" className="explain"><ComparisonVerdict c={result} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ))}
              <p className="muted small">
                Una diferencia «pendiente de verificación» es orientativa: no es una recomendación hasta que una persona con permiso
                verifique ambos datos. Las puntuaciones de autoridad de herramientas distintas no son equivalentes.
              </p>
            </>
          )}
        </section>
      )}

      <section aria-labelledby="c-propio" className="section">
        <h2 id="c-propio">Mediciones de tu sitio{project.domain ? ` (${project.domain})` : ""}</h2>
        {own.length === 0 ? (
          <EmptyState title="Sin mediciones de tu sitio">
            <p>Sin una medición de tu propio sitio con la misma fuente no hay comparación posible.</p>
          </EmptyState>
        ) : (
          <ul className="cards">
            {own.slice(0, 20).map((o) => (
              <li key={o.id} className="card">
                <div className="card-head"><h3>{METRIC_SHORT[o.metric]}</h3><MethodPill o={o} /></div>
                <p><Reading o={o} /></p>
                <p className="small muted">{market(o)}</p>
                <p><VerificationPill o={o} /></p>
              </li>
            ))}
          </ul>
        )}
        {canDraft && signing && (
          <details className="legend">
            <summary>Registrar una medición de tu sitio</summary>
            <ObservationForm action={recordObservation} tenant={project.tenantId} project={project.projectId} competitor="project" today={today} idPrefix="own" />
          </details>
        )}
      </section>

      <section aria-labelledby="c-nuevo" className="section">
        <h2 id="c-nuevo">Añadir competidor</h2>
        {!canDraft ? (
          <p className="muted">Tu rol en este proyecto permite consultar los competidores, no añadirlos.</p>
        ) : !signing ? (
          <EmptyState title="Edición no disponible" requires={["Claves de firma de auditoría y escritor de auditoría configurados en el servidor por el propietario (ADR 0004, S1)"]}>
            <p>Cada cambio deja un registro de auditoría firmado. Sin la firma configurada no se guarda nada.</p>
          </EmptyState>
        ) : (
          <form action={createCompetitor} className="card form">
            <input type="hidden" name="tenant" value={project.tenantId} />
            <input type="hidden" name="project" value={project.projectId} />
            <div className="field">
              <label htmlFor="c-domain">Dominio o dirección del competidor</label>
              <input id="c-domain" name="domain" required maxLength={2048} autoComplete="off" inputMode="url" aria-describedby="c-domain-help" />
              <p id="c-domain-help" className="muted small">
                Se guarda solo el dominio («https://www.competidor.es/tienda» queda como «competidor.es»). No se visita la dirección.
              </p>
            </div>
            <div className="field">
              <label htmlFor="c-name">Nombre (opcional)</label>
              <input id="c-name" name="name" maxLength={120} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="c-relation">Tipo de competidor</label>
              <select id="c-relation" name="relation" defaultValue="direct" aria-describedby="c-relation-help">
                <option value="direct">Directo</option>
                <option value="indirect">Indirecto</option>
              </select>
              <p id="c-relation-help" className="muted small">Directo: mismo producto o servicio. Indirecto: compite por las mismas búsquedas o clientes.</p>
            </div>
            <div className="field">
              <label htmlFor="c-notes">Descripción (opcional)</label>
              <input id="c-notes" name="notes" maxLength={1000} autoComplete="off" />
            </div>
            <button type="submit" className="btn btn-block">Añadir competidor</button>
          </form>
        )}
      </section>

      <section aria-labelledby="c-fuentes" className="section">
        <h2 id="c-fuentes">Fuentes automáticas</h2>
        <EmptyState
          title="Fuente no configurada"
          requires={CAPABILITIES.map((c) => `${c.label}: ${c.needs} (${c.costNote})`)}
          nextStep="Cuando el propietario lo autorice, cada lectura automática llegará con su fuente, su fecha y su coste, y se mostrará junto a las manuales sin mezclarlas."
        >
          <p>
            Descubrimiento de competidores, backlinks y seguimiento de posiciones están desactivados: no consumen créditos ni
            llaman a ningún proveedor. Una posición desconocida no es la posición cero, y la ausencia de datos no significa cero backlinks.
          </p>
        </EmptyState>
      </section>
    </>
  );
}
