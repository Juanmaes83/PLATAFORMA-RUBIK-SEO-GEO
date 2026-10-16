import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { ProjectRef } from "@/lib/provenance/audit";
import type { Engine, Method, ObservationInput, Presence } from "./contract";
import type { GeoObservation, Opportunity, Priority } from "./rules";

// N2-13 persistence. Every call runs as the signed-in user (publishable key): RLS and the
// triggers of 20261016160000 decide; the database queues the audit receipt in the same
// transaction. Every query is bound to the project's database id, so a foreign id matches nothing.

type Client = SupabaseClient<Database>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string | null | undefined): s is string => !!s && UUID.test(s);

export interface GeoProject extends ProjectRef { domain: string | null }
export interface StoredObservation extends GeoObservation {
  answerExcerpt: string | null;
  evidenceReference: string | null;
  notes: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdBy: string;
}
export interface Proposal {
  id: string; rule: Opportunity["rule"] | "manual"; queryText: string; title: string; problem: string; hypothesis: string; suggestedAction: string;
  limitations: string | null; priority: Priority; priorityReason: string; evidenceIds: string[]; status: "proposed" | "accepted" | "rejected" | "done";
  reviewNote: string | null; reviewedBy: string | null; reviewedAt: string | null; createdBy: string; createdAt: string; updatedAt: string;
}

export type WriteError = "DUPLICATE" | "NOT_ALLOWED" | "NOT_FOUND" | "INVALID" | "LOCKED" | "TRANSITION" | "WRITE_FAILED";
export type WriteResult<T = undefined> = { ok: true; value: T } | { ok: false; error: WriteError };

function failure(error: { code?: string; message?: string } | null): WriteError {
  const m = error?.message ?? "";
  switch (error?.code) {
    case "23505": return "DUPLICATE";
    case "23503": return "NOT_FOUND";
    case "23514": return m.includes("transition") ? "TRANSITION" : "INVALID";
    case "42501": return m.includes("only a proposal awaiting") ? "LOCKED" : "NOT_ALLOWED";
    default: return "WRITE_FAILED";
  }
}

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
const toObservation = (r: Row<"geo_observations">): StoredObservation => ({
  id: r.id, entityName: r.entity_name, engine: r.engine as Engine, engineDetail: r.engine_detail, queryText: r.query_text, observedOn: r.observed_on,
  marketLanguage: r.market_language, marketCountry: r.market_country, method: r.method as Method, presence: r.presence as Presence,
  citedSources: (r.cited_sources as unknown as { url: string; title?: string }[]).map((s) => ({ url: s.url, title: s.title ?? "" })),
  mentionedEntities: r.mentioned_entities as unknown as string[], supersedesId: r.supersedes_id, verification: r.verification as StoredObservation["verification"],
  createdAt: r.created_at, answerExcerpt: r.answer_excerpt, evidenceReference: r.evidence_reference, notes: r.notes, verifiedBy: r.verified_by,
  verifiedAt: r.verified_at, createdBy: r.created_by,
});
const toProposal = (r: Row<"geo_proposals">): Proposal => ({
  id: r.id, rule: r.rule as Proposal["rule"], queryText: r.query_text, title: r.title, problem: r.problem, hypothesis: r.hypothesis,
  suggestedAction: r.suggested_action, limitations: r.limitations, priority: r.priority as Priority, priorityReason: r.priority_reason,
  evidenceIds: r.evidence_ids, status: r.status as Proposal["status"], reviewNote: r.review_note, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at,
  createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
});

export async function loadGeoProject(client: Client, scope: { tenantId: string; projectId: string }): Promise<GeoProject | null> {
  const { data, error } = await client.from("projects").select("id, organization_id, domain, organizations!inner(slug)")
    .eq("slug", scope.projectId).eq("organizations.slug", scope.tenantId).maybeSingle();
  if (error || !data) return null;
  return { projectId: data.id, organizationId: data.organization_id, domain: data.domain, scope };
}

/** Newest first, capped (the page says so when the cap is reached). */
export const OBSERVATION_LIMIT = 500;
export async function listObservations(client: Client, p: ProjectRef): Promise<StoredObservation[]> {
  const { data, error } = await client.from("geo_observations").select("*").eq("project_id", p.projectId)
    .order("observed_on", { ascending: false }).order("created_at", { ascending: false }).limit(OBSERVATION_LIMIT);
  if (error) throw new Error(`No se pudieron leer las observaciones (${error.code}).`);
  return data.map(toObservation);
}
export async function getObservation(client: Client, p: ProjectRef, id: string): Promise<StoredObservation | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await client.from("geo_observations").select("*").eq("project_id", p.projectId).eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo leer la observación (${error.code}).`);
  return data ? toObservation(data) : null;
}
export async function listProposals(client: Client, p: ProjectRef): Promise<Proposal[]> {
  const { data, error } = await client.from("geo_proposals").select("*").eq("project_id", p.projectId).order("created_at", { ascending: false }).limit(300);
  if (error) throw new Error(`No se pudieron leer las propuestas (${error.code}).`);
  return data.map(toProposal);
}
export async function getProposal(client: Client, p: ProjectRef, id: string): Promise<Proposal | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await client.from("geo_proposals").select("*").eq("project_id", p.projectId).eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo leer la propuesta (${error.code}).`);
  return data ? toProposal(data) : null;
}

export async function addObservation(client: Client, p: ProjectRef, v: ObservationInput): Promise<WriteResult<string>> {
  if (v.supersedesId && !isUuid(v.supersedesId)) return { ok: false, error: "NOT_FOUND" };
  const { data, error } = await client.from("geo_observations").insert({
    project_id: p.projectId, organization_id: p.organizationId, entity_name: v.entityName, engine: v.engine, engine_detail: v.engineDetail,
    query_text: v.queryText, observed_on: v.observedOn, market_language: v.marketLanguage, market_country: v.marketCountry, method: v.method,
    presence: v.presence, answer_excerpt: v.answerExcerpt, cited_sources: v.citedSources as unknown as NonNullable<Json>,
    mentioned_entities: v.mentionedEntities as unknown as NonNullable<Json>, evidence_reference: v.evidenceReference, notes: v.notes, supersedes_id: v.supersedesId,
  }).select("id").single();
  return error || !data ? { ok: false, error: failure(error) } : { ok: true, value: data.id };
}

const one = async (q: PromiseLike<{ data: { id: string }[] | null; error: { code?: string; message?: string } | null }>): Promise<WriteResult> => {
  const { data, error } = await q;
  if (error) return { ok: false, error: failure(error) };
  return data?.length === 1 ? { ok: true, value: undefined } : { ok: false, error: "NOT_FOUND" };
};
const missing = Promise.resolve({ ok: false as const, error: "NOT_FOUND" as const });

export const verifyObservation = (client: Client, p: ProjectRef, id: string) =>
  isUuid(id) ? one(client.from("geo_observations").update({ verification: "verified" }).eq("project_id", p.projectId).eq("id", id).eq("verification", "declared").select("id")) : missing;
export const eraseObservation = (client: Client, p: ProjectRef, id: string) =>
  isUuid(id) ? one(client.from("geo_observations").delete().eq("project_id", p.projectId).eq("id", id).select("id")) : missing;

export async function addProposal(client: Client, p: ProjectRef, o: Opportunity): Promise<WriteResult<string>> {
  const { data, error } = await client.from("geo_proposals").insert({
    project_id: p.projectId, organization_id: p.organizationId, rule: o.rule, query_text: o.queryText, title: o.title, problem: o.problem,
    hypothesis: o.hypothesis, suggested_action: o.suggestedAction, limitations: o.limitations, priority: o.priority, priority_reason: o.priorityReason,
    evidence_ids: o.evidence.map((e) => e.id),
  }).select("id").single();
  return error || !data ? { ok: false, error: failure(error) } : { ok: true, value: data.id };
}
export const setProposalStatus = (client: Client, p: ProjectRef, id: string, status: Proposal["status"], note: string | null) =>
  isUuid(id) ? one(client.from("geo_proposals").update(note === null ? { status } : { status, review_note: note }).eq("project_id", p.projectId).eq("id", id).select("id")) : missing;
export const eraseProposal = (client: Client, p: ProjectRef, id: string) =>
  isUuid(id) ? one(client.from("geo_proposals").delete().eq("project_id", p.projectId).eq("id", id).select("id")) : missing;
