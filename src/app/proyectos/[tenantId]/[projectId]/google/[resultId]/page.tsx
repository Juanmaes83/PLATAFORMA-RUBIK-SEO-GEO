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
import { CAPTURE_NOTICES, PROVIDER_LABELS } from "@/lib/openseo/google/capture-messages";
import { serverKeyring } from "@/lib/provenance/keyring";
import { loadProviderResult } from "@/lib/provenance/repository";
import { myProjectMembership } from "@/lib/tenancy";

// One stored Google capture: signature verified with the server keyring against THIS project,
// the signed query and source (connection, property binding, OpenSEO project) and the rows.
// Rows are shown only when the signature verifies; otherwise the page says the data is untrusted.
type Row = Record<string, unknown>;
const GSC_METRICS = [["clicks", "Clics"], ["impressions", "Impresiones"], ["ctr", "CTR"], ["averagePosition", "Posición media"]] as const;
const GA4_METRICS = [["sessions", "Sesiones"], ["activeUsers", "Usuarios activos"], ["engagedSessions", "Sesiones con interacción"], ["keyEvents", "Eventos clave"]] as const;
const show = (v: unknown, key?: string) => v === null || v === undefined ? "—"
  : typeof v === "number" ? (key === "ctr" ? `${(v * 100).toFixed(1)} %` : Number.isInteger(v) ? v.toLocaleString("es-ES") : v.toFixed(2)) : String(v);

export default async function GoogleCapturePage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string; resultId: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const [{ tenantId, projectId, resultId }, { aviso }, { user, supabase }] = await Promise.all([params, searchParams, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;
  const ref = await loadProjectRef(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  if (!ref) notFound();
  const keyring = serverKeyring();
  if (!keyring) {
    return (
      <>
        <ProjectNav base={base} current="google" />
        <PageHead title="Captura de Google" />
        <EmptyState title="Firma no configurada"><p>Sin el anillo de firma del servidor no se puede verificar esta captura.</p></EmptyState>
      </>
    );
  }
  const loaded = await loadProviderResult(supabase, ref, resultId, keyring);
  if (!loaded.ok || !["search-console", "google-analytics"].includes(loaded.row.provider)) notFound();
  const { row, verification } = loaded;
  const payload = row.signed_payload as { provenance?: { requestContext?: Row; sourceContext?: Row } } | null;
  const request = payload?.provenance?.requestContext ?? {};
  const source = payload?.provenance?.sourceContext ?? {};
  const gsc = row.provider === "search-console";
  const dims = gsc && Array.isArray(request.dimensions) ? (request.dimensions as string[]) : [];
  const rows = verification.verified && Array.isArray(row.data) ? (row.data as Row[]) : [];
  // Each row is a card: its dimensions (GSC) or landing page (GA4) as title, metrics as facts.
  const titles = gsc ? dims : ["hostName", "landingPage"];
  const metrics = (gsc ? GSC_METRICS : GA4_METRICS).map(([key, label]) => ({ key, label }));

  return (
    <>
      <p className="muted small">{project.name}</p>
      <ProjectNav base={base} current="google" />
      <PageHead title={verification.verified ? PROVIDER_LABELS[row.provider] : "Captura no confiable"} />
      <Notice tone="info" text={pick(CAPTURE_NOTICES, aviso)} />
      <p>
        <StatusPill tone={verification.verified ? "ok" : "no"}>{verification.verified ? "Firma verificada" : "Firma no verificada"}</StatusPill>{" "}
        <StatusPill tone={row.status === "OK" ? "ok" : "warn"}>{row.status === "PARTIAL" ? "Parcial" : row.status === "EMPTY" ? "Sin filas" : "Completa"}</StatusPill>
      </p>
      {row.status === "PARTIAL" && <p className="muted small">Parcial: hay más filas de las pedidas, o Google aplicó muestreo o umbrales. No representa el total.</p>}
      <dl className="facts">
        <div><dt>Periodo</dt><dd>{show(request.startDate)} – {show(request.endDate)}</dd></div>
        <div><dt>Propiedad</dt><dd className="break">{show(request.siteUrl ?? request.propertyId)}</dd></div>
        <div><dt>Capturada</dt><dd>{formatDateTime(row.captured_at)}</dd></div>
        <div><dt>Proyecto de OpenSEO</dt><dd className="break">{show(source.providerProjectId)}</dd></div>
        <div><dt>Conexión y asociación</dt><dd className="break small">{show(source.connectionId)} · {show(source.propertyBindingId)}</dd></div>
      </dl>
      {!verification.verified ? (
        <EmptyState title="Datos no mostrados"><p>La firma no verifica para este proyecto ({verification.reason ?? "motivo desconocido"}). No se muestran sus filas.</p></EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="Sin filas"><p>Google no devolvió filas para esta consulta y periodo.</p></EmptyState>
      ) : (
        <ul className="cards" aria-label={`${rows.length} filas`}>
          {rows.map((r, i) => (
            <li className="card" key={i}>
              <h3 className="break">{titles.map((k) => show(r[k])).join(" · ")}</h3>
              <dl className="facts">
                {metrics.map((m) => <div key={m.key}><dt>{m.label}</dt><dd>{show(r[m.key], m.key)}</dd></div>)}
              </dl>
            </li>
          ))}
        </ul>
      )}
      <p><Link href={`${base}/google`}>← Volver a Search Console y GA4</Link> · <Link href={`${base}/exportar`}>Exportar el proyecto</Link></p>
    </>
  );
}
