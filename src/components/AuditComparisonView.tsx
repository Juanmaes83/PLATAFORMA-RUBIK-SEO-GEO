import { StatusPill } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { SEVERITY_LABELS } from "@/lib/openseo/labels";
import type { AuditComparison, ComparedIssue, Severity } from "@/lib/openseo/compare";

const SEVERITY_ORDER: readonly Severity[] = ["ERROR", "WARNING", "OPPORTUNITY", "UNKNOWN"];
const severityText = (s: Severity) => SEVERITY_LABELS[s] ?? "Sin clasificar";
/** Long groups are cut so a large crawl stays usable on a phone; the count is always exact. */
const VISIBLE = 50;

function IssueGroup({ id, title, issues, before }: { id: string; title: string; issues: (ComparedIssue & { before?: Severity })[]; before?: boolean }) {
  return (
    <section aria-labelledby={id} className="section">
      <h3 id={id}>{title} ({issues.length})</h3>
      {issues.length === 0 ? (
        <p className="muted">Ninguna.</p>
      ) : (
        <>
          <ul className="cards">
            {issues.slice(0, VISIBLE).map((issue) => (
              <li className="card" key={`${issue.category}|${issue.url}`}>
                <p>
                  <strong>{before && issue.before ? `${severityText(issue.before)} → ${severityText(issue.severity)}` : severityText(issue.severity)}</strong> · {issue.category}
                </p>
                <p className="break">{issue.url}</p>
              </li>
            ))}
          </ul>
          {issues.length > VISIBLE && <p className="muted small">Se muestran {VISIBLE} de {issues.length}. La exportación del proyecto conserva los resultados completos.</p>}
        </>
      )}
    </section>
  );
}

export function AuditComparisonView({ comparison }: { comparison: AuditComparison }) {
  const { before, after } = comparison;
  return (
    <>
      <dl className="facts card">
        <div><dt>Captura anterior</dt><dd>{formatDateTime(before.capturedAt)} · {before.total} incidencias</dd></div>
        <div><dt>Captura posterior</dt><dd>{formatDateTime(after.capturedAt)} · {after.total} incidencias</dd></div>
        <div><dt>Resueltas</dt><dd>{comparison.resolved.length}</dd></div>
        <div><dt>Nuevas</dt><dd>{comparison.added.length}</dd></div>
        <div><dt>Cambian de severidad</dt><dd>{comparison.changed.length}</dd></div>
        <div><dt>Sin cambios</dt><dd>{comparison.unchanged}</dd></div>
      </dl>

      {comparison.caveats.length > 0 && (
        <div className="card" role="note">
          <p><StatusPill tone="warn">Comparación con reservas</StatusPill></p>
          <ul>{comparison.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      )}

      <section aria-labelledby="c-severidad" className="section">
        <h2 id="c-severidad">Por severidad</h2>
        <dl className="facts card">
          {SEVERITY_ORDER.filter((s) => s !== "UNKNOWN" || comparison.bySeverity.UNKNOWN.before + comparison.bySeverity.UNKNOWN.after > 0).map((s) => (
            <div key={s}><dt>{severityText(s)}</dt><dd>{comparison.bySeverity[s].before} → {comparison.bySeverity[s].after}</dd></div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="c-detalle" className="section">
        <h2 id="c-detalle">Detalle</h2>
        <IssueGroup id="c-nuevas" title="Nuevas" issues={comparison.added} />
        <IssueGroup id="c-resueltas" title="Ya no aparecen" issues={comparison.resolved} />
        <IssueGroup id="c-cambios" title="Cambian de severidad" issues={comparison.changed} before />
      </section>
    </>
  );
}
