import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { Pool } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { loadProviderResult } from "@/lib/provenance/repository";
import { loadKeyring } from "@/lib/provenance/keyring";
import { processAuditOutbox, signProviderReceipt } from "@/lib/provenance/outbox";
import { createConfirmedUser, deleteOrganizations, deleteUsers, env, signedIn } from "./support";
import { localDatabaseContainer } from "../../scripts/supabase-test-env.mjs";
import { buildMinimalInstallSql, buildMinimalRollbackSql, ROLE } from "../../scripts/u03-window-minimal-principal.mjs";

const runId: string = randomUUID();
const tenant = `u03-${runId.replaceAll("-", "").slice(0, 12)}-a`;
const rolePassword = randomBytes(32).toString("base64url");
const signingSecret = randomBytes(32).toString("base64");
const keyringResult = loadKeyring({ PROVENANCE_SIGNING_KEYS: `u03-fixture:${signingSecret}`, PROVENANCE_ACTIVE_KEY_ID: "u03-fixture" });
const db = localDatabaseContainer();
let ownerId = "";
let user: SupabaseClient<Database>;
let organizationId = "";
let projectId = "";
let roleInstalled = false;
let originalEnv: Record<string, string | undefined> = {};
let writePool: Pool | undefined;
let createFixture: (kind: string, bodyRunId?: string) => Promise<Response>;
let cleanupFixture: () => Promise<Response>;

function sql(statement: string) {
  return execFileSync("docker", ["exec", "-i", db, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"],
    { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

beforeAll(async () => {
  if (!keyringResult.ok) throw new Error("LOCAL_FIXTURE_KEYRING_INVALID");
  const envKeys = ["RUBIK_AUDIT_DATABASE_URL", "VERCEL_ENV", "RUBIK_TEST_U03_WINDOW_STACK", "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "PROVENANCE_SIGNING_KEYS", "PROVENANCE_ACTIVE_KEY_ID", "RUBIK_RECOVERY_SCHEMA_ATTESTATION"];
  originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  expect(sql("select count(*)::text||'|'||max(version)::text from supabase_migrations.schema_migrations"))
    .toBe("27|20261015210000");
  if (sql("select count(*) from information_schema.tables where table_schema='private' and table_name='environment_identity'") === "0")
    sql(readFileSync("scripts/u02-preview-sentinel.sql", "utf8"));
  expect(sql("select count(*) from auth.users") + "|" + sql("select count(*) from public.organizations") + "|" +
    sql("select count(*) from public.projects") + "|" + sql("select count(*) from private.audit_outbox"))
    .toBe("0|0|0|0");

  ownerId = await createConfirmedUser("u03-window-result-owner");
  user = await signedIn("u03-window-result-owner");
  const orgInsert = await user.from("organizations").insert({ slug: tenant, name: "U03 result fixture" });
  if (orgInsert.error) throw new Error("LOCAL_FIXTURE_ORG_CREATE_FAILED");
  const org = await user.from("organizations").select("id").eq("slug", tenant).single();
  if (org.error || !org.data) throw new Error("LOCAL_FIXTURE_ORG_LOOKUP_FAILED");
  organizationId = org.data.id;
  const projectInsert = await user.from("projects").insert({ organization_id: organizationId, slug: "a1", name: "A1" });
  if (projectInsert.error) throw new Error("LOCAL_FIXTURE_PROJECT_CREATE_FAILED");
  const project = await user.from("projects").select("id").eq("organization_id", organizationId).eq("slug", "a1").single();
  if (project.error || !project.data) throw new Error("LOCAL_FIXTURE_PROJECT_LOOKUP_FAILED");
  projectId = project.data.id;

  const expires = new Date(Date.now() + 10 * 60_000).toISOString();
  sql(buildMinimalInstallSql(runId, rolePassword, expires));
  roleInstalled = true;
  sql(`alter role ${ROLE} login valid until '${expires}'`);
  const connection = new URL(`postgresql://${ROLE}:${rolePassword}@127.0.0.1:63422/postgres`);
  process.env.RUBIK_AUDIT_DATABASE_URL = connection.toString();
  process.env.VERCEL_ENV = "development";
  process.env.RUBIK_TEST_U03_WINDOW_STACK = "1";
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.apiUrl;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = env.publishableKey;
  process.env.PROVENANCE_SIGNING_KEYS = `u03-fixture:${signingSecret}`;
  process.env.PROVENANCE_ACTIVE_KEY_ID = "u03-fixture";
  process.env.RUBIK_RECOVERY_SCHEMA_ATTESTATION = "pre-n2-through-20261015210000";
  writePool = new Pool({ connectionString: connection.toString(), ssl: false, max: 1 });
  const session = await user.auth.getSession();
  const bearer = session.data.session?.access_token;
  if (session.error || !bearer) throw new Error("LOCAL_FIXTURE_AUTH_SESSION_MISSING");
  const { createBearerClient } = await import("@/lib/supabase/server");
  const bearerProbe = await createBearerClient(new Request("http://127.0.0.1/api/u03/window-fixtures", {
    headers: { authorization: `Bearer ${bearer}` },
  }));
  if (!bearerProbe || bearerProbe.user.id !== ownerId) throw new Error("LOCAL_FIXTURE_BEARER_AUTH_FAILED");

  vi.doMock("@/lib/provenance/preview-writer-capability", () => ({
    withPreviewWriterCapability: async (_request: Request, gotTenant: string, gotProject: string, action: () => Promise<unknown>) =>
      gotTenant === tenant && gotProject === "a1" ? action() : null,
  }));
  vi.doMock("@/lib/auth/session", () => ({ currentUser: async () => null }));
  const [{ POST: fixturePost }, { POST: cleanupPost }] = await Promise.all([
    import("@/app/api/u03/window-fixtures/[tenantId]/[projectId]/route"),
    import("@/app/api/u03/window-cleanup/[tenantId]/[projectId]/route"),
  ]);
  const context = { params: Promise.resolve({ tenantId: tenant, projectId: "a1" }) };
  const request = (kind: string, bodyRunId = runId) => new Request(`http://127.0.0.1/api/u03/window-fixtures/${tenant}/a1`, {
    method: "POST", headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json", "x-rubik-u03-run-id": runId },
    body: JSON.stringify({ kind, runId: bodyRunId }),
  });
  createFixture = async (kind, bodyRunId) => fixturePost(request(kind, bodyRunId), context);
  cleanupFixture = async () => cleanupPost(new Request(`http://127.0.0.1/api/u03/window-cleanup/${tenant}/a1`, {
    method: "POST", headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json", "x-rubik-u03-run-id": runId },
    body: JSON.stringify({ runId }),
  }), context);
}, 60_000);

afterAll(async () => {
  await writePool?.end().catch(() => undefined);
  if (roleInstalled) {
    sql(`alter role ${ROLE} nologin; select pg_terminate_backend(pid) from pg_stat_activity where usesysid=(select oid from pg_roles where rolname='${ROLE}') and pid<>pg_backend_pid()`);
    const pending = sql(`select count(*) from private.audit_outbox where state='pending' and project_id='${projectId}'::uuid`);
    if (pending !== "0") throw new Error("LOCAL_FIXTURE_PENDING_RECEIPT_PRESERVE_ROLE");
    await deleteOrganizations([tenant]);
    await deleteUsers([ownerId]);
    const residual = sql(`select (select count(*) from auth.users)::text||'|'||(select count(*) from public.organizations)::text||'|'||
      (select count(*) from public.projects)::text||'|'||(select count(*) from public.audit_events)::text||'|'||
      (select count(*) from public.provider_results)::text||'|'||(select count(*) from public.imports)::text||'|'||
      (select count(*) from private.audit_outbox)::text||'|'||(select count(*) from private.audit_outbox where state='pending')::text`);
    if (residual !== "0|0|0|0|0|0|0|0") throw new Error("LOCAL_FIXTURE_RESIDUAL_DATA_PRESERVE_ROLE");
    sql(buildMinimalRollbackSql(runId));
    roleInstalled = false;
  }
  for (const key of ["RUBIK_AUDIT_DATABASE_URL", "VERCEL_ENV", "RUBIK_TEST_U03_WINDOW_STACK", "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "PROVENANCE_SIGNING_KEYS", "PROVENANCE_ACTIVE_KEY_ID", "RUBIK_RECOVERY_SCHEMA_ATTESTATION"])
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]!;
  const final = sql(`select (select count(*) from pg_roles where rolname='${ROLE}')::text||'|'||
    (select count(*) from pg_policy where polname like 'u03_preview_writer_%')::text||'|'||
    (select (not rolcanlogin)::text from pg_roles where rolname='rubik_audit_writer')`);
  expect(final).toBe("0|0|true");
});

it("stores a signed synthetic result without inventing a google.capture receipt and resolves the real erase receipt idempotently", async () => {
  const denied = await createFixture("invalid");
  expect(denied.status).toBe(400);
  expect((await createFixture("result", randomUUID())).status).toBe(400);

  const first = await createFixture("result");
  expect(first.status).toBe(200);
  const firstBody = await first.json() as { ok: boolean; id: string };
  expect(firstBody.ok).toBe(true);
  const ref = { projectId, organizationId, scope: { tenantId: tenant, projectId: "a1" } };
  const loaded = await loadProviderResult(user, ref, firstBody.id, keyringResult.ok ? keyringResult.keyring : (() => { throw new Error("LOCAL_FIXTURE_KEYRING_INVALID"); })());
  expect(loaded.ok && loaded.verification.verified).toBe(true);
  expect(await signProviderReceipt(ref, "google.capture", firstBody.id,
    keyringResult.ok ? keyringResult.keyring : (() => { throw new Error("LOCAL_FIXTURE_KEYRING_INVALID"); })()))
    .toEqual({ ok: false, error: "RECEIPT_NOT_FOUND" });

  const retry = await createFixture("result");
  expect(retry.status).toBe(200);
  const retryBody = await retry.json() as { ok: boolean; id: string };
  expect(retryBody.id).toBe(firstBody.id);
  expect(sql(`select count(*) from public.provider_results where id='${firstBody.id}'::uuid`)).toBe("1");
  expect(sql(`select count(*) from private.audit_outbox where project_id='${projectId}'::uuid and action='google.capture' and target_text='${firstBody.id}'`)).toBe("0");

  const cleanup = await cleanupFixture();
  expect(cleanup.status).toBe(200);
  expect(await cleanup.json()).toMatchObject({ ok: true, resultRowsErased: 1 });
  const receipt = sql(`select id::text||'|'||state||'|'||event_seq::text from private.audit_outbox where project_id='${projectId}'::uuid and action='provider-results.erase'`);
  const [receiptId, state, eventSeq] = receipt.split("|");
  expect(receiptId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(state).toBe("completed");
  const retried = await processAuditOutbox(receiptId, keyringResult.ok ? keyringResult.keyring : (() => { throw new Error("LOCAL_FIXTURE_KEYRING_INVALID"); })());
  expect(retried).toEqual({ ok: true, seq: Number(eventSeq) });
  const final = sql(`select (select count(*) from public.provider_results where project_id='${projectId}'::uuid)::text||'|'||
    (select count(*) from private.audit_outbox where project_id='${projectId}'::uuid and state='pending')::text`);
  expect(final).toBe("0|0");
});
