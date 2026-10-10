import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { captureGoogleReport } from "@/lib/openseo/google/capture";
import { loadKeyring } from "@/lib/provenance/keyring";
import { openProviderResult } from "@/lib/provenance/results";

// Manual Google capture, in memory only: the RPCs are a small state machine with the same rules as
// migration 20261012120000, the MCP is simulated and nothing reaches a network or a database.
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

function setup({ storeError, revokeBetween }: { storeError?: string; revokeBetween?: boolean } = {}) {
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
    if (revokeBetween) active = false;
    if (storeError) return { data: null, error: { code: storeError } };
    const row = p.row as Record<string, unknown>;
    stored.push(row);
    const resultId = "66666666-6666-4666-8666-66666666666" + stored.length;
    captures.set(String(p.key), { state: "STORED", resultId });
    return { data: { state: "STORED", resultId }, error: null };
  });
  const callTool = vi.fn(async () => reply);
  const mcpFactory = vi.fn(() => ({ callTool, close: vi.fn(async () => {}) }));
  const audit = vi.fn(async () => ({ ok: true as const, row: {} as never }));
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc, callTool, mcpFactory, audit, captures, stored };
}

describe("manual Google capture (simulated provider and RPCs)", () => {
  it("stores one signed result whose source names the reserved connection and binding, then replays without a new read", async () => {
    const s = setup();
    const first = await captureGoogleReport(s.client, project, query, key, actor, keyring, { env, mcpFactory: s.mcpFactory, audit: s.audit });
    expect(first).toMatchObject({ ok: true, replayed: false, audited: true });
    expect(s.callTool).toHaveBeenCalledTimes(1);
    const row = s.stored[0] as { signed_payload: { provenance: { sourceContext: Record<string, string> } } };
    expect(row.signed_payload.provenance.sourceContext).toMatchObject({ connectionId, propertyBindingId: bindingId, providerProjectId: "client-project" });
    expect(openProviderResult({ ...(s.stored[0] as Record<string, unknown>), id: "x" } as never, project, keyring)).toMatchObject({ verified: true });
    expect(s.audit).toHaveBeenCalledWith(s.client, project, expect.objectContaining({ action: "google.capture", outcome: "allowed" }), keyring);

    const again = await captureGoogleReport(s.client, project, query, key, actor, keyring, { env, mcpFactory: s.mcpFactory, audit: s.audit });
    expect(again).toEqual({ ok: true, resultId: (first as { resultId: string }).resultId, replayed: true, audited: false });
    expect(s.callTool).toHaveBeenCalledTimes(1);
    expect(s.stored).toHaveLength(1);
  });

  it("checks flag, query, key and keyring before reserving anything", async () => {
    const s = setup();
    const run = (over: { env?: Record<string, string>; k?: string; q?: typeof query; ring?: typeof keyring | null }) =>
      captureGoogleReport(s.client, project, over.q ?? query, over.k ?? key, actor, over.ring === undefined ? keyring : over.ring, { env: over.env ?? env, mcpFactory: s.mcpFactory, audit: s.audit });
    expect(await run({ env: { ...env, OPENSEO_GOOGLE_READS_ENABLED: "false" } })).toEqual({ ok: false, error: "DISABLED" });
    expect(await run({ k: "short" })).toEqual({ ok: false, error: "INVALID" });
    expect(await run({ q: { ...query, rowLimit: 1000 } })).toEqual({ ok: false, error: "INVALID" });
    expect(await run({ ring: null })).toEqual({ ok: false, error: "SIGNING_NOT_CONFIGURED" });
    expect(s.rpc).not.toHaveBeenCalled();
    expect(s.callTool).not.toHaveBeenCalled();
  });

  it("releases the key when storage is refused (revocation between read and store) and stores nothing", async () => {
    const s = setup({ storeError: "55000", revokeBetween: true });
    expect(await captureGoogleReport(s.client, project, query, key, actor, keyring, { env, mcpFactory: s.mcpFactory, audit: s.audit }))
      .toEqual({ ok: false, error: "SOURCE_CHANGED" });
    expect(s.captures.get(key)?.state).toBe("RELEASED");
    expect(s.stored).toHaveLength(0);
    expect(s.audit).not.toHaveBeenCalled();
  });

  it("does not store a provider error and releases the key", async () => {
    const s = setup();
    s.callTool.mockResolvedValueOnce({ structuredContent: { ok: false }, isError: true } as never);
    const r = await captureGoogleReport(s.client, project, query, key, actor, keyring, { env, mcpFactory: s.mcpFactory, audit: s.audit });
    expect(r.ok).toBe(false);
    expect(s.captures.get(key)?.state).toBe("RELEASED");
    expect(s.stored).toHaveLength(0);
  });

  it("refuses a concurrent run of the same key without calling the provider", async () => {
    const s = setup();
    s.captures.set(key, { state: "RESERVED" });
    expect(await captureGoogleReport(s.client, project, query, key, actor, keyring, { env, mcpFactory: s.mcpFactory, audit: s.audit }))
      .toEqual({ ok: false, error: "IN_PROGRESS" });
    expect(s.callTool).not.toHaveBeenCalled();
  });
});
