import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { providers } from "@/lib/core";
import { loadKeyring, type Keyring } from "@/lib/provenance/keyring";
import type { ProjectRef } from "@/lib/provenance/audit";
import { appendAudit, eraseProviderResults, exportProject, listProviderResults, loadProviderResult, readAuditTrail, storeProviderResult } from "@/lib/provenance/repository";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

// CORE-9.2 end to end against the LOCAL Supabase stack, as signed-in fictitious users with the
// publishable key: what passes or fails is decided by RLS and the migration's triggers. The
// HMAC keys are random per run and live only in this process.
type Client = SupabaseClient<Database>;
const orgA = `agencia-a-${RUN}`, orgB = `agencia-b-${RUN}`;
const users: string[] = [];
let a: Client, b: Client, c: Client;
let pa: ProjectRef, pa2: ProjectRef, pb: ProjectRef;
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-int:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-int" });
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
  expect((await a.from("organization_members").insert({ organization_id: oa, user_id: users[2], role: "member" })).error).toBeNull();
  expect((await a.from("project_members").insert({ project_id: a1, organization_id: oa, user_id: users[2], role: "analyst" })).error).toBeNull();
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

  it("a row forged through the Data API with a self-computed hash is detected", async () => {
    const forger = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-int:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-int" });
    if (!forger.ok) throw new Error(forger.error);
    expect((await appendAudit(c, pa, { actor: { role: "analyst", id: users[2] }, action: "forged" }, forger.keyring)).ok).toBe(true);
    const trail = await readAuditTrail(a, pa, keyring);
    if (!trail.ok) throw new Error(trail.error);
    expect(trail.verification).toEqual({ valid: false, brokenAt: 6, reason: "SIGNATURE" });
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
    expect(ex.export.audit.verification).toMatchObject({ valid: false, reason: "SIGNATURE" }); // the forged row stays visible
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
});
