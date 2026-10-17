import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { ProjectRef } from "@/lib/provenance/audit";
import type {
  BriefInput, BriefStatus, ClusterRole, EvidenceInput, EvidenceKind, InternalLink, Intent, OpportunityInput, OpportunityStatus,
  OpportunityType, OutlineItem, Priority,
} from "./contract";

// N2-12 persistence. Every call runs as the signed-in user with the publishable key: RLS and
// the triggers of 20261017100000 decide who reads or changes what, and the database queues the
// audit receipt in the same transaction. Ids from forms are lookup keys only: every query is
// also bound to the project's database id, so an id of another project matches nothing.

type Client = SupabaseClient<Database>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string | null | undefined): s is string => !!s && UUID.test(s);

export interface ContentProject extends ProjectRef { domain: string | null }

export interface Cluster { id: string; name: string; mainTopic: string; description: string | null; createdAt: string; updatedAt: string }
export interface Opportunity {
  id: string; clusterId: string | null; clusterRole: ClusterRole | null; topic: string; searchIntent: Intent; marketLanguage: string;
  marketCountry: string | null; pageKind: "existing" | "proposed"; pageUrl: string | null; opportunityType: OpportunityType;
  rationale: string; priority: Priority; priorityReason: string | null; status: OpportunityStatus; createdBy: string; createdAt: string; updatedAt: string;
}
export interface Evidence {
  id: string; opportunityId: string; kind: EvidenceKind; providerResultId: string | null; importId: string | null; title: string;
  detail: string | null; sourceUrl: string | null; sourceDate: string | null; createdBy: string; createdAt: string;
}
export interface Brief {
  id: string; opportunityId: string; objective: string | null; audience: string | null; marketLanguage: string; marketCountry: string | null;
  searchIntent: Intent; mainTopic: string; targetUrl: string | null; outline: OutlineItem[]; questions: string[]; internalLinks: InternalLink[];
  sourcesConsulted: string | null; originalData: string | null; risks: string | null; cta: string | null; assignee: string | null;
  status: BriefStatus; version: number; reviewNote: string | null; submittedBy: string | null; submittedAt: string | null;
  reviewedBy: string | null; reviewedAt: string | null; approvedBy: string | null; approvedAt: string | null; archivedAt: string | null;
  createdBy: string; createdAt: string; updatedAt: string;
}

export type WriteError = "DUPLICATE" | "NOT_ALLOWED" | "NOT_FOUND" | "INVALID" | "INCOMPLETE" | "LOCKED" | "TRANSITION" | "WRITE_FAILED";
export type WriteResult<T = undefined> = { ok: true; value: T } | { ok: false; error: WriteError };

function failure(error: { code?: string; message?: string } | null): WriteError {
  const m = error?.message ?? "";
  switch (error?.code) {
    case "23505": return "DUPLICATE";
    case "23503": return "NOT_FOUND";
    case "23514": return m.includes("needs objective") ? "INCOMPLETE" : m.includes("transition") ? "TRANSITION" : "INVALID";
    case "42501": return m.includes("only a draft") ? "LOCKED" : "NOT_ALLOWED";
    default: return "WRITE_FAILED";
  }
}

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
const toCluster = (r: Row<"content_clusters">): Cluster => ({
  id: r.id, name: r.name, mainTopic: r.main_topic, description: r.description, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toOpportunity = (r: Row<"content_opportunities">): Opportunity => ({
  id: r.id, clusterId: r.cluster_id, clusterRole: r.cluster_role as ClusterRole | null, topic: r.topic, searchIntent: r.search_intent as Intent,
  marketLanguage: r.market_language, marketCountry: r.market_country, pageKind: r.page_kind as Opportunity["pageKind"], pageUrl: r.page_url,
  opportunityType: r.opportunity_type as OpportunityType, rationale: r.rationale, priority: r.priority as Priority, priorityReason: r.priority_reason,
  status: r.status as OpportunityStatus, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toEvidence = (r: Row<"content_evidence">): Evidence => ({
  id: r.id, opportunityId: r.opportunity_id, kind: r.kind as EvidenceKind, providerResultId: r.provider_result_id, importId: r.import_id,
  title: r.title, detail: r.detail, sourceUrl: r.source_url, sourceDate: r.source_date, createdBy: r.created_by, createdAt: r.created_at,
});
const toBrief = (r: Row<"content_briefs">): Brief => ({
  id: r.id, opportunityId: r.opportunity_id, objective: r.objective, audience: r.audience, marketLanguage: r.market_language,
  marketCountry: r.market_country, searchIntent: r.search_intent as Intent, mainTopic: r.main_topic, targetUrl: r.target_url,
  outline: (r.outline as unknown as OutlineItem[]) ?? [], questions: (r.questions as unknown as string[]) ?? [],
  internalLinks: (r.internal_links as unknown as InternalLink[]) ?? [], sourcesConsulted: r.sources_consulted, originalData: r.original_data,
  risks: r.risks, cta: r.cta, assignee: r.assignee, status: r.status as BriefStatus, version: r.version, reviewNote: r.review_note,
  submittedBy: r.submitted_by, submittedAt: r.submitted_at, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at, approvedBy: r.approved_by,
  approvedAt: r.approved_at, archivedAt: r.archived_at, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

export async function loadContentProject(client: Client, scope: { tenantId: string; projectId: string }): Promise<ContentProject | null> {
  const { data, error } = await client.from("projects").select("id, organization_id, domain, organizations!inner(slug)")
    .eq("slug", scope.projectId).eq("organizations.slug", scope.tenantId).maybeSingle();
  if (error || !data) return null;
  return { projectId: data.id, organizationId: data.organization_id, domain: data.domain, scope };
}

const read = <T>(what: string, r: { data: T | null; error: { code?: string } | null }): T => {
  if (r.error) throw new Error(`No se pudo leer ${what} (${r.error.code}).`);
  return r.data as T;
};

export async function listClusters(client: Client, project: ProjectRef): Promise<Cluster[]> {
  return read("los clústeres", await client.from("content_clusters").select("*").eq("project_id", project.projectId).order("name").limit(200)).map(toCluster);
}
export async function getCluster(client: Client, project: ProjectRef, id: string): Promise<Cluster | null> {
  if (!isUuid(id)) return null;
  const r = read("el clúster", await client.from("content_clusters").select("*").eq("project_id", project.projectId).eq("id", id).maybeSingle());
  return r ? toCluster(r) : null;
}
export async function listOpportunities(client: Client, project: ProjectRef, filter: { clusterId?: string } = {}): Promise<Opportunity[]> {
  let q = client.from("content_opportunities").select("*").eq("project_id", project.projectId);
  if (filter.clusterId) q = q.eq("cluster_id", filter.clusterId);
  return read("las oportunidades", await q.order("created_at", { ascending: false }).limit(500)).map(toOpportunity);
}
export async function getOpportunity(client: Client, project: ProjectRef, id: string): Promise<Opportunity | null> {
  if (!isUuid(id)) return null;
  const r = read("la oportunidad", await client.from("content_opportunities").select("*").eq("project_id", project.projectId).eq("id", id).maybeSingle());
  return r ? toOpportunity(r) : null;
}
export async function listEvidence(client: Client, project: ProjectRef, opportunityId?: string): Promise<Evidence[]> {
  let q = client.from("content_evidence").select("*").eq("project_id", project.projectId);
  if (opportunityId) q = q.eq("opportunity_id", opportunityId);
  return read("las evidencias", await q.order("created_at").limit(2000)).map(toEvidence);
}
export async function listBriefs(client: Client, project: ProjectRef): Promise<Brief[]> {
  return read("los briefs", await client.from("content_briefs").select("*").eq("project_id", project.projectId).limit(500)).map(toBrief);
}
export async function getBriefFor(client: Client, project: ProjectRef, opportunityId: string): Promise<Brief | null> {
  if (!isUuid(opportunityId)) return null;
  const r = read("el brief", await client.from("content_briefs").select("*").eq("project_id", project.projectId).eq("opportunity_id", opportunityId).maybeSingle());
  return r ? toBrief(r) : null;
}

/** Stored sources the user can link as evidence (same project, RLS-filtered). */
export async function linkableSources(client: Client, project: ProjectRef) {
  const [imports, results] = await Promise.all([
    client.from("imports").select("id, source_label, captured_at").eq("project_id", project.projectId).order("captured_at", { ascending: false }).limit(50),
    client.from("provider_results").select("id, provider, operation, captured_at, created_at").eq("project_id", project.projectId).order("created_at", { ascending: false }).limit(50),
  ]);
  return {
    imports: (imports.data ?? []).map((i) => ({ id: i.id, label: i.source_label, date: i.captured_at })),
    results: (results.data ?? []).map((r) => ({ id: r.id, label: `${r.provider} · ${r.operation}`, date: r.captured_at ?? r.created_at })),
  };
}

const one = async (q: PromiseLike<{ data: { id: string }[] | null; error: { code?: string; message?: string } | null }>): Promise<WriteResult> => {
  const { data, error } = await q;
  if (error) return { ok: false, error: failure(error) };
  return data?.length === 1 ? { ok: true, value: undefined } : { ok: false, error: "NOT_FOUND" };
};
const created = async (q: PromiseLike<{ data: { id: string } | null; error: { code?: string; message?: string } | null }>): Promise<WriteResult<string>> => {
  const { data, error } = await q;
  return error || !data ? { ok: false, error: failure(error) } : { ok: true, value: data.id };
};

export const addCluster = (client: Client, p: ProjectRef, v: { name: string; mainTopic: string; description: string | null }) =>
  created(client.from("content_clusters").insert({ project_id: p.projectId, organization_id: p.organizationId, name: v.name, main_topic: v.mainTopic, description: v.description }).select("id").single());
export const updateCluster = (client: Client, p: ProjectRef, id: string, v: { name: string; mainTopic: string; description: string | null }) =>
  isUuid(id) ? one(client.from("content_clusters").update({ name: v.name, main_topic: v.mainTopic, description: v.description }).eq("project_id", p.projectId).eq("id", id).select("id"))
    : Promise.resolve({ ok: false as const, error: "NOT_FOUND" as const });
export const eraseCluster = (client: Client, p: ProjectRef, id: string) =>
  isUuid(id) ? one(client.from("content_clusters").delete().eq("project_id", p.projectId).eq("id", id).select("id")) : Promise.resolve({ ok: false as const, error: "NOT_FOUND" as const });

const opportunityRow = (v: OpportunityInput) => ({
  cluster_id: v.clusterId, cluster_role: v.clusterRole, topic: v.topic, search_intent: v.searchIntent, market_language: v.marketLanguage,
  market_country: v.marketCountry, page_kind: v.pageKind, page_url: v.pageUrl, opportunity_type: v.opportunityType, rationale: v.rationale,
  priority: v.priority, priority_reason: v.priorityReason,
});
export async function addOpportunity(client: Client, p: ProjectRef, v: OpportunityInput): Promise<WriteResult<string>> {
  if (v.clusterId && !isUuid(v.clusterId)) return { ok: false, error: "NOT_FOUND" };
  return created(client.from("content_opportunities").insert({ project_id: p.projectId, organization_id: p.organizationId, ...opportunityRow(v) }).select("id").single());
}
export async function updateOpportunity(client: Client, p: ProjectRef, id: string, v: OpportunityInput): Promise<WriteResult> {
  if (!isUuid(id) || (v.clusterId && !isUuid(v.clusterId))) return { ok: false, error: "NOT_FOUND" };
  return one(client.from("content_opportunities").update(opportunityRow(v)).eq("project_id", p.projectId).eq("id", id).select("id"));
}
export const setOpportunityStatus = (client: Client, p: ProjectRef, id: string, status: OpportunityStatus) =>
  isUuid(id) ? one(client.from("content_opportunities").update({ status }).eq("project_id", p.projectId).eq("id", id).select("id")) : Promise.resolve({ ok: false as const, error: "NOT_FOUND" as const });
export const eraseOpportunity = (client: Client, p: ProjectRef, id: string) =>
  isUuid(id) ? one(client.from("content_opportunities").delete().eq("project_id", p.projectId).eq("id", id).select("id")) : Promise.resolve({ ok: false as const, error: "NOT_FOUND" as const });

export async function addEvidence(client: Client, p: ProjectRef, opportunityId: string, v: EvidenceInput): Promise<WriteResult<string>> {
  if (!isUuid(opportunityId) || (v.providerResultId && !isUuid(v.providerResultId)) || (v.importId && !isUuid(v.importId))) return { ok: false, error: "NOT_FOUND" };
  return created(client.from("content_evidence").insert({
    project_id: p.projectId, organization_id: p.organizationId, opportunity_id: opportunityId, kind: v.kind, provider_result_id: v.providerResultId,
    import_id: v.importId, title: v.title, detail: v.detail, source_url: v.sourceUrl, source_date: v.sourceDate,
  }).select("id").single());
}
export const eraseEvidence = (client: Client, p: ProjectRef, id: string) =>
  isUuid(id) ? one(client.from("content_evidence").delete().eq("project_id", p.projectId).eq("id", id).select("id")) : Promise.resolve({ ok: false as const, error: "NOT_FOUND" as const });

const briefRow = (v: BriefInput) => ({
  objective: v.objective, audience: v.audience, market_language: v.marketLanguage, market_country: v.marketCountry, search_intent: v.searchIntent,
  main_topic: v.mainTopic, target_url: v.targetUrl, outline: v.outline as unknown as NonNullable<Json>, questions: v.questions as unknown as NonNullable<Json>,
  internal_links: v.internalLinks as unknown as NonNullable<Json>, sources_consulted: v.sourcesConsulted, original_data: v.originalData, risks: v.risks, cta: v.cta, assignee: v.assignee,
});
export async function createBrief(client: Client, p: ProjectRef, opportunity: Opportunity): Promise<WriteResult<string>> {
  return created(client.from("content_briefs").insert({
    project_id: p.projectId, organization_id: p.organizationId, opportunity_id: opportunity.id, market_language: opportunity.marketLanguage,
    market_country: opportunity.marketCountry, search_intent: opportunity.searchIntent, main_topic: opportunity.topic, target_url: opportunity.pageUrl,
  }).select("id").single());
}
export const updateBrief = (client: Client, p: ProjectRef, id: string, v: BriefInput) =>
  isUuid(id) ? one(client.from("content_briefs").update(briefRow(v)).eq("project_id", p.projectId).eq("id", id).select("id")) : Promise.resolve({ ok: false as const, error: "NOT_FOUND" as const });
export const setBriefStatus = (client: Client, p: ProjectRef, id: string, status: BriefStatus, note: string | null) =>
  isUuid(id) ? one(client.from("content_briefs").update(note === null ? { status } : { status, review_note: note }).eq("project_id", p.projectId).eq("id", id).select("id"))
    : Promise.resolve({ ok: false as const, error: "NOT_FOUND" as const });
export const eraseBrief = (client: Client, p: ProjectRef, id: string) =>
  isUuid(id) ? one(client.from("content_briefs").delete().eq("project_id", p.projectId).eq("id", id).select("id")) : Promise.resolve({ ok: false as const, error: "NOT_FOUND" as const });
