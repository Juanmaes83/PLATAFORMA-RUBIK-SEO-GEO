import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectRef } from "@/lib/provenance/audit";
import type { Observation } from "./compare";
import type { CompetitorInput, Metric, ObservationInput, Relation } from "./contract";

// N2-11 persistence. Every call runs as the signed-in user with the publishable key, so RLS
// decides who reads or changes what, and the database writes the audit receipt in the same
// transaction (20261016100000). Ids from forms are only lookup keys: each query is also bound
// to the project's database id, so an id from another project matches nothing.

type Client = SupabaseClient<Database>;
type ObservationRow = Database["public"]["Tables"]["competitor_observations"]["Row"];

export interface CompetitorRow {
  id: string;
  domain: string;
  name: string | null;
  notes: string | null;
  relation: Relation;
  status: "active" | "archived";
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorProject extends ProjectRef {
  domain: string | null;
}

export type WriteError = "DUPLICATE" | "NOT_ALLOWED" | "NOT_FOUND" | "INVALID" | "ARCHIVED" | "WRITE_FAILED";
export type WriteResult<T = undefined> = { ok: true; value: T } | { ok: false; error: WriteError };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

const COMPETITOR_FIELDS = "id, domain, name, notes, relation, status, archived_at, created_at, updated_at";
const OBSERVATION_FIELDS =
  "id, competitor_id, metric, availability, value, method, source_name, source_reference, observed_on, market_country, market_language, device, verification, notes, created_at";

function failure(error: { code?: string; message?: string } | null): WriteError {
  switch (error?.code) {
    case "23505": return "DUPLICATE";
    case "42501": return "NOT_ALLOWED";
    case "23503": return "NOT_FOUND";
    case "23514": return error.message?.includes("archived") ? "ARCHIVED" : "INVALID";
    default: return "WRITE_FAILED";
  }
}

const toCompetitor = (r: { id: string; domain: string; name: string | null; notes: string | null; relation: string; status: string; archived_at: string | null; created_at: string; updated_at: string }): CompetitorRow => ({
  id: r.id, domain: r.domain, name: r.name, notes: r.notes, relation: r.relation as Relation, status: r.status as CompetitorRow["status"],
  archivedAt: r.archived_at, createdAt: r.created_at, updatedAt: r.updated_at,
});

const toObservation = (r: Pick<ObservationRow, "id" | "competitor_id" | "metric" | "availability" | "value" | "method" | "source_name" | "source_reference" | "observed_on" | "market_country" | "market_language" | "device" | "verification" | "notes" | "created_at">): Observation => ({
  id: r.id, competitorId: r.competitor_id, metric: r.metric as Metric, availability: r.availability as Observation["availability"],
  value: r.value === null ? null : Number(r.value), method: r.method as Observation["method"], sourceName: r.source_name,
  sourceReference: r.source_reference, observedOn: r.observed_on, marketCountry: r.market_country, marketLanguage: r.market_language,
  device: r.device as Observation["device"], verification: r.verification as Observation["verification"], notes: r.notes, createdAt: r.created_at,
});

/** Database ids and own domain of a project the user can read, from the Core scope slugs. */
export async function loadCompetitorProject(client: Client, scope: { tenantId: string; projectId: string }): Promise<CompetitorProject | null> {
  const { data, error } = await client
    .from("projects")
    .select("id, organization_id, domain, organizations!inner(slug)")
    .eq("slug", scope.projectId)
    .eq("organizations.slug", scope.tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return { projectId: data.id, organizationId: data.organization_id, domain: data.domain, scope };
}

export async function listCompetitors(client: Client, project: ProjectRef): Promise<CompetitorRow[]> {
  const { data, error } = await client.from("competitors").select(COMPETITOR_FIELDS)
    .eq("project_id", project.projectId).order("status").order("domain").limit(200);
  if (error) throw new Error(`No se pudieron leer los competidores (${error.code}).`);
  return data.map(toCompetitor);
}

export async function getCompetitor(client: Client, project: ProjectRef, id: string): Promise<CompetitorRow | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await client.from("competitors").select(COMPETITOR_FIELDS)
    .eq("project_id", project.projectId).eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo leer el competidor (${error.code}).`);
  return data ? toCompetitor(data) : null;
}

/** All readings of the project (own site and competitors), newest first, capped. */
export async function listObservations(client: Client, project: ProjectRef, competitorId?: string | null): Promise<Observation[]> {
  let query = client.from("competitor_observations").select(OBSERVATION_FIELDS).eq("project_id", project.projectId);
  if (competitorId === null) query = query.is("competitor_id", null);
  else if (competitorId !== undefined) query = query.eq("competitor_id", competitorId);
  const { data, error } = await query.order("observed_on", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error(`No se pudieron leer las observaciones (${error.code}).`);
  return data.map(toObservation);
}

export async function addCompetitor(client: Client, project: ProjectRef, domain: string, details: CompetitorInput): Promise<WriteResult<string>> {
  const { data, error } = await client.from("competitors").insert({
    project_id: project.projectId, organization_id: project.organizationId, domain, name: details.name, notes: details.notes, relation: details.relation,
  }).select("id").single();
  return error || !data ? { ok: false, error: failure(error) } : { ok: true, value: data.id };
}

/** Finds an existing competitor by domain (idempotent add after a duplicate). */
export async function findCompetitorByDomain(client: Client, project: ProjectRef, domain: string): Promise<string | null> {
  const { data } = await client.from("competitors").select("id").eq("project_id", project.projectId).eq("domain", domain).maybeSingle();
  return data?.id ?? null;
}

async function updateOne(client: Client, project: ProjectRef, id: string, patch: Database["public"]["Tables"]["competitors"]["Update"]): Promise<WriteResult> {
  if (!isUuid(id)) return { ok: false, error: "NOT_FOUND" };
  const { data, error } = await client.from("competitors").update(patch).eq("project_id", project.projectId).eq("id", id).select("id");
  if (error) return { ok: false, error: failure(error) };
  // RLS hides rows the user may not change: zero rows is "not found or not allowed".
  return data.length === 1 ? { ok: true, value: undefined } : { ok: false, error: "NOT_FOUND" };
}

export const updateCompetitor = (client: Client, project: ProjectRef, id: string, details: CompetitorInput) =>
  updateOne(client, project, id, { name: details.name, notes: details.notes, relation: details.relation });

export const setCompetitorStatus = (client: Client, project: ProjectRef, id: string, status: "active" | "archived") =>
  updateOne(client, project, id, { status });

export async function eraseCompetitor(client: Client, project: ProjectRef, id: string): Promise<WriteResult> {
  if (!isUuid(id)) return { ok: false, error: "NOT_FOUND" };
  const { data, error } = await client.from("competitors").delete().eq("project_id", project.projectId).eq("id", id).select("id");
  if (error) return { ok: false, error: failure(error) };
  return data.length === 1 ? { ok: true, value: undefined } : { ok: false, error: "NOT_FOUND" };
}

export async function addObservation(client: Client, project: ProjectRef, input: ObservationInput): Promise<WriteResult<string>> {
  if (input.competitorId !== null && !isUuid(input.competitorId)) return { ok: false, error: "NOT_FOUND" };
  const { data, error } = await client.from("competitor_observations").insert({
    project_id: project.projectId, organization_id: project.organizationId, competitor_id: input.competitorId, metric: input.metric,
    availability: input.availability, value: input.value, method: input.method, source_name: input.sourceName,
    source_reference: input.sourceReference, observed_on: input.observedOn, market_country: input.marketCountry,
    market_language: input.marketLanguage, device: input.device, notes: input.notes,
  }).select("id").single();
  return error || !data ? { ok: false, error: failure(error) } : { ok: true, value: data.id };
}

export async function verifyObservation(client: Client, project: ProjectRef, id: string): Promise<WriteResult> {
  if (!isUuid(id)) return { ok: false, error: "NOT_FOUND" };
  const { data, error } = await client.from("competitor_observations").update({ verification: "verified" })
    .eq("project_id", project.projectId).eq("id", id).eq("verification", "unverified").select("id");
  if (error) return { ok: false, error: failure(error) };
  return data.length === 1 ? { ok: true, value: undefined } : { ok: false, error: "NOT_FOUND" };
}

export async function eraseObservation(client: Client, project: ProjectRef, id: string): Promise<WriteResult> {
  if (!isUuid(id)) return { ok: false, error: "NOT_FOUND" };
  const { data, error } = await client.from("competitor_observations").delete().eq("project_id", project.projectId).eq("id", id).select("id");
  if (error) return { ok: false, error: failure(error) };
  return data.length === 1 ? { ok: true, value: undefined } : { ok: false, error: "NOT_FOUND" };
}
