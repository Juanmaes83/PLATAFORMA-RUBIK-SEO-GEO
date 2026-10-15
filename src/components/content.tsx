import Link from "next/link";
import { StatusPill } from "@/components/ui";
import {
  BRIEF_STATUS_LABEL, CLUSTER_ROLE_LABEL, INTENT_LABEL, INTENTS, OPPORTUNITY_STATUS_LABEL, OPPORTUNITY_TYPE_LABEL, OPPORTUNITY_TYPES,
  PRIORITY_LABEL, PRIORITIES, type BriefStatus, type Priority,
} from "@/lib/content/contract";
import { SUPPORT_LABEL, type Support } from "@/lib/content/insights";
import type { Cluster, Opportunity } from "@/lib/content/repository";

// N2-12 presentation pieces. Proposals, evidence and missing data are always told apart.

const DAY = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const formatDay = (iso: string | null) => (iso ? DAY.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : "—");
export const market = (o: { marketLanguage: string; marketCountry: string | null }) => [o.marketLanguage, o.marketCountry].filter(Boolean).join(" · ");

export function PriorityPill({ priority, support }: { priority: Priority; support: Support }) {
  if (priority === "unset") return <StatusPill tone="neutral">Sin priorizar</StatusPill>;
  return <StatusPill tone={support === "hypothesis" ? "warn" : "ok"}>Prioridad {PRIORITY_LABEL[priority].toLowerCase()} · {SUPPORT_LABEL[support].toLowerCase()}</StatusPill>;
}

export function BriefPill({ status }: { status: BriefStatus | null }) {
  if (!status) return <StatusPill tone="neutral">Sin brief</StatusPill>;
  const tone = status === "approved" ? "ok" : status === "in-review" ? "warn" : status === "archived" ? "no" : "neutral";
  return <StatusPill tone={tone}>Brief: {BRIEF_STATUS_LABEL[status].toLowerCase()}</StatusPill>;
}

export function OpportunityCard({ o, href, support, evidence, brief, cluster }: {
  o: Opportunity; href: string; support: Support; evidence: number; brief: BriefStatus | null; cluster: Cluster | null;
}) {
  return (
    <li className="card">
      <div className="card-head">
        <h3><Link href={href}>{o.topic}</Link></h3>
        <PriorityPill priority={o.priority} support={support} />
      </div>
      <dl className="facts">
        <div><dt>Tipo</dt><dd>{OPPORTUNITY_TYPE_LABEL[o.opportunityType]}</dd></div>
        <div><dt>Intención declarada</dt><dd>{INTENT_LABEL[o.searchIntent]} · {market(o)}</dd></div>
        <div><dt>Página</dt><dd className="break">{o.pageUrl ?? (o.pageKind === "proposed" ? "Página nueva (sin dirección todavía)" : "—")}</dd></div>
        <div><dt>Evidencias</dt><dd>{evidence === 0 ? "Ninguna: es una hipótesis" : evidence}</dd></div>
        <div><dt>Clúster</dt><dd>{cluster ? `${cluster.name}${o.clusterRole ? ` · ${CLUSTER_ROLE_LABEL[o.clusterRole].toLowerCase()}` : ""}` : "Sin clúster"}</dd></div>
      </dl>
      <p className="small"><StatusPill tone="neutral">{OPPORTUNITY_STATUS_LABEL[o.status]}</StatusPill> <BriefPill status={brief} /></p>
    </li>
  );
}

export function Hidden({ values }: { values: Record<string, string> }) {
  return <>{Object.entries(values).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}</>;
}

/** Create or edit an opportunity. */
export function OpportunityFields({ o, clusters, idPrefix, defaultLanguage }: { o?: Opportunity; clusters: readonly Cluster[]; idPrefix: string; defaultLanguage: string }) {
  const id = (s: string) => `${idPrefix}-${s}`;
  return (
    <>
      <div className="field">
        <label htmlFor={id("topic")}>Tema</label>
        <input id={id("topic")} name="topic" required maxLength={160} defaultValue={o?.topic} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor={id("type")}>Tipo de oportunidad</label>
        <select id={id("type")} name="type" required defaultValue={o?.opportunityType ?? "create"}>
          {OPPORTUNITY_TYPES.map((t) => <option key={t} value={t}>{OPPORTUNITY_TYPE_LABEL[t]}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={id("intent")}>Intención de búsqueda (declarada)</label>
        <select id={id("intent")} name="intent" defaultValue={o?.searchIntent ?? "unknown"}>
          {INTENTS.map((t) => <option key={t} value={t}>{INTENT_LABEL[t]}</option>)}
        </select>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor={id("language")}>Idioma</label>
          <input id={id("language")} name="language" required maxLength={2} defaultValue={o?.marketLanguage ?? defaultLanguage} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor={id("country")}>País (opcional)</label>
          <input id={id("country")} name="country" maxLength={2} defaultValue={o?.marketCountry ?? ""} autoComplete="off" placeholder="ES" />
        </div>
      </div>
      <div className="field">
        <label htmlFor={id("pageKind")}>Página</label>
        <select id={id("pageKind")} name="pageKind" defaultValue={o?.pageKind ?? "proposed"}>
          <option value="proposed">Página propuesta (nueva)</option>
          <option value="existing">Página existente</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={id("pageUrl")}>Dirección de la página (opcional si es nueva)</label>
        <input id={id("pageUrl")} name="pageUrl" maxLength={2048} inputMode="url" defaultValue={o?.pageUrl ?? ""} autoComplete="off" aria-describedby={id("pageUrl-help")} />
        <p id={id("pageUrl-help")} className="muted small">Debe ser del dominio del proyecto. No se visita.</p>
      </div>
      <div className="field">
        <label htmlFor={id("rationale")}>Justificación</label>
        <textarea id={id("rationale")} name="rationale" required maxLength={2000} rows={3} defaultValue={o?.rationale} />
      </div>
      <div className="field">
        <label htmlFor={id("priority")}>Prioridad propuesta</label>
        <select id={id("priority")} name="priority" defaultValue={o?.priority ?? "unset"}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={id("priorityReason")}>Motivo de la prioridad</label>
        <input id={id("priorityReason")} name="priorityReason" maxLength={500} defaultValue={o?.priorityReason ?? ""} autoComplete="off" aria-describedby={id("pr-help")} />
        <p id={id("pr-help")} className="muted small">Obligatorio si eliges prioridad. Sin evidencia se mostrará como hipótesis.</p>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor={id("cluster")}>Clúster (opcional)</label>
          <select id={id("cluster")} name="cluster" defaultValue={o?.clusterId ?? ""}>
            <option value="">Sin clúster</option>
            {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={id("clusterRole")}>Papel en el clúster</label>
          <select id={id("clusterRole")} name="clusterRole" defaultValue={o?.clusterRole ?? ""}>
            <option value="">Sin indicar</option>
            <option value="pillar">Posible página pilar</option>
            <option value="support">Página de soporte</option>
          </select>
        </div>
      </div>
    </>
  );
}
