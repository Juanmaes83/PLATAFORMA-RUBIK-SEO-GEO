import "server-only";

import type { Keyring } from "@/lib/provenance/keyring";
import { processAuditOutbox } from "@/lib/provenance/outbox";
import { writerPool } from "@/lib/provenance/writer";

// N2-13: the database queues one receipt per GEO change in the same transaction (S1 outbox);
// the server then signs this actor's pending geo receipts for this project through the trusted
// writer. No caller supplies event fields. A failure leaves the receipt pending.

export const writerReady = () => writerPool() !== null;

export async function signGeoReceipts(projectId: string, actorId: string, keyring: Keyring): Promise<{ ok: boolean; signed: number; pending: number }> {
  const pool = writerPool();
  if (!pool) return { ok: false, signed: 0, pending: 0 };
  let ids: string[];
  try {
    const rows = await pool.query<{ id: string }>(
      `select id from private.audit_outbox
        where project_id = $1::uuid and actor_id = $2::uuid and state = 'pending' and action like 'geo.%'
        order by created_at, id limit 25`, [projectId, actorId]);
    ids = rows.rows.map((r) => r.id);
  } catch {
    return { ok: false, signed: 0, pending: 0 };
  }
  let signed = 0;
  for (const id of ids) if ((await processAuditOutbox(id, keyring)).ok) signed++;
  return { ok: signed === ids.length, signed, pending: ids.length - signed };
}
