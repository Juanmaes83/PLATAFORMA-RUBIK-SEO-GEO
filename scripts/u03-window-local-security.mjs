// Local-only proof of the temporary role, Session Supavisor SET ROLE, effective grants,
// SECURITY DEFINER allowlist, and a time-bounded restrictive RLS scope. Never uses hosted refs.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { Pool } from "pg";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/(\w:)/, "$1").replaceAll("/", "\\");
const WORKDIR = `${ROOT}test-results\\u03-window-local-stack`;
const PROJECT = "rubik-u03-window-20261020";
const DB = `supabase_db_${PROJECT}`;
// Supavisor's local auth maps this database role directly; hosted shared-pooler usernames append `.rhnnplewqsekrnaousyl`.
const LOGIN = "rubik_preview_u03_writer";
const WRITER = "rubik_audit_writer";
const LEDGER = `${ROOT}test-results\\u03-window-local-security.jsonl`;
const RUN_ID = randomUUID();
const ALLOW_ID = randomUUID();
const DENY_ID = randomUUID();
const temporaryRoleCredential = randomBytes(32).toString("hex");
const RPCS = ["private.google_capture_command(uuid, text, jsonb)", "private.openseo_job(uuid, text, uuid, jsonb)"];
const EXPECTED_DEFINERS = ["private.audit_writer_actor(uuid, uuid)", "private.audit_writer_project(uuid)"];
const RELATIONS = ["public.audit_events", "public.provider_results", "private.audit_idempotency", "private.audit_outbox"];
const PROBE = "private.u03_local_scope_probe";
let pool;
let roleCreated = false;
let probeCreated = false;
let phase = "initialization";
const policiesCreated = [];

function record(caseId, status, details = {}) {
  appendFileSync(LEDGER, `${JSON.stringify({ at: new Date().toISOString(), runId: RUN_ID, caseId, status, ...details })}\n`, { flag: "a" });
}
function admin(sql) {
  try {
    execFileSync("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"],
      { input: sql, cwd: ROOT, stdio: ["pipe", "ignore", "pipe"] });
  } catch (error) { throw new Error(`LOCAL_ADMIN_SQL_FAILED_${error.status ?? "PROCESS"}`); }
}
function ident(value) { return `"${value.replaceAll('"', '""')}"`; }
function uuid(value) { if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error("UUID_REJECTED"); return `'${value}'::uuid`; }
function assert(condition, code) { if (!condition) throw new Error(code); }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const marker = JSON.parse(readFileSync(`${WORKDIR}\\.u03-owned-stack.json`, "utf8"));
  assert(marker.project === PROJECT && marker.migrations === 27, "LOCAL_STACK_PIN_REJECTED");
  const migration = execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-d", "postgres", "-Atqc",
    "select count(*)::text||'|'||max(version)::text from supabase_migrations.schema_migrations"], { encoding: "utf8" }).trim();
  assert(migration === "27|20261015210000", "LOCAL_MIGRATION_PREFLIGHT_FAILED");
  record("local-preflight", "PASS", { migrations: 27, lastMigration: "20261015210000", pooler: "session" });

  phase = "preexisting-role-check";
  const baseline = execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-d", "postgres", "-Atqc",
    `select count(*) from pg_roles where rolname='${LOGIN}'`], { encoding: "utf8" }).trim();
  assert(baseline === "0", "TEMP_ROLE_ALREADY_EXISTS");
  const policyNames = RELATIONS.map((_, index) => `u03_window_scope_${index}`);
  const expiry = new Date(Date.now() + 30_000).toISOString();
  const installPolicies = RELATIONS.map((relation, index) => {
    const name = policyNames[index];
    policiesCreated.push({ relation, name });
    return `create policy ${ident(name)} on ${relation} as restrictive for all to ${WRITER}
      using (project_id = ${uuid(ALLOW_ID)} and clock_timestamp() < '${expiry}'::timestamptz)
      with check (project_id = ${uuid(ALLOW_ID)} and clock_timestamp() < '${expiry}'::timestamptz);`;
  }).join("\n");
  const revokeRpc = RPCS.map(signature => `revoke execute on function ${signature} from ${WRITER};`).join("\n");
  phase = "install-window-role-and-policies";
  admin(`begin;\n${revokeRpc}\n${installPolicies}\ncreate role ${ident(LOGIN)} login noinherit nobypassrls nosuperuser nocreatedb nocreaterole password '${temporaryRoleCredential}' valid until '${expiry}';\ngrant ${WRITER} to ${ident(LOGIN)} with inherit false, set true;\ncommit;`);
  roleCreated = true;
  const membership = execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-d", "postgres", "-Atqc",
    `select set_option::text||'|'||inherit_option::text from pg_auth_members where roleid='${WRITER}'::regrole and member='${LOGIN}'::regrole`], { encoding: "utf8" }).trim();
  const [setOption, inheritOption] = membership.split("|");
  record("temporary-role-membership", setOption === "true" && inheritOption === "false" ? "PASS" : "BLOCKED", { setOption, inheritOption });
  execFileSync("docker", ["restart", `supabase_pooler_${PROJECT}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  record("install-temporary-role-and-runscope", "PASS", { expiresAt: expiry, rlsRelations: RELATIONS.length, revokedDefinerFunctions: 2 });

  const poolerUrl = new URL(`postgresql://${encodeURIComponent(`${LOGIN}.${PROJECT}`)}:${temporaryRoleCredential}@127.0.0.1:63429/postgres`);
  poolerUrl.searchParams.set("options", `-c role=${WRITER}`);
  const poolerProbe = new Pool({ connectionString: poolerUrl.toString(), ssl: false, max: 1, connectionTimeoutMillis: 1500 });
  let poolerAuthenticated = false;
  let poolerErrorCode = "UNKNOWN";
  phase = "session-pooler-login";
  try {
    const result = await poolerProbe.query("select session_user, current_user");
    poolerAuthenticated = result.rows[0]?.session_user === LOGIN && result.rows[0]?.current_user === WRITER;
  }
  catch (error) {
    const candidate = String(error?.code ?? "").toUpperCase();
    poolerErrorCode = /^[A-Z0-9_]{2,12}$/.test(candidate) ? candidate : "CLIENT_ERROR";
  }
  await poolerProbe.end();
  record("session-pooler-prerequisite", poolerAuthenticated ? "PASS" : "BLOCKED", poolerAuthenticated
    ? { category: "POOLER_AUTH", sessionUser: LOGIN, currentUser: WRITER, setRole: true }
    : { category: "POOLER_AUTH", code: poolerErrorCode });

  const url = new URL(`postgresql://${encodeURIComponent(LOGIN)}:${temporaryRoleCredential}@127.0.0.1:63422/postgres`);
  const plainPool = new Pool({ connectionString: url.toString(), ssl: false, max: 1, connectionTimeoutMillis: 3000 });
  phase = "direct-login-privileges";
  const plain = (await plainPool.query(`select session_user,current_user,
      has_table_privilege(current_user,'public.audit_events','insert') as audit_insert,
      has_schema_privilege(current_user,'auth','usage') as auth_schema`)).rows[0];
  assert(plain.session_user === LOGIN && plain.current_user === LOGIN && !plain.audit_insert && !plain.auth_schema,
    "TEMP_ROLE_NOINHERIT_CHECK_FAILED");
  await plainPool.end();
  pool = new Pool({ connectionString: url.toString(), ssl: false, max: 1, connectionTimeoutMillis: 3000, idleTimeoutMillis: 5000 });
  phase = "explicit-set-role";
  await pool.query(`set role ${ident(WRITER)}`);
  phase = "direct-set-role-privileges";
  const session = (await pool.query(`select session_user, current_user, current_setting('role',true) as set_role,
      (select rolbypassrls or rolsuper from pg_roles where rolname=current_user) as elevated,
      has_schema_privilege(current_user,'auth','usage') as auth_schema,
      has_table_privilege(current_user,'public.project_members','select') as members_select,
      has_table_privilege(current_user,'public.audit_events','insert') as audit_insert,
      has_table_privilege(current_user,'public.provider_results','insert') as results_insert,
      has_table_privilege(current_user,'public.imports','insert') as imports_insert`)).rows[0];
  assert(session.session_user === LOGIN && session.current_user === WRITER && session.set_role === WRITER &&
    !session.elevated && !session.auth_schema && !session.members_select &&
    session.audit_insert && session.results_insert && !session.imports_insert, "SESSION_ROLE_OR_PRIVILEGE_CHECK_FAILED");
  record("direct-postgres-set-role-and-privileges", "PASS", { sessionUser: LOGIN, currentUser: WRITER,
    bypassRls: false, authAccess: false, membershipAccess: false, auditWriter: true, providerWriter: true, importsWriter: false });

  phase = "effective-security-definer-catalog";
  const functions = (await pool.query(`select format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) signature
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in ('f','p') and p.prosecdef
      and has_schema_privilege(current_user,n.oid,'USAGE') and has_function_privilege(current_user,p.oid,'EXECUTE') order by 1`))
    .rows.map(row => row.signature);
  assert(JSON.stringify(functions) === JSON.stringify(EXPECTED_DEFINERS), "SECURITY_DEFINER_ALLOWLIST_MISMATCH");
  record("effective-security-definer-allowlist", "PASS", { functions });

  phase = "create-synthetic-rls-probe";
  admin(`begin;\ncreate table ${PROBE}(project_id uuid not null, marker text not null);\nalter table ${PROBE} enable row level security;\ngrant select,insert on ${PROBE} to ${WRITER};\ncreate policy u03_probe_permissive on ${PROBE} as permissive for all to ${WRITER} using (true) with check (true);\ncreate policy u03_probe_restrictive on ${PROBE} as restrictive for all to ${WRITER} using (project_id=${uuid(ALLOW_ID)} and clock_timestamp() < '${expiry}'::timestamptz) with check (project_id=${uuid(ALLOW_ID)} and clock_timestamp() < '${expiry}'::timestamptz);\ninsert into ${PROBE} values (${uuid(ALLOW_ID)},'allowed'),(${uuid(DENY_ID)},'outside');\ncommit;`);
  probeCreated = true;
  phase = "verify-rls-scope";
  const visible = await pool.query(`select marker from ${PROBE} order by marker`);
  assert(visible.rows.length === 1 && visible.rows[0].marker === "allowed", "RLS_SCOPE_READ_FAILED");
  let denied = false;
  try { await pool.query(`insert into ${PROBE} values (${uuid(DENY_ID)},'outside-write')`); }
  catch (error) { denied = error.code === "42501"; }
  assert(denied, "RLS_SCOPE_WRITE_NOT_DENIED");
  const productPolicies = await pool.query(`select count(*)::int count from pg_policy p join pg_class c on c.oid=p.polrelid
      join pg_namespace n on n.oid=c.relnamespace where not p.polpermissive and p.polname like 'u03_window_scope_%'`);
  assert(productPolicies.rows[0].count === RELATIONS.length, "PRODUCT_RLS_SCOPE_POLICY_MISSING");
  record("restrictive-rls-boundary", "PASS", { visibleAllowedRow: true, outsideReadRows: 0, outsideInsertDenied: true,
    productRelationsRestricted: productPolicies.rows[0].count });

  await pool.end(); pool = null;
  // Keep one authenticated pooler session across policy expiry: the RLS expression itself must deny it.
  const shortExpiry = new Date(Date.now() + 4500).toISOString();
  admin(`begin;\ndrop policy u03_probe_restrictive on ${PROBE};\ncreate policy u03_probe_restrictive on ${PROBE} as restrictive for all to ${WRITER} using (project_id=${uuid(ALLOW_ID)} and clock_timestamp() < '${shortExpiry}'::timestamptz) with check (project_id=${uuid(ALLOW_ID)} and clock_timestamp() < '${shortExpiry}'::timestamptz);\ncommit;`);
  const shortUrl = new URL(url.toString());
  pool = new Pool({ connectionString: shortUrl.toString(), ssl: false, max: 1, connectionTimeoutMillis: 3000 });
  await pool.query(`set role ${ident(WRITER)}`);
  await pool.query("select 1");
  await sleep(5000);
  const afterTtl = await pool.query(`select count(*)::int count from ${PROBE}`);
  let ttlWriteDenied = false;
  try { await pool.query(`insert into ${PROBE} values (${uuid(ALLOW_ID)},'after-ttl')`); }
  catch (error) { ttlWriteDenied = error.code === "42501"; }
  assert(afterTtl.rows[0].count === 0 && ttlWriteDenied, "DB_TTL_BOUNDARY_FAILED");
  record("existing-session-after-database-ttl", "PASS", { visibleRows: 0, writeDenied: true });
  if (!poolerAuthenticated) {
    record("session-pooler-set-role", "BLOCKED", { reason: "local Supavisor rejected isolated role; direct PostgreSQL SET ROLE validated" });
    process.stdout.write(`U03_LOCAL_SECURITY_PARTIAL runId=${RUN_ID} secdef=${functions.length} scopeTables=${RELATIONS.length} directSetRole=pass pooler=blocked ttl=database-enforced\n`);
    process.exitCode = 2;
  } else {
    process.stdout.write(`U03_LOCAL_SECURITY_PARTIAL runId=${RUN_ID} secdef=${functions.length} scopeTables=${RELATIONS.length} directSetRole=pass pooler=auth-pass ttl=database-enforced\n`);
  }
}

async function cleanup() {
  await pool?.end().catch(() => {});
  try {
    if (probeCreated) admin(`drop table if exists ${PROBE};`);
    for (const policy of policiesCreated.reverse()) admin(`drop policy if exists ${ident(policy.name)} on ${policy.relation};`);
    if (roleCreated) {
      admin(`begin;\nalter role ${ident(LOGIN)} nologin;\nrevoke ${WRITER} from ${ident(LOGIN)};\ndrop role ${ident(LOGIN)};\ngrant execute on function ${RPCS[0]} to ${WRITER};\ngrant execute on function ${RPCS[1]} to ${WRITER};\ncommit;`);
    }
    record("finally-containment-and-rollback", "PASS", { rolePresent: false, policiesRemaining: 0, probePresent: false });
  } catch (error) {
    record("finally-containment-and-rollback", "BLOCKED", { code: error.message.slice(0, 64) });
    process.exitCode = 1;
  }
}

try { await main(); }
catch (error) {
  const candidate = String(error?.message ?? "");
  const clientCode = String(error?.code ?? "").toUpperCase();
  const code = /^[A-Z0-9_]{1,64}$/.test(candidate) ? candidate
    : /^[A-Z0-9_]{2,12}$/.test(clientCode) ? `CLIENT_${clientCode}` : "LOCAL_SECURITY_TEST_FAILED";
  record("campaign", "BLOCKED", { phase, code });
  process.stderr.write(`U03_LOCAL_SECURITY_BLOCKED phase=${phase} code=${code}\n`);
  process.exitCode = 1;
} finally { await cleanup(); }
