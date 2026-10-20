import "server-only";

import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { buildAuditRow, verifyAuditTrail, type AuditInput, type AuditRow, type ProjectRef } from "./audit";
import { openProviderResult, sealProviderResult, type ProviderResultRow } from "./results";
import type { Keyring } from "./keyring";
import { previewLocked } from "@/lib/auth/mode";
import { previewWriterScopeAllowed, previewWriterWindowActive } from "./preview-writer-window";
import { SUPABASE_ROOT_2021_CA } from "./supabase-root-ca";

type Client = SupabaseClient<Database>;
type Failure = { ok: false; error: string };
type Result = { ok: true; row: AuditRow } | Failure;
type AppendInput = Omit<AuditInput, "at"> & { at?: string };
type ActorRow = { organization_id: string; actor_role: AuditInput["actor"]["role"]; tenant_slug: string; project_slug: string };

let sharedPool: Pool | null = null;
let poolUrl: string | null = null;
export function writerPool(): Pool | null {
  // Ordinary Preview remains read-only. Only a separately pinned U03 deployment may open
  // the temporary run-scoped writer, with a role-specific URL and an expiring window.
  if (((process.env.VERCEL_ENV ?? "").trim() === "preview" &&
      !previewWriterWindowActive()) || previewLocked(process.env)) return null;
  const url = process.env.RUBIK_AUDIT_DATABASE_URL;
  if (!url) return null;
  if (sharedPool && poolUrl === url) return sharedPool;
  if (sharedPool) void sharedPool.end();
  const parsed = new URL(url);
  const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!local && parsed.protocol !== "postgresql:") return null;
  // pg can let SSL query parameters override the explicit TLS settings below.
  if (!local && [...parsed.searchParams.keys()].some((key) => key.toLowerCase().startsWith("ssl"))) return null;
  const supabaseHost = parsed.hostname.endsWith(".pooler.supabase.com")
    || /^db\.[a-z0-9]+\.supabase\.co$/.test(parsed.hostname);
  poolUrl = url;
  sharedPool = new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000, ssl: local ? false : { rejectUnauthorized: true,
      ...(supabaseHost ? { ca: SUPABASE_ROOT_2021_CA } : {}) } });
  sharedPool.on("error", () => { /* idle client failure: next checkout reconnects */ });
  return sharedPool;
}

/** Read-only, per-project readiness probe before any metered provider request.
 * This is deliberately uncached: a healthy environment variable is not evidence that the
 * dedicated SQL identity can connect, see the schema, authorize this actor and verify the chain.
 * A later network/commit failure remains possible and must still be reported as uncertain.
 */
export async function preflightTrustedWriter(userClient: Client, project: ProjectRef,
  actorId: string, keyring: Keyring, operation: "google" | "openseo",
): Promise<{ ok: true } | Failure> {
  if (!previewWriterScopeAllowed(project.scope)) return { ok: false, error: "WRITER_UNAVAILABLE" };
  let pool: Pool | null;
  try { pool = writerPool(); } catch { return { ok: false, error: "WRITER_UNAVAILABLE" }; }
  if (!pool) return { ok: false, error: "WRITER_NOT_CONFIGURED" };
  if (!/^[0-9a-f-]{36}$/i.test(project.projectId) || !/^[0-9a-f-]{36}$/i.test(actorId))
    return { ok: false, error: "INVALID_SCOPE" };
  let verified;
  try { verified = await userClient.auth.getUser(); }
  catch { return { ok: false, error: "WRITER_UNAVAILABLE" }; }
  if (verified.error || verified.data.user?.id !== actorId) return { ok: false, error: "NOT_ALLOWED" };
  let db;
  try {
    db = await pool.connect();
    // audit_writer_actor takes FOR SHARE locks to revalidate membership; PostgreSQL forbids
    // that in a READ ONLY transaction. This transaction still issues no mutations.
    await db.query("begin");
    await db.query("set local statement_timeout = '8s'");
    await db.query("set local lock_timeout = '3s'");
    const capability = await db.query<{ ready: boolean }>(`select
      current_user = 'rubik_audit_writer'
      and not (select rolbypassrls from pg_roles where rolname = current_user)
      and has_table_privilege(current_user, 'public.audit_events', 'SELECT')
      and has_table_privilege(current_user, 'public.audit_events', 'INSERT')
      and has_table_privilege(current_user, 'public.provider_results', 'SELECT')
      and has_table_privilege(current_user, 'public.provider_results', 'INSERT')
      and has_table_privilege(current_user, 'private.audit_idempotency', 'SELECT')
      and has_table_privilege(current_user, 'private.audit_idempotency', 'INSERT')
      and has_table_privilege(current_user, 'private.audit_outbox', 'SELECT')
      and has_column_privilege(current_user, 'private.audit_outbox', 'state', 'UPDATE')
      and has_function_privilege(current_user, 'private.audit_writer_actor(uuid,uuid)', 'EXECUTE')
      and has_function_privilege(current_user, $1, 'EXECUTE') as ready`,
    [operation === "google" ? "private.google_capture_command(uuid,text,jsonb)" : "private.openseo_job(uuid,text,uuid,jsonb)"]);
    if (!capability.rows[0]?.ready) return { ok: false, error: "WRITER_UNAVAILABLE" };
    const actor = await db.query<ActorRow>("select * from private.audit_writer_actor($1::uuid, $2::uuid)", [project.projectId, actorId]);
    const current = actor.rows[0];
    if (!current || current.organization_id !== project.organizationId
      || current.tenant_slug !== project.scope.tenantId || current.project_slug !== project.scope.projectId)
      return { ok: false, error: "NOT_ALLOWED" };
    const chain = await db.query<AuditRow>("select * from public.audit_events where project_id = $1::uuid order by seq", [project.projectId]);
    if (!verifyAuditTrail(chain.rows, project, keyring).valid) return { ok: false, error: "CHAIN_INVALID" };
    return { ok: true };
  } catch {
    return { ok: false, error: "WRITER_UNAVAILABLE" };
  } finally {
    if (db) {
      try { await db.query("rollback"); } catch { /* read-only transaction was discarded */ }
      db.release();
    }
  }
}

/** The only ordinary append path. No request can supply a signed row or SQL role. */
export async function appendTrustedAudit(
  userClient: Client, project: ProjectRef, input: AppendInput, keyring: Keyring,
  opts: { clock?: () => Date; operationId?: string } = {},
): Promise<Result> {
  if (!previewWriterScopeAllowed(project.scope)) return { ok: false, error: "WRITER_NOT_CONFIGURED" };
  const pool = writerPool();
  if (!pool) return { ok: false, error: "WRITER_NOT_CONFIGURED" };
  if (!/^[0-9a-f-]{36}$/i.test(project.projectId) || !/^[0-9a-f-]{36}$/i.test(input.actor.id)) return { ok: false, error: "INVALID_SCOPE" };
  const verified = await userClient.auth.getUser();
  if (verified.error || verified.data.user?.id !== input.actor.id) return { ok: false, error: "NOT_ALLOWED" };
  const operationId = opts.operationId ?? randomUUID();
  if (!/^[0-9a-f-]{36}$/i.test(operationId)) return { ok: false, error: "INVALID_OPERATION" };

  let db;
  let committed = false;
  try {
    db = await pool.connect();
    await db.query("begin");
    await db.query("set local statement_timeout = '8s'");
    await db.query("set local lock_timeout = '3s'");
    await db.query("select pg_advisory_xact_lock(hashtextextended('audit_events:' || $1::text, 0))", [project.projectId]);
    const actor = await db.query<ActorRow>("select * from private.audit_writer_actor($1::uuid, $2::uuid)", [project.projectId, input.actor.id]);
    const current = actor.rows[0];
    if (!current || current.organization_id !== project.organizationId || current.actor_role !== input.actor.role
      || current.tenant_slug !== project.scope.tenantId || current.project_slug !== project.scope.projectId) {
      await db.query("rollback");
      return { ok: false, error: "NOT_ALLOWED" };
    }
    const prior = await db.query<{ project_id: string; actor_id: string; action: string; event_seq: number }>(
      "select project_id, actor_id, action, event_seq from private.audit_idempotency where id = $1::uuid", [operationId]);
    if (prior.rows[0]) {
      const receipt = prior.rows[0];
      if (receipt.project_id !== project.projectId || receipt.actor_id !== input.actor.id || receipt.action !== input.action) {
        await db.query("rollback");
        return { ok: false, error: "IDEMPOTENCY_CONFLICT" };
      }
      const existing = await db.query<AuditRow>("select * from public.audit_events where project_id = $1::uuid and seq = $2", [project.projectId, receipt.event_seq]);
      await db.query("commit");
      committed = true;
      return existing.rows[0] ? { ok: true, row: existing.rows[0] } : { ok: false, error: "CHAIN_INVALID" };
    }
    const chain = await db.query<AuditRow>("select * from public.audit_events where project_id = $1::uuid order by seq", [project.projectId]);
    if (!verifyAuditTrail(chain.rows, project, keyring).valid) {
      await db.query("rollback");
      return { ok: false, error: "CHAIN_INVALID" };
    }
    const built = buildAuditRow(chain.rows.at(-1) ?? null, { ...input, at: input.at ?? (opts.clock ?? (() => new Date()))().toISOString(),
      actor: { id: input.actor.id, role: current.actor_role } }, project, keyring);
    if (!built.ok) {
      await db.query("rollback");
      return built;
    }
    const row = built.row;
    const inserted = await db.query<AuditRow>(`insert into public.audit_events
      (project_id, organization_id, seq, at, actor_role, actor_id, action, target, outcome, details, prev_hash, hash, key_id, signature)
      values ($1::uuid,$2::uuid,$3,$4,$5,$6::uuid,$7,$8,$9,$10::jsonb,$11,$12,$13,$14) returning *`,
    [row.project_id, row.organization_id, row.seq, row.at, row.actor_role, input.actor.id, row.action,
      row.target, row.outcome, JSON.stringify(row.details), row.prev_hash, row.hash, row.key_id, row.signature]);
    await db.query("insert into private.audit_idempotency (id, project_id, actor_id, action, event_seq) values ($1::uuid,$2::uuid,$3::uuid,$4,$5)",
      [operationId, project.projectId, input.actor.id, input.action, row.seq]);
    await db.query("commit");
    committed = true;
    return { ok: true, row: inserted.rows[0] };
  } catch (error) {
    if (db && !committed) {
      try { await db.query("rollback"); } catch { /* the server already discarded the transaction */ }
    }
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    return { ok: false, error: code === "42501" ? "NOT_ALLOWED" : code === "57014" || code === "55P03" ? "WRITER_TIMEOUT" : "WRITE_FAILED" };
  } finally {
    db?.release();
  }
}

/** Persists only a Core-issued result sealed on this server, with a live SQL membership check. */
export async function storeTrustedProviderResult(
  userClient: Client, project: ProjectRef, result: unknown, keyring: Keyring,
  opts: { operationId?: string } = {},
): Promise<{ ok: true; id: string } | Failure> {
  if (!previewWriterScopeAllowed(project.scope)) return { ok: false, error: "WRITER_NOT_CONFIGURED" };
  const pool = writerPool();
  if (!pool) return { ok: false, error: "WRITER_NOT_CONFIGURED" };
  if (!/^[0-9a-f-]{36}$/i.test(project.projectId)) return { ok: false, error: "INVALID_SCOPE" };
  const verified = await userClient.auth.getUser();
  const userId = verified.data.user?.id;
  if (verified.error || !userId) return { ok: false, error: "NOT_ALLOWED" };
  const sealed = sealProviderResult(result, project, keyring);
  if (!sealed.ok) return sealed;
  const id = opts.operationId ?? randomUUID();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "INVALID_OPERATION" };

  let db;
  try {
    db = await pool.connect();
    await db.query("begin");
    await db.query("set local statement_timeout = '8s'");
    await db.query("set local lock_timeout = '3s'");
    await db.query("select pg_advisory_xact_lock(hashtextextended('audit_events:' || $1::text, 0))", [project.projectId]);
    const actors = await db.query<ActorRow>("select * from private.audit_writer_actor($1::uuid, $2::uuid)", [project.projectId, userId]);
    const actor = actors.rows[0];
    if (!actor || actor.organization_id !== project.organizationId || actor.tenant_slug !== project.scope.tenantId
      || actor.project_slug !== project.scope.projectId || !["owner", "account-manager", "analyst"].includes(actor.actor_role)) {
      await db.query("rollback");
      return { ok: false, error: "NOT_ALLOWED" };
    }
    const row = sealed.row;
    await db.query(`insert into public.provider_results
      (id, project_id, organization_id, provider, operation, status, captured_at, signed_payload, data,
       data_hash_alg, data_hash, key_id, signature, created_by)
      values ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14::uuid)
      on conflict (id) do nothing`, [id, project.projectId, project.organizationId, row.provider, row.operation,
      row.status, row.captured_at, JSON.stringify(row.signed_payload), JSON.stringify(row.data), row.data_hash_alg,
      row.data_hash, row.key_id, row.signature, userId]);
    const stored = await db.query<ProviderResultRow & { created_by: string; content_matches: boolean }>(
      `select *, (signed_payload = $2::jsonb and data is not distinct from $3::jsonb
        and provider = $4 and operation = $5 and status = $6
        and captured_at is not distinct from $7::timestamptz
        and data_hash_alg = $8 and data_hash = $9) as content_matches
       from public.provider_results where id = $1::uuid`,
      [id, JSON.stringify(row.signed_payload), JSON.stringify(row.data), row.provider, row.operation,
        row.status, row.captured_at, row.data_hash_alg, row.data_hash]);
    const existing = stored.rows[0];
    if (!existing || existing.project_id !== project.projectId || existing.organization_id !== project.organizationId
      || existing.created_by !== userId || !existing.content_matches
      || !openProviderResult(existing, project, keyring).verified) {
      await db.query("rollback");
      return { ok: false, error: "IDEMPOTENCY_CONFLICT" };
    }
    await db.query("commit");
    return { ok: true, id };
  } catch (error) {
    if (db) { try { await db.query("rollback"); } catch { /* connection lost */ } }
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    return { ok: false, error: code === "42501" ? "NOT_ALLOWED" : code === "57014" || code === "55P03" ? "WRITER_TIMEOUT" : "WRITE_FAILED" };
  } finally {
    db?.release();
  }
}

/** Completes a reserved external capture through the dedicated SQL identity. */
export async function completeTrustedProviderCommand(
  userClient: Client, project: ProjectRef,
  command: { kind: "google"; key: string; row: ProviderResultRow }
    | { kind: "openseo"; jobId: string; issues: ProviderResultRow; pages: ProviderResultRow },
): Promise<{ ok: true; data: Record<string, unknown> } | Failure> {
  if (!previewWriterScopeAllowed(project.scope)) return { ok: false, error: "WRITER_NOT_CONFIGURED" };
  const pool = writerPool();
  if (!pool) return { ok: false, error: "WRITER_NOT_CONFIGURED" };
  const verified = await userClient.auth.getUser();
  const userId = verified.data.user?.id;
  if (verified.error || !userId) return { ok: false, error: "NOT_ALLOWED" };
  let db;
  try {
    db = await pool.connect();
    await db.query("begin");
    await db.query("set local statement_timeout = '8s'");
    await db.query("set local lock_timeout = '3s'");
    const actors = await db.query<ActorRow>("select * from private.audit_writer_actor($1::uuid, $2::uuid)", [project.projectId, userId]);
    const actor = actors.rows[0];
    if (!actor || actor.actor_role !== "owner" || actor.organization_id !== project.organizationId
      || actor.tenant_slug !== project.scope.tenantId || actor.project_slug !== project.scope.projectId) {
      await db.query("rollback");
      return { ok: false, error: "NOT_ALLOWED" };
    }
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    const query = command.kind === "google"
      ? await db.query<{ result: Record<string, unknown> }>(
        "select private.google_capture_command($1::uuid, 'store', $2::jsonb) as result",
        [project.projectId, JSON.stringify({ key: command.key, row: command.row })])
      : await db.query<{ result: Record<string, unknown> }>(
        "select private.openseo_job($1::uuid, 'complete', $2::uuid, $3::jsonb) as result",
        [project.projectId, command.jobId, JSON.stringify({ auditIssues: command.issues, auditPages: command.pages })]);
    await db.query("commit");
    return { ok: true, data: query.rows[0].result };
  } catch (error) {
    if (db) { try { await db.query("rollback"); } catch { /* connection lost */ } }
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    return { ok: false, error: code === "42501" ? "NOT_ALLOWED" : code === "55000" ? "SOURCE_CHANGED"
      : code === "22023" || code === "23514" ? "INVALID" : code === "55P03" || code === "57014" ? "WRITER_TIMEOUT" : "WRITE_FAILED" };
  } finally {
    db?.release();
  }
}
