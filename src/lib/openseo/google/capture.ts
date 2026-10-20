import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { googleReadsEnabled, type McpClientOptions, type OpenSeoMcpClient } from "@/lib/openseo/mcp-client";
import type { AuditInput, ProjectRef } from "@/lib/provenance/audit";
import type { Keyring } from "@/lib/provenance/keyring";
import { signProviderReceipt } from "@/lib/provenance/outbox";
import { sealProviderResult } from "@/lib/provenance/results";
import { completeTrustedProviderCommand, preflightTrustedWriter } from "@/lib/provenance/writer";
import { runManualGoogleReport, validQuery, type ManualGoogleQuery } from "./manual-report";
import { resolveGoogleSource } from "./properties";

// Manual Google capture (migration 20261012120000). The bounded read of #61 becomes a stored,
// signed result in five steps, so a retry never stores twice and a revocation never stores at all:
//   1. flag, query, keyring and source checked before anything is reserved;
//   2. `begin` reserves the idempotency key for the resolved connection and binding (a key
//      already stored returns its result, without calling the provider again);
//   3. the provider is called once; the source it used must be the one reserved;
//   4. the result is sealed with the server keyring (its signed source names connection and binding);
//   5. `store` re-validates connection and binding and inserts the result in one transaction.
// Once a provider request may have begun, keep the reservation on any uncertain failure.
// A replay must not spend quota again merely because persistence or the response failed.
// S1: step 5 also writes the `google.capture` audit receipt in the same transaction
// (20261015210000); the server then signs that receipt. A lost answer or a signing failure is
// repaired by retrying the same key (it replays the stored result and signs the pending
// receipt) or by the operator drain, never by calling the provider again.

type Client = SupabaseClient<Database>;
export type CaptureError =
  | "DISABLED" | "INVALID" | "SIGNING_NOT_CONFIGURED" | "FORBIDDEN" | "NOT_CONNECTED" | "IN_PROGRESS"
  | "SOURCE_CHANGED" | "CONFIGURATION" | "PROVIDER_STATUS" | "UNAVAILABLE" | "STORE_FAILED" | "WRITER_UNAVAILABLE";
export type CaptureOutcome =
  | { ok: true; resultId: string; replayed: boolean; audited: boolean }
  | { ok: false; error: CaptureError; status?: string };

const KEY = /^[A-Za-z0-9_-]{16,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORABLE = new Set(["OK", "PARTIAL", "EMPTY"]);
export const validCaptureKey = (key: string) => KEY.test(key);

const rpcError = (code: string | undefined): CaptureError =>
  code === "42501" ? "FORBIDDEN" : code === "55P03" ? "IN_PROGRESS" : code === "55000" ? "SOURCE_CHANGED"
    : code === "22023" ? "INVALID" : "UNAVAILABLE";

async function capture(client: Client, projectId: string, command: "begin" | "store" | "release", payload: Record<string, unknown>) {
  try {
    const { data, error } = await client.rpc("google_capture", { p_project_id: projectId, p_command: command, p_payload: payload as Json });
    return error ? { ok: false as const, error: rpcError(error.code) } : { ok: true as const, data: (data ?? {}) as Record<string, unknown> };
  } catch {
    return { ok: false as const, error: "UNAVAILABLE" as const };
  }
}

export async function captureGoogleReport(
  client: Client, project: ProjectRef, query: ManualGoogleQuery, key: string, actor: AuditInput["actor"], keyring: Keyring | null,
  deps: { env?: Record<string, string | undefined>; mcpFactory?: (opts: McpClientOptions) => Pick<OpenSeoMcpClient, "callTool" | "close">;
    clock?: () => Date; runId?: string | null; store?: typeof completeTrustedProviderCommand; receipt?: typeof signProviderReceipt;
    preflight?: typeof preflightTrustedWriter } = {},
): Promise<CaptureOutcome> {
  const env = deps.env ?? process.env;
  if (!googleReadsEnabled(env)) return { ok: false, error: "DISABLED" };
  if (!validCaptureKey(key) || !validQuery(query) || !UUID.test(project.projectId)) return { ok: false, error: "INVALID" };
  if (!keyring) return { ok: false, error: "SIGNING_NOT_CONFIGURED" };

  const resolved = await resolveGoogleSource(client, project.projectId, query.provider);
  if (!resolved.ok) return { ok: false, error: resolved.error === "FORBIDDEN" ? "FORBIDDEN" : resolved.error === "NOT_CONNECTED" ? "NOT_CONNECTED" : "UNAVAILABLE" };
  const source = resolved.source;

  // Check the live SQL writer and this actor's project chain before reserving or reading Google.
  const ready = await (deps.preflight ?? preflightTrustedWriter)(client, project, actor.id, keyring, "google");
  if (!ready.ok) return { ok: false, error: ready.error === "NOT_ALLOWED" ? "FORBIDDEN" : "WRITER_UNAVAILABLE" };

  const begun = await capture(client, project.projectId, "begin", {
    key, provider: query.provider, connectionId: source.connectionId, propertyBindingId: source.propertyBindingId,
  });
  if (!begun.ok) return { ok: false, error: begun.error === "SOURCE_CHANGED" ? "NOT_CONNECTED" : begun.error };
  const signReceipt = async (resultId: string) =>
    (await (deps.receipt ?? signProviderReceipt)(project, "google.capture", resultId, keyring)).ok;
  if (begun.data.state === "STORED" && typeof begun.data.resultId === "string" && UUID.test(begun.data.resultId)) {
    // Replay of a committed capture: completes its audit receipt if it is still pending.
    return { ok: true, resultId: begun.data.resultId, replayed: true, audited: await signReceipt(begun.data.resultId) };
  }
  if (begun.data.state !== "RESERVED") return { ok: false, error: "UNAVAILABLE" };

  const read = await runManualGoogleReport(client, project.projectId, query, deps);
  if (!read.ok) {
    return { ok: false, error: read.error === "DISABLED" || read.error === "INVALID" || read.error === "CONFIGURATION" || read.error === "FORBIDDEN"
      || read.error === "NOT_CONNECTED" ? read.error : "UNAVAILABLE" };
  }
  if (read.source.connectionId !== source.connectionId || read.source.propertyBindingId !== source.propertyBindingId) {
    return { ok: false, error: "SOURCE_CHANGED" };
  }
  if (!STORABLE.has(read.result.status)) return { ok: false, error: "PROVIDER_STATUS", status: read.result.status };

  const sealed = sealProviderResult(read.result, project, keyring);
  if (!sealed.ok) return { ok: false, error: "STORE_FAILED" };
  const stored = await (deps.store ?? completeTrustedProviderCommand)(client, project, { kind: "google", key, row: sealed.row });
  if (!stored.ok || typeof stored.data.resultId !== "string" || !UUID.test(stored.data.resultId)) {
    return { ok: false, error: !stored.ok && stored.error === "SOURCE_CHANGED" ? "SOURCE_CHANGED" : "STORE_FAILED" };
  }
  const resultId = stored.data.resultId;
  return { ok: true, resultId, replayed: false, audited: await signReceipt(resultId) };
}

export interface GoogleCaptureSummary { id: string; provider: "search-console" | "google-analytics"; status: string; capturedAt: string | null; createdAt: string }

/** Stored Google captures of the project (metadata only; open each one to verify its signature). */
export async function listGoogleCaptures(client: Client, project: ProjectRef, limit = 25): Promise<{ ok: true; rows: GoogleCaptureSummary[] } | { ok: false }> {
  if (!UUID.test(project.projectId) || !UUID.test(project.organizationId)) return { ok: false };
  const { data, error } = await client.from("provider_results").select("id, provider, status, captured_at, created_at")
    .eq("project_id", project.projectId).eq("organization_id", project.organizationId)
    .in("provider", ["search-console", "google-analytics"])
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  if (error) return { ok: false };
  return { ok: true, rows: data.map((r) => ({ id: r.id, provider: r.provider as GoogleCaptureSummary["provider"], status: r.status, capturedAt: r.captured_at, createdAt: r.created_at })) };
}
