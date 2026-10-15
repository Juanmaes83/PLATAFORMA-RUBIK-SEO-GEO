import { StatusPill } from "@/components/ui";
import { MISMATCH_LABEL, type Comparison, type Observation } from "@/lib/competitors/compare";
import { DEVICE_LABEL, DEVICES, METHOD_LABEL, METRIC_LABEL, METRICS, type Metric } from "@/lib/competitors/contract";

// N2-11 presentation pieces. Every value is shown with how it was obtained; nothing missing is
// displayed as 0 and an unverified difference is never phrased as a recommendation.

const NUMBER = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });
const DATE = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const formatDay = (iso: string) => DATE.format(new Date(`${iso}T00:00:00Z`));
export const formatValue = (n: number) => NUMBER.format(n);

export function market(o: Pick<Observation, "marketCountry" | "marketLanguage" | "device">): string {
  const parts = [o.marketCountry, o.marketLanguage, o.device ? DEVICE_LABEL[o.device] : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Sin mercado indicado";
}

export function MethodPill({ o }: { o: Pick<Observation, "method" | "availability"> }) {
  if (o.availability === "not-available") return <StatusPill tone="neutral">No disponible en la fuente</StatusPill>;
  return o.method === "observed" ? <StatusPill tone="ok">Dato observado</StatusPill> : <StatusPill tone="warn">Declarado manualmente</StatusPill>;
}

export function VerificationPill({ o }: { o: Pick<Observation, "verification"> }) {
  return o.verification === "verified" ? <StatusPill tone="ok">Verificado</StatusPill> : <StatusPill tone="neutral">Sin verificar</StatusPill>;
}

/** "120 (Ahrefs, 1 oct 2026)" or "No disponible (Semrush, …)". */
export function Reading({ o }: { o: Observation }) {
  return (
    <span>
      {o.availability === "available" ? <strong>{formatValue(o.value as number)}</strong> : <em>No disponible</em>}{" "}
      <span className="muted small">({o.sourceName}, {formatDay(o.observedOn)}, {o.method === "observed" ? "observado" : "declarado"})</span>
    </span>
  );
}

export function ComparisonVerdict({ c }: { c: Comparison }) {
  switch (c.kind) {
    case "missing-competitor":
      return <span className="muted">Sin mediciones del competidor</span>;
    case "missing-project":
      return <span className="muted">Sin mediciones de tu sitio para esta métrica</span>;
    case "not-available":
      return <span className="muted">No disponible en la fuente ({c.side === "both" ? "ambos" : c.side === "competitor" ? "competidor" : "tu sitio"}): no se compara</span>;
    case "not-comparable":
      return (
        <span>
          <StatusPill tone="warn">Comparación no válida</StatusPill>{" "}
          <span className="small">{c.reasons.map((r) => MISMATCH_LABEL[r]).join("; ")}</span>
        </span>
      );
    case "comparable": {
      const sign = c.difference > 0 ? "+" : "";
      return (
        <span>
          <strong>{sign}{formatValue(c.difference)}</strong> <span className="small">respecto a tu sitio</span>{" "}
          {c.verified ? <StatusPill tone="ok">Verificada</StatusPill> : <StatusPill tone="warn">Pendiente de verificación</StatusPill>}
          {c.declared && <span className="small muted"> · datos declarados manualmente</span>}
        </span>
      );
    }
  }
}

/** Form to record one observation; `competitor` is a competitor id or "project" (own site). */
export function ObservationForm({ action, tenant, project, competitor, today, idPrefix }: {
  action: (formData: FormData) => Promise<void>;
  tenant: string;
  project: string;
  competitor: string;
  today: string;
  idPrefix: string;
}) {
  const id = (s: string) => `${idPrefix}-${s}`;
  return (
    <form action={action} className="card form">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="project" value={project} />
      <input type="hidden" name="competitor" value={competitor} />
      <div className="field">
        <label htmlFor={id("metric")}>Métrica</label>
        <select id={id("metric")} name="metric" required defaultValue="">
          <option value="" disabled>Elige una métrica</option>
          {METRICS.map((m: Metric) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={id("value")}>Valor</label>
        <input id={id("value")} name="value" inputMode="decimal" autoComplete="off" aria-describedby={id("value-help")} />
        <p id={id("value-help")} className="muted small">Sin separadores de miles. Déjalo vacío solo si marcas «no disponible».</p>
      </div>
      <div className="field field-check">
        <input id={id("na")} name="availability" type="checkbox" value="not-available" />
        <label htmlFor={id("na")}>La fuente no da este dato (se guarda como «no disponible», nunca como 0)</label>
      </div>
      <div className="field">
        <label htmlFor={id("method")}>Cómo se obtuvo</label>
        <select id={id("method")} name="method" required defaultValue="observed">
          <option value="observed">{METHOD_LABEL.observed}</option>
          <option value="declared">{METHOD_LABEL.declared}</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={id("source")}>Fuente</label>
        <input id={id("source")} name="source" required maxLength={80} autoComplete="off" aria-describedby={id("source-help")} />
        <p id={id("source-help")} className="muted small">Herramienta o persona (por ejemplo, «Ahrefs» o «Informe del cliente»). Solo se comparan lecturas de la misma fuente.</p>
      </div>
      <div className="field">
        <label htmlFor={id("date")}>Fecha de la observación</label>
        <input id={id("date")} name="observedOn" type="date" required max={today} min="2000-01-01" />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor={id("country")}>País (opcional)</label>
          <input id={id("country")} name="country" maxLength={2} autoComplete="off" placeholder="ES" />
        </div>
        <div className="field">
          <label htmlFor={id("language")}>Idioma (opcional)</label>
          <input id={id("language")} name="language" maxLength={2} autoComplete="off" placeholder="es" />
        </div>
      </div>
      <div className="field">
        <label htmlFor={id("device")}>Dispositivo (opcional)</label>
        <select id={id("device")} name="device" defaultValue="">
          <option value="">Sin indicar</option>
          {DEVICES.map((d) => <option key={d} value={d}>{DEVICE_LABEL[d]}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={id("reference")}>Referencia (opcional)</label>
        <input id={id("reference")} name="reference" maxLength={500} autoComplete="off" aria-describedby={id("reference-help")} />
        <p id={id("reference-help")} className="muted small">Nombre del informe o dirección donde consultarlo. Se guarda como texto y la plataforma no la abre.</p>
      </div>
      <div className="field">
        <label htmlFor={id("notes")}>Notas (opcional)</label>
        <input id={id("notes")} name="notes" maxLength={500} autoComplete="off" />
      </div>
      <button type="submit" className="btn btn-block">Registrar observación</button>
    </form>
  );
}
