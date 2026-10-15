import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { captureGoogleReport } from "@/lib/openseo/google/capture";
import { loadKeyring } from "@/lib/provenance/keyring";
import { openProviderResult } from "@/lib/provenance/results";

// Manual Google capture, in memory only: the RPCs are a small state machine with the same rules as
// migration 20261012120000, the MCP is simulated and nothing reaches a network or a database.
// S1: storage goes through the trusted writer (simulated `store`, same rules) and the audit is
// the receipt written with the result (simulated `receipt`, 20261015210000).
const projectId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const project = { projectId, organizationId, scope: { tenantId: "agencia", projectId: "proyecto" } };
const connectionId = "33333333-3333-4333-8333-333333333333";
const bindingId = "55555555-5555-4555-8555-555555555555";
const actor = { role: "owner" as const, id: "44444444-4444-4444-8444-444444444444" };
const env = { OPENSEO_GOOGLE_READS_ENABLED: "true", OPENSEO_ENDPOINT: "https://openseo.example", OPENSEO_API_KEY: "oseo_123456789" };
const key = "capture-key-000000001";
const query = { provider: "search-console" as const, startDate: "2026-09-01", endDate: "2026-09-28", dimensions: ["page"], rowLimit: 10 };
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-test:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-test" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;
const reply = { structuredContent: { ok: true, siteUrl: "https://sarah.es/", startDate: "2026-09-01", endDate: "2026-09-28",
  dimensions: ["page"], rowCount: 1, rows: [{ keys: ["https://sarah.es/"], clicks: 1, impressions: 10, ctr: 0.1, position: 3 }],
  hasMore: false, nextStartRow: 1 } };

function setup({ storeError, revokeBetween, lostStoreResponse }: { storeError?: string; revokeBetween?: boolean; lostStoreResponse?: boolean } = {}) {
  const captures = new Map<string, { state: string; resultId?: string }>();
  const stored: Record<string, unknown>[] = [];
  let active = true;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "openseo_connection") return { data: { connectionId, state: active ? "ACTIVE" : "REVOKED", credentialMode: "platform", openseoProjectId: "client-project",
      allowedHosts: ["sarah.com"], grantedAt: "2026-10-09T10:00:00Z", revokedAt: active ? null : "2026-10-10T10:00:00Z" }, error: null };
    if (name === "openseo_google_property") return { data: { propertyId: bindingId, connectionId, provider: "search-console", state: "ACTIVE",
      externalPropertyId: "https://sarah.es/", source: "OWNER_DECLARED", grantedAt: "2026-10-09T10:10:00Z", revokedAt: null }, error: null };
    const p = args.p_payload as Record<string, unknown>;
    const cap = captures.get(String(p.key));
    if (args.p_command === "begin") {
      if (cap?.state === "STORED") return { data: { state: "STORED", resultId: cap.resultId }, error: null };
      if (cap?.state === "RESERVED") return { data: null, error: { code: "55P03" } };
      captures.set(String(p.key), { state: "RESERVED" });
      return { data: { state: "RESERVED" }, error: null };
    }
    if (args.p_command === "release") { if (cap?.state === "RESERVED") cap.state = "RELEASED"; return { data: { state: "RELEASED" }, error: null }; }
    throw new Error(`unexpected JWT command ${String(args.p_command)}: storage must use the trusted writer`);
  });
  // completeTrustedProviderCommand, simulated: the same reservation rules, through the writer.
  const receipts = new Map<string, "pending" | "completed">();
  const store = vi.fn(async (_client: unknown, _project: unknown, command: { kind: string; key?: string; row?: unknown }) => {
    const cap = captures.get(String(command.key));
    if (revokeBetween) active = false;
    if (storeError) return { ok: false as const, error: storeError === "55000" ? "SOURCE_CHANGED" : "WRITE_FAILED" };
    if (cap?.state !== "RESERVED") return { ok: false as const, error: "SOURCE_CHANGED" };
    stored.push(command.row as Record<string, unknown>);
    const resultId = "66666666-6666-4666-8666-66666666666" + stored.length;
    captures.set(String(command.key), { state: "STORED", resultId });
    receipts.set(resultId, "pending");
    // The transaction committed, but the answer never reaches the server (network cut, timeout).
    if (lostStoreResponse) return { ok: false as const, error: "WRITE_FAILED" };
    return { ok: true as const, data: { state: "STORED", resultId } };
  });
  // signProviderReceipt, simulated: signs the receipt committed with the result, idempotently.
  const receipt = vi.fn(async (_project: unknown, _action: string, resultId: string) => {
    if (!receipts.has(resultId)) return { ok: false as const, error: "RECEIPT_NOT_FOUND" };
    receipts.set(resultId, "completed");
    return { ok: true as const, seq: 1 };
  });
  const callTool = vi.fn(async () => reply);
  const mcpFactory = vi.fn(() => ({ callTool, close: vi.fn(async () => {}) }));
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc, callTool, mcpFactory, store, receipt, receipts, captures, stored };
}

describe("manual Google capture (simulated provider and RPCs)", () => {
  it("stores one signed result whose source names the reserved connection and binding, signs its receipt, then replays without a new read", async () => {
    const s = setup();
    const first = await captureGoogleReport(s.client, project, query, key, actor, keyring, { env, mcpFactory: s.mcpFactory, store: s.store, receipt: s.receipt });
    expect(first).toMatchObject({ ok: true, replayed: false, audited: true });
    expect(s.callTool).toHaveBeenCalledTimes(1);
    const row = s.stored[0] as { signed_payload: { provenance: { sourceContext: Record<string, string> } } };
    expect(row.signed_payload.provenance.sourceContext).toMatchObject({ connectionId, propertyBindingId: bindingId, providerProjectId: "client-project" });
    expect(openProviderResult({ ...(s.stored[0] as Record<string, unknown>), id: "x" } as never, project, keyring)).toMatchObject({ verified: true });
    const resultId = (first as { resultId: string }).resultId;
    expect(s.receipt).toHaveBeenCalledWith(project, "google.capture", resultId, keyring);
    expect(s.receipts.get(resultId)).toBe("completed");

    // A replay signs nothing new (the receipt is already completed) and never reads again.
    const again = await captureGoogleReport(s.client, project, query, key, actor, keyring, { env, mcpFactory: s.mcpFactory, store: s.store, receipt: s.receipt });
    expect(again).toEqual({ ok: true, resultId, replayed: true, audited: true });
    expect(s.callTool).toHaveBeenCalledTimes(1);
    expect(s.stored).toHaveLength(1);
  });

  it("checks flag, query, key and keyring before reserving anything", async () => {
    const s = setup();
    const run = (over: { env?: Record<string, string>; k?: string; q?: typeof query; ring?: typeof keyring | null }) =>
      captureGoogleReport(s.client, project, over.q ?? query, over.k ?? key, actor, over.ring === undefined ? keyring : over.ring, { env: over.env ?? env, mcpFactory: s.mcpFactory, store: s.store, receipt: s.receipt });
    expect(await run({ env: { ...env, OPENSEO_GOOGLE_READS_ENABLED: "false" } })).toEqual({ ok: false, error: "DISABLED" });
    expect(await run({ k: "short" })).toEqual({ ok: false, error: "INVALID" });
    expect(await run({ q: { ...query, rowLimit: 1000 } })).toEqual({ ok: false, error: "INVALID" });
    expect(await run({ ring: null })).toEqual({ ok: false, error: "SIGNING_NOT_CONFIGURED" });
    expect(s.rpc).not.toHaveBeenCalled();
    expect(s.callTool).not.toHaveBeenCalled();
  });

  it("releases the key when storage is refused (revocation between read and store) and stores nothing", async () => {
    const s = setup({ storeError: "55000", revokeBetween: true });
    expect(await captureGoogleReport(s.client, project, query, key, actor, keyring, { env, mcpFactory: s.mcpFactory, store: s.store, receipt: s.receipt }))
      .toEqual({ ok: false, error: "SOURCE_CHANGED" });
    expect(s.captures.get(key)?.state).toBe("RELEASED");
    expect(s.stored).toHaveLength(0);
    expect(s.receipt).not.toHaveBeenCalled();
  });

  it("does not store a provider error and releases the key", async () => {
    const s = setup();
    s.callTool.mockResolvedValueOnce({ structuredContent: { ok: false }, isError: true } as never);
    const r = await captureGoogleReport(s.client, project, query, key, actor, keyring, { env, mcpFactory: s.mcpFactory, store: s.store, receipt: s.receipt });
    expect(r.ok).toBe(false);
    expect(s.captures.get(key)?.state).toBe("RELEASED");
    expect(s.stored).toHaveLength(0);
  });

  it("refuses a concurrent run of the same key without calling the provider", async () => {
    const s = setup();
    s.captures.set(key, { state: "RESERVED" });
    expect(await captureGoogleReport(s.client, project, query, key, actor, keyring, { env, mcpFactory: s.mcpFactory, store: s.store, receipt: s.receipt }))
      .toEqual({ ok: false, error: "IN_PROGRESS" });
    expect(s.callTool).not.toHaveBeenCalled();
  });

  it("a provider timeout stores nothing and releases the key; retrying the same key reads again and stores once", async () => {
    const s = setup();
    s.callTool.mockRejectedValueOnce(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
    const first = await captureGoogleReport(s.client, project, query, key, actor, keyring, { env, mcpFactory: s.mcpFactory, store: s.store, receipt: s.receipt });
    expect(first).toMatchObject({ ok: false });
    expect(s.captures.get(key)?.state).toBe("RELEASED");
    expect(s.stored).toHaveLength(0);
    // Nothing was stored, so the same key may read again: one more provider call, one result.
    const retry = await captureGoogleReport(s.client, project, query, key, actor, keyring, { env, mcpFactory: s.mcpFactory, store: s.store, receipt: s.receipt });
    expect(retry).toMatchObject({ ok: true, replayed: false });
    expect(s.callTool).toHaveBeenCalledTimes(2);
    expect(s.stored).toHaveLength(1);
  });

  it("if the answer of a committed store is lost, retrying the same key returns the stored result and signs its audit without reading again", async () => {
    const s = setup({ lostStoreResponse: true });
    expect(await captureGoogleReport(s.client, project, query, key, actor, keyring, { env, mcpFactory: s.mcpFactory, store: s.store, receipt: s.receipt }))
      .toEqual({ ok: false, error: "STORE_FAILED" });
    // The release that follows cannot undo a committed capture: the key stays STORED.
    expect(s.captures.get(key)?.state).toBe("STORED");
    const resultId = s.captures.get(key)?.resultId as string;
    // The audit receipt committed with the result is still pending: nothing signed it yet.
    expect(s.receipts.get(resultId)).toBe("pending");
    const retry = await captureGoogleReport(s.client, project, query, key, actor, keyring, { env, mcpFactory: s.mcpFactory, store: s.store, receipt: s.receipt });
    // S1: the retry replays the stored result AND completes its audit, without a provider call.
    expect(retry).toEqual({ ok: true, resultId, replayed: true, audited: true });
    expect(s.receipts.get(resultId)).toBe("completed");
    expect(s.callTool).toHaveBeenCalledTimes(1);
    expect(s.stored).toHaveLength(1);
  });
});
