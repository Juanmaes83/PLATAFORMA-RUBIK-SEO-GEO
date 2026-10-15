import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database, Json } from "@/lib/supabase/database.types";
import { consentedMembership } from "../fixtures/consented-membership";
import { providers } from "@/lib/core";
import { loadKeyring, type Keyring } from "@/lib/provenance/keyring";
import { buildAuditRow, type ProjectRef } from "@/lib/provenance/audit";
import { appendAudit, eraseProviderResults, exportProject, listProviderResults, loadProviderResult, readAuditTrail, storeProviderResult } from "@/lib/provenance/repository";
import { processAuditOutbox } from "@/lib/provenance/outbox";
import { removePerson } from "@/lib/project-people";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

// CORE-9.2 end to end against the LOCAL Supabase stack, as signed-in fictitious users with the
// publishable key: what passes or fails is decided by RLS and the migration's triggers. The
// HMAC keys are random per run and live only in this process.
type Client = SupabaseClient<Database>;
const orgA = `agencia-a-${RUN}`, orgB = `agencia-b-${RUN}`;
const users: string[] = [];
let a: Client, b: Client, c: Client;
let pa: ProjectRef, pa2: ProjectRef, pb: ProjectRef;
const localSigningKey = randomBytes(32).toString("base64");
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-int:${localSigningKey}`, PROVENANCE_ACTIVE_KEY_ID: "k-int" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring: Keyring = loaded.keyring;
const at = (m: number) => new Date(Date.UTC(2026, 9, 7, 10, m)).toISOString();

async function liveResult() {
  return providers.runProviderRequest({
    provider: "dataforseo", operation: "backlinks", input: { target: "ejemplo.test" },
    transport: { kind: "live", request: async () => ({ rows: [{ url_from: "https://a.ejemplo.test/1", url_to: "https://ejemplo.test/" }] }) },
    clock: () => new Date("2026-10-07T10:00:00Z"), budget: { maxUnits: 1, maxRequests: 1 }, confirmCost: true,
  });
}

beforeAll(async () => {
  // a: owner of orgA/a1 · b: owner of orgB/b1 · c: analyst in a1.
  users.push(await createConfirmedUser("pa"), await createConfirmedUser("pb"), await createConfirmedUser("pc"));
  [a, b, c] = await Promise.all(["pa", "pb", "pc"].map(signedIn));
  expect((await a.from("organizations").insert({ slug: orgA, name: "Agencia A" })).error).toBeNull();
  expect((await b.from("organizations").insert({ slug: orgB, name: "Agencia B" })).error).toBeNull();
  const oa = (await a.from("organizations").select("id").eq("slug", orgA).single()).data!.id;
  const ob = (await b.from("organizations").select("id").eq("slug", orgB).single()).data!.id;
  expect((await a.from("projects").insert({ organization_id: oa, slug: "proyecto-a1", name: "A1" })).error).toBeNull();
  expect((await b.from("projects").insert({ organization_id: ob, slug: "proyecto-b1", name: "B1" })).error).toBeNull();
  const a1 = (await a.from("projects").select("id").eq("organization_id", oa).single()).data!.id;
  const b1 = (await b.from("projects").select("id").eq("organization_id", ob).single()).data!.id;
  await consentedMembership(a, c, a1, "analyst");
  pa = { projectId: a1, organizationId: oa, scope: { tenantId: orgA, projectId: "proyecto-a1" } };
  // Membership is granted after INSERT; read in a second request, as for the first project.
  expect((await a.from("projects").insert({ organization_id: oa, slug: "proyecto-a2", name: "A2" })).error).toBeNull();
  const second = await a.from("projects").select("id").eq("organization_id", oa).eq("slug", "proyecto-a2").single();
  expect(second.error).toBeNull();
  pa2 = { projectId: second.data!.id, organizationId: oa, scope: { tenantId: orgA, projectId: "proyecto-a2" } };
  pb = { projectId: b1, organizationId: ob, scope: { tenantId: orgB, projectId: "proyecto-b1" } };
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([orgA, orgB]);
  await deleteUsers(users);
});

describe("CORE-9.2 audit chain through the Data API", () => {
  it("members append as themselves; the chain verifies with SHA-256 and HMAC", async () => {
    expect((await appendAudit(a, pa, { actor: { role: "owner", id: users[0] }, action: "project.open" }, keyring)).ok).toBe(true);
    expect((await appendAudit(c, pa, { actor: { role: "analyst", id: users[2] }, action: "result.review", details: { rows: 1 } }, keyring)).ok).toBe(true);
    const trail = await readAuditTrail(a, pa, keyring);
    if (!trail.ok) throw new Error(trail.error);
    expect(trail.rows.map((r) => [r.seq, r.actor_role, r.actor_id])).toEqual([[1, "owner", users[0]], [2, "analyst", users[2]]]);
    expect(trail.verification).toEqual({ valid: true, length: 2 });
  });

  it("concurrent appends are serialised without gaps or forks", async () => {
    const results = await Promise.all([2, 3, 4, 5].map((m) => appendAudit(a, pa, { actor: { role: "owner", id: users[0] }, action: `parallel-${m}` }, keyring, { attempts: 6 })));
    expect(results.every((r) => r.ok)).toBe(true);
    const trail = await readAuditTrail(a, pa, keyring);
    if (!trail.ok) throw new Error(trail.error);
    expect(trail.rows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(trail.verification.valid).toBe(true);
  });

  it("an analyst cannot append as owner; another tenant can neither read nor append", async () => {
    expect(await appendAudit(c, pa, { actor: { role: "owner", id: users[2] }, action: "spoof" }, keyring)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    const foreign = await readAuditTrail(b, pa, keyring);
    expect(foreign.ok && foreign.rows.length).toBe(0);
    expect(await appendAudit(b, pa, { actor: { role: "owner", id: users[1] }, action: "intrude" }, keyring)).toEqual({ ok: false, error: "NOT_ALLOWED" });
  });

  it("a row forged through the Data API is denied before it can poison the chain", async () => {
    const forger = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-int:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-int" });
    if (!forger.ok) throw new Error(forger.error);
    const before = await readAuditTrail(a, pa, keyring);
    if (!before.ok) throw new Error(before.error);
    const built = buildAuditRow(before.rows.at(-1)!, { at: new Date().toISOString(), actor: { role: "analyst", id: users[2] }, action: "forged" }, pa, forger.keyring);
    if (!built.ok) throw new Error(built.error);
    const direct = await c.from("audit_events").insert({ ...built.row, actor_id: users[2], details: built.row.details as NonNullable<Json> });
    expect(direct.error?.code).toBe("42501");
    const upsert = await c.from("audit_events").upsert({ ...built.row, actor_id: users[2], details: built.row.details as NonNullable<Json> });
    expect(upsert.error?.code).toBe("42501");
    const after = await readAuditTrail(a, pa, keyring);
    if (!after.ok) throw new Error(after.error);
    expect(after.verification).toEqual({ valid: true, length: before.rows.length });
  });

  it("history cannot be rewritten or deleted by members", async () => {
    const upd = await a.from("audit_events").update({ action: "rewritten" }).eq("project_id", pa.projectId);
    expect(upd.error?.code).toBe("42501");
    const del = await a.from("audit_events").delete().eq("project_id", pa.projectId);
    expect(del.error?.code).toBe("42501");
  });
});

describe("CORE-9.2 signed provider results through the Data API", () => {
  let id = "";

  it("an analyst stores a signed result; any member reopens and verifies it", async () => {
    const stored = await storeProviderResult(c, pa, await liveResult(), keyring);
    if (!stored.ok) throw new Error(stored.error);
    id = stored.id;
    const loadedResult = await loadProviderResult(a, pa, id, keyring);
    if (!loadedResult.ok) throw new Error(loadedResult.error);
    expect([loadedResult.row.data_hash_alg, loadedResult.verification.trust, loadedResult.verification.verified]).toEqual(["sha256", "SIGNED_PROVENANCE", true]);
  });

  it("keeps reports separate when the same owner belongs to two projects", async () => {
    const stored = await storeProviderResult(a, pa2, await liveResult(), keyring);
    if (!stored.ok) throw new Error(stored.error);
    expect(await loadProviderResult(a, pa, stored.id, keyring)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await loadProviderResult(a, pa2, id, keyring)).toEqual({ ok: false, error: "NOT_FOUND" });
    const first = await listProviderResults(a, pa);
    const second = await listProviderResults(a, pa2);
    expect(first.ok && first.rows.map((r) => r.id)).toEqual([id]);
    expect(second.ok && second.rows.map((r) => r.id)).toEqual([stored.id]);
    expect(first.ok && Object.keys(first.rows[0]).sort()).toEqual(["captured_at", "created_at", "id", "operation", "provider", "status"]);
    expect(await listProviderResults(b, pa)).toEqual({ ok: true, rows: [] });
  });

  it("rejects a genuine signature copied into another project through the Data API", async () => {
    const original = await loadProviderResult(a, pa, id, keyring);
    if (!original.ok) throw new Error(original.error);
    const row = original.row;
    const copied = {
      project_id: pa2.projectId, organization_id: pa2.organizationId,
      provider: row.provider, operation: row.operation, status: row.status, captured_at: row.captured_at,
      signed_payload: row.signed_payload as NonNullable<Json>, data: row.data as Json,
      data_hash_alg: row.data_hash_alg, data_hash: row.data_hash, key_id: row.key_id, signature: row.signature,
    };
    expect((await a.from("provider_results").insert(copied)).error?.code).toBe("42501");
    expect((await a.from("provider_results").upsert(copied)).error?.code).toBe("42501");
    const after = await listProviderResults(a, pa2);
    expect(after.ok && after.rows).toHaveLength(1);
  });

  it("another tenant cannot read it; nobody can update it", async () => {
    expect(await loadProviderResult(b, pa, id, keyring)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect((await a.from("provider_results").update({ status: "OK" }).eq("id", id)).error?.code).toBe("42501");
    expect(await storeProviderResult(b, pa, await liveResult(), keyring)).toEqual({ ok: false, error: "NOT_ALLOWED" });
  });

  it("export contains the trail and results with their verification; only the owner erases", async () => {
    const ex = await exportProject(a, pa, keyring, at(20));
    if (!ex.ok) throw new Error(ex.error);
    expect(ex.export.format).toBe("rubik-project-export-v1");
    expect(ex.export.results.map((r) => r.verification.trust)).toEqual(["SIGNED_PROVENANCE"]);
    expect(ex.export.audit.verification).toEqual({ valid: true, length: 6 });
    expect(JSON.stringify(ex.export)).not.toMatch(/PROVENANCE_SIGNING_KEYS|k-int:/);

    const byAnalyst = await c.from("provider_results").delete().eq("project_id", pa.projectId).select("id");
    expect(byAnalyst.data).toEqual([]);
    const erased = await eraseProviderResults(a, pa, { role: "owner", id: users[0] }, keyring);
    expect(erased).toEqual({ ok: true, erased: 1 });
    const after = await exportProject(a, pa, keyring, at(22));
    if (!after.ok) throw new Error(after.error);
    expect(after.export.results).toEqual([]);
    expect(after.export.audit.rows.at(-1)).toMatchObject({ action: "provider-results.erase", details: { erased: 1 } });
  });

  it("an empty project exports honestly", async () => {
    const ex = await exportProject(b, pb, keyring, at(30));
    if (!ex.ok) throw new Error(ex.error);
    expect([ex.export.audit.rows.length, ex.export.audit.verification, ex.export.results.length]).toEqual([0, { valid: true, length: 0 }, 0]);
  });

  it("keeps an erasure receipt when signing fails, then completes it once", async () => {
    expect((await appendAudit(b, pb, { actor: { role: "owner", id: users[1] }, action: "erase.seed" }, keyring)).ok).toBe(true);
    const stored = await storeProviderResult(b, pb, await liveResult(), keyring);
    if (!stored.ok) throw new Error(stored.error);
    const wrong = loadKeyring({ PROVENANCE_SIGNING_KEYS: `wrong:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "wrong" });
    if (!wrong.ok) throw new Error(wrong.error);
    expect(await eraseProviderResults(b, pb, { role: "owner", id: users[1] }, wrong.keyring)).toEqual({ ok: false, error: "AUDIT_PENDING" });
    const remaining = await listProviderResults(b, pb);
    expect(remaining.ok && remaining.rows).toEqual([]);
    const signed = await processAuditOutbox(stored.id, keyring);
    expect(signed.ok).toBe(true);
    expect(await processAuditOutbox(stored.id, keyring)).toEqual(signed);
    const trail = await readAuditTrail(b, pb, keyring);
    if (!trail.ok) throw new Error(trail.error);
    expect(trail.verification.valid).toBe(true);
    expect(trail.rows.filter((row) => row.action === "provider-results.erase" && row.target === stored.id)).toHaveLength(1);
  });

  it("queues a receipt even when an owner deletes a result directly through the Data API", async () => {
    const stored = await storeProviderResult(b, pb, await liveResult(), keyring);
    if (!stored.ok) throw new Error(stored.error);
    const direct = await b.from("provider_results").delete().eq("id", stored.id).select("id");
    expect(direct.error).toBeNull();
    expect(direct.data).toEqual([{ id: stored.id }]);
    expect((await processAuditOutbox(stored.id, keyring)).ok).toBe(true);
    const trail = await readAuditTrail(b, pb, keyring);
    if (!trail.ok) throw new Error(trail.error);
    expect(trail.verification.valid).toBe(true);
    expect(trail.rows.filter((row) => row.action === "provider-results.erase" && row.target === stored.id)).toHaveLength(1);
  });

  it("stores a Core result once per operation id and refuses reuse in another project", async () => {
    const operationId = randomUUID();
    const result = await liveResult();
    const first = await storeProviderResult(a, pa2, result, keyring, { operationId });
    if (!first.ok) throw new Error(first.error);
    expect(await storeProviderResult(a, pa2, result, keyring, { operationId })).toEqual(first);
    expect(await storeProviderResult(a, pa, result, keyring, { operationId })).toEqual({ ok: false, error: "IDEMPOTENCY_CONFLICT" });
    const loaded = await loadProviderResult(a, pa2, operationId, keyring);
    expect(loaded.ok && loaded.verification.verified).toBe(true);
  });
});

describe("S1 durable membership withdrawal", () => {
  it("revokes immediately, retains a receipt after signing failure, then signs exactly once", async () => {
    const removed = await removePerson(a, pa.projectId, users[2]);
    if (!removed.ok) throw new Error(removed.error);
    expect(removed.auditReceiptId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await c.from("audit_events").select("seq").eq("project_id", pa.projectId)).data).toEqual([]);
    expect(await appendAudit(c, pa, { actor: { role: "analyst", id: users[2] }, action: "revoked.write" }, keyring)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    const forger = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-other:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-other" });
    if (!forger.ok) throw new Error(forger.error);
    expect(await processAuditOutbox(removed.auditReceiptId!, forger.keyring)).toEqual({ ok: false, error: "CHAIN_INVALID" });
    vi.stubEnv("RUBIK_AUDIT_DRAIN_TOKEN", "fictitious-local-operator-token-32-characters");
    vi.stubEnv("PROVENANCE_SIGNING_KEYS", `k-int:${localSigningKey}`);
    vi.stubEnv("PROVENANCE_ACTIVE_KEY_ID", "k-int");
    const operator = await import("@/app/api/operaciones/auditoria/pendientes/route");
    const endpoint = "http://localhost/api/operaciones/auditoria/pendientes";
    const headers = { authorization: "Bearer fictitious-local-operator-token-32-characters" };
    const before = await operator.GET(new Request(endpoint, { headers }));
    expect(before.status).toBe(200);
    expect((await before.json()).pending).toBeGreaterThanOrEqual(1);
    const drained = await operator.POST(new Request(endpoint, { method: "POST", headers }));
    expect(drained.status).toBe(200);
    expect((await drained.json()).completed).toBeGreaterThanOrEqual(1);
    const signed = await processAuditOutbox(removed.auditReceiptId!, keyring);
    expect(signed.ok).toBe(true);
    expect(await processAuditOutbox(removed.auditReceiptId!, keyring)).toEqual(signed);
    const trail = await readAuditTrail(a, pa, keyring);
    if (!trail.ok) throw new Error(trail.error);
    expect(trail.verification.valid).toBe(true);
    expect(trail.rows.filter((r) => r.action === "member.withdraw" && r.target === users[2])).toHaveLength(1);
    vi.unstubAllEnvs();
  });
});

describe("S1 idempotency receipts", () => {
  it("returns the original signed event and rejects a reused id for another action", async () => {
    const operationId = randomUUID();
    const input = { actor: { role: "owner" as const, id: users[0] }, action: "idempotent.write" };
    const first = await appendAudit(a, pa2, input, keyring, { operationId });
    if (!first.ok) throw new Error(first.error);
    expect(await appendAudit(a, pa2, input, keyring, { operationId })).toEqual(first);
    expect(await appendAudit(a, pa2, { ...input, action: "changed.write" }, keyring, { operationId })).toEqual({ ok: false, error: "IDEMPOTENCY_CONFLICT" });
    const trail = await readAuditTrail(a, pa2, keyring);
    if (!trail.ok) throw new Error(trail.error);
    expect(trail.verification).toEqual({ valid: true, length: 1 });
  });
});
