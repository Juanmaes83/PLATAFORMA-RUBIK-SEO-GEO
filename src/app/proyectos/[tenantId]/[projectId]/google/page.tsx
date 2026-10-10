import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { pick } from "@/lib/auth/messages";
import { formatDateTime } from "@/lib/format";
import { loadProjectRef } from "@/lib/imports/repository";
import { googleReadsEnabled } from "@/lib/openseo/mcp-client";
import { listGoogleCaptures } from "@/lib/openseo/google/capture";
import { captureGoogleAction, connectGooglePropertyAction, revokeGooglePropertyAction } from "@/lib/openseo/google/capture-actions";
import { CAPTURE_ERRORS, CAPTURE_NOTICES, PROPERTY_ERRORS, PROVIDER_LABELS } from "@/lib/openseo/google/capture-messages";
import { getGoogleProperty, type GoogleProvider } from "@/lib/openseo/google/properties";
import { myProjectMembership } from "@/lib/tenancy";

// Search Console and GA4 through OpenSEO: owner-declared property per provider, manual bounded
// capture stored as a signed result, and the project's capture history. Nothing is read from
// Google when the page loads: only the capture button calls the provider, once, server-side.
const PROVIDERS: GoogleProvider[] = ["search-console", "google-analytics"];
const DIMENSIONS = [["page", "Página"], ["query", "Consulta"], ["date", "Fecha"], ["country", "País"], ["device", "Dispositivo"]] as const;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function GooglePage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string }>;
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const [{ tenantId, projectId }, { aviso, error }, { user, supabase }] = await Promise.all([params, searchParams, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project, role } = access;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;
  const ref = await loadProjectRef(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  if (!ref) notFound();
  const owner = role === "owner";
  const reads = googleReadsEnabled();
  const [history, ...bindings] = await Promise.all([
    listGoogleCaptures(supabase, ref),
    ...(owner ? PROVIDERS.map((p) => getGoogleProperty(supabase, ref.projectId, p)) : []),
  ]);
  const hidden = (<><input type="hidden" name="tenant" value={project.tenantId} /><input type="hidden" name="project" value={project.projectId} /></>);
  const today = new Date();
  const end = iso(new Date(today.getTime() - 3 * 86400000));
  const start = iso(new Date(today.getTime() - 30 * 86400000));

  return (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current="google" />
      <PageHead title="Search Console y GA4" />
      <Notice tone="info" text={pick(CAPTURE_NOTICES, aviso)} />
      <Notice tone="error" text={pick(CAPTURE_ERRORS, error) ?? pick(PROPERTY_ERRORS, error)} />
      <p>
        Capturas manuales de Search Console (rendimiento) y GA4 (páginas de destino orgánicas) a través de OpenSEO. Cada captura se guarda firmada,
        con la conexión y la propiedad que se usaron, y entra en la exportación del proyecto. Abrir esta página no consulta a Google.
      </p>
      <p><StatusPill tone={reads ? "ok" : "warn"}>{reads ? "Lecturas de Google activadas" : "Lecturas de Google desactivadas"}</StatusPill></p>

      {owner && (
        <section aria-labelledby="g-propiedades" className="section">
          <h2 id="g-propiedades">Propiedades asociadas</h2>
          <p className="muted small">Asociar una propiedad no consulta a Google: indica qué propiedad, ya conectada en OpenSEO, corresponde a este proyecto.</p>
          <ul className="cards">
            {PROVIDERS.map((provider, i) => {
              const b = bindings[i] as Awaited<ReturnType<typeof getGoogleProperty>> | undefined;
              const active = b?.ok && b.property?.state === "ACTIVE" ? b.property : null;
              return (
                <li className="card" key={provider}>
                  <div className="card-head">
                    <h3>{PROVIDER_LABELS[provider]}</h3>
                    <StatusPill tone={active ? "ok" : "neutral"}>{active ? "Asociada" : b && !b.ok ? "No disponible" : "Sin asociar"}</StatusPill>
                  </div>
                  {active ? (
                    <>
                      <dl className="facts">
                        <div><dt>Propiedad</dt><dd className="break">{active.externalPropertyId}</dd></div>
                        <div><dt>Desde</dt><dd>{formatDateTime(active.grantedAt)}</dd></div>
                      </dl>
                      <form action={revokeGooglePropertyAction}>
                        {hidden}<input type="hidden" name="provider" value={provider} />
                        <button type="submit" className="btn btn-ghost">Revocar asociación</button>
                      </form>
                    </>
                  ) : b && b.ok ? (
                    <form action={connectGooglePropertyAction} className="form">
                      {hidden}<input type="hidden" name="provider" value={provider} />
                      <div className="field">
                        <label htmlFor={`g-prop-${provider}`}>{provider === "search-console" ? "Propiedad de Search Console" : "Propiedad de GA4"}</label>
                        <input id={`g-prop-${provider}`} name="externalPropertyId" required autoComplete="off" spellCheck={false}
                          placeholder={provider === "search-console" ? "sc-domain:dominio.es" : "properties/123456789"} />
                      </div>
                      <div className="field field-check">
                        <input id={`g-consent-${provider}`} name="consent" value="si" type="checkbox" required />
                        <label htmlFor={`g-consent-${provider}`}>Confirmo que esta propiedad es de este proyecto y está autorizada en OpenSEO.</label>
                      </div>
                      <button type="submit" className="btn">Asociar propiedad</button>
                    </form>
                  ) : (
                    <p className="muted small">Hace falta una conexión de OpenSEO para este proyecto.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="g-captura" className="section">
        <h2 id="g-captura">Nueva captura</h2>
        {!owner ? (
          <EmptyState title="Solo la titularidad del proyecto captura datos de Google">
            <p>Puedes consultar las capturas ya guardadas en el historial.</p>
          </EmptyState>
        ) : !reads ? (
          <EmptyState title="Lecturas de Google desactivadas" requires={["Autorización de Juanma para leer con cuota", "Conexión de OpenSEO activa y propiedad asociada", "OPENSEO_GOOGLE_READS_ENABLED activado en el servidor"]}>
            <p>No se consulta nada hasta que se active en el servidor con una decisión aparte.</p>
          </EmptyState>
        ) : (
          <ul className="cards">
            <li className="card">
              <h3>{PROVIDER_LABELS["search-console"]}</h3>
              <form action={captureGoogleAction} className="form">
                {hidden}<input type="hidden" name="provider" value="search-console" /><input type="hidden" name="key" value={randomUUID()} />
                <div className="field"><label htmlFor="g-sc-start">Desde</label><input id="g-sc-start" name="startDate" type="date" required defaultValue={start} /></div>
                <div className="field"><label htmlFor="g-sc-end">Hasta (máximo 31 días)</label><input id="g-sc-end" name="endDate" type="date" required defaultValue={end} /></div>
                <fieldset className="field">
                  <legend>Dimensiones (1 a 4)</legend>
                  {DIMENSIONS.map(([id, label]) => (
                    <div className="field field-check" key={id}>
                      <input id={`g-dim-${id}`} name="dimensions" value={id} type="checkbox" defaultChecked={id === "page"} />
                      <label htmlFor={`g-dim-${id}`}>{label}</label>
                    </div>
                  ))}
                </fieldset>
                <div className="field"><label htmlFor="g-sc-rows">Filas (1 a 100)</label><input id="g-sc-rows" name="rowLimit" type="number" min={1} max={100} required defaultValue={25} /></div>
                <button type="submit" className="btn">Capturar y guardar</button>
              </form>
            </li>
            <li className="card">
              <h3>{PROVIDER_LABELS["google-analytics"]}</h3>
              <form action={captureGoogleAction} className="form">
                {hidden}<input type="hidden" name="provider" value="google-analytics" /><input type="hidden" name="key" value={randomUUID()} />
                <div className="field"><label htmlFor="g-ga-start">Desde</label><input id="g-ga-start" name="startDate" type="date" required defaultValue={start} /></div>
                <div className="field"><label htmlFor="g-ga-end">Hasta (máximo 31 días)</label><input id="g-ga-end" name="endDate" type="date" required defaultValue={end} /></div>
                <div className="field"><label htmlFor="g-ga-limit">Filas (1 a 100)</label><input id="g-ga-limit" name="limit" type="number" min={1} max={100} required defaultValue={25} /></div>
                <div className="field"><label htmlFor="g-ga-offset">Desde la fila (0 a 1000)</label><input id="g-ga-offset" name="offset" type="number" min={0} max={1000} required defaultValue={0} /></div>
                <button type="submit" className="btn">Capturar y guardar</button>
              </form>
            </li>
          </ul>
        )}
      </section>

      <section aria-labelledby="g-historial" className="section">
        <h2 id="g-historial">Historial de capturas</h2>
        {!history.ok ? (
          <EmptyState title="Historial no disponible"><p>No se pudo leer el historial ahora mismo.</p></EmptyState>
        ) : history.rows.length === 0 ? (
          <EmptyState title="Sin capturas"><p>Este proyecto aún no tiene capturas de Google guardadas.</p></EmptyState>
        ) : (
          <>
          {history.rows.length >= 2 && <p><Link href={`${base}/google/comparar`}>Comparar dos capturas</Link></p>}
          <ul className="cards">
            {history.rows.map((r) => (
              <li className="card" key={r.id}>
                <div className="card-head">
                  <h3><Link href={`${base}/google/${r.id}`}>{PROVIDER_LABELS[r.provider]}</Link></h3>
                  <StatusPill tone={r.status === "OK" ? "ok" : "warn"}>{r.status}</StatusPill>
                </div>
                <dl className="facts">
                  <div><dt>Capturada</dt><dd>{formatDateTime(r.capturedAt)}</dd></div>
                  <div><dt>Guardada</dt><dd>{formatDateTime(r.createdAt)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
          </>
        )}
      </section>
      <p><Link href={base}>← Volver al proyecto</Link></p>
    </>
  );
}
