import "server-only";

import type { Keyring } from "@/lib/provenance/keyring";
import { processAuditOutbox } from "@/lib/provenance/outbox";
import { writerPool } from "@/lib/provenance/writer";

export const keywordWriterReady = () => writerPool() !== null;

/** Signs only the current actor's keyword receipts; failed signing leaves S1's receipt pending. */
export async function signKeywordReceipts(projectId: string, actorId: string, keyring: Keyring) {
  const pool = writerPool();
  if (!pool) return { ok: false, signed: 0, pending: 0 };
  let ids: string[];
  try {
    const result = await pool.query<{ id: string }>(
      `select id from private.audit_outbox where project_id = $1::uuid and actor_id = $2::uuid
        and state = 'pending' and action like 'seo.keyword.%' order by created_at, id limit 25`, [projectId, actorId]);
    ids = result.rows.map((row) => row.id);
  } catch {
    return { ok: false, signed: 0, pending: 0 };
  }
  let signed = 0;
  for (const id of ids) if ((await processAuditOutbox(id, keyring)).ok) signed++;
  return { ok: signed === ids.length, signed, pending: ids.length - signed };
}
