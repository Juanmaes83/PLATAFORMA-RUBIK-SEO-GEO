import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectNav } from "@/components/ProjectNav";
import { EmptyState, PageHead, StatusPill } from "@/components/ui";
import { projectAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { getImport, listImports, loadProjectRef } from "@/lib/imports/repository";
import { serverKeyring } from "@/lib/provenance/keyring";
import { listProviderResults, loadProviderResult } from "@/lib/provenance/repository";
import { deleteKeywordAction, saveKeywordAction } from "@/lib/seo/actions";
import { diagnoseAudit, ONPAGE_FIELDS, urlPath } from "@/lib/seo/diagnosis";
import { INTENTS, keywordOverlaps, type Keyword } from "@/lib/seo/keywords";
import { myProjectMembership } from "@/lib/tenancy";
import { n2SchemaAvailable } from "@/lib/n2/availability";

const SEVERITY = { ERROR: "Error", WARNING: "Aviso", OPPORTUNITY: "Oportunidad", UNKNOWN: "Sin clasificar" };
const INTENT_LABELS = { unknown: "Sin clasificar", informational: "Informativa", navigational: "Navegacional", commercial: "Comercial", transactional: "Transaccional" };
const FILTERS = ["Todas", "Indexabilidad", "Canonical", "Hreflang", "Sitemap", "HTTP y enlaces", "On-Page", "Otros hallazgos"];

export default async function SeoPage({ params, searchParams }: {
  params: Promise<{ tenantId: string; projectId: string }>;
  searchParams: Promise<{ category?: string; severity?: string; status?: string; url?: string; error?: string; aviso?: string; auditoria?: string }>;
}) {
  const [{ tenantId, projectId }, query, { user, supabase }] = await Promise.all([params, searchParams, requireSession()]);
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access) notFound();
  const { project } = access;
  const ref = await loadProjectRef(supabase, { tenantId: project.tenantId, projectId: project.projectId });
  if (!ref) notFound();
  const base = `/proyectos/${project.tenantId}/${project.projectId}`;
  const n2Available = n2SchemaAvailable();
  const canDraft = access.permissions.some((p) => p.action === "draft" && p.decision.allowed);
  const canDelete = access.permissions.some((p) => p.action === "delete-data" && p.decision.allowed);
  const [listed, keywordsResult, importSummaries] = await Promise.all([
    listProviderResults(supabase, ref, { limit: 100 }),
    n2Available
      ? supabase.from("seo_keywords").select("id,phrase,language_code,country_code,intent,topic,target_url,created_at").eq("project_id", ref.projectId).eq("organization_id", ref.organizationId).order("created_at", { ascending: false }).limit(500)
      : Promise.resolve({ data: [], error: null }),
    listImports(supabase, ref),
  ]);
  const keywords = !n2Available || keywordsResult.error ? [] : keywordsResult.data as Keyword[];
  const keywordsAtLimit = keywords.length === 500;
  const keyring = serverKeyring();
  const issueSummary = listed.ok ? listed.rows.find((r) => r.provider === "openseo" && r.operation === "auditIssues") : null;
  const issuesLoaded = issueSummary && keyring ? await loadProviderResult(supabase, ref, issueSummary.id, keyring) : null;
  const verifiedIssues = issuesLoaded?.ok && issuesLoaded.verification.verified ? issuesLoaded.verification.result : null;
  const issues = diagnoseAudit(verifiedIssues);
  const issueAuditId = verifiedIssues && typeof verifiedIssues === "object" ? (verifiedIssues as { provenance?: { evidence?: { auditId?: string } } }).provenance?.evidence?.auditId : null;
  let pages: string[] = [];
  let pageResultId: string | null = null;
  if (keyring && listed.ok) {
    for (const summary of listed.rows.filter((r) => r.provider === "openseo" && r.operation === "auditPages")) {
      const loaded = await loadProviderResult(supabase, ref, summary.id, keyring);
      if (!loaded.ok || !loaded.verification.verified) continue;
      const result = loaded.verification.result as { data?: unknown; provenance?: { evidence?: { auditId?: string } } };
      if (issueAuditId && result.provenance?.evidence?.auditId !== issueAuditId) continue;
      if (!Array.isArray(result.data)) continue;
      pages = result.data.flatMap((row) => row && typeof row === "object" && typeof row.url === "string" ? [row.url] : []);
      pageResultId = summary.id;
      break;
    }
  }
  const lhSummaries = importSummaries.filter((r) => r.source_tool?.startsWith("lighthouse@")).slice(0, 10);
  const lhImports = await Promise.all(lhSummaries.map((r) => getImport(supabase, ref, r.id)));
  const lhFindings = lhImports.flatMap((row) => row ? row.findings.filter((f) => f.ruleId.startsWith("lh.")).map((finding) => ({ ...finding, source: row.source_label, capturedAt: row.captured_at, id: row.id })) : []);
  const allPages = [...new Set([...pages, ...issues.map((i) => i.url).filter(Boolean), ...lhFindings.map((f) => f.url)])].sort();
  const selectedUrl = allPages.includes(query.url ?? "") ? query.url! : allPages[0] ?? null;
  const filtered = issues.filter((issue) => (!query.category || query.category === "Todas" || issue.group === query.category) && (!query.severity || issue.severity === query.severity) && (!query.status || issue.status === query.status));
  const pageIssues = issues.filter((issue) => issue.url === selectedUrl);
  const pageLh = lhFindings.filter((finding) => finding.url === selectedUrl);
  const overlaps = keywordOverlaps(keywords);

  return <>
    <p className="muted small">{project.name}</p>
    <ProjectNav base={base} current="seo" />
    <PageHead title="Análisis SEO"><StatusPill tone="neutral">N2-09 · datos existentes</StatusPill></PageHead>
    <p>Diagnóstico de resultados guardados en este proyecto. Las incidencias OpenSEO solo se muestran tras verificar firma y ámbito. Las importaciones y palabras clave son datos declarados, con procedencia separada.</p>
    {query.error && <p className="notice notice-error" role="alert">No se pudo completar la operación ({query.error}). Revisa los datos y permisos.</p>}
    {query.aviso && <p className="notice notice-info" role="status">Palabra clave {query.aviso}.</p>}
    {query.auditoria === "pendiente" && <p className="notice notice-error" role="alert">El cambio se guardó y su recibo S1 está pendiente de firma. No borres el proyecto hasta que se resuelva.</p>}
    <nav aria-label="Áreas de análisis" className="subnav"><ul><li><a href="#cobertura">Cobertura</a></li><li><a href="#incidencias">Incidencias</a></li><li><a href="#paginas">On-Page</a></li><li><a href="#keywords">Keywords</a></li></ul></nav>

    <section id="cobertura" className="section" aria-labelledby="cobertura-title">
      <h2 id="cobertura-title">Cobertura y procedencia</h2>
      <div className="cards">
        <div className="card"><strong>{issues.length}</strong><p>Incidencias OpenSEO verificadas</p><p className="muted small">{issueSummary && issuesLoaded?.ok && issuesLoaded.verification.verified ? <>Captura {formatDateTime(issueSummary.captured_at)} · <Link href={`${base}/auditoria-tecnica/resultados/${issueSummary.id}`}>Ver origen</Link></> : "Sin resultado verificable. No evaluado."}</p></div>
        <div className="card"><strong>{pages.length}</strong><p>URLs en inventario OpenSEO verificado</p><p className="muted small">{pageResultId ? <Link href={`${base}/auditoria-tecnica/resultados/${pageResultId}`}>Ver origen</Link> : "No evaluado: hace falta una captura de páginas."}</p></div>
        <div className="card"><strong>{lhFindings.length}</strong><p>Hallazgos Lighthouse importados</p><p className="muted small">Datos declarados; no equivalen a una medición firmada. {lhSummaries.length ? <Link href={`${base}/importaciones`}>Ver importaciones</Link> : "Sin importación."}</p></div>
      </div>
      {(!keyring || !listed.ok || issuesLoaded && (!issuesLoaded.ok || !issuesLoaded.verification.verified)) && <p className="notice notice-error" role="alert">La firma o el historial no están disponibles. Se ocultan los resultados OpenSEO afectados; esto no significa que el sitio no tenga problemas.</p>}
      {verifiedIssues && typeof verifiedIssues === "object" && "partial" in verifiedIssues && !!verifiedIssues.partial && <p className="notice notice-info">Captura parcial: las incidencias ausentes no se consideran resueltas.</p>}
      <p className="muted small">Robots, sitemap, respuesta HTTP, canonical, metadatos y rendimiento solo se evalúan cuando una fuente guardada aporta el campo o hallazgo correspondiente. No se calcula una puntuación SEO global.</p>
    </section>

    <section id="incidencias" className="section" aria-labelledby="incidencias-title">
      <h2 id="incidencias-title">Problemas técnicos ({filtered.length})</h2>
      <form method="get" action={`${base}/seo`} className="card form">
        <div className="field"><label htmlFor="seo-category">Categoría</label><select id="seo-category" name="category" defaultValue={FILTERS.includes(query.category ?? "") ? query.category : "Todas"}>{FILTERS.map((v) => <option key={v}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="seo-severity">Severidad</label><select id="seo-severity" name="severity" defaultValue={query.severity ?? ""}><option value="">Todas</option>{Object.entries(SEVERITY).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></div>
        <div className="field"><label htmlFor="seo-status">Estado en la captura</label><select id="seo-status" name="status" defaultValue={query.status ?? ""}><option value="">Todos</option><option value="OPEN">Abierta en la captura</option><option value="UNKNOWN">No determinado</option></select></div>
        <button className="btn" type="submit">Filtrar</button>
      </form>
      {filtered.length === 0 ? <EmptyState title="Sin incidencias para este filtro"><p>Si no hay una captura verificable, la categoría está no evaluada. Una lista vacía no demuestra ausencia de problemas.</p></EmptyState> : <ul className="cards">{filtered.map((issue, index) => <li className="card" key={`${issue.category}-${issue.url}-${index}`}><p><StatusPill tone={issue.severity === "ERROR" ? "warn" : "neutral"}>{SEVERITY[issue.severity]}</StatusPill> · {issue.group} · {issue.priority} · {issue.status === "OPEN" ? "Abierta en la captura" : "Estado no determinado"}</p><h3>{issue.category}</h3><p className="break">{issue.url || "Sitio completo; URL no aportada"}</p><p>{issue.explanation}</p><p><strong>Acción propuesta:</strong> {issue.recommendation}</p><p className="muted small">Fuente: OpenSEO firmado · {formatDateTime(issueSummary?.captured_at ?? null)} · {issueSummary && <Link href={`${base}/auditoria-tecnica/resultados/${issueSummary.id}`}>Resultado original</Link>}</p></li>)}</ul>}
    </section>

    <section id="paginas" className="section" aria-labelledby="paginas-title">
      <h2 id="paginas-title">Revisión On-Page por URL</h2>
      {allPages.length === 0 ? <EmptyState title="Páginas no evaluadas" requires={["Una captura OpenSEO verificada o una importación manual con URL"]}><p>No se ha consultado ninguna web desde esta pantalla.</p></EmptyState> : <>
        <div className="card"><label htmlFor="seo-page">Seleccionar página</label><ul className="checklist" id="seo-page">{allPages.slice(0, 100).map((url) => <li key={url}><Link aria-current={url === selectedUrl ? "page" : undefined} href={`${base}/seo?url=${encodeURIComponent(url)}#paginas`}>{urlPath(url)}</Link></li>)}</ul>{allPages.length > 100 && <p>Se muestran las primeras 100 URLs; consulta el resultado original para el resto.</p>}</div>
        <h3 className="break">{selectedUrl}</h3>
        <p><strong>Observado:</strong> URL presente en {pages.includes(selectedUrl!) ? "captura OpenSEO verificada" : "hallazgo guardado"}. Ruta: {urlPath(selectedUrl!)}.</p>
        <p><strong>Derivado:</strong> {pageIssues.length} incidencias técnicas y {pageLh.length} hallazgos Lighthouse importados asociados a esta URL. No se infiere su estado actual.</p>
        {pageIssues.map((issue, i) => <p className="card" key={i}><strong>{issue.category}</strong> · {issue.explanation}<br /><strong>Recomendado:</strong> {issue.recommendation}</p>)}
        {pageLh.map((f) => <p className="card" key={`${f.id}-${f.ruleId}`}><strong>{f.title}</strong> · {f.observation}<br /><strong>Recomendado:</strong> {f.proposal ?? "Revisar la medición original."}<br /><span className="muted small">Importación declarada: {f.source} · {formatDateTime(f.capturedAt)} · <Link href={`${base}/importaciones/${f.id}`}>Ver origen</Link></span></p>)}
        <h4>Controles sin observación suficiente</h4><ul className="cards">{ONPAGE_FIELDS.map((field) => <li className="card" key={field.label}><strong>{field.label}</strong><p>No evaluado. Hace falta {field.need}.</p></li>)}</ul>
      </>}
    </section>

    <section id="keywords" className="section" aria-labelledby="keywords-title">
      <h2 id="keywords-title">Palabras clave y oportunidades</h2>
      <p>Las palabras clave siguientes son declaraciones del equipo. Volumen, dificultad, CPC, posición y tendencia: <strong>sin medición disponible</strong>. Una keyword sin página objetivo es una oportunidad para investigar, no una recomendación de publicación.</p>
      {!n2Available && <p className="notice notice-info" role="status">La gestión de keywords no está activada en este despliegue; el diagnóstico SEO, las importaciones y los resultados guardados siguen disponibles.</p>}
      {n2Available && keywordsResult.error && <p className="notice notice-error" role="alert">No se pudieron leer las palabras clave. El error no se interpreta como una lista vacía.</p>}
      {keywordsAtLimit && <p className="notice notice-info" role="status">Se muestran como máximo 500 keywords. Los solapamientos y las consultas sin página se calculan solo sobre esta lista; pueden faltar declaraciones anteriores.</p>}
      {n2Available && !keywordsResult.error && canDraft && <form action={saveKeywordAction} className="card form"><h3>Añadir palabra clave</h3><input type="hidden" name="tenant" value={project.tenantId} /><input type="hidden" name="project" value={project.projectId} />
        <div className="field"><label htmlFor="kw-phrase">Consulta</label><input id="kw-phrase" name="phrase" required minLength={2} maxLength={160} /></div>
        <div className="field"><label htmlFor="kw-language">Idioma (ISO)</label><input id="kw-language" name="language" defaultValue="es" required pattern="[a-z]{2}(-[a-z]{2})?" /></div>
        <div className="field"><label htmlFor="kw-country">País (ISO)</label><input id="kw-country" name="country" defaultValue="ES" required pattern="[A-Z]{2}" /></div>
        <div className="field"><label htmlFor="kw-intent">Intención propuesta, editable</label><select id="kw-intent" name="intent">{INTENTS.map((v) => <option key={v} value={v}>{INTENT_LABELS[v]}</option>)}</select></div>
        <div className="field"><label htmlFor="kw-topic">Tema o grupo</label><input id="kw-topic" name="topic" maxLength={80} /></div>
        <div className="field"><label htmlFor="kw-target">Página objetivo del dominio del proyecto (opcional)</label><input id="kw-target" name="targetUrl" type="url" placeholder={project.domain ? `https://${project.domain}/pagina` : "https://dominio-del-proyecto/pagina"} /></div>
        <button className="btn" type="submit">Guardar keyword declarada</button>
      </form>}
      {n2Available && !keywordsResult.error && (keywords.length === 0 ? <EmptyState title="Aún no hay keywords declaradas"><p>Añade una consulta real del proyecto con idioma y país. No se harán consultas de pago.</p></EmptyState> : <ul className="cards">{keywords.map((keyword) => <li className="card" key={keyword.id}><h3>{keyword.phrase}</h3><p>{keyword.language_code} · {keyword.country_code} · {INTENT_LABELS[keyword.intent as keyof typeof INTENT_LABELS] ?? "Sin clasificar"} · Tema: {keyword.topic || "Sin grupo"}</p><p className="break">Página: {keyword.target_url ?? "Sin asignar: investigar página objetivo"}</p><p className="muted small">Declarada por usuario · {formatDateTime(keyword.created_at)} · Sin medición disponible.</p>{canDraft && <form action={saveKeywordAction} className="form"><input type="hidden" name="tenant" value={project.tenantId} /><input type="hidden" name="project" value={project.projectId} /><input type="hidden" name="id" value={keyword.id} /><input type="hidden" name="phrase" value={keyword.phrase} /><input type="hidden" name="language" value={keyword.language_code} /><input type="hidden" name="country" value={keyword.country_code} /><div className="field"><label htmlFor={`intent-${keyword.id}`}>Corregir intención</label><select id={`intent-${keyword.id}`} name="intent" defaultValue={keyword.intent}>{INTENTS.map((v) => <option key={v} value={v}>{INTENT_LABELS[v]}</option>)}</select></div><div className="field"><label htmlFor={`topic-${keyword.id}`}>Tema</label><input id={`topic-${keyword.id}`} name="topic" defaultValue={keyword.topic} maxLength={80} /></div><div className="field"><label htmlFor={`target-${keyword.id}`}>Página objetivo</label><input id={`target-${keyword.id}`} name="targetUrl" type="url" defaultValue={keyword.target_url ?? ""} /></div><button className="btn" type="submit">Actualizar</button></form>}{canDelete && <form action={deleteKeywordAction}><input type="hidden" name="tenant" value={project.tenantId} /><input type="hidden" name="project" value={project.projectId} /><input type="hidden" name="id" value={keyword.id} /><div className="field"><label><input type="checkbox" required /> Confirmo que quiero eliminar esta keyword.</label></div><button className="btn" type="submit">Eliminar</button></form>}</li>)}</ul>)}
      {n2Available && !keywordsResult.error && overlaps.length > 0 && <p className="notice notice-info">Posible solapamiento de páginas para: {overlaps.join(", ")}. Revisar intención y página principal antes de decidir.</p>}
      {n2Available && !keywordsResult.error && <p className="muted small">Oportunidades pendientes de análisis: {keywords.filter((k) => !k.target_url).length} consultas sin página asignada. No se asigna prioridad automática sin demanda y contexto comercial medidos.</p>}
    </section>
  </>;
}
