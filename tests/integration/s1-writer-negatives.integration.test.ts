import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectRef } from "@/lib/provenance/audit";
import { loadKeyring, type Keyring } from "@/lib/provenance/keyring";
import { readAuditTrail } from "@/lib/provenance/repository";
import { appendTrustedAudit } from "@/lib/provenance/writer";
import { consentedMembership } from "../fixtures/consented-membership";
import { localDatabaseContainer } from "../../scripts/supabase-test-env.mjs";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, env, signedIn } from "./support";

// S1 negatives for the trusted writer on the LOCAL stack: revoked sessions, stale memberships,
// spoofed scope/role/actor, damaged chains, keyring rotation and a lost writer connection.
// Every refusal must leave the chain exactly as it was.
const CONTAINER = localDatabaseContainer();
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const ring = (entries: string, active: string): Keyring => {
  const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: entries, PROVENANCE_ACTIVE_KEY_ID: active });
  if (!loaded.ok) throw new Error(loaded.error);
  return loaded.keyring;
};
const k1 = `k1:${randomBytes(32).toString("base64")}`;
const k2 = `k2:${randomBytes(32).toString("base64")}`;
const keyring = ring(k1, "k1");
const orgA = `neg-a-${RUN}`, orgB = `neg-b-${RUN}`;
const users: string[] = [];
let owner: SupabaseClient<Database>;
let analyst: SupabaseClient<Database>;
let pa: ProjectRef, pb: ProjectRef;
const at = () => new Date().toISOString();
const count = async (p: ProjectRef, k: Keyring = keyring) => {
  const trail = await readAuditTrail(owner, p, k);
  if (!trail.ok) throw new Error(trail.error);
  return trail.rows.length;
};

beforeAll(async () => {
  users.push(await createConfirmedUser("neg-owner"), await createConfirmedUser("neg-analyst"), await createConfirmedUser("neg-owner-b"));
  owner = await signedIn("neg-owner");
  const ownerB = await signedIn("neg-owner-b");
  expect((await owner.from("organizations").insert({ slug: orgA, name: "Negativas A" })).error).toBeNull();
  expect((await ownerB.from("organizations").insert({ slug: orgB, name: "Negativas B" })).error).toBeNull();
  const oa = (await owner.from("organizations").select("id").eq("slug", orgA).single()).data!.id;
  const ob = (await ownerB.from("organizations").select("id").eq("slug", orgB).single()).data!.id;
  expect((await owner.from("projects").insert({ organization_id: oa, slug: "a1", name: "A1" })).error).toBeNull();
  expect((await ownerB.from("projects").insert({ organization_id: ob, slug: "b1", name: "B1" })).error).toBeNull();
  pa = { projectId: (await owner.from("projects").select("id").eq("organization_id", oa).single()).data!.id, organizationId: oa, scope: { tenantId: orgA, projectId: "a1" } };
  pb = { projectId: (await ownerB.from("projects").select("id").eq("organization_id", ob).single()).data!.id, organizationId: ob, scope: { tenantId: orgB, projectId: "b1" } };
  analyst = await signedIn("neg-analyst");
  await consentedMembership(owner, analyst, pa.projectId, "analyst");
  expect((await appendTrustedAudit(owner, pa, { at: at(), actor: { role: "owner", id: users[0] }, action: "neg.seed", outcome: "allowed" }, keyring)).ok).toBe(true);
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([orgA, orgB]);
  await deleteUsers(users);
});

describe("S1 trusted writer negatives (local stack)", () => {
  it("refuses a spoofed organization, tenant/project slug, role or actor without writing", async () => {
    const before = await count(pa);
    const input = { at: at(), actor: { role: "owner" as const, id: users[0] }, action: "neg.spoof", outcome: "allowed" as const };
    expect(await appendTrustedAudit(owner, { ...pa, organizationId: pb.organizationId }, input, keyring)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await appendTrustedAudit(owner, { ...pa, scope: { tenantId: orgB, projectId: "a1" } }, input, keyring)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await appendTrustedAudit(owner, { ...pa, scope: { tenantId: orgA, projectId: "b1" } }, input, keyring)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    // Another tenant's project, with this owner's session.
    expect(await appendTrustedAudit(owner, pb, input, keyring)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    // An analyst claiming the owner role, or acting as the owner's id.
    expect(await appendTrustedAudit(analyst, pa, { ...input, actor: { role: "owner", id: users[1] } }, keyring)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await appendTrustedAudit(analyst, pa, { ...input, actor: { role: "owner", id: users[0] } }, keyring)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await count(pa)).toBe(before);
  });

  it("refuses a request without a session and a session revoked on the server", async () => {
    const before = await count(pa);
    const input = { at: at(), actor: { role: "owner" as const, id: users[0] }, action: "neg.session", outcome: "allowed" as const };
    const anonymous = createClient<Database>(env.apiUrl, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    expect(await appendTrustedAudit(anonymous, pa, input, keyring)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    // Server-side revocation: another session of the same user signs out globally; this client
    // still holds its local access token, so the refusal can only come from the Auth server.
    const holder = await signedIn("neg-owner");
    const token = (await holder.auth.getSession()).data.session?.access_token;
    expect(token).toBeTruthy();
    expect((await (await signedIn("neg-owner")).auth.signOut({ scope: "global" })).error).toBeNull();
    expect((await holder.auth.getSession()).data.session?.access_token).toBe(token);
    expect((await holder.auth.getUser()).error).not.toBeNull();
    expect(await appendTrustedAudit(holder, pa, input, keyring)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    owner = await signedIn("neg-owner");
    expect(await count(pa)).toBe(before);
  });

  it("revalidates membership in SQL: a still-valid token of a withdrawn member is refused", async () => {
    const stale = await signedIn("neg-analyst");
    const input = { at: at(), actor: { role: "analyst" as const, id: users[1] }, action: "neg.member", outcome: "allowed" as const };
    expect((await appendTrustedAudit(stale, pa, input, keyring)).ok).toBe(true);
    const before = await count(pa);
    psql(`delete from public.project_members where project_id = '${pa.projectId}' and user_id = '${users[1]}';`);
    expect(await appendTrustedAudit(stale, pa, { ...input, at: at() }, keyring)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await count(pa)).toBe(before);
  });

  it("rotation: a new active key appends after old events; a wrong ring is refused before signing", async () => {
    const rotated = ring(`${k1},${k2}`, "k2");
    const before = await count(pa);
    const appended = await appendTrustedAudit(owner, pa, { at: at(), actor: { role: "owner", id: users[0] }, action: "neg.rotated", outcome: "allowed" }, rotated);
    expect(appended).toMatchObject({ ok: true, row: { key_id: "k2" } });
    const trail = await readAuditTrail(owner, pa, rotated);
    expect(trail.ok && trail.verification.valid).toBe(true);
    // A ring that cannot verify the existing chain (lost/other keys) never extends it.
    const foreign = ring(`k1:${randomBytes(32).toString("base64")}`, "k1");
    expect(await appendTrustedAudit(owner, pa, { at: at(), actor: { role: "owner", id: users[0] }, action: "neg.foreign", outcome: "allowed" }, foreign))
      .toEqual({ ok: false, error: "CHAIN_INVALID" });
    expect(await count(pa, rotated)).toBe(before + 1);
  });

  it("a damaged chain (forged row or removed middle event) is never extended", async () => {
    const rotated = ring(`${k1},${k2}`, "k2");
    const input = () => ({ at: at(), actor: { role: "owner" as const, id: users[0] }, action: "neg.after-damage", outcome: "allowed" as const });
    // A row inserted offline with a wrong HMAC but correct linkage.
    const last = psql(`select seq || '|' || hash from public.audit_events where project_id = '${pa.projectId}' order by seq desc limit 1;`).split("|");
    psql(`insert into public.audit_events (project_id, organization_id, seq, at, actor_role, actor_id, action, outcome, details, prev_hash, hash, key_id, signature)
      values ('${pa.projectId}', '${pa.organizationId}', ${Number(last[0]) + 1}, now(), 'owner', '${users[0]}', 'neg.forged', 'allowed', '{}', '${last[1]}', '${"c".repeat(64)}', 'k2', '${"d".repeat(64)}');`);
    expect(await appendTrustedAudit(owner, pa, input(), rotated)).toEqual({ ok: false, error: "CHAIN_INVALID" });
    psql(`delete from public.audit_events where project_id = '${pa.projectId}' and action = 'neg.forged';`);
    expect((await appendTrustedAudit(owner, pa, input(), rotated)).ok).toBe(true);
    // Removing a middle event leaves a gap the writer detects.
    psql(`delete from public.audit_events where project_id = '${pa.projectId}' and seq = 2;`);
    const before = Number(psql(`select count(*) from public.audit_events where project_id = '${pa.projectId}';`));
    expect(await appendTrustedAudit(owner, pa, input(), rotated)).toEqual({ ok: false, error: "CHAIN_INVALID" });
    expect(Number(psql(`select count(*) from public.audit_events where project_id = '${pa.projectId}';`))).toBe(before);
  });

  it("a lost writer connection never half-writes; the same operation id retried yields one event", async () => {
    const operationId = randomUUID();
    const p = pb; // untouched chain
    const ownerB = await signedIn("neg-owner-b");
    const input = { at: at(), actor: { role: "owner" as const, id: users[2] }, action: "neg.conn", outcome: "allowed" as const };
    expect((await appendTrustedAudit(ownerB, p, { ...input, action: "neg.warm" }, keyring)).ok).toBe(true);
    // Kill every pooled writer backend: the next checkout must not reuse a dead connection silently.
    const killed = Number(psql("select count(pg_terminate_backend(pid)) from pg_stat_activity where usename = 'rubik_audit_writer';"));
    expect(killed).toBeGreaterThan(0);
    const first = await appendTrustedAudit(ownerB, p, input, keyring, { operationId });
    const second = await appendTrustedAudit(ownerB, p, input, keyring, { operationId });
    expect(second).toMatchObject({ ok: true });
    if (first.ok && second.ok) expect(second.row.seq).toBe(first.row.seq);
    const trail = await readAuditTrail(ownerB, p, keyring);
    if (!trail.ok) throw new Error(trail.error);
    expect(trail.verification.valid).toBe(true);
    expect(trail.rows.filter((r) => r.action === "neg.conn")).toHaveLength(1);
  });
});
