"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import type { Finding, Severity } from "@/lib/imports/contract";

export interface EvidenceEntry {
  key: string;
  finding: Finding;
  importId: string;
  source: string;
  capturedAt: string;
  status: string;
}
export const SEVERITY_LABELS: Record<Severity, string> = {critical:"Crítica",high:"Alta",medium:"Media",low:"Baja",info:"Informativa"};
export interface SeverityCount { key: Severity; count: number }

/** Local exploration of a bounded, already-authorized sample. No requests or writes. */
export function EvidenceExplorer({ entries, counts, base }: {entries: EvidenceEntry[]; counts: SeverityCount[]; base: string}) {
  const [selected, setSelected] = useState<Severity | "all">("all");
  const total = counts.reduce((sum, row) => sum + row.count, 0);
  const maximum = Math.max(1, ...counts.map(row => row.count));
  const matched = selected === "all" ? total : counts.find(row => row.key === selected)?.count ?? 0;
  const visible = entries.filter(entry => selected === "all" || entry.finding.severity === selected).slice(0, 6);
  return <div className="evidence-explorer">
    <div className="severity-explorer" role="group" aria-label="Filtrar hallazgos por gravedad declarada">
      <div className="severity-explorer-head"><h3>Gravedad declarada</h3><button type="button" aria-pressed={selected === "all"} onClick={() => setSelected("all")}>Todos <strong>{total}</strong></button></div>
      {counts.map(({key,count}) => <button type="button" className="severity-filter" key={key} aria-pressed={selected === key} aria-controls="sample-findings" onClick={() => setSelected(key)}>
        <span>{SEVERITY_LABELS[key]}</span><span className="severity-track" aria-hidden="true"><span className={`distribution-${key}`} style={{width:`${count / maximum * 100}%`}}/></span><strong>{count}</strong>
      </button>)}
      <p className="small muted">Selecciona una gravedad para ver su evidencia. El ancho compara cantidades de esta muestra; no es una puntuación del sitio.</p>
    </div>
    <div id="sample-findings" className="evidence-results">
      <p className="evidence-result-count" role="status">Mostrando {visible.length} de {matched} hallazgos abiertos {selected === "all" ? "de la muestra" : `de gravedad ${SEVERITY_LABELS[selected].toLocaleLowerCase("es")}`} · orden por gravedad declarada</p>
      {visible.length ? <ul className="finding-list">{visible.map(({key,finding,importId,source,capturedAt,status}) => <li key={key}>
        <div className="finding-heading"><span className={`severity severity-${finding.severity}`}>{SEVERITY_LABELS[finding.severity]}</span><span className="finding-status">Abierto · importado</span></div>
        <h3><Link href={`${base}/importaciones/${importId}`}>{finding.title} <span aria-hidden="true">↗</span></Link></h3>
        <p>{finding.observation}</p>
        <details className="finding-context"><summary>Fuente y evidencia</summary>
          <p className="finding-target">URL afectada · {finding.url}</p>
          <p className="finding-provenance">{source} · Capturada {formatDateTime(capturedAt)} · {status === "partial" ? "Importación parcial" : "Declaración importada"}</p>
          {finding.evidenceRef && <p>Referencia declarada · {finding.evidenceRef}</p>}
          {finding.proposal && <p>Propuesta de la importación · {finding.proposal}</p>}
          <Link href={`${base}/importaciones/${importId}`}>Abrir documento original</Link>
        </details>
      </li>)}</ul> : <p className="designed-empty">No hay hallazgos abiertos de esta gravedad en la muestra. Esto no acredita su ausencia en todo el sitio.</p>}
    </div>
  </div>;
}
