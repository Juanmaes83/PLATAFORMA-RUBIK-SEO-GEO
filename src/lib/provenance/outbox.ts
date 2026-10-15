import "server-only";

import type { Role } from "@/lib/core";
import { buildAuditRow, verifyAuditTrail, type AuditRow, type ProjectRef } from "./audit";
import type { Keyring } from "./keyring";
import { writerPool } from "./writer";

type Receipt = { id: string; project_id: string; organization_id: string; actor_id: string;
  actor_role: Role; target_id: string | null; target_text: string | null; action: "member.withdraw" | "import.file" | "import.erase";
  details: Record<string, unknown>; state: "pending" | "completed"; event_seq: number | null };

/** Signs only a receipt created by a database effect trigger; no caller supplies event fields. */
export async function processAuditOutbox(id: string, keyring: Keyring): Promise<{ ok: true; seq: number } | { ok: false; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "INVALID_RECEIPT" };
  const pool = writerPool();
  if (!pool) return { ok: false, error: "WRITER_NOT_CONFIGURED" };
  let db;
  let failure = "WRITE_FAILED";
  try {
    db = await pool.connect();
    await db.query("begin");
    await db.query("set local statement_timeout = '8s'");
    const got = await db.query<Receipt>("select * from private.audit_outbox where id = $1::uuid for update", [id]);
    const receipt = got.rows[0];
    if (!receipt) { await db.query("rollback"); return { ok: false, error: "RECEIPT_NOT_FOUND" }; }
    if (receipt.state === "completed" && receipt.event_seq !== null) {
      await db.query("commit");
      return { ok: true, seq: receipt.event_seq };
    }
    await db.query("select pg_advisory_xact_lock(hashtextextended('audit_events:' || $1::text, 0))", [receipt.project_id]);
    const scope = await db.query<{ organization_id: string; tenant_slug: string; project_slug: string }>(
      "select * from private.audit_writer_project($1::uuid)", [receipt.project_id]);
    if (!scope.rows[0] || scope.rows[0].organization_id !== receipt.organization_id) {
      failure = "INVALID_SCOPE"; throw new Error(failure);
    }
    const project: ProjectRef = { projectId: receipt.project_id, organizationId: receipt.organization_id,
      scope: { tenantId: scope.rows[0].tenant_slug, projectId: scope.rows[0].project_slug } };
    const chain = await db.query<AuditRow>("select * from public.audit_events where project_id = $1::uuid order by seq", [receipt.project_id]);
    if (!verifyAuditTrail(chain.rows, project, keyring).valid) { failure = "CHAIN_INVALID"; throw new Error(failure); }
    const built = buildAuditRow(chain.rows.at(-1) ?? null, { at: new Date().toISOString(),
      actor: { role: receipt.actor_role, id: receipt.actor_id }, action: receipt.action, target: receipt.target_text ?? receipt.target_id ?? undefined,
      outcome: "allowed", details: { ...receipt.details, receiptId: receipt.id } }, project, keyring);
    if (!built.ok) { failure = built.error; throw new Error(failure); }
    const row = built.row;
    await db.query(`insert into public.audit_events
      (project_id, organization_id, seq, at, actor_role, actor_id, action, target, outcome, details, prev_hash, hash, key_id, signature)
      values ($1::uuid,$2::uuid,$3,$4,$5,$6::uuid,$7,$8,$9,$10::jsonb,$11,$12,$13,$14)`,
    [row.project_id, row.organization_id, row.seq, row.at, row.actor_role, receipt.actor_id, row.action,
      row.target, row.outcome, JSON.stringify(row.details), row.prev_hash, row.hash, row.key_id, row.signature]);
    await db.query("update private.audit_outbox set state = 'completed', event_seq = $2, completed_at = now(), attempts = attempts + 1, last_error = null where id = $1::uuid",
      [id, row.seq]);
    await db.query("commit");
    return { ok: true, seq: row.seq };
  } catch {
    if (db) {
      try { await db.query("rollback"); } catch { /* disconnected */ }
      db.release();
      db = undefined;
    }
    try { await pool.query("update private.audit_outbox set attempts = attempts + 1, last_error = $2 where id = $1::uuid and state = 'pending'", [id, failure]); } catch { /* receipt remains pending */ }
    return { ok: false, error: failure };
  } finally {
    db?.release();
  }
}

/** Safe to retry: completed receipts are ignored and each pending receipt is locked on processing. */
export async function drainAuditOutbox(keyring: Keyring, limit = 25): Promise<{ pending: number; completed: number; failed: number }> {
  const pool = writerPool();
  if (!pool || !Number.isInteger(limit) || limit < 1 || limit > 100) return { pending: 0, completed: 0, failed: 0 };
  const rows = await pool.query<{ id: string }>("select id from private.audit_outbox where state = 'pending' order by created_at, id limit $1", [limit]);
  let completed = 0, failed = 0;
  for (const row of rows.rows) {
    if ((await processAuditOutbox(row.id, keyring)).ok) completed++;
    else failed++;
  }
  return { pending: rows.rowCount ?? 0, completed, failed };
}

/** Counts only DB-created receipts; no customer payload or signature is returned. */
export async function pendingAuditOutbox(): Promise<{ pending: number; oldestAt: string | null }> {
  const pool = writerPool();
  if (!pool) throw new Error("WRITER_NOT_CONFIGURED");
  const result = await pool.query<{ pending: string; oldest_at: Date | null }>(
    "select count(*)::text as pending, min(created_at) as oldest_at from private.audit_outbox where state = 'pending'");
  return { pending: Number(result.rows[0].pending), oldestAt: result.rows[0].oldest_at?.toISOString() ?? null };
}
