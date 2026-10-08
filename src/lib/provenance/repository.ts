import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { ProvenanceVerification } from "@/lib/core";
import type { Keyring } from "./keyring";
import { buildAuditRow, verifyAuditTrail, type AuditInput, type AuditRow, type AuditVerification, type ProjectRef } from "./audit";
import { openProviderResult, sealProviderResult, type ProviderResultRow } from "./results";

// Persistence through the signed-in user's Supabase client (publishable key): Postgres RLS
// decides what each call may read or write; the database links and protects the chain
// (migration 20261007120000) and this module computes and verifies hashes and signatures.

type Client = SupabaseClient<Database>;
type Failure = { ok: false; error: string };

const CHAIN_RACE = new Set(["23505", "23514"]);

export type AppendInput = Omit<AuditInput, "at"> & { at?: string };

/**
 * Appends an audit event; retries when another append won the race for the same seq. Without
 * an explicit `at`, each attempt takes the current time, so a retry never lands before the
 * event that won. An explicit `at` earlier than the stored chain is refused by the Core.
 */
export async function appendAudit(
  client: Client,
  project: ProjectRef,
  input: AppendInput,
  keyring: Keyring,
  { attempts = 3, clock = () => new Date() }: { attempts?: number; clock?: () => Date } = {},
): Promise<{ ok: true; row: AuditRow } | Failure> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const last = await client.from("audit_events").select("*").eq("project_id", project.projectId).order("seq", { ascending: false }).limit(1);
    if (last.error) return { ok: false, error: "READ_FAILED" };
    const built = buildAuditRow((last.data[0] as AuditRow | undefined) ?? null, { ...input, at: input.at ?? clock().toISOString() }, project, keyring);
    if (!built.ok) return built;
    const inserted = await client.from("audit_events").insert({ ...built.row, details: (built.row.details ?? {}) as NonNullable<Json> }).select("*").single();
    if (!inserted.error) return { ok: true, row: inserted.data as AuditRow };
    if (!CHAIN_RACE.has(inserted.error.code)) return { ok: false, error: inserted.error.code === "42501" ? "NOT_ALLOWED" : "WRITE_FAILED" };
  }
  return { ok: false, error: "CHAIN_CONTENTION" };
}

export async function readAuditTrail(client: Client, project: ProjectRef, keyring: Keyring): Promise<{ ok: true; rows: AuditRow[]; verification: AuditVerification } | Failure> {
  const { data, error } = await client.from("audit_events").select("*").eq("project_id", project.projectId).order("seq");
  if (error) return { ok: false, error: "READ_FAILED" };
  const rows = data as AuditRow[];
  return { ok: true, rows, verification: verifyAuditTrail(rows, project, keyring) };
}

export async function storeProviderResult(client: Client, project: ProjectRef, result: unknown, keyring: Keyring): Promise<{ ok: true; id: string } | Failure> {
  const sealed = sealProviderResult(result, project, keyring);
  if (!sealed.ok) return sealed;
  const { data, error } = await client
    .from("provider_results")
    .insert({ ...sealed.row, signed_payload: sealed.row.signed_payload as NonNullable<Json>, data: sealed.row.data as Json })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.code === "42501" ? "NOT_ALLOWED" : "WRITE_FAILED" };
  return { ok: true, id: data.id };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validProject = (project: ProjectRef) => UUID.test(project.projectId) && UUID.test(project.organizationId);

/** Metadata only. A list is not proof that the signed contents verify: load each result first. */
export interface ProviderResultSummary {
  id: string;
  provider: string;
  operation: string;
  status: string;
  captured_at: string | null;
  created_at: string;
}

/** Bounded history for one project, through the user's RLS client. No payloads or signatures. */
export async function listProviderResults(client: Client, project: ProjectRef, { limit = 25, offset = 0 }: { limit?: number; offset?: number } = {}): Promise<{ ok: true; rows: ProviderResultSummary[] } | Failure> {
  if (!validProject(project)) return { ok: false, error: "INVALID_SCOPE" };
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) return { ok: false, error: "INVALID_PAGE" };
  const { data, error } = await client.from("provider_results")
    .select("id, provider, operation, status, captured_at, created_at")
    .eq("project_id", project.projectId).eq("organization_id", project.organizationId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return { ok: false, error: "READ_FAILED" };
  return { ok: true, rows: data.map(({ id, provider, operation, status, captured_at, created_at }) => ({ id, provider, operation, status, captured_at, created_at })) };
}

/** Requires the expected project even when the user belongs to several projects. */
export async function loadProviderResult(client: Client, project: ProjectRef, id: string, keyring: Keyring): Promise<{ ok: true; row: ProviderResultRow; verification: ProvenanceVerification } | Failure> {
  if (!UUID.test(id) || !validProject(project)) return { ok: false, error: "NOT_FOUND" };
  const { data, error } = await client.from("provider_results").select("*").eq("project_id", project.projectId).eq("organization_id", project.organizationId).eq("id", id).maybeSingle();
  if (error) return { ok: false, error: "READ_FAILED" };
  if (!data || data.project_id !== project.projectId || data.organization_id !== project.organizationId) return { ok: false, error: "NOT_FOUND" };
  const row = data as ProviderResultRow;
  return { ok: true, row, verification: openProviderResult(row, keyring) };
}

export interface ProjectExport {
  format: "rubik-project-export-v1";
  exportedAt: string;
  scope: ProjectRef["scope"];
  audit: { rows: AuditRow[]; verification: AuditVerification };
  results: { row: ProviderResultRow; verification: { trust: string; verified: boolean; reason: string | null } }[];
  /** CORE-9.3 manual imports: DECLARED data, exported as stored (findings and row errors included). */
  imports: unknown[];
}

/** Full export of the project's persisted CORE-9.2 data, with the verification of each part. */
export async function exportProject(client: Client, project: ProjectRef, keyring: Keyring, at: string): Promise<{ ok: true; export: ProjectExport } | Failure> {
  const audit = await readAuditTrail(client, project, keyring);
  if (!audit.ok) return audit;
  const res = await client.from("provider_results").select("*").eq("project_id", project.projectId).order("created_at");
  if (res.error) return { ok: false, error: "READ_FAILED" };
  const results = (res.data as ProviderResultRow[]).map((row) => {
    const v = openProviderResult(row, keyring);
    return { row, verification: { trust: v.trust, verified: v.verified, reason: v.reason } };
  });
  const imports = await client.from("imports").select("*").eq("project_id", project.projectId).order("created_at");
  if (imports.error) return { ok: false, error: "READ_FAILED" };
  return { ok: true, export: { format: "rubik-project-export-v1", exportedAt: at, scope: project.scope, audit: { rows: audit.rows, verification: audit.verification }, results, imports: imports.data } };
}

/**
 * Erases the project's stored results and records it. RLS lets only the project owner delete
 * (a non-owner erases 0 rows); callers check `delete-data` with the Core's authorize() first.
 */
export async function eraseProviderResults(client: Client, project: ProjectRef, actor: AuditInput["actor"], keyring: Keyring): Promise<{ ok: true; erased: number } | Failure> {
  const { data, error } = await client.from("provider_results").delete().eq("project_id", project.projectId).select("id");
  if (error) return { ok: false, error: "WRITE_FAILED" };
  const erased = data.length;
  const logged = await appendAudit(client, project, { actor, action: "provider-results.erase", outcome: "allowed", details: { erased } }, keyring);
  if (!logged.ok) return logged;
  return { ok: true, erased };
}
