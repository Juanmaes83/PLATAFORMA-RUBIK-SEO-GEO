import { StatusPill } from "@/components/ui";
import { ENGINE_LABEL, ENGINES, METHOD_LABEL, METHODS, PRESENCE_LABEL, PRESENCES, type Presence } from "@/lib/geo/contract";
import type { Priority } from "@/lib/geo/rules";

// N2-13 presentation pieces. Declared and verified observations, presence and absence, and
// hypotheses are always told apart. User-provided text is rendered as text (React escapes it).

const DAY = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const formatDay = (iso: string | null) => (iso ? DAY.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : "—");
export const market = (o: { marketLanguage: string | null; marketCountry: string | null }) =>
  [o.marketLanguage, o.marketCountry].filter(Boolean).join(" · ") || "Mercado sin indicar";

export function PresencePill({ presence }: { presence: Presence }) {
  const tone = presence === "cited" ? "ok" : presence === "mentioned" ? "warn" : presence === "absent" ? "no" : "neutral";
  return <StatusPill tone={tone}>{PRESENCE_LABEL[presence]}</StatusPill>;
}
export function VerificationPill({ v }: { v: "declared" | "verified" }) {
  return v === "verified" ? <StatusPill tone="ok">Verificada</StatusPill> : <StatusPill tone="neutral">Declarada, sin verificar</StatusPill>;
}
export const PRIORITY_LABEL: Record<Priority, string> = { high: "Alta", medium: "Media", low: "Baja" };
export function PriorityPill({ p }: { p: Priority }) {
  return <StatusPill tone={p === "high" ? "no" : p === "medium" ? "warn" : "neutral"}>Prioridad {PRIORITY_LABEL[p].toLowerCase()}</StatusPill>;
}

export function Hidden({ values }: { values: Record<string, string> }) {
  return <>{Object.entries(values).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}</>;
}

/** Fields to record an observation; `d` pre-fills a correction of an existing one. */
export function ObservationFields({ idPrefix, today, d }: {
  idPrefix: string; today: string;
  d?: { entity?: string; engine?: string; engineDetail?: string | null; query?: string; language?: string | null; country?: string | null; method?: string };
}) {
  const id = (s: string) => `${idPrefix}-${s}`;
  return (
    <>
      <div className="field"><label htmlFor={id("entity")}>Marca o entidad observada</label>
        <input id={id("entity")} name="entity" required maxLength={120} defaultValue={d?.entity} autoComplete="off" /></div>
      <div className="grid-2">
        <div className="field"><label htmlFor={id("engine")}>Motor (declarado)</label>
          <select id={id("engine")} name="engine" defaultValue={d?.engine ?? "chatgpt"}>{ENGINES.map((e) => <option key={e} value={e}>{ENGINE_LABEL[e]}</option>)}</select></div>
        <div className="field"><label htmlFor={id("engineDetail")}>Modelo o versión (opcional)</label>
          <input id={id("engineDetail")} name="engineDetail" maxLength={80} defaultValue={d?.engineDetail ?? ""} autoComplete="off" /></div>
      </div>
      <div className="field"><label htmlFor={id("query")}>Consulta exacta</label>
        <textarea id={id("query")} name="query" required maxLength={500} rows={2} defaultValue={d?.query} /></div>
      <div className="field"><label htmlFor={id("date")}>Fecha observada</label>
        <input id={id("date")} name="observedOn" type="date" required max={today} min="2023-01-01" /></div>
      <div className="grid-2">
        <div className="field"><label htmlFor={id("language")}>Idioma (si se conoce)</label>
          <input id={id("language")} name="language" maxLength={2} defaultValue={d?.language ?? ""} autoComplete="off" placeholder="es" /></div>
        <div className="field"><label htmlFor={id("country")}>País (si se conoce)</label>
          <input id={id("country")} name="country" maxLength={2} defaultValue={d?.country ?? ""} autoComplete="off" placeholder="ES" /></div>
      </div>
      <div className="field"><label htmlFor={id("method")}>Método de obtención</label>
        <select id={id("method")} name="method" defaultValue={d?.method ?? "manual-copy"}>{METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}</select></div>
      <div className="field"><label htmlFor={id("presence")}>Presencia de la marca en la respuesta</label>
        <select id={id("presence")} name="presence" defaultValue="mentioned">{PRESENCES.map((p) => <option key={p} value={p}>{PRESENCE_LABEL[p]}</option>)}</select></div>
      <div className="field"><label htmlFor={id("excerpt")}>Fragmento relevante de la respuesta (opcional)</label>
        <textarea id={id("excerpt")} name="excerpt" maxLength={4000} rows={4} aria-describedby={id("excerpt-help")} />
        <p id={id("excerpt-help")} className="muted small">Solo la parte relevante, con su atribución al motor. Máximo 4000 caracteres.</p></div>
      <div className="field"><label htmlFor={id("sources")}>URLs citadas (opcional)</label>
        <textarea id={id("sources")} name="sources" rows={3} aria-describedby={id("sources-help")} />
        <p id={id("sources-help")} className="muted small">Una por línea: «https://… | título». Se guardan como texto; la plataforma no las visita.</p></div>
      <div className="field"><label htmlFor={id("entities")}>Otras marcas o entidades mencionadas (opcional)</label>
        <textarea id={id("entities")} name="entities" rows={2} aria-describedby={id("entities-help")} />
        <p id={id("entities-help")} className="muted small">Una por línea.</p></div>
      <div className="field"><label htmlFor={id("reference")}>Dónde está la evidencia original (opcional)</label>
        <input id={id("reference")} name="reference" maxLength={500} autoComplete="off" aria-describedby={id("reference-help")} />
        <p id={id("reference-help")} className="muted small">Por ejemplo, «captura en la carpeta del cliente, 12/10». No se sube ningún archivo.</p></div>
      <div className="field"><label htmlFor={id("notes")}>Notas (opcional)</label>
        <textarea id={id("notes")} name="notes" maxLength={1000} rows={2} /></div>
    </>
  );
}
