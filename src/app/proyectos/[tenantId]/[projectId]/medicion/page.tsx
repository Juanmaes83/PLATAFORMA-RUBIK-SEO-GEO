import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { ProjectNav } from "@/components/ProjectNav";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { loadProjectRef } from "@/lib/imports/repository";
import { getProjectConnection } from "@/lib/openseo/connections";
import { listGoogleCaptures } from "@/lib/openseo/google/capture";
import { getGoogleProperty } from "@/lib/openseo/google/properties";
import { getWebmasterProperty } from "@/lib/webmaster/properties";
import { serverKeyring } from "@/lib/provenance/keyring";
import { loadProviderResult } from "@/lib/provenance/repository";
import { myProjectMembership } from "@/lib/tenancy";
import { associationLabel, coverageLabel, measurementRows, unavailableMetrics, type MeasurementProvider } from "@/lib/medicion/resumen";

const SOURCES = [
  { key: "search-console", name: "Google Search Console" },
  { key: "google-analytics", name: "Google Analytics 4" },
] as const;

function stateOf(result: { ok: true; property: { state: "ACTIVE" | "REVOKED" } | null } | { ok: false; error: string }) {
  if (!result.ok) return result.error.includes("FORBIDDEN") ? "FORBIDDEN" as const : "ERROR" as const;
  return result.property?.state ?? "NONE";
}

function numberLabel(value: string | number, key: string) {
  if (typeof value !== "number") return String(value);
  if (key === "ctr" || key === "engagementRate" || key === "sessionKeyEventRate") return `${(value * 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
  return Number.isInteger(value) ? value.toLocaleString("es-ES") : value.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

export default async function MeasurementPage({ params }: { params: Promise<{ tenantId: string; projectId: string }> }) {
  const [{ tenantId, projectId }, { user, supabase }] = await Promise.all([params, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;
  const ref = await loadProjectRef(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  if (!ref) notFound();

  // Session-bound reads only. No provider transport or capture action is called while rendering.
  const [history, connection, gscProperty, gaProperty, bingProperty] = await Promise.all([
    listGoogleCaptures(supabase, ref, 25),
    getProjectConnection(supabase, ref.projectId),
    getGoogleProperty(supabase, ref.projectId, "search-console"),
    getGoogleProperty(supabase, ref.projectId, "google-analytics"),
    getWebmasterProperty(supabase, ref.projectId, "bing-webmaster"),
  ]);
  const keyring = serverKeyring();
  const captures = history.ok
    ? keyring
      ? await Promise.all(history.rows.map(async (summary) => {
      const loaded = await loadProviderResult(supabase, ref, summary.id, keyring);
      if (!loaded.ok) return { summary, verified: false as const, row: null, request: null, source: null, data: null };
      const payload = loaded.row.signed_payload as { provenance?: { requestContext?: Record<string, unknown>; sourceContext?: Record<string, unknown> } } | null;
      return {
        summary,
        verified: loaded.verification.verified,
        row: loaded.verification.verified ? loaded.row : null,
        request: loaded.verification.verified ? payload?.provenance?.requestContext ?? {} : null,
        source: loaded.verification.verified ? payload?.provenance?.sourceContext ?? {} : null,
        data: loaded.verification.verified ? loaded.row.data : null,
      };
      }))
      : history.rows.map((summary) => ({ summary, verified: false as const, row: null, request: null, source: null, data: null }))
    : [];

  const googleProperties = { "search-console": gscProperty, "google-analytics": gaProperty } as const;
  const googleStates = { "search-console": stateOf(gscProperty), "google-analytics": stateOf(gaProperty) } as const;
  const connectionState = !connection.ok ? connection.error.includes("FORBIDDEN") ? "FORBIDDEN" : "ERROR"
    : connection.connection?.state ?? "NONE";

  return <>
    <p className="muted small">{project.name}{project.domain ? ` · ${project.domain}` : ""}</p>
    <ProjectNav base={base} current="medicion" />
    <PageHead title="Medición orgánica"><StatusPill tone="neutral">Datos guardados del proyecto</StatusPill></PageHead>
    <p className="lead">Consulta qué se ha medido, con qué fuente y en qué periodo. Solo se muestran filas cuya firma se verifica para este proyecto.</p>

    <section className="section" aria-labelledby="sources-title">
      <h2 id="sources-title">Estado de las fuentes</h2>
      <ul className="cards measurement-cards">
        {SOURCES.map(({ key, name }) => {
          const propertyResult = googleProperties[key];
          const propertyStatus = associationLabel(googleStates[key]);
          const declared = propertyResult.ok ? propertyResult.property : null;
          const connectionText = connectionState === "ACTIVE" ? "Vínculo OpenSEO declarado activo (sin consulta de prueba)" : connectionState === "REVOKED" ? "Vínculo OpenSEO revocado" : connectionState === "NONE" ? "Sin vínculo OpenSEO declarado" : connectionState === "FORBIDDEN" ? "Estado del vínculo no visible para este rol" : "No se pudo consultar el vínculo";
          const providerCaptures = captures.filter((capture) => capture.summary.provider === key);
          const hasVerifiedCapture = providerCaptures.some((capture) => capture.verified);
          return <li className="card" key={key}>
            <div className="card-head"><h3>{name}</h3><StatusPill tone={hasVerifiedCapture ? "ok" : providerCaptures.length ? "warn" : "neutral"}>{hasVerifiedCapture ? "Hay datos verificados" : !history.ok ? "Historial no disponible" : providerCaptures.length ? keyring ? "Captura no verificada" : "Verificación sin configurar" : "Sin captura verificada"}</StatusPill></div>
            <dl className="facts">
              <div><dt>Asociación declarada</dt><dd>{propertyStatus}</dd></div>
              <div><dt>Propiedad</dt><dd className="break">{declared?.externalPropertyId ?? (googleStates[key] === "REVOKED" ? "Asociación retirada" : googleStates[key] === "FORBIDDEN" ? "No visible para este rol" : googleStates[key] === "ERROR" ? "No disponible ahora" : "Sin propiedad declarada")}</dd></div>
              <div><dt>Servicio</dt><dd>{connectionText}</dd></div>
              <div><dt>Registros de captura</dt><dd>{!history.ok ? "No se pudo cargar el historial" : providerCaptures.length ? `${providerCaptures.length} guardados` : "Ninguno guardado"}</dd></div>
            </dl>
            <p className="muted small">Una asociación o consentimiento no confirma acceso actual a Google. Las capturas manuales requieren autorización, credenciales y activación del propietario.</p>
            <p><Link href={`${base}/google`}>Abrir capturas e historial de Google</Link></p>
            {propertyResult.ok && propertyResult.property?.state === "REVOKED" && <p role="note">La propiedad fue revocada; las capturas históricas verificadas siguen siendo evidencia del periodo en que se obtuvieron.</p>}
          </li>;
        })}
        <li className="card">
          <div className="card-head"><h3>Bing Webmaster Tools</h3><StatusPill tone="neutral">Preparación</StatusPill></div>
          <dl className="facts">
            <div><dt>Propiedad declarada</dt><dd>{bingProperty.ok ? bingProperty.property ? `${bingProperty.property.state === "ACTIVE" ? "Activa" : "Revocada"}: ${bingProperty.property.siteUrl}` : "Ninguna" : bingProperty.error.includes("FORBIDDEN") ? "Estado no visible para este rol" : "No se pudo consultar"}</dd></div>
            <div><dt>Lectura de URL</dt><dd>Sin credencial autorizada; no se ha consultado Bing</dd></div>
            <div><dt>Estado</dt><dd>El transporte de solo lectura está disponible en código. Eso no significa que haya cuenta conectada ni datos de Bing.</dd></div>
          </dl>
        </li>
      </ul>
    </section>

    <section className="section" aria-labelledby="verified-title">
      <div className="card-head"><h2 id="verified-title">Mediciones verificadas</h2><Link href={`${base}/google/comparar`}>Comparar capturas de Google</Link></div>
      {!keyring ? <EmptyState title="No se pueden verificar capturas"><p>Falta el anillo de firma del servidor. Por seguridad no se muestran métricas guardadas; los registros aparecen arriba como no verificados.</p></EmptyState>
        : !history.ok ? <EmptyState title="No se pudo cargar el historial"><p>La lectura del proyecto falló. Vuelve a intentarlo desde Google.</p></EmptyState>
          : !captures.some((capture) => capture.verified) ? <EmptyState title="Aún no hay mediciones verificadas"><p>Cuando se guarde una captura de Google, aquí aparecerán sus valores, fuente, periodo y cobertura. La ausencia de filas no equivale a cero.</p><p><Link href={`${base}/google`}>Ver estado y opciones de captura</Link></p></EmptyState>
            : <ul className="cards measurement-cards">
              {captures.map((capture) => {
                const provider = capture.summary.provider as MeasurementProvider;
                const validProvider = provider === "search-console" || provider === "google-analytics";
                if (!capture.verified || !capture.row || !capture.request || !validProvider) return <li className="card" key={capture.summary.id}>
                  <div className="card-head"><h3>{provider === "search-console" ? "Search Console" : "GA4"}</h3><StatusPill tone="no">Firma no verificada</StatusPill></div>
                  <p>Los datos no se muestran porque no se ha podido verificar esta captura.</p>
                </li>;
                const captureData = Array.isArray(capture.data) ? capture.data.filter((item) => item !== null && typeof item === "object" && !Array.isArray(item)) : [];
                const rows = measurementRows(provider, capture.request, captureData);
                const period = `${String(capture.request.startDate ?? "Periodo no indicado")} – ${String(capture.request.endDate ?? "Periodo no indicado")}`;
                const property = String(capture.request.siteUrl ?? capture.request.propertyId ?? "Propiedad no indicada");
                const sourceContext = capture.source ?? {};
                const sourceName = sourceContext.source === "OWNER_DECLARED" ? "Propiedad declarada por el titular" : "Origen firmado en la captura";
                const hasMissingMetrics = captureData.some((row) => unavailableMetrics(provider, row).length > 0);
                return <li className="card" key={capture.summary.id}>
                  <div className="card-head"><h3>{provider === "search-console" ? "Google Search Console" : "Google Analytics 4"}</h3><StatusPill tone="ok">Firma verificada</StatusPill><StatusPill tone={capture.row.status === "PARTIAL" || hasMissingMetrics ? "warn" : "neutral"}>{capture.row.status === "PARTIAL" ? "Cobertura parcial" : capture.row.status === "EMPTY" ? "Vacía" : hasMissingMetrics ? "Firmada con métricas ausentes" : "Capturada"}</StatusPill></div>
                  <dl className="facts">
                    <div><dt>Origen</dt><dd>{sourceName}</dd></div>
                    <div><dt>Propiedad</dt><dd className="break">{property}</dd></div>
                    <div><dt>Periodo</dt><dd>{period}</dd></div>
                    <div><dt>Última captura</dt><dd>{formatDateTime(capture.row.captured_at)}</dd></div>
                    <div><dt>Cobertura</dt><dd>{coverageLabel(capture.row.status)}</dd></div>
                  </dl>
                  {capture.row.status === "PARTIAL" && <p className="notice notice-info" role="note">Hay límites de filas o cobertura parcial. No extrapoles estas filas al sitio completo; las ausencias no son ceros.</p>}
                  {capture.row.status === "EMPTY" || rows.length === 0 ? <p>Consulta verificada sin filas. No se infieren valores cero.</p> : <div className="measurement-row-list">
                    {rows.slice(0, 5).map((row, index) => <div className="measurement-row" key={`${capture.summary.id}-${index}`}>
                      <h4 className="break">{row.label}</h4>
                      {row.metrics.length ? <dl className="facts measurement-metrics">{row.metrics.map((metric) => <div key={metric.key}><dt>{metric.label}</dt><dd>{numberLabel(metric.value, metric.key)}</dd></div>)}</dl> : <p className="muted small">Esta fila no contiene las métricas esperadas; no se muestran valores inventados.</p>}
                      {unavailableMetrics(provider, captureData[index]).length > 0 && <p className="muted small" role="note">No disponibles en esta fila: {unavailableMetrics(provider, captureData[index]).join(", ")}.</p>}
                    </div>)}
                    {rows.length > 5 && <p className="muted small">Se muestran 5 de {rows.length} filas guardadas. Abre el detalle para ver la captura completa.</p>}
                  </div>}
                  <p><Link href={`${base}/google/${capture.summary.id}`}>Abrir detalle y filas de la captura</Link></p>
                  <p><Link href={`${base}/google/comparar?antes=${capture.summary.id}`}>Elegir otra captura para comparar</Link></p>
                </li>;
              })}
            </ul>}
      {history.ok && captures.some((capture) => !capture.verified) && <p className="muted small" role="status">Una o más capturas recientes no verifican; sus valores están ocultos.</p>}
    </section>
  </>;
}
