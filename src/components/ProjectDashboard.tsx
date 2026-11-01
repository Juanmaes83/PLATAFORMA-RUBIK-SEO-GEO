import Link from "next/link";
import { SourceStatePill } from "@/components/dashboard";
import { EvidenceExplorer, type EvidenceEntry, type SeverityCount } from "@/components/EvidenceExplorer";
import { contentGeoSchemaAvailable, n2SchemaAvailable } from "@/lib/n2/availability";
import { formatDateTime } from "@/lib/format";
import type { ProjectModules } from "@/lib/signals";
import type { ImportRow } from "@/lib/imports/repository";

const SOURCES = [
  ["measurement", "Medición", "GSC / GA4 · capturas guardadas", "medicion"],
  ["technical", "SEO técnico", "OpenSEO · auditoría del sitio", "seo"],
  ["imports", "Importaciones", "Revisiones declaradas por su autor", "importaciones"],
  ["competitors", "Competidores", "Sitios y lecturas declaradas", "competidores"],
  ["content", "Contenidos", "Oportunidades y briefs registrados", "contenidos"],
  ["geo", "GEO e IA", "Observaciones registradas", "geo"],
] as const;
const ORDER = ["critical", "high", "medium", "low", "info"] as const;
const ICONS = {data:"●",no_data:"○",pending:"◷",unavailable:"—"} as const;

/** Server presentation of existing RLS-scoped signals; only the bounded explorer is interactive. */
export function ProjectDashboard({modules, imports, base}: {modules:ProjectModules; imports:ImportRow[]|null; base:string}) {
  const openEntries: EvidenceEntry[] = imports?.flatMap(row => row.findings.flatMap((finding,index) => finding.status === "open" ? [{key:`${row.id}-${index}`,finding,importId:row.id,source:row.source_label,capturedAt:row.captured_at,status:row.status}] : [])) ?? [];
  const counts: SeverityCount[] = ORDER.map(key => ({key,count:openEntries.filter(entry => entry.finding.severity === key).length}));
  // Send at most six per severity (30), not the full import payload, to the client.
  const entries = ORDER.flatMap(key => openEntries.filter(entry => entry.finding.severity === key).slice(0,6));
  const hasImports = imports !== null && imports.length > 0;
  const higher = counts.filter(row => row.key === "critical" || row.key === "high").reduce((sum,row) => sum + row.count,0);
  const recorded = SOURCES.filter(([key]) => modules[key].state === "data").length;
  const actions = [
    {key:"imports",title:hasImports ? "Revisar la evidencia importada" : "Consultar importaciones",body:hasImports ? "Contrasta cada hallazgo con su fuente y alcance." : "Consulta o aporta una revisión existente.",route:"importaciones",signal:modules.imports,enabled:true},
    {key:"measurement",title:modules.measurement.state === "data" ? "Revisar la medición" : "Preparar la medición",body:modules.measurement.lines[0] ?? "Consulta propiedades y capturas disponibles.",route:"medicion",signal:modules.measurement,enabled:true},
    {key:"technical",title:"Consultar el análisis SEO",body:modules.technical.lines[0] ?? "Consulta la auditoría y sus límites.",route:"seo",signal:modules.technical,enabled:true},
    {key:"content",title:"Revisar contenidos",body:modules.content.lines[0] ?? "Consulta oportunidades y briefs con evidencia.",route:"contenidos",signal:modules.content,enabled:contentGeoSchemaAvailable()},
    {key:"competitors",title:"Situar la competencia",body:modules.competitors.lines[0] ?? "Consulta los competidores y sus lecturas.",route:"competidores",signal:modules.competitors,enabled:n2SchemaAvailable()},
    {key:"geo",title:"Analizar observaciones GEO",body:modules.geo.lines[0] ?? "Consulta observaciones con sus fuentes.",route:"geo",signal:modules.geo,enabled:contentGeoSchemaAvailable()},
  ].filter(action => action.enabled && (action.key === "imports" || action.signal.state !== "unavailable"))
    .sort((a,b) => Number(b.key === "imports" && hasImports)-Number(a.key === "imports" && hasImports) || Number(b.signal.state === "data")-Number(a.signal.state === "data")).slice(0,3);
  return <div className="project-intelligence refinement">
    <section className="executive-brief" aria-labelledby="intelligence-title">
      <div><p className="eyebrow">01 / SITUACIÓN DEL PROYECTO</p>
        <h2 id="intelligence-title">{hasImports ? <><strong>{openEntries.length}</strong> {openEntries.length === 1 ? "hallazgo abierto" : "hallazgos abiertos"} en la muestra</> : imports === null ? "La evidencia necesita una nueva lectura" : "Prepara tu primera lectura"}</h2>
        <p className="executive-context">{hasImports ? <>En {imports.length} importaciones recientes · <strong>{higher} de gravedad alta o crítica</strong>, declarada por la fuente.</> : imports === null ? "La lectura falló; no significa que no haya incidencias." : "Todavía no hay importaciones. Empieza por una fuente fiable para decidir con evidencia."}</p>
        <div className="hero-actions"><Link className="btn" href={hasImports ? "#evidence-title" : `${base}/${imports === null ? "importaciones" : "medicion"}`}>{hasImports ? "Explorar los hallazgos" : imports === null ? "Consultar importaciones" : "Preparar la medición"} <span aria-hidden="true">→</span></Link><Link className="insight-link" href={`${base}/informe`}>Abrir informe <span aria-hidden="true">↗</span></Link></div>
      </div>
      <div className="brief-scope"><span className="scope-mark" aria-hidden="true">{hasImports ? "↳" : "○"}</span><div><strong>{hasImports ? "Evidencia declarada" : `${recorded} de 6 módulos con registros`}</strong><p>{hasImports ? "No verificada independientemente. Una muestra orienta la revisión; no describe todo el sitio." : "Disponibilidad de registros; no mide el rendimiento SEO/GEO. Las fuentes y sus límites están debajo."}</p></div></div>
    </section>
    <section className="source-overview" aria-labelledby="sources-title"><div className="section-heading"><h2 id="sources-title">Fuentes del proyecto</h2><span>Estado disponible · abre una fuente para más contexto</span></div>
      <div className="source-matrix">{SOURCES.map(([key,title,source,route]) => {
        const signal=modules[key];
        return <details key={key} className={`source-cell source-${signal.state}`}><summary><span className="source-symbol" aria-hidden="true">{ICONS[signal.state]}</span><span><strong>{title}</strong><SourceStatePill state={signal.state}/></span><span className="source-chevron" aria-hidden="true">+</span></summary><div className="source-detail"><p>{source}</p><p>{signal.at ? formatDateTime(signal.at) : "Sin fecha de observación disponible"}</p>{signal.lines.map(line => <p key={line}>{line}</p>)}{signal.note && <p>{signal.note}</p>}{signal.state === "unavailable" && <p>Esquema sin habilitar o lectura no completada; no equivale a ausencia de datos.</p>}<Link href={`${base}/${route}`}>Revisar fuente <span aria-hidden="true">↗</span></Link></div></details>;
      })}</div>
    </section>
    <div className="analysis-layout">
      <section className="analysis-panel" aria-labelledby="evidence-title"><div className="analysis-heading"><div><p className="eyebrow">02 / DIAGNÓSTICO CON EVIDENCIA</p><h2 id="evidence-title" tabIndex={-1}>Del hallazgo a su fuente</h2></div><Link href={`${base}/importaciones`}>Ver importaciones <span aria-hidden="true">↗</span></Link></div>
        <p className="sample-scope">Hasta seis hallazgos abiertos por filtro de las tres importaciones más recientes. Un hallazgo puede repetirse entre importaciones. Gravedad y propuestas declaradas, no comprobaciones independientes.</p>
        {hasImports && openEntries.length > 0 ? <EvidenceExplorer entries={entries} counts={counts} base={base}/> : <div className="designed-empty"><span className="empty-symbol" aria-hidden="true">↗</span><h3>{imports === null ? "No se pudo leer la evidencia" : hasImports ? "Sin hallazgos abiertos en esta muestra" : "Tu primera lectura empieza aquí"}</h3><p>{imports === null ? "Un fallo de lectura no se interpreta como ausencia de incidencias." : hasImports ? "Esto no acredita que todo el sitio esté libre de incidencias." : "Importa una auditoría o revisión existente para explorar sus hallazgos con fuente y fecha."}</p><Link className="btn btn-ghost" href={`${base}/importaciones`}>Consultar importaciones</Link></div>}
      </section>
      <aside className="analysis-panel next-actions" aria-labelledby="next-title"><p className="eyebrow">03 / PRÓXIMOS PASOS</p><h2 id="next-title">Dónde continuar</h2><p>Primero evidencia importada, después fuentes con registros y preparación. No es un orden de urgencia.</p><ol>{actions.map(({key,title,body,route},index) => <li key={key}><span>{String(index+1).padStart(2,"0")}</span><div><h3><Link href={`${base}/${route}`}>{title} <span aria-hidden="true">↗</span></Link></h3><p>{body}</p></div></li>)}</ol><details className="analysis-footnote"><summary>Alcance de este resumen</summary><p>No hay serie temporal comparable. Las métricas, períodos y verificación se consultan en cada fuente. No se deduce causalidad de estos registros.</p></details></aside>
    </div>
  </div>;
}
