import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { Client as PgClient, Pool } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { appendTrustedAudit } from "@/lib/provenance/writer";
import { loadKeyring } from "@/lib/provenance/keyring";
import { verifyProjectExport } from "@/lib/recovery/verify-export";
import type { ProjectRef } from "@/lib/provenance/audit";
import { planRestore } from "@/lib/restore/plan";
import { recoverySchemaContract } from "@/lib/recovery/schema-contract";
import { createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";
import { safeU03LocalDiagnostic, type U03LocalCategory, type U03LocalPhase, type U03LocalResult } from "../support/u03-local-diagnostic";

const runId = randomUUID();
type Phase = U03LocalPhase;
type Category = U03LocalCategory;
const ledger = resolve("test-results/u03-window-local-http-diagnostic.jsonl");
mkdirSync(resolve("test-results"), { recursive: true });
function record(phase: Phase, category: Category, result: U03LocalResult, sqlstate?: "42501") {
  const safe = safeU03LocalDiagnostic({ runId, phase, result, errorCode: sqlstate ?? (category === "OTHER_LOCAL_FAILURE" ? "UNCLASSIFIED" : undefined),
    authUserMatches: category === "AUTH_USER_MISMATCH" ? false : undefined,
    actorScopeMatches: category === "ACTOR_SCOPE_MISMATCH" ? false : undefined });
  appendFileSync(ledger, `${JSON.stringify(safe)}\n`, { flag: "a" });
}
function queryText(input: unknown): string {
  if (typeof input === "string") return input.toLowerCase().replace(/\s+/g, " ").trim();
  if (input && typeof input === "object" && "text" in input && typeof input.text === "string")
    return input.text.toLowerCase().replace(/\s+/g, " ").trim();
  return "";
}
function phaseOf(input: unknown): Phase {
  const text = queryText(input);
  if (text === "begin") return "writer_transaction_begin";
  if (text.startsWith("set local")) return "writer_session_settings";
  if (text.includes("pg_advisory_xact_lock")) return "writer_advisory_lock";
  if (text.includes("audit_writer_actor")) return "writer_actor_lookup";
  if (text.includes("audit_idempotency") && text.startsWith("select")) return "writer_idempotency_read";
  if (text.includes("audit_events") && text.startsWith("select")) return "writer_chain_read";
  if (text.includes("insert into public.audit_events")) return "writer_audit_insert";
  if (text.includes("insert into private.audit_idempotency")) return "writer_receipt_insert";
  if (text === "commit") return "writer_commit";
  return "other_sql";
}

const originalQuery = PgClient.prototype.query;
let observedSqlFailure: { phase: Phase; sqlstate: "42501" } | null = null;
const diagnosticQuery = function (this: InstanceType<typeof PgClient>, ...args: unknown[]) {
  const phase = phaseOf(args[0]);
  const result = (originalQuery as unknown as (...queryArgs: unknown[]) => unknown).apply(this, args);
  if (result && typeof result === "object" && "then" in result) {
    return (result as Promise<unknown>).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "42501") observedSqlFailure = { phase, sqlstate: "42501" };
      throw error;
    });
  }
  return result;
} as unknown as typeof originalQuery;
PgClient.prototype.query = diagnosticQuery;

const role = `u03_diag_${randomBytes(5).toString("hex")}`;
const policyPrefix = `u03_d_${runId.replaceAll("-", "").slice(0, 8)}`;
const rolePassword = randomBytes(32).toString("base64url");
const tenant = `u03-${runId.replaceAll("-", "").slice(0, 12)}-a`;
const users: string[] = [];
let user: SupabaseClient<Database>;
let organizationId = "";
let project: ProjectRef;
let roleReady = false;
const createdPolicies: { relation: string; name: string }[] = [];
let organizationCreated = false;
let authCategory: Category = null;
let actorCategory: Category = null;
let pool: Pool;
const signingKey = randomBytes(32).toString("base64");
const keyring = loadKeyring({ PROVENANCE_SIGNING_KEYS: `u03-local:${signingKey}`, PROVENANCE_ACTIVE_KEY_ID: "u03-local" });

function adminSql(statement: string) {
  try {
    execFileSync("docker", ["exec", "-i", "supabase_db_rubik-u03-window-20261020", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
      { input: statement, stdio: ["pipe", "ignore", "pipe"] });
  } catch { throw new Error("LOCAL_ADMIN_SQL_FAILED"); }
}
function applyRestore(statement: string) {
  try {
    execFileSync("docker", ["exec", "-i", "supabase_db_rubik-u03-window-20261020", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
      { input: statement, stdio: ["pipe", "ignore", "pipe"] });
  } catch { throw new Error("LOCAL_RESTORE_SQL_FAILED"); }
}

beforeAll(async () => {
  if (!keyring.ok) throw new Error("LOCAL_KEYRING_INVALID");
  try {
    users.push(await createConfirmedUser("u03-http-owner"));
    user = await signedIn("u03-http-owner");
  } catch { throw new Error("LOCAL_AUTH_FIXTURE_FAILED"); }
  const createdOrg = await user.from("organizations").insert({ slug: tenant, name: "U03 local diagnostic" });
  if (createdOrg.error) throw new Error("LOCAL_ORGANIZATION_CREATE_FAILED");
  organizationCreated = true;
  const org = await user.from("organizations").select("id").eq("slug", tenant).single();
  if (org.error || !org.data) throw new Error("LOCAL_ORGANIZATION_LOOKUP_FAILED");
  organizationId = org.data.id;
  const createdProject = await user.from("projects").insert({ organization_id: organizationId, slug: "a1", name: "A1" });
  if (createdProject.error) throw new Error("LOCAL_PROJECT_CREATE_FAILED");
  const loadedProject = await user.from("projects").select("id").eq("organization_id", organizationId).eq("slug", "a1").single();
  if (loadedProject.error || !loadedProject.data) throw new Error("LOCAL_PROJECT_LOOKUP_FAILED");
  project = { projectId: loadedProject.data.id, organizationId, scope: { tenantId: tenant, projectId: "a1" } };

  const expiry = new Date(Date.now() + 600_000).toISOString();
  const relations = ["public.audit_events", "private.audit_idempotency", "private.audit_outbox"];
  adminSql(`create role "${role}" login noinherit nobypassrls nosuperuser nocreatedb nocreaterole password '${rolePassword}' valid until '${expiry}';`);
  roleReady = true;
  adminSql(`grant rubik_audit_writer to "${role}" with inherit false, set true;`);
  for (const [index, relation] of relations.entries()) {
    const name = `${policyPrefix}_${index}`;
    adminSql(`create policy "${name}" on ${relation} as restrictive for all to rubik_audit_writer using (project_id='${project.projectId}'::uuid and clock_timestamp()<'${expiry}'::timestamptz) with check (project_id='${project.projectId}'::uuid and clock_timestamp()<'${expiry}'::timestamptz);`);
    createdPolicies.push({ relation, name });
  }
  const connection = new URL(`postgresql://${role}:${rolePassword}@127.0.0.1:63422/postgres`);
  connection.searchParams.set("options", "-c role=rubik_audit_writer");
  process.env.RUBIK_AUDIT_DATABASE_URL = connection.toString();
  process.env.VERCEL_ENV = "development";
  process.env.RUBIK_TEST_U03_WINDOW_STACK = "1";
  process.env.PROVENANCE_SIGNING_KEYS = `u03-local:${signingKey}`;
  process.env.PROVENANCE_ACTIVE_KEY_ID = "u03-local";
  process.env.RUBIK_RECOVERY_SCHEMA_ATTESTATION = "pre-n2-through-20261015210000";
  pool = new Pool({ connectionString: connection.toString(), ssl: false, max: 1 });
  try {
    const auth = await user.auth.getUser();
    authCategory = !auth.error && auth.data.user?.id === users[0] ? null : "AUTH_USER_MISMATCH";
  } catch { authCategory = "AUTH_USER_MISMATCH"; }
  try {
    const actor = await pool.query<{ organization_id: string; actor_role: string; tenant_slug: string; project_slug: string }>(
      "select * from private.audit_writer_actor($1::uuid,$2::uuid)", [project.projectId, users[0]]);
    const row = actor.rows[0];
    actorCategory = row && row.organization_id === organizationId && row.actor_role === "owner" && row.tenant_slug === tenant && row.project_slug === "a1"
      ? null : "ACTOR_SCOPE_MISMATCH";
  } catch {
    if (observedSqlFailure) record(observedSqlFailure.phase, "SQL_PRIVILEGE_DENIED", "FAIL", observedSqlFailure.sqlstate);
    else record("other_sql", "OTHER_LOCAL_FAILURE", "FAIL");
    actorCategory = "ACTOR_SCOPE_MISMATCH";
  }
  record("auth_user_check", authCategory, authCategory === null ? "PASS" : "FAIL");
  record("actor_scope_check", actorCategory, actorCategory === null ? "PASS" : "FAIL");
  expect(await recoverySchemaContract()).toBe("legacy-v2");
}, 60_000);

afterAll(async () => {
  await pool?.end().catch(() => undefined);
  PgClient.prototype.query = originalQuery;
  if (roleReady) {
    adminSql(`alter role "${role}" nologin;`);
  }
  const scopedOutbox = execFileSync("docker", ["exec", "supabase_db_rubik-u03-window-20261020", "psql", "-X", "-U", "postgres", "-d", "postgres", "-Atqc",
    `select count(*) from private.audit_outbox o join public.organizations g on g.id=o.organization_id where g.slug='${tenant}' and o.state='pending'`], { encoding: "utf8" }).trim();
  if (scopedOutbox !== "0") { record("fixture_cleanup", "OTHER_LOCAL_FAILURE", "FAIL"); return; }
  try {
    if (organizationCreated) await deleteOrganizations([tenant]);
    if (users.length) await deleteUsers(users);
  } catch { record("fixture_cleanup", "OTHER_LOCAL_FAILURE", "FAIL"); return; }
  for (const policy of createdPolicies.reverse()) adminSql(`drop policy if exists "${policy.name}" on ${policy.relation};`);
  if (roleReady) adminSql(`revoke rubik_audit_writer from "${role}"; drop role "${role}";`);
  const final = execFileSync("docker", ["exec", "supabase_db_rubik-u03-window-20261020", "psql", "-X", "-U", "postgres", "-d", "postgres", "-Atqc",
    "select (select count(*) from auth.users)::text||'|'||(select count(*) from public.organizations)::text||'|'||(select count(*) from public.projects)::text||'|'||(select count(*) from public.audit_events)::text||'|'||(select count(*) from public.provider_results)::text||'|'||(select count(*) from public.imports)::text||'|'||(select count(*) from private.audit_outbox)::text||'|'||(select count(*) from private.audit_outbox where state='pending')::text||'|'||(select count(*) from pg_roles where rolname like 'u03_diag_%')::text||'|'||(select count(*) from pg_policy where polname like 'u03_d_%')::text||'|'||(select (not rolcanlogin)::text from pg_roles where rolname='rubik_audit_writer')"], { encoding: "utf8" }).trim();
  if (final !== "0|0|0|0|0|0|0|0|0|0|true") { record("fixture_cleanup", "OTHER_LOCAL_FAILURE", "FAIL"); return; }
  record("fixture_cleanup", null, "PASS");
  roleReady = false;
});

it("classifies NOT_ALLOWED without exposing internal values", async () => {
  expect(authCategory).toBeNull();
  expect(actorCategory).toBeNull();
  const result = await appendTrustedAudit(user, project, { actor: { id: users[0], role: "owner" }, action: "u03.diagnostic" }, keyring.ok ? keyring.keyring : (() => { throw new Error("KEYRING_INVALID"); })());
  if (!result.ok && observedSqlFailure) {
    record(observedSqlFailure.phase, "SQL_PRIVILEGE_DENIED", "FAIL", observedSqlFailure.sqlstate);
  } else if (!result.ok) {
    record("other_sql", "OTHER_LOCAL_FAILURE", "FAIL");
  } else {
    record("writer_commit", null, "PASS");
  }
  expect(result.ok).toBe(true);

  vi.doMock("@/lib/auth/session", () => ({ currentUser: async () => ({ id: users[0] }) }));
  vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => user }));
  const { GET } = await import("@/app/proyectos/[tenantId]/[projectId]/exportar/route");
  const response = await GET(new Request(`http://local/proyectos/${tenant}/a1/exportar`), {
    params: Promise.resolve({ tenantId: tenant, projectId: "a1" }),
  });
  record("http_export", null, response.status === 200 ? "PASS" : "FAIL");
  expect(response.status).toBe(200);
  const document = await response.json();
  const verified = verifyProjectExport(document, keyring.ok ? keyring.keyring : (() => { throw new Error("KEYRING_INVALID"); })());
  expect(verified.ok).toBe(true);
  record("offline_verify", null, verified.ok ? "PASS" : "FAIL");
  const altered = structuredClone(document);
  altered.audit.rows[0].action = "project.delete";
  const tamper = verifyProjectExport(altered, keyring.ok ? keyring.keyring : (() => { throw new Error("KEYRING_INVALID"); })());
  expect(tamper.ok).toBe(true);
  if (tamper.ok) {
    expect(tamper.audit.valid).toBe(false);
    expect(tamper.mismatches).toContain("audit.verification");
  }
  expect(planRestore(altered, keyring.ok ? keyring.keyring : (() => { throw new Error("KEYRING_INVALID"); })(), { operatorId: users[0] }))
    .toMatchObject({ ok: false, error: "TAMPERED" });
  record("tamper_rejection", null, "PASS");

  const restore = planRestore(document, keyring.ok ? keyring.keyring : (() => { throw new Error("KEYRING_INVALID"); })(), { operatorId: users[0] });
  expect(restore.ok).toBe(true);
  if (!restore.ok) throw new Error("LOCAL_RESTORE_PLAN_FAILED");
  await deleteOrganizations([tenant]);
  applyRestore(restore.plan.sql);
  applyRestore(restore.plan.sql);
  const restored = await user.from("audit_events").select("seq").eq("project_id", project.projectId).order("seq");
  expect(restored.error).toBeNull();
  expect(restored.data?.length).toBe(2);
  record("restore_twice_idempotent", null, "PASS");
});
