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
const EXPORT_PAGE = 500;
const EXPORT_MAX_ROWS = 10_000;

// PostgREST may cap a response below the requested limit. Count first and walk by a stable
// cursor; an empty page, changed count or excessive export fails instead of silently omitting
// signed rows. The cap is explicit because this route builds one in-memory download.
async function readCompleteRows<T>(
  countRows: () => Promise<{ count: number | null; error: unknown }>,
  pageRows: (after: string | number | null) => Promise<{ data: T[] | null; error: unknown }>,
  cursorOf: (row: T) => string | number,
): Promise<{ ok: true; rows: T[] } | Failure> {
  const first = await countRows();
  if (first.error || first.count === null) return { ok: false, error: "READ_FAILED" };
  if (first.count > EXPORT_MAX_ROWS) return { ok: false, error: "EXPORT_TOO_LARGE" };
  const rows: T[] = [];
  let after: string | number | null = null;
  while (rows.length < first.count) {
    const page = await pageRows(after);
    if (page.error) return { ok: false, error: "READ_FAILED" };
    if (!page.data?.length || rows.length + page.data.length > first.count) return { ok: false, error: "EXPORT_CHANGED" };
    const next = cursorOf(page.data.at(-1)!);
    if (next === after) return { ok: false, error: "EXPORT_CHANGED" };
    rows.push(...page.data);
    after = next;
  }
  const last = await countRows();
  if (last.error || last.count !== first.count) return { ok: false, error: "EXPORT_CHANGED" };
  return { ok: true, rows };
}

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
  const complete = await readCompleteRows<AuditRow>(
    async () => client.from("audit_events").select("seq", { count: "exact", head: true }).eq("project_id", project.projectId).eq("organization_id", project.organizationId),
    async (after) => {
      let query = client.from("audit_events").select("*").eq("project_id", project.projectId).eq("organization_id", project.organizationId).order("seq").limit(EXPORT_PAGE);
      if (after !== null) query = query.gt("seq", Number(after));
      return await query;
    },
    (row) => row.seq,
  );
  if (!complete.ok) return complete;
  const rows = complete.rows;
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
  return { ok: true, row, verification: openProviderResult(row, project, keyring) };
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
  const res = await readCompleteRows<Database["public"]["Tables"]["provider_results"]["Row"]>(
    async () => client.from("provider_results").select("id", { count: "exact", head: true }).eq("project_id", project.projectId).eq("organization_id", project.organizationId),
    async (after) => {
      let query = client.from("provider_results").select("*").eq("project_id", project.projectId).eq("organization_id", project.organizationId).order("id").limit(EXPORT_PAGE);
      if (after !== null) query = query.gt("id", String(after));
      return await query;
    },
    (row) => row.id,
  );
  if (!res.ok) return res;
  const results = res.rows.map((row) => {
    const v = openProviderResult(row, project, keyring);
    return { row, verification: { trust: v.trust, verified: v.verified, reason: v.reason } };
  });
  const imports = await readCompleteRows<Database["public"]["Tables"]["imports"]["Row"]>(
    async () => client.from("imports").select("id", { count: "exact", head: true }).eq("project_id", project.projectId).eq("organization_id", project.organizationId),
    async (after) => {
      let query = client.from("imports").select("*").eq("project_id", project.projectId).eq("organization_id", project.organizationId).order("id").limit(EXPORT_PAGE);
      if (after !== null) query = query.gt("id", String(after));
      return await query;
    },
    (row) => row.id,
  );
  if (!imports.ok) return imports;
  return { ok: true, export: { format: "rubik-project-export-v1", exportedAt: at, scope: project.scope, audit: { rows: audit.rows, verification: audit.verification }, results, imports: imports.rows } };
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
