import Link from "next/link";
import { SourceStatePill } from "@/components/dashboard";
import { formatDateTime } from "@/lib/format";
import type { ProjectModules, ModuleSignal } from "@/lib/signals";
import type { ImportRow } from "@/lib/imports/repository";

const SOURCES = [
  ["measurement", "Medición orgánica", "GSC / GA4 · capturas guardadas", "medicion"],
  ["technical", "SEO técnico", "OpenSEO · auditoría del sitio", "seo"],
  ["geo", "GEO e IA", "Observaciones registradas", "geo"],
] as const;
const SEVERITY: Record<string, string> = {critical:"Crítica",high:"Alta",medium:"Media",low:"Baja",info:"Informativa"};

function Signal({ title, source, signal, href }: {title:string; source:string; signal:ModuleSignal; href:string}) {
  return <article className="insight-card">
    <div className="insight-card-top"><span>{title}</span><SourceStatePill state={signal.state}/></div>
    <p className="insight-value">{signal.state === "data" ? "Lectura disponible" : signal.state === "pending" ? "Por configurar" : signal.state === "unavailable" ? "Lectura no disponible" : "Aún sin registros"}</p>
    <p className="insight-source">{source}</p>
    <p className="small muted">{signal.at ? formatDateTime(signal.at) : "Sin fecha de observación disponible"}</p>
    {signal.lines.map(line=><p className="small" key={line}>{line}</p>)}
    {signal.note && <p className="insight-limit">{signal.note}</p>}
    <Link href={href} className="insight-link">Revisar fuente <span aria-hidden="true">↗</span></Link>
  </article>;
}

/** Presentation only: existing RLS-scoped signals and imported declarations. No synthetic metrics. */
export function ProjectDashboard({modules, imports, base}: {modules:ProjectModules; imports:ImportRow[]|null; base:string}) {
  const channels = [modules.measurement,modules.technical,modules.imports,modules.competitors,modules.content,modules.geo];
  const recorded = channels.filter(s=>s.state === "data").length;
  const findings = imports?.flatMap(row=>row.findings.filter(f=>f.status === "open").map((finding,i)=>({finding,row,key:`${row.id}-${i}`}))).slice(0,6) ?? [];
  const openFindings = imports?.flatMap(row=>row.findings.filter(f=>f.status === "open")) ?? [];
  const severity = ["critical", "high", "medium", "low", "info"].map(key=>({key,label:SEVERITY[key],count:openFindings.filter(f=>f.severity===key).length}));
  const hasImports = imports !== null && imports.length > 0;
  return <div className="project-intelligence">
    <section className="intelligence-intro" aria-labelledby="intelligence-title">
      <div><p className="eyebrow">RESUMEN · INTELIGENCIA DEL PROYECTO</p>
        <h2 id="intelligence-title">{hasImports ? <>{openFindings.length} hallazgos abiertos.<br/><span>Una prioridad: revisar la evidencia.</span></> : <>Empieza por una fuente fiable.<br/><span>Después, decide dónde actuar.</span></>}</h2>
        <p>{hasImports ? `Muestra de ${imports.length} importaciones recientes. Distingue las incidencias declaradas de las mediciones verificadas y convierte la información en próximos pasos.` : "Conecta la medición o importa una revisión existente. Aquí verás la información disponible, su origen y sus límites."}</p>
        <div className="hero-actions"><Link className="btn" href={`${base}/${hasImports ? "importaciones" : "medicion"}`}>{hasImports ? "Revisar hallazgos importados" : "Preparar la medición"} <span aria-hidden="true">→</span></Link><Link className="btn btn-ghost" href={`${base}/informe`}>Abrir informe</Link></div>
      </div>
      <aside className="evidence-summary" aria-label="Prioridad de hallazgos importados">
        <span className="eyebrow">{hasImports ? "PRIORIDAD DE LA MUESTRA" : "COBERTURA DE REGISTROS"}</span>
        {hasImports ? <>
          <div className="severity-chart" role="img" aria-label={severity.map(s=>`${s.label}: ${s.count}`).join(', ')}>{severity.filter(s=>s.count>0).map(s=><span key={s.key} className={`distribution-${s.key}`} style={{flex:s.count}}/>)}</div>
          <dl className="severity-key">{severity.filter(s=>s.count>0).map(s=><div key={s.key}><dt><i className={`distribution-${s.key}`} aria-hidden="true"/>{s.label}</dt><dd>{s.count}</dd></div>)}</dl>
          <p className="small muted">Declaraciones importadas · no verificadas independientemente. No es una puntuación del sitio.</p>
        </> : <><p><strong>{recorded}<span> / 6</span></strong></p><span>módulos con registros</span><p className="small muted">Disponibilidad de datos, no una puntuación SEO/GEO ni verificación de firmas.</p></>}
      </aside>
    </section>
    <div className="insight-grid">{SOURCES.map(([key,title,source,route])=><Signal key={key} title={title} source={source} signal={modules[key]} href={`${base}/${route}`}/>)}</div>
    <div className="analysis-layout">
      <section className="analysis-panel" aria-labelledby="evidence-title">
        <div className="analysis-heading"><div><p className="eyebrow">EVIDENCIA → DECISIÓN</p><h2 id="evidence-title">Hallazgos que puedes revisar</h2></div><Link href={`${base}/importaciones`}>Ver importaciones <span aria-hidden="true">↗</span></Link></div>
        <p className="small muted">Hasta seis hallazgos abiertos de las tres importaciones más recientes. Son declaraciones importadas, no comprobaciones independientes de Rubik. Un hallazgo puede repetirse entre importaciones.</p>
        {findings.length > 0 ? <ul className="finding-list">{findings.map(({finding,row,key})=><li key={key}>
          <span className={`severity severity-${finding.severity}`}>{SEVERITY[finding.severity] ?? finding.severity}</span>
          <div><h3><Link href={`${base}/importaciones/${row.id}`}>{finding.title}</Link></h3><p>{finding.observation}</p><p className="finding-provenance">{row.source_label} · Capturada {formatDateTime(row.captured_at)} · {row.status === "partial" ? "Importación parcial" : "Declaración importada"}</p></div>
          <span className="finding-status">Abierto</span>
        </li>)}</ul> : <div className="designed-empty"><span className="empty-symbol" aria-hidden="true">↗</span><h3>{imports === null ? "No se pudo leer la evidencia" : hasImports ? "Sin hallazgos abiertos en esta muestra" : "Tu primera lectura empieza aquí"}</h3><p>{imports === null ? "No se interpreta un fallo de lectura como ausencia de incidencias. Puedes consultar la fuente directamente." : hasImports ? "Esto no acredita que todo el sitio esté libre de incidencias. Revisa las importaciones y su alcance." : "Importa una auditoría o revisión existente para convertir la evidencia del sitio en próximos pasos concretos."}</p><Link className="btn btn-ghost" href={`${base}/importaciones`}>{imports === null || hasImports ? "Consultar importaciones" : "Abrir importaciones"}</Link></div>}
      </section>
      <aside className="analysis-panel next-actions" aria-labelledby="next-title"><p className="eyebrow">PLAN DE TRABAJO</p><h2 id="next-title">Dónde continuar</h2>
        <ol>{[
          ["01","Revisa la medición",modules.measurement.state === "data" ? "Consulta la captura, su periodo y su verificación." : "Asocia una propiedad o consulta por qué aún no hay capturas.","medicion"],
          ["02","Prioriza contenido",modules.content.lines[0] ?? "Consulta oportunidades y briefs con evidencia, si el módulo está disponible.","contenidos"],
          ["03","Sitúa tu competencia",modules.competitors.lines[0] ?? "Declara los sitios que quieres comparar sin inventar posiciones.","competidores"],
        ].map(([n,title,body,route])=><li key={n}><span>{n}</span><div><h3><Link href={`${base}/${route}`}>{title} <span aria-hidden="true">↗</span></Link></h3><p>{body}</p></div></li>)}</ol>
        <div className="analysis-footnote"><strong>Sin tendencias inventadas</strong><p>Este resumen no dispone de una serie temporal comparable. Las métricas y sus límites se consultan en cada fuente.</p></div>
      </aside>
    </div>
  </div>;
}
