// Runs the real signed N1 integration flows on the disposable U03 stack using a temporary
// NOINHERIT login that can SET ROLE to rubik_audit_writer. It never targets a hosted ref.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORKDIR = resolve(ROOT, "test-results/u03-window-local-stack");
const PROJECT = "rubik-u03-window-20261020";
const DB = `supabase_db_${PROJECT}`;
const RUN_ID = randomUUID();
const ROLE = `u03_window_${randomBytes(4).toString("hex")}`;
const temporaryCredential = randomBytes(32).toString("base64url");
const LEDGER = resolve(ROOT, "test-results/u03-window-local-flows.jsonl");
let roleInstalled = false;

function record(caseId, status, details = {}) {
  appendFileSync(LEDGER, `${JSON.stringify({ at: new Date().toISOString(), runId: RUN_ID, caseId, status, ...details })}\n`, { flag: "a" });
}
function sql(statement) {
  execFileSync("docker", ["exec", "-i", DB, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
    { input: statement, cwd: ROOT, stdio: ["pipe", "ignore", "pipe"] });
}
function scalar(statement) {
  return execFileSync("docker", ["exec", DB, "psql", "-X", "-U", "postgres", "-d", "postgres", "-Atqc", statement],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function checked(condition, code) { if (!condition) throw new Error(code); }

const marker = JSON.parse(readFileSync(resolve(WORKDIR, ".u03-owned-stack.json"), "utf8"));
checked(marker.project === PROJECT && marker.migrations === 27, "LOCAL_STACK_PIN_REJECTED");
checked(scalar("select count(*)::text||'|'||max(version)::text from supabase_migrations.schema_migrations") === "27|20261015210000", "MIGRATION_SET_REJECTED");
checked(scalar(`select count(*) from pg_roles where rolname='${ROLE}'`) === "0", "TEMP_ROLE_EXISTS");
record("direct-postgres-preflight", "PASS", { migrations: 27, lastMigration: "20261015210000", transport: "postgres-direct" });

try {
  sql(`create role "${ROLE}" login noinherit nobypassrls nosuperuser nocreatedb nocreaterole password '${temporaryCredential}';
    grant rubik_audit_writer to "${ROLE}" with inherit false, set true;`);
  roleInstalled = true;
  const membership = scalar(`select set_option::text||'|'||inherit_option::text from pg_auth_members where roleid='rubik_audit_writer'::regrole and member='${ROLE}'::regrole`);
  checked(membership === "true|false", "ROLE_MEMBERSHIP_REJECTED");
  const url = new URL(`postgresql://${ROLE}:${temporaryCredential}@127.0.0.1:63422/postgres`);
  url.searchParams.set("options", "-c role=rubik_audit_writer");
  const capabilities = scalar(`select has_table_privilege('rubik_audit_writer','public.audit_events','insert')::text||'|'||
    has_table_privilege('rubik_audit_writer','public.provider_results','insert')::text||'|'||
    has_table_privilege('rubik_audit_writer','public.imports','insert')::text||'|'||
    has_schema_privilege('rubik_audit_writer','auth','usage')::text||'|'||
    (select (not rolbypassrls and not rolsuper)::text from pg_roles where rolname='rubik_audit_writer')`);
  checked(capabilities === "true|true|false|false|true", "WRITER_CAPABILITIES_REJECTED");
  record("temporary-login-and-effective-grants", "PASS", { noinherit: true, bypassRls: false, authAccess: false,
    auditInsert: true, resultInsert: true, importInsert: false, setRole: true });

  const env = { ...process.env,
    RUBIK_TEST_U03_WINDOW_STACK: "1",
    SUPABASE_CLI: `npx --yes supabase@2.118.0 --workdir ${WORKDIR}`,
    RUBIK_AUDIT_DATABASE_URL: url.toString(),
    VERCEL_ENV: "development",
  };
  const files = ["tests/integration/provenance.integration.test.ts", "tests/integration/imports.integration.test.ts", "tests/integration/restore.integration.test.ts"];
  const result = spawnSync("cmd.exe", ["/d", "/s", "/c", `node_modules\\.bin\\vitest.cmd run --config vitest.integration.config.mts ${files.join(" ")}`],
    { cwd: ROOT, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    record("signed-isolation-import-export-restore", "FAIL", { category: "LOCAL_INTEGRATION", code: `EXIT_${result.status ?? "PROCESS"}` });
    throw new Error("LOCAL_SIGNED_INTEGRATION_FAILED");
  }
  record("signed-isolation-import-export-restore", "PASS", { suites: files.length, transport: "postgres-direct",
    coverage: ["signed audit", "signed provider result", "populated cross-tenant reads", "signed import and receipts",
      "offline export verification", "restore idempotency and rollback"] });

  const leftover = scalar(`select
    (select count(*) from auth.users)::text||'|'||
    (select count(*) from public.organizations)::text||'|'||
    (select count(*) from public.projects)::text||'|'||
    (select count(*) from public.project_members)::text||'|'||
    (select count(*) from public.audit_events)::text||'|'||
    (select count(*) from public.provider_results)::text||'|'||
    (select count(*) from public.imports)::text||'|'||
    (select count(*) from private.audit_outbox)::text||'|'||
    (select count(*) from private.audit_outbox where state='pending')::text`);
  checked(leftover === "0|0|0|0|0|0|0|0|0", "LOCAL_FIXTURE_OR_OUTBOX_REMAINS");
  record("independent-inventory-and-outbox", "PASS", { inventory: "zero", outboxTotal: 0, outboxPending: 0 });
} finally {
  if (roleInstalled) {
    sql(`alter role "${ROLE}" nologin;`);
    const remaining = scalar(`select (select count(*) from auth.users)::text||'|'||(select count(*) from public.organizations)::text||'|'||
      (select count(*) from public.projects)::text||'|'||(select count(*) from private.audit_outbox)::text||'|'||
      (select count(*) from private.audit_outbox where state='pending')::text`);
    if (remaining === "0|0|0|0|0") {
      sql(`revoke rubik_audit_writer from "${ROLE}"; drop role "${ROLE}";`);
      roleInstalled = false;
      record("finally-temporary-role-containment", "PASS", { role: "removed", zeroInventory: true, outboxTotal: 0, outboxPending: 0 });
    } else {
      record("finally-temporary-role-containment", "BLOCKED", { role: "NOLOGIN", residualInventory: true });
    }
  }
}

if (roleInstalled) process.exitCode = 2;
else process.stdout.write(`U03_LOCAL_FLOWS runId=${RUN_ID} transport=postgres-direct suites=3 cleanup=zero ledger=u03-window-local-flows.jsonl\n`);
