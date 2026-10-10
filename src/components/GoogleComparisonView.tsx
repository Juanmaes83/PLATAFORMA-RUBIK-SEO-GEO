import Link from "next/link";
import { EmptyState, StatusPill } from "@/components/ui";
import type { BlockReason, GoogleComparison, Warning } from "@/lib/openseo/google/compare";
import { PROVIDER_LABELS } from "@/lib/openseo/google/capture-messages";

// Result of comparing two stored Google captures. Blocking reasons show no rows; warnings are shown
// above the rows and never hidden. A row seen on one side only is "no observada", never a zero.
export const BLOCK_MESSAGES: Record<BlockReason, string> = {
  UNVERIFIED: "Al menos una captura no supera la comprobación de firma, huella o contexto del proyecto; no se muestran sus datos.",
  NOT_GOOGLE: "Solo se comparan capturas de Search Console o GA4.",
  PROVIDER_DIFFERS: "Una captura es de Search Console y la otra de GA4: miden cosas distintas.",
  PROPERTY_DIFFERS: "Las capturas son de propiedades distintas.",
  DIMENSIONS_DIFFER: "Las capturas de Search Console usan dimensiones distintas, así que sus filas no se corresponden.",
  INVALID_QUERY: "La consulta firmada de una captura no tiene un periodo válido.",
};
export const WARNING_MESSAGES: Record<Warning, string> = {
  PERIOD_LENGTH_DIFFERS: "Los periodos tienen distinta duración: los totales no son comparables directamente.",
  PERIODS_OVERLAP: "Los periodos se solapan: parte de los días cuenta en las dos capturas.",
  SAME_PERIOD: "Las dos capturas son del mismo periodo: las diferencias solo pueden venir de datos que Google actualizó después.",
  PAGINATION_DIFFERS: "Se pidieron filas distintas (límite o desplazamiento): que una fila falte en un lado no significa que no exista.",
  PARTIAL_BEFORE: "La captura anterior es parcial (más filas que las pedidas, muestreo o umbrales): no representa el total.",
  PARTIAL_AFTER: "La captura posterior es parcial (más filas que las pedidas, muestreo o umbrales): no representa el total.",
  EMPTY_BEFORE: "La captura anterior no tiene filas.",
  EMPTY_AFTER: "La captura posterior no tiene filas.",
};
const LABELS: Record<string, string> = {
  clicks: "Clics", impressions: "Impresiones", ctr: "CTR", averagePosition: "Posición media", sessions: "Sesiones", activeUsers: "Usuarios activos",
  engagedSessions: "Sesiones con interacción", engagementRate: "Tasa de interacción", keyEvents: "Eventos clave",
  sessionKeyEventRate: "Tasa de eventos clave", transactions: "Transacciones", purchaseRevenue: "Ingresos",
};
const RATES = new Set(["ctr", "engagementRate", "sessionKeyEventRate"]);
const fmt = (v: number | null, metric: string, signed = false) => {
  if (v === null) return "—";
  const sign = signed && v > 0 ? "+" : "";
  if (RATES.has(metric)) return `${sign}${(v * 100).toFixed(1)}${signed ? " p.p." : " %"}`;
  return sign + (Number.isInteger(v) ? v.toLocaleString("es-ES") : v.toFixed(2));
};
const PRESENCE = { both: null, "only-before": "Solo en la anterior", "only-after": "Solo en la posterior" } as const;

export function GoogleComparisonView({ comparison, base }: { comparison: GoogleComparison; base: string }) {
  if (!comparison.ok) {
    return <EmptyState title="Estas capturas no se pueden comparar"><p>{BLOCK_MESSAGES[comparison.reason]}</p></EmptyState>;
  }
  const { provider, property, before, after, warnings, rows, swapped } = comparison;
  const shared = rows.filter((r) => r.presence === "both").length;
  return (
    <>
      <dl className="facts">
        <div><dt>Fuente</dt><dd>{PROVIDER_LABELS[provider]}</dd></div>
        <div><dt>Propiedad</dt><dd className="break">{property}</dd></div>
        <div><dt>Anterior</dt><dd><Link href={`${base}/google/${before.id}`}>{before.start} – {before.end}</Link> · {before.status}</dd></div>
        <div><dt>Posterior</dt><dd><Link href={`${base}/google/${after.id}`}>{after.start} – {after.end}</Link> · {after.status}</dd></div>
      </dl>
      {swapped && <p className="muted small">Se han ordenado por fecha de inicio del periodo.</p>}
      {warnings.length > 0 && (
        <section aria-labelledby="gc-avisos" className="section">
          <h2 id="gc-avisos">Avisos antes de leer las cifras</h2>
          <ul className="checklist">{warnings.map((w) => <li key={w}>{WARNING_MESSAGES[w]}</li>)}</ul>
        </section>
      )}
      <section aria-labelledby="gc-filas" className="section">
        <h2 id="gc-filas">Filas ({shared} en ambas, {rows.length - shared} en una sola)</h2>
        <p className="muted small">Una fila que solo aparece en un lado está «no observada» en el otro: no equivale a cero.</p>
        {rows.length === 0 ? (
          <EmptyState title="Sin filas en ninguna de las dos"><p>No hay nada que comparar.</p></EmptyState>
        ) : (
          <ul className="cards" aria-label={`${rows.length} filas comparadas`}>
            {rows.map((r) => (
              <li className="card" key={r.key}>
                <div className="card-head">
                  <h3 className="break">{r.label.join(" · ")}</h3>
                  {PRESENCE[r.presence] && <StatusPill tone="warn">{PRESENCE[r.presence]}</StatusPill>}
                </div>
                <dl className="facts">
                  {r.metrics.map((m) => (
                    <div key={m.metric}>
                      <dt>{LABELS[m.metric] ?? m.metric}</dt>
                      <dd>{fmt(m.before, m.metric)} → {fmt(m.after, m.metric)}{m.delta !== null && <> ({fmt(m.delta, m.metric, true)})</>}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
