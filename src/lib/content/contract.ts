// N2-12 content strategy contract. Mirrors the database checks of 20261016130000 so a form can
// explain an error before writing; the database stays the authority. Everything here is a
// proposal: no search volume, difficulty, position, trend or CTR exists in this module.

export const INTENTS = ["informational", "commercial", "transactional", "navigational", "local", "unknown"] as const;
export type Intent = (typeof INTENTS)[number];
export const INTENT_LABEL: Record<Intent, string> = {
  informational: "Informativa",
  commercial: "Comercial (investigación de compra)",
  transactional: "Transaccional",
  navigational: "Navegacional",
  local: "Local",
  unknown: "Sin determinar",
};

export const OPPORTUNITY_TYPES = ["create", "improve", "update", "consolidate", "research"] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];
export const OPPORTUNITY_TYPE_LABEL: Record<OpportunityType, string> = {
  create: "Crear contenido nuevo",
  improve: "Mejorar una página existente",
  update: "Actualizar una página existente",
  consolidate: "Consolidar páginas",
  research: "Investigar",
};

export const PRIORITIES = ["high", "medium", "low", "unset"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { high: "Alta", medium: "Media", low: "Baja", unset: "Sin priorizar" };

export const OPPORTUNITY_STATUSES = ["open", "planned", "done", "discarded"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];
export const OPPORTUNITY_STATUS_LABEL: Record<OpportunityStatus, string> = {
  open: "Abierta", planned: "Planificada", done: "Hecha", discarded: "Descartada",
};

export const CLUSTER_ROLES = ["pillar", "support"] as const;
export type ClusterRole = (typeof CLUSTER_ROLES)[number];
export const CLUSTER_ROLE_LABEL: Record<ClusterRole, string> = { pillar: "Posible página pilar", support: "Página de soporte" };

export const EVIDENCE_KINDS = ["provider-result", "import-finding", "manual-source", "analyst-proposal"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
/** How the UI names each kind: observed, declared, consulted source or analyst proposal. */
export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  "provider-result": "Dato observado (resultado de proveedor guardado)",
  "import-finding": "Hallazgo declarado (importación)",
  "manual-source": "Fuente consultada por el analista",
  "analyst-proposal": "Propuesta del analista",
};

export const BRIEF_STATUSES = ["draft", "in-review", "approved", "archived"] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];
export const BRIEF_STATUS_LABEL: Record<BriefStatus, string> = {
  draft: "Borrador", "in-review": "En revisión", approved: "Aprobado", archived: "Archivado",
};

const isOneOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);
const text = (v: string | undefined) => (v ?? "").trim();
const optional = (v: string | undefined) => text(v) || null;
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** http(s) URL with a host; returns the URL as typed (trimmed) or null. Never fetched. */
export function httpUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v || v.length > 2048 || /\s/.test(v)) return null;
  try {
    const u = new URL(v);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname || u.username || u.password) return null;
    return /^https?:\/\/[^\s/]+(\/\S*)?$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

const bareHost = (h: string) => h.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
/** True when the URL is on the project's own domain (or the project has no domain to compare). */
export function onProjectDomain(url: string, projectDomain: string | null): boolean {
  if (!projectDomain) return true;
  let own: string;
  try {
    own = new URL(/^https?:\/\//i.test(projectDomain) ? projectDomain : `https://${projectDomain}`).hostname;
  } catch {
    return true;
  }
  try {
    return bareHost(new URL(url).hostname) === bareHost(own);
  } catch {
    return false;
  }
}

export interface OpportunityInput {
  topic: string;
  searchIntent: Intent;
  marketLanguage: string;
  marketCountry: string | null;
  pageKind: "existing" | "proposed";
  pageUrl: string | null;
  opportunityType: OpportunityType;
  rationale: string;
  priority: Priority;
  priorityReason: string | null;
  clusterId: string | null;
  clusterRole: ClusterRole | null;
}

export type OpportunityError =
  | "TOPIC" | "INTENT" | "LANGUAGE" | "COUNTRY" | "PAGE_KIND" | "PAGE_URL" | "PAGE_URL_REQUIRED" | "PAGE_URL_FOREIGN"
  | "TYPE" | "TYPE_NEEDS_EXISTING" | "TYPE_NEEDS_PROPOSED" | "RATIONALE" | "PRIORITY" | "PRIORITY_REASON" | "CLUSTER_ROLE";

export function parseOpportunity(f: Record<string, string>, projectDomain: string | null): { ok: true; value: OpportunityInput } | { ok: false; error: OpportunityError } {
  const topic = text(f.topic);
  if (topic.length < 1 || topic.length > 160) return { ok: false, error: "TOPIC" };
  const intent = text(f.intent) || "unknown";
  if (!isOneOf(INTENTS, intent)) return { ok: false, error: "INTENT" };
  const language = text(f.language).toLowerCase();
  if (!/^[a-z]{2}$/.test(language)) return { ok: false, error: "LANGUAGE" };
  const country = text(f.country).toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) return { ok: false, error: "COUNTRY" };
  const pageKind = text(f.pageKind);
  if (pageKind !== "existing" && pageKind !== "proposed") return { ok: false, error: "PAGE_KIND" };
  let pageUrl: string | null = null;
  if (text(f.pageUrl)) {
    pageUrl = httpUrl(f.pageUrl);
    if (!pageUrl) return { ok: false, error: "PAGE_URL" };
    if (!onProjectDomain(pageUrl, projectDomain)) return { ok: false, error: "PAGE_URL_FOREIGN" };
  }
  if (pageKind === "existing" && !pageUrl) return { ok: false, error: "PAGE_URL_REQUIRED" };
  const type = text(f.type);
  if (!isOneOf(OPPORTUNITY_TYPES, type)) return { ok: false, error: "TYPE" };
  if ((type === "improve" || type === "update") && pageKind !== "existing") return { ok: false, error: "TYPE_NEEDS_EXISTING" };
  if (type === "create" && pageKind !== "proposed") return { ok: false, error: "TYPE_NEEDS_PROPOSED" };
  const rationale = text(f.rationale);
  if (rationale.length < 1 || rationale.length > 2000) return { ok: false, error: "RATIONALE" };
  const priority = text(f.priority) || "unset";
  if (!isOneOf(PRIORITIES, priority)) return { ok: false, error: "PRIORITY" };
  const priorityReason = optional(f.priorityReason);
  if ((priority !== "unset" && !priorityReason) || (priorityReason && priorityReason.length > 500)) return { ok: false, error: "PRIORITY_REASON" };
  const clusterId = optional(f.cluster);
  const role = text(f.clusterRole);
  if (role && (!clusterId || !isOneOf(CLUSTER_ROLES, role))) return { ok: false, error: "CLUSTER_ROLE" };
  return {
    ok: true,
    value: {
      topic, searchIntent: intent, marketLanguage: language, marketCountry: country || null, pageKind, pageUrl,
      opportunityType: type, rationale, priority, priorityReason, clusterId, clusterRole: role ? (role as ClusterRole) : null,
    },
  };
}

export function parseCluster(f: Record<string, string>): { ok: true; value: { name: string; mainTopic: string; description: string | null } } | { ok: false; error: "NAME" | "MAIN_TOPIC" | "DESCRIPTION" } {
  const name = text(f.name);
  if (name.length < 1 || name.length > 120) return { ok: false, error: "NAME" };
  const mainTopic = text(f.mainTopic);
  if (mainTopic.length < 1 || mainTopic.length > 160) return { ok: false, error: "MAIN_TOPIC" };
  const description = optional(f.description);
  if (description && description.length > 1000) return { ok: false, error: "DESCRIPTION" };
  return { ok: true, value: { name, mainTopic, description } };
}

export interface EvidenceInput {
  kind: EvidenceKind;
  providerResultId: string | null;
  importId: string | null;
  title: string;
  detail: string | null;
  sourceUrl: string | null;
  sourceDate: string | null;
}

export type EvidenceError = "KIND" | "SOURCE_REQUIRED" | "TITLE" | "DETAIL" | "SOURCE_URL" | "SOURCE_DATE" | "SOURCE_DATE_FUTURE";

export function parseEvidence(f: Record<string, string>, today: string): { ok: true; value: EvidenceInput } | { ok: false; error: EvidenceError } {
  const kind = text(f.kind);
  if (!isOneOf(EVIDENCE_KINDS, kind)) return { ok: false, error: "KIND" };
  const detail = optional(f.detail);
  if (detail && detail.length > 2000) return { ok: false, error: "DETAIL" };
  const base = { kind, providerResultId: null, importId: null, detail, sourceUrl: null, sourceDate: null } as EvidenceInput;
  if (kind === "provider-result" || kind === "import-finding") {
    const ref = text(kind === "provider-result" ? f.providerResult : f.import);
    if (!ref) return { ok: false, error: "SOURCE_REQUIRED" };
    // The database replaces the title and date with those of the stored source.
    return { ok: true, value: { ...base, title: "pendiente", ...(kind === "provider-result" ? { providerResultId: ref } : { importId: ref }) } };
  }
  const title = text(f.title);
  if (title.length < 1 || title.length > 200) return { ok: false, error: "TITLE" };
  if (kind === "analyst-proposal") {
    if (!detail) return { ok: false, error: "DETAIL" };
    return { ok: true, value: { ...base, title } };
  }
  const sourceUrl = text(f.sourceUrl) ? httpUrl(f.sourceUrl) : null;
  if (text(f.sourceUrl) && !sourceUrl) return { ok: false, error: "SOURCE_URL" };
  const date = text(f.sourceDate);
  if (!validDate(date) || date < "2000-01-01") return { ok: false, error: "SOURCE_DATE" };
  if (date > today) return { ok: false, error: "SOURCE_DATE_FUTURE" };
  return { ok: true, value: { ...base, title, sourceUrl, sourceDate: date } };
}

export interface OutlineItem { level: 1 | 2 | 3; text: string }
export interface InternalLink { url: string; anchor: string }

/** "# Título", "## Sección", "### Apartado" one per line. */
export function parseOutline(raw: string): { ok: true; value: OutlineItem[] } | { ok: false; error: "OUTLINE" } {
  const items: OutlineItem[] = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = /^(#{1,3})\s+(.{1,200})$/.exec(line);
    if (!m) return { ok: false, error: "OUTLINE" };
    items.push({ level: m[1].length as 1 | 2 | 3, text: m[2].trim() });
  }
  if (items.length > 60 || items.filter((i) => i.level === 1).length > 1) return { ok: false, error: "OUTLINE" };
  return { ok: true, value: items };
}
export const outlineText = (items: readonly OutlineItem[]) => items.map((i) => `${"#".repeat(i.level)} ${i.text}`).join("\n");

/** One question per line. */
export function parseQuestions(raw: string): { ok: true; value: string[] } | { ok: false; error: "QUESTIONS" } {
  const qs = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return qs.length <= 30 && qs.every((q) => q.length <= 300) ? { ok: true, value: qs } : { ok: false, error: "QUESTIONS" };
}

/** "URL | texto del enlace" per line; URL is http(s) or a site path starting with "/". */
export function parseLinks(raw: string): { ok: true; value: InternalLink[] } | { ok: false; error: "LINKS" } {
  const links: InternalLink[] = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [urlPart, ...rest] = line.split("|");
    const url = urlPart.trim();
    const anchor = rest.join("|").trim();
    if (!(/^\/\S*$/.test(url) || httpUrl(url)) || url.length > 2048 || anchor.length > 120) return { ok: false, error: "LINKS" };
    links.push({ url, anchor });
  }
  return links.length <= 30 ? { ok: true, value: links } : { ok: false, error: "LINKS" };
}
export const linksText = (links: readonly InternalLink[]) => links.map((l) => (l.anchor ? `${l.url} | ${l.anchor}` : l.url)).join("\n");

export interface BriefInput {
  objective: string | null;
  audience: string | null;
  marketLanguage: string;
  marketCountry: string | null;
  searchIntent: Intent;
  mainTopic: string;
  targetUrl: string | null;
  outline: OutlineItem[];
  questions: string[];
  internalLinks: InternalLink[];
  sourcesConsulted: string | null;
  originalData: string | null;
  risks: string | null;
  cta: string | null;
  assignee: string | null;
}

export type BriefError = "OBJECTIVE" | "AUDIENCE" | "LANGUAGE" | "COUNTRY" | "INTENT" | "MAIN_TOPIC" | "TARGET_URL" | "TARGET_URL_FOREIGN"
  | "OUTLINE" | "QUESTIONS" | "LINKS" | "SOURCES" | "ORIGINAL_DATA" | "RISKS" | "CTA" | "ASSIGNEE";

export function parseBrief(f: Record<string, string>, projectDomain: string | null): { ok: true; value: BriefInput } | { ok: false; error: BriefError } {
  const max = (v: string | null, n: number) => !v || v.length <= n;
  const objective = optional(f.objective); if (!max(objective, 1000)) return { ok: false, error: "OBJECTIVE" };
  const audience = optional(f.audience); if (!max(audience, 500)) return { ok: false, error: "AUDIENCE" };
  const language = text(f.language).toLowerCase(); if (!/^[a-z]{2}$/.test(language)) return { ok: false, error: "LANGUAGE" };
  const country = text(f.country).toUpperCase(); if (country && !/^[A-Z]{2}$/.test(country)) return { ok: false, error: "COUNTRY" };
  const intent = text(f.intent) || "unknown"; if (!isOneOf(INTENTS, intent)) return { ok: false, error: "INTENT" };
  const mainTopic = text(f.mainTopic); if (mainTopic.length < 1 || mainTopic.length > 160) return { ok: false, error: "MAIN_TOPIC" };
  let targetUrl: string | null = null;
  if (text(f.targetUrl)) {
    targetUrl = httpUrl(f.targetUrl);
    if (!targetUrl) return { ok: false, error: "TARGET_URL" };
    if (!onProjectDomain(targetUrl, projectDomain)) return { ok: false, error: "TARGET_URL_FOREIGN" };
  }
  const outline = parseOutline(f.outline ?? ""); if (!outline.ok) return outline;
  const questions = parseQuestions(f.questions ?? ""); if (!questions.ok) return questions;
  const links = parseLinks(f.internalLinks ?? ""); if (!links.ok) return links;
  const sources = optional(f.sourcesConsulted); if (!max(sources, 2000)) return { ok: false, error: "SOURCES" };
  const originalData = optional(f.originalData); if (!max(originalData, 2000)) return { ok: false, error: "ORIGINAL_DATA" };
  const risks = optional(f.risks); if (!max(risks, 2000)) return { ok: false, error: "RISKS" };
  const cta = optional(f.cta); if (!max(cta, 300)) return { ok: false, error: "CTA" };
  const assignee = optional(f.assignee); if (!max(assignee, 120)) return { ok: false, error: "ASSIGNEE" };
  return {
    ok: true,
    value: {
      objective, audience, marketLanguage: language, marketCountry: country || null, searchIntent: intent, mainTopic, targetUrl,
      outline: outline.value, questions: questions.value, internalLinks: links.value, sourcesConsulted: sources, originalData, risks, cta, assignee,
    },
  };
}
