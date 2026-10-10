import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Google state of a project for recovery (migration 20261012130000): every OpenSEO connection and
// Google property binding (revoked history included) and every STORED capture. Read through the
// owner RPC; nothing secret is returned. The restore plan only writes these rows back when they
// agree with the signed results (src/lib/restore/plan.ts).

export interface GoogleRecoveryState {
  connections: Record<string, unknown>[];
  bindings: Record<string, unknown>[];
  captures: Record<string, unknown>[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (rows: unknown) => Array.isArray(rows) && rows.every((r) => r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string" && UUID.test((r as { id: string }).id));

export function isGoogleRecoveryState(value: unknown): value is GoogleRecoveryState {
  const v = value as GoogleRecoveryState | null;
  return !!v && typeof v === "object" && ids(v.connections) && ids(v.bindings) && ids(v.captures);
}

export async function readGoogleRecoveryState(client: SupabaseClient<Database>, projectId: string):
  Promise<{ ok: true; value: GoogleRecoveryState } | { ok: false; error: string }> {
  if (!UUID.test(projectId)) return { ok: false, error: "INVALID" };
  try {
    const { data, error } = await client.rpc("google_recovery_state", { p_project_id: projectId });
    if (error) return { ok: false, error: error.code === "42501" ? "FORBIDDEN" : "UNAVAILABLE" };
    return isGoogleRecoveryState(data) ? { ok: true, value: data } : { ok: false, error: "INVALID_RESPONSE" };
  } catch {
    return { ok: false, error: "UNAVAILABLE" };
  }
}
