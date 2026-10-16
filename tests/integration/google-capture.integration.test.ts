import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { consentedMembership } from "../fixtures/consented-membership";
import { loadProjectRef } from "@/lib/imports/repository";
import { connectProject } from "@/lib/openseo/connections";
import { captureGoogleReport, listGoogleCaptures } from "@/lib/openseo/google/capture";
import { writerPool } from "@/lib/provenance/writer";
import { connectGoogleProperty, revokeGoogleProperty } from "@/lib/openseo/google/properties";
import { resolveGoogleSource } from "@/lib/openseo/google/properties";
import type { ProjectRef } from "@/lib/provenance/audit";
import { loadKeyring } from "@/lib/provenance/keyring";
import { exportProject, loadProviderResult, readAuditTrail } from "@/lib/provenance/repository";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

// Manual Google capture end to end against the LOCAL stack only: the owner connects OpenSEO,
// binds a GSC property, captures once through a simulated MCP and the signed result is stored,
// verified, listed, exported and audited. A retry replays without a second provider call; a
// revoked binding stops new captures; an analyst cannot capture. No network, no real Google.
type Client = SupabaseClient<Database>;
const org = `gcap-${RUN}`;
const users: string[] = [];
let owner: Client, analyst: Client, project: ProjectRef;
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-int:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-int" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;
const env = { OPENSEO_GOOGLE_READS_ENABLED: "true", OPENSEO_ENDPOINT: "https://openseo.example", OPENSEO_API_KEY: "oseo_123456789" };
const query = { provider: "search-console" as const, startDate: "2026-09-01", endDate: "2026-09-28", dimensions: ["page"], rowLimit: 10 };
const site = `sc-domain:gcap-${RUN}.example`;
const reply = { structuredContent: { ok: true, siteUrl: site, startDate: "2026-09-01", endDate: "2026-09-28", dimensions: ["page"], rowCount: 1,
  rows: [{ keys: [`https://gcap-${RUN}.example/`], clicks: 4, impressions: 40, ctr: 0.1, position: 2.5 }], hasMore: false, nextStartRow: 1 } };
const mcp = () => { const callTool = vi.fn(async () => reply); return { callTool, factory: vi.fn(() => ({ callTool, close: vi.fn(async () => {}) })) }; };

type StoredCapture = { idempotency_key: string; state: string; result_id: string };
async function captureLedger() {
  const [inventory, recovery] = await Promise.all([
    owner.rpc("project_data_inventory", { p_project_id: project.projectId }),
    owner.rpc("google_recovery_state", { p_project_id: project.projectId }),
  ]);
  expect(inventory.error).toBeNull();
  expect(recovery.error).toBeNull();
  return {
    count: (inventory.data as { googleCaptures: number }).googleCaptures,
    stored: (recovery.data as { captures: StoredCapture[] }).captures,
  };
}

beforeAll(async () => {
  users.push(await createConfirmedUser("gcap-owner"), await createConfirmedUser("gcap-analyst"));
  [owner, analyst] = await Promise.all(["gcap-owner", "gcap-analyst"].map(signedIn));
  expect((await owner.from("organizations").insert({ slug: org, name: "Google capture" })).error).toBeNull();
  const orgId = (await owner.from("organizations").select("id").eq("slug", org).single()).data!.id;
  expect((await owner.from("projects").insert({ organization_id: orgId, slug: "site", name: "Site", domain: `gcap-${RUN}.example` })).error).toBeNull();
  const ref = await loadProjectRef(owner, { tenantId: org, projectId: "site" });
  if (!ref) throw new Error("project not visible");
  project = ref;
  await consentedMembership(owner, analyst, project.projectId, "analyst");
  expect(await connectProject(owner, project.projectId, { openseoProjectId: `gcap-${RUN}`, allowedHosts: [`gcap-${RUN}.example`], consent: true })).toMatchObject({ ok: true });
  expect(await connectGoogleProperty(owner, project.projectId, "search-console", { externalPropertyId: site, consent: true })).toMatchObject({ ok: true });
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([org]);
  await deleteUsers(users);
});

describe("manual Google capture on the local stack (simulated MCP)", () => {
  const key = randomUUID();
  let resultId = "";

  it("stores one signed, verifiable result with its source, lists it, exports it and audits it", async () => {
    const m = mcp();
    const r = await captureGoogleReport(owner, project, query, key, { role: "owner", id: users[0] }, keyring, { env, mcpFactory: m.factory });
    expect(r).toMatchObject({ ok: true, replayed: false, audited: true });
    resultId = (r as { resultId: string }).resultId;
    expect(m.callTool).toHaveBeenCalledTimes(1);
    const stored = await loadProviderResult(owner, project, resultId, keyring);
    expect(stored).toMatchObject({ ok: true, verification: { verified: true }, row: { provider: "search-console", status: "OK" } });
    const payload = (stored as { row: { signed_payload: { provenance: { sourceContext: Record<string, string> } } } }).row.signed_payload;
    expect(payload.provenance.sourceContext).toMatchObject({ providerProjectId: `gcap-${RUN}` });
    expect(await listGoogleCaptures(analyst, project)).toMatchObject({ ok: true, rows: [{ id: resultId, provider: "search-console" }] });
    const exported = await exportProject(owner, project, keyring, "2026-10-10T12:00:00.000Z");
    expect(exported.ok && exported.export.results.some((x) => x.row.id === resultId && x.verification.verified)).toBe(true);
    const audit = await readAuditTrail(owner, project, keyring);
    expect(audit.ok && audit.rows.some((e) => e.action === "google.capture" && e.target === resultId)).toBe(true);
  });

  it("a retry with the same key returns the same result without calling the provider", async () => {
    const m = mcp();
    expect(await captureGoogleReport(owner, project, query, key, { role: "owner", id: users[0] }, keyring, { env, mcpFactory: m.factory }))
      .toEqual({ ok: true, resultId, replayed: true, audited: true });
    expect(m.callTool).not.toHaveBeenCalled();
    expect((await owner.from("provider_results").select("id").eq("project_id", project.projectId)).data).toHaveLength(1);
    // S1: the replay completed nothing new; exactly one signed event names the result.
    const audit = await readAuditTrail(owner, project, keyring);
    expect(audit.ok && audit.rows.filter((e) => e.action === "google.capture" && e.target === resultId)).toHaveLength(1);
  });

  it("a signing failure after the commit leaves a durable receipt; the retry signs it once without a provider call", async () => {
    const lostKey = randomUUID();
    const m = mcp();
    // The result and its receipt commit; then the signer is unavailable (crash, timeout, keyring).
    const crashed = await captureGoogleReport(owner, project, query, lostKey, { role: "owner", id: users[0] }, keyring,
      { env, mcpFactory: m.factory, receipt: async () => ({ ok: false, error: "WRITER_TIMEOUT" }) });
    expect(crashed).toMatchObject({ ok: true, replayed: false, audited: false });
    const lostResult = (crashed as { resultId: string }).resultId;
    const pool = writerPool();
    if (!pool) throw new Error("local writer required");
    const pending = await pool.query("select state, details from private.audit_outbox where project_id = $1 and action = 'google.capture' and target_text = $2",
      [project.projectId, lostResult]);
    expect(pending.rows).toEqual([{ state: "pending", details: { provider: "search-console", status: "OK" } }]);
    let trail = await readAuditTrail(owner, project, keyring);
    expect(trail.ok && trail.rows.filter((e) => e.target === lostResult)).toHaveLength(0);

    const retry = mcp();
    expect(await captureGoogleReport(owner, project, query, lostKey, { role: "owner", id: users[0] }, keyring, { env, mcpFactory: retry.factory }))
      .toEqual({ ok: true, resultId: lostResult, replayed: true, audited: true });
    expect(retry.callTool).not.toHaveBeenCalled();
    expect(m.callTool).toHaveBeenCalledTimes(1);
    trail = await readAuditTrail(owner, project, keyring);
    if (!trail.ok) throw new Error(trail.error);
    expect(trail.verification.valid).toBe(true);
    const events = trail.rows.filter((e) => e.action === "google.capture" && e.target === lostResult);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor_role: "owner", actor_id: users[0], details: { provider: "search-console", status: "OK" } });
    // A third attempt is still a pure replay: no new event, no provider call.
    expect(await captureGoogleReport(owner, project, query, lostKey, { role: "owner", id: users[0] }, keyring, { env, mcpFactory: retry.factory }))
      .toMatchObject({ replayed: true, audited: true });
    trail = await readAuditTrail(owner, project, keyring);
    expect(trail.ok && trail.rows.filter((e) => e.target === lostResult)).toHaveLength(1);
  });

  it("rejects a forged HMAC submitted through the owner JWT RPC", async () => {
    const source = await resolveGoogleSource(owner, project.projectId, "search-console");
    if (!source.ok) throw new Error("active Google source required");
    const forgedKey = randomUUID();
    const before = (await owner.from("provider_results").select("id").eq("project_id", project.projectId)).data!.length;
    const begun = await owner.rpc("google_capture", { p_project_id: project.projectId, p_command: "begin",
      p_payload: { key: forgedKey, provider: "search-console", connectionId: source.source.connectionId,
        propertyBindingId: source.source.propertyBindingId } });
    expect(begun.error).toBeNull();
    const original = await owner.from("provider_results").select("*").eq("id", resultId).single();
    expect(original.error).toBeNull();
    const forged = { ...original.data!, signature: "f".repeat(64) };
    const attempted = await owner.rpc("google_capture", { p_project_id: project.projectId,
      p_command: "store", p_payload: { key: forgedKey, row: forged } });
    expect(attempted.error?.code).toBe("42501");
    expect((await owner.from("provider_results").select("id").eq("project_id", project.projectId)).data).toHaveLength(before);
    // A JWT caller cannot release an uncertain reservation to repeat a paid read.
    expect((await owner.rpc("google_capture", { p_project_id: project.projectId,
      p_command: "release", p_payload: { key: forgedKey } })).error?.code).toBe("55P03");
  });

  it("an analyst cannot capture, even with a fresh key", async () => {
    const m = mcp();
    expect(await captureGoogleReport(analyst, project, query, randomUUID(), { role: "analyst", id: users[1] }, keyring, { env, mcpFactory: m.factory }))
      .toEqual({ ok: false, error: "FORBIDDEN" });
    expect(m.callTool).not.toHaveBeenCalled();
  });

  it("two sessions retrying the same key at once: one provider call, one stored result", async () => {
    const second = await signedIn("gcap-owner"); // another HTTP session of the same owner (double click, two tabs)
    const sameKey = randomUUID();
    const before = (await owner.from("provider_results").select("id").eq("project_id", project.projectId)).data!.length;
    const ledgerBefore = await captureLedger();
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    const slow = mcp();
    slow.callTool.mockImplementationOnce(async () => { await gate; return reply; });
    const first = captureGoogleReport(owner, project, query, sameKey, { role: "owner", id: users[0] }, keyring, { env, mcpFactory: slow.factory });
    try {
      await vi.waitFor(() => expect(slow.callTool).toHaveBeenCalledTimes(1)); // reservation exists; provider is waiting
      const racing = mcp();
      expect(await captureGoogleReport(second, project, query, sameKey, { role: "owner", id: users[0] }, keyring, { env, mcpFactory: racing.factory }))
        .toEqual({ ok: false, error: "IN_PROGRESS" });
      expect(racing.factory).not.toHaveBeenCalled();
      expect(racing.callTool).not.toHaveBeenCalled();
    } finally {
      // Always finish the pending request before fixture cleanup, even when an assertion fails.
      open();
      await first;
    }
    const done = await first;
    expect(done).toMatchObject({ ok: true, replayed: false });
    const replay = mcp();
    expect(await captureGoogleReport(second, project, query, sameKey, { role: "owner", id: users[0] }, keyring, { env, mcpFactory: replay.factory }))
      .toEqual({ ok: true, resultId: (done as { resultId: string }).resultId, replayed: true, audited: true });
    expect(replay.callTool).not.toHaveBeenCalled();
    expect(slow.callTool).toHaveBeenCalledTimes(1);
    const ledgerAfter = await captureLedger();
    expect(ledgerAfter.count).toBe(ledgerBefore.count + 1);
    expect(ledgerAfter.stored.filter((row) => row.idempotency_key === sameKey))
      .toEqual([expect.objectContaining({ state: "STORED", result_id: (done as { resultId: string }).resultId })]);
    expect((await owner.from("provider_results").select("id").eq("project_id", project.projectId)).data).toHaveLength(before + 1);
  });

  it("a provider failure retains the key and a retry cannot repeat an uncertain paid read", async () => {
    const retryKey = randomUUID();
    const before = (await owner.from("provider_results").select("id").eq("project_id", project.projectId)).data!.length;
    const ledgerBefore = await captureLedger();
    const failing = mcp();
    failing.callTool.mockImplementationOnce(async () => { throw new Error("simulated provider outage"); });
    const failed = await captureGoogleReport(owner, project, query, retryKey, { role: "owner", id: users[0] }, keyring, { env, mcpFactory: failing.factory });
    expect(failed).toEqual({ ok: false, error: "PROVIDER_STATUS", status: "ERROR" });
    expect(failing.callTool).toHaveBeenCalledTimes(1);
    const ledgerFailed = await captureLedger();
    expect(ledgerFailed.count).toBe(ledgerBefore.count + 1);
    expect(ledgerFailed.stored.filter((row) => row.idempotency_key === retryKey)).toEqual([]);
    expect((await owner.from("provider_results").select("id").eq("project_id", project.projectId)).data).toHaveLength(before);
    const retry = mcp();
    const recovered = await captureGoogleReport(owner, project, query, retryKey, { role: "owner", id: users[0] }, keyring, { env, mcpFactory: retry.factory });
    expect(recovered).toEqual({ ok: false, error: "IN_PROGRESS" });
    expect(retry.callTool).not.toHaveBeenCalled();
    const again = mcp();
    expect(await captureGoogleReport(owner, project, query, retryKey, { role: "owner", id: users[0] }, keyring, { env, mcpFactory: again.factory }))
      .toEqual({ ok: false, error: "IN_PROGRESS" });
    const ledgerAfter = await captureLedger();
    expect(ledgerAfter.count).toBe(ledgerBefore.count + 1);
    expect(ledgerAfter.stored.filter((row) => row.idempotency_key === retryKey)).toEqual([]);
    expect(again.callTool).not.toHaveBeenCalled();
    expect((await owner.from("provider_results").select("id").eq("project_id", project.projectId)).data).toHaveLength(before);
  });

  it("after revoking the binding no capture starts; the stored one stays verifiable", async () => {
    expect(await revokeGoogleProperty(owner, project.projectId, "search-console")).toMatchObject({ ok: true });
    const m = mcp();
    expect(await captureGoogleReport(owner, project, query, randomUUID(), { role: "owner", id: users[0] }, keyring, { env, mcpFactory: m.factory }))
      .toEqual({ ok: false, error: "NOT_CONNECTED" });
    expect(m.callTool).not.toHaveBeenCalled();
    expect(await loadProviderResult(owner, project, resultId, keyring)).toMatchObject({ ok: true, verification: { verified: true } });
  });
});
