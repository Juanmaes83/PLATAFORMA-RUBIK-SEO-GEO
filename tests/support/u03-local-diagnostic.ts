export const U03_LOCAL_PHASES = [
  "auth_user_check", "actor_scope_check", "writer_transaction_begin", "writer_session_settings",
  "writer_advisory_lock", "writer_actor_lookup", "writer_idempotency_read", "writer_chain_read",
  "writer_audit_insert", "writer_receipt_insert", "writer_commit", "http_export", "offline_verify",
  "tamper_rejection", "restore_twice_idempotent", "fixture_cleanup", "other_sql",
] as const;
export type U03LocalPhase = typeof U03_LOCAL_PHASES[number];
export type U03LocalCategory = "AUTH_USER_MISMATCH" | "ACTOR_SCOPE_MISMATCH" | "SQL_PRIVILEGE_DENIED" | "OTHER_LOCAL_FAILURE" | null;
export type U03LocalResult = "PASS" | "FAIL" | "BLOCKED";

const PHASES = new Set<string>(U03_LOCAL_PHASES);

/** Returns a closed, sanitized ledger row. It never reads error.message or other free text. */
export function safeU03LocalDiagnostic(input: {
  runId: string;
  phase: string;
  result: U03LocalResult;
  errorCode?: unknown;
  authUserMatches?: boolean;
  actorScopeMatches?: boolean;
}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.runId) || !PHASES.has(input.phase))
    throw new Error("U03_DIAGNOSTIC_INPUT_REJECTED");
  let category: U03LocalCategory = null;
  let sqlstate: "42501" | undefined;
  if (input.phase === "auth_user_check" && input.authUserMatches === false) category = "AUTH_USER_MISMATCH";
  else if (input.phase === "actor_scope_check" && input.actorScopeMatches === false) category = "ACTOR_SCOPE_MISMATCH";
  else if (typeof input.errorCode === "string") {
    if (input.errorCode === "42501" && input.phase.startsWith("writer_")) {
      category = "SQL_PRIVILEGE_DENIED";
      sqlstate = "42501";
    } else category = "OTHER_LOCAL_FAILURE";
  }
  return { runId: input.runId, phase: input.phase, category, result: input.result, ...(sqlstate ? { sqlstate } : {}) };
}
