import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deriveTemporaryPassword, EXPECTED_DEFINERS, EXPECTED_N1_MIGRATIONS,
  createPreviewAdminPool, createPreviewRolePool, POOLER_HOST, PINNED_POOLER_CA, PREVIEW_REF, ROLE, WRITER,
  assertNodeClientTls, assertReadOnlyState, classifyDiagnosticError, diagnoseReadOnlyPreflight, PreflightConditionError,
  runIndependentContainment, runWindowRolePreflight, buildRunScopedPolicySql, buildRunScopedInstallSql,
  previewWindowRolePassword } from './u03-window-role-preflight.mjs';

const RUN = '5b02bb37-2ef8-4af1-8954-56fd496cd121';
const DB_PASSWORD = 'fictional:/?#% +&=[]quote!()*';
const secrets = [DB_PASSWORD, 'fictional-user-uuid-111111111111', 'fictional-project-uuid-222222222222'];

function freshState({ failNoLogin = false, failInstallAfterApply = false, failActivationAfterApply = false,
  failPoolerConnect = false, extraPreRoleDefiner = false, readOnlyError = null, readOnlyOverrides = {} } = {}) {
  return { role: false, login: false, expired: false, policies: 0, sessions: 0, failNoLogin,
    failInstallAfterApply, failActivationAfterApply, failPoolerConnect, extraPreRoleDefiner, readOnlyError, readOnlyOverrides,
    readOnlyQueries: 0, writeQueries: 0,
    marker: `u03-window:${RUN}` };
}
function createMocks(state) {
  const adminPoolFactory = () => new AdminPool(state);
  const rolePoolFactory = () => new RolePool(state);
  return { adminPoolFactory, rolePoolFactory };
}
const emptyCounts = { auth_users: 0, organizations: 0, organization_members: 0, projects: 0,
  project_members: 0, audit_events: 0, provider_results: 0, imports: 0, invitations: 0,
  audit_idempotency: 0, outbox_total: 0, pending_outbox: 0, openseo_project_jobs: 0,
  openseo_project_connections: 0, webmaster_properties: 0, provider_budgets: 0, provider_spend: 0,
  openseo_google_properties: 0, google_captures: 0, writer_locked: true };

class AdminPool {
  constructor(state) { this.state = state; this.options = { host: POOLER_HOST, port: 5432,
    ssl: { ca: PINNED_POOLER_CA, rejectUnauthorized: true, servername: POOLER_HOST } }; }
  async end() {}
  async connect() { return { connection: { stream: { encrypted: true, authorized: true, authorizationError: null } },
    query: (sql, params) => this.query(sql, params), release() {} }; }
  async query(sql, params = []) {
    if (sql.includes('select current_database()')) {
      this.state.readOnlyQueries++;
      if (this.state.readOnlyError) {
        const error = this.state.readOnlyError;
        this.state.readOnlyError = null;
        throw error;
      }
      assert.deepEqual(params, [PREVIEW_REF]);
      return { rows: [{ database_ok: true, exact_admin: true,
      exact_identity: true, closed_identity: true, migration_count: 27, latest_migration: '20261015210000',
      migrations: EXPECTED_N1_MIGRATIONS, writer_locked: true, may_manage_role: true, may_terminate_session: true,
      writer_sessions: this.state.sessions, writer_role_sessions: 0, temporary_role_sessions: this.state.sessions,
      temporary_role_count: Number(this.state.role),
      temporary_policy_count: this.state.policies, auth_users: 0, organizations: 0, organization_members: 0,
      projects: 0, project_members: 0, audit_events: 0, provider_results: 0, imports: 0,
      invitations: 0, audit_idempotency: 0, outbox_total: 0, pending_outbox: 0, openseo_project_jobs: 0,
      openseo_project_connections: 0, webmaster_properties: 0, provider_budgets: 0, provider_spend: 0,
      openseo_google_properties: 0, google_captures: 0, backend_tls_active: false, ...this.state.readOnlyOverrides }] };
    }
    if (sql.includes('from pg_proc p join pg_namespace')) return { rows: [{ executable: [...EXPECTED_DEFINERS], definers: [...EXPECTED_DEFINERS] }] };
    if (sql.includes('relrowsecurity')) return { rows: [{ n: 4 }] };
    if (sql.startsWith('begin;')) {
      this.state.writeQueries++;
      this.state.role = true; this.state.policies = 4;
      if (this.state.failInstallAfterApply) throw Object.assign(new Error(DB_PASSWORD), { code: 'ECONNRESET' });
      return { rows: [] };
    }
    if (sql.includes('select r.rolcanlogin')) return { rows: [{ rolcanlogin: this.state.login, rolsuper: false,
      rolbypassrls: false, rolinherit: false, rolcreaterole: false, rolcreatedb: false,
      marker: this.state.marker, set_only_membership: true, membership_count: 1 }] };
    if (sql.includes('from pg_policies where policyname = any')) {
      const tables = [['public','audit_events'],['public','provider_results'],['private','audit_idempotency'],['private','audit_outbox']];
      return { rows: Array.from({ length: this.state.policies }, (_, i) => ({
        policyname: `u03_preview_writer_${RUN.replaceAll('-','').slice(0,12)}_${tables[i][1]}`,
        schemaname: tables[i][0], tablename: tables[i][1], cmd: 'ALL', permissive: 'RESTRICTIVE', qual: 'false', with_check: 'false', roles: [WRITER] })) };
    }
    if (sql.includes('alter role rubik_preview_u03_writer with login')) {
      this.state.login = true;
      if (this.state.failActivationAfterApply) throw Object.assign(new Error(DB_PASSWORD), { code: 'ECONNRESET' });
      return { rows: [] };
    }
    if (sql.includes('select rolcanlogin and rolvaliduntil')) return { rows: [{ active: this.state.login }] };
    if (sql.includes('alter role rubik_preview_u03_writer valid until')) { this.state.expired = true; return { rows: [] }; }
    if (sql.includes("select shobj_description(oid,'pg_authid') as marker from pg_roles") ||
        sql.includes("select shobj_description(oid,'pg_authid') as marker,rolcanlogin\n      from pg_roles")) {
      return { rows: this.state.role ? [{ marker: this.state.marker }] : [] };
    }
    if (sql.includes('alter role rubik_preview_u03_writer nologin')) {
      if (this.state.failNoLogin) throw Object.assign(new Error(DB_PASSWORD), { code: '42501' });
      this.state.login = false; return { rows: [] };
    }
    if (sql.includes('select not rolcanlogin as locked')) return { rows: [{ locked: !this.state.login }] };
    if (sql.trim().startsWith('select oid from pg_roles')) return { rows: [{ oid: 7001 }] };
    if (sql.includes('pg_terminate_backend')) { this.state.sessions = 0; return { rows: [{ pg_terminate_backend: true }] }; }
    if (sql.includes('select count(*)::int as count from pg_stat_activity')) return { rows: [{ count: this.state.sessions }] };
    if (sql.includes("where usename='rubik_preview_u03_writer'")) return { rows: [{ count: this.state.sessions }] };
    if (sql.includes("select shobj_description(oid,'pg_authid') as marker,rolcanlogin")) return { rows: this.state.role ? [{ marker: this.state.marker, rolcanlogin: this.state.login }] : [] };
    if (sql.includes('select count(*)::int as n from pg_stat_activity')) return { rows: [{ n: this.state.sessions }] };
    if (sql.includes('select count(*)::int as n from pg_policies where policyname=any')) return { rows: [{ n: this.state.policies }] };
    if (sql.includes('select (select count(*) from auth.users)')) return { rows: [{ ...emptyCounts, ...this.state.readOnlyOverrides, writer_locked: true }] };
    if (sql.startsWith('drop policy')) { this.state.policies--; return { rows: [] }; }
    if (sql.startsWith('revoke rubik_audit_writer')) return { rows: [] };
    if (sql.startsWith('drop role rubik_preview_u03_writer')) { this.state.role = false; this.state.login = false; return { rows: [] }; }
    if (sql.includes('select exists(select 1 from pg_roles')) return { rows: [{ role_exists: this.state.role, policy_count: this.state.policies }] };
    throw new Error('UNEXPECTED_FAKE_ADMIN_QUERY');
  }
}
class RolePool {
  constructor(state) { this.state = state; this.options = { host: POOLER_HOST, port: 5432,
    ssl: { ca: PINNED_POOLER_CA, rejectUnauthorized: true, servername: POOLER_HOST } }; }
  async end() {}
  async connect() {
    if (this.state.login && this.state.failPoolerConnect) {
      this.state.failPoolerConnect = false;
      throw Object.assign(new Error(DB_PASSWORD), { code: 'ECONNRESET' });
    }
    if (!this.state.login || this.state.expired) throw Object.assign(new Error(DB_PASSWORD), { code: '28P01' });
    let setRole = false;
    const state = this.state;
    return { connection: { stream: { encrypted: true, authorized: true, authorizationError: null } }, release() {}, async query(sql) {
      if (sql.startsWith('set role')) { setRole = true; return { rows: [] }; }
      if (sql.includes('not has_table_privilege')) return { rows: [{ session_user: ROLE, current_user: ROLE,
        no_writer_privileges: true, no_results_privileges: true, no_outbox_privileges: true, no_auth_schema: true }] };
      if (sql.includes('has_table_privilege(current_user')) return { rows: [{ session_user: ROLE, current_user: setRole ? WRITER : ROLE,
        audit_insert: true, audit_select: true, result_insert: true, result_select: true, idempotency_insert: true,
        outbox_select: true, outbox_state_update: true, public_create: false, private_create: false,
        import_insert: false, imports_select: false, auth_schema: false, org_members_select: false, project_members_select: false,
        organizations_select: false, projects_select: false,
        audit_delete: false, outbox_delete: false, backend_tls_active: false }] };
      if (sql.includes('from pg_proc p join pg_namespace')) return { rows: [{ executable: [...EXPECTED_DEFINERS],
        definers: !setRole && state.extraPreRoleDefiner ? [...EXPECTED_DEFINERS, 'public.unsafe_definer()'] : [...EXPECTED_DEFINERS] }] };
      if (sql.includes('relrowsecurity')) return { rows: [{ rls_count: 4 }] };
      if (sql.includes('audit_hidden')) return { rows: [{ audit_hidden: true, results_hidden: true, receipts_hidden: true, outbox_hidden: true }] };
      throw new Error('UNEXPECTED_FAKE_ROLE_QUERY');
    } };
  }
}

async function runWithFault(faultAt, { failNoLogin = false } = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'u03-window-role-'));
  const ledgerPath = join(folder, 'run.jsonl');
  const state = freshState({ failNoLogin, failInstallAfterApply: faultAt === 'install',
    failActivationAfterApply: faultAt === 'activation', failPoolerConnect: faultAt === 'pooler' });
  try {
    const result = await runWindowRolePreflight({ databasePassword: DB_PASSWORD, runId: RUN,
      ledgerPath, faultAt, ...createMocks(state) });
    return { result, state, ledger: await (await import('node:fs/promises')).readFile(ledgerPath, 'utf8') };
  } finally { await rm(folder, { recursive: true, force: true }); }
}

test('pins Preview Session pooler, expected role contract and derived secret without producing a URL', () => {
  assert.equal(PREVIEW_REF, 'rhnnplewqsekrnaousyl');
  assert.equal(POOLER_HOST, 'aws-1-eu-west-3.pooler.supabase.com');
  assert.equal(ROLE, 'rubik_preview_u03_writer');
  assert.equal(WRITER, 'rubik_audit_writer');
  assert.deepEqual(EXPECTED_DEFINERS, ['private.audit_writer_actor(uuid, uuid)', 'private.audit_writer_project(uuid)']);
  assert.equal(EXPECTED_N1_MIGRATIONS.length, 27);
  const one = deriveTemporaryPassword(DB_PASSWORD, RUN);
  assert.equal(one, deriveTemporaryPassword(DB_PASSWORD, RUN));
  assert.doesNotMatch(one, /[/:?#[\]@%]/);
  assert.notEqual(one, DB_PASSWORD);
});

test('read-only preflight counts the actual run-window policy namespace', async () => {
  const pool = createPreviewAdminPool(DB_PASSWORD, class CapturePool { constructor(config) { this.config = config; } on() {} });
  assert.match(pool.config.user, /^postgres\./);
  const source = (await readFile(new URL('./u03-window-role-preflight.mjs', import.meta.url), 'utf8'));
  assert.match(source, /pg_policies where policyname like 'u03_preview_writer_%'\) as temporary_policy_count/);
  assert.doesNotMatch(source, /pg_policies where policyname like 'u03_preflight_writer_%'/);
});

test('temporary role credential is accepted only from the exact Preview writer Session pooler URL', () => {
  const password = 'FictionalRolePassword_123456789012345678901234';
  const url = new URL('postgresql://rubik_preview_u03_writer.rhnnplewqsekrnaousyl@aws-1-eu-west-3.pooler.supabase.com:5432/postgres');
  url.password = password;
  url.searchParams.set('options', '-c role=rubik_audit_writer');
  assert.equal(previewWindowRolePassword({ RUBIK_AUDIT_DATABASE_URL: url.toString() }), password);
  url.hostname = 'another.pooler.supabase.com';
  assert.throws(() => previewWindowRolePassword({ RUBIK_AUDIT_DATABASE_URL: url.toString() }), /TEMP_ROLE_CREDENTIAL_INVALID/);
  assert.throws(() => previewWindowRolePassword({}), /TEMP_ROLE_CREDENTIAL_MISSING/);
});

test('readonly diagnostic classifies transport, TLS, SQLSTATE and explicit preflight conditions without messages', async () => {
  const cases = [
    [Object.assign(new Error(DB_PASSWORD), { code: 'ENOTFOUND' }), 'DNS', 'ENOTFOUND', null],
    [Object.assign(new Error(DB_PASSWORD), { cause: Object.assign(new Error('private'), { code: 'ECONNRESET' }) }), 'TCP', 'ECONNRESET', null],
    [Object.assign(new Error(DB_PASSWORD), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' }), 'TLS', 'ERR_TLS_CERT_ALTNAME_INVALID', null],
    [Object.assign(new Error(DB_PASSWORD), { code: 'ERR_SSL_UNEXPECTED_PACKET' }), 'TLS', 'TLS_ERROR_UNCLASSIFIED', null],
    [Object.assign(new Error(DB_PASSWORD), { code: 'EPIPE' }), 'TCP', 'EPIPE', null],
    [Object.assign(new Error(DB_PASSWORD), { code: '28P01' }), 'AUTHENTICATION', 'SQLSTATE_28P01', '28P01'],
    [Object.assign(new Error(DB_PASSWORD), { code: '42501' }), 'PERMISSION', 'SQLSTATE_42501', '42501'],
    [Object.assign(new Error(DB_PASSWORD), { code: '42502' }), 'DATABASE', 'DATABASE_ERROR_UNCLASSIFIED', null],
  ];
  for (const [error, category, code, sqlstate] of cases) {
    const classified = classifyDiagnosticError(error);
    assert.deepEqual([classified.category, classified.code, classified.sqlstate], [category, code, sqlstate]);
    assert.doesNotMatch(JSON.stringify(classified), /fictional|private|password|postgres/i);
  }
  const condition = classifyDiagnosticError(new PreflightConditionError('MIGRATION_SET_MISMATCH'));
  assert.deepEqual(condition, { category: 'PREFLIGHT', code: 'MIGRATION_SET_MISMATCH',
    sqlstate: null, condition: 'MIGRATION_SET_MISMATCH' });
  const state = freshState();
  const folder = await mkdtemp(join(tmpdir(), 'u03-window-readonly-diagnostic-'));
  const ledgerPath = join(folder, 'diagnostic.jsonl');
  try {
    const result = await diagnoseReadOnlyPreflight({ databasePassword: DB_PASSWORD, runId: RUN,
      ledgerPath, ...createMocks(state) });
    assert.equal(result.status, 'PASS');
    assert.deepEqual(result.checks, ['IDENTITY','MIGRATIONS','WRITER_LOCK','ADMIN_CAPABILITIES','INVENTORY','OUTBOX','CLIENT_TLS']);
    assert.equal(state.role, false);
    assert.equal(state.policies, 0);
    assert.equal(state.readOnlyQueries, 1);
    assert.equal(state.writeQueries, 0);
    const ledger = await readFile(ledgerPath, 'utf8');
    assert.match(ledger, /readonly-diagnostic.*PREFLIGHT.*PASS/);
    for (const secret of secrets) assert.equal(ledger.includes(secret), false);
  } finally { await rm(folder, { recursive: true, force: true }); }

  const blockedFolder = await mkdtemp(join(tmpdir(), 'u03-window-readonly-condition-'));
  const blockedPath = join(blockedFolder, 'diagnostic.jsonl');
  const blockedState = freshState({ readOnlyOverrides: { migration_count: 26 } });
  try {
    const result = await diagnoseReadOnlyPreflight({ databasePassword: DB_PASSWORD, runId: RUN,
      ledgerPath: blockedPath, ...createMocks(blockedState) });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.category, 'PREFLIGHT');
    assert.equal(result.condition, 'MIGRATION_SET_MISMATCH');
    assert.equal(blockedState.writeQueries, 0);
    const ledger = await readFile(blockedPath, 'utf8');
    assert.match(ledger, /MIGRATION_SET_MISMATCH/);
    for (const secret of secrets) assert.equal(ledger.includes(secret), false);
  } finally { await rm(blockedFolder, { recursive: true, force: true }); }
});

test('first-query transient is classified and finally independently verifies absent role without containment warning', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'u03-window-role-first-read-failure-'));
  const ledgerPath = join(folder, 'run.jsonl');
  const state = freshState({ readOnlyError: Object.assign(new Error(DB_PASSWORD), { code: 'EAI_AGAIN' }) });
  try {
    await assert.rejects(runWindowRolePreflight({ databasePassword: DB_PASSWORD, runId: RUN,
      ledgerPath, ...createMocks(state) }), /WINDOW_ROLE_PREFLIGHT_BLOCKED/);
    assert.equal(state.role, false);
    assert.equal(state.policies, 0);
    const ledger = await readFile(ledgerPath, 'utf8');
    assert.match(ledger, /operator-phase-failure.*DNS.*EAI_AGAIN/);
    assert.match(ledger, /finally-independent-containment.*CONTAINMENT.*PASS/);
    assert.doesNotMatch(ledger, /finally-independent-containment.*BLOCKED/);
    for (const secret of secrets) assert.equal(ledger.includes(secret), false);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('missing SQL result columns and concrete failed conditions do not collapse into nonempty-inventory', () => {
  assert.throws(() => assertReadOnlyState({}), error => {
    assert.ok(error instanceof PreflightConditionError);
    assert.equal(error.condition, 'PREVIEW_READ_ONLY_RESULT_SCHEMA_INCOMPLETE');
    return true;
  });
  const row = { database_ok: true, exact_admin: true, exact_identity: false, closed_identity: true,
    migration_count: 27, latest_migration: '20261015210000', migrations: EXPECTED_N1_MIGRATIONS,
    writer_locked: true, may_manage_role: true, may_terminate_session: true, writer_sessions: 0,
    writer_role_sessions: 0, temporary_role_sessions: 0, temporary_role_count: 0,
    temporary_policy_count: 0, backend_tls_active: false, ...emptyCounts };
  assert.throws(() => assertReadOnlyState(row), error => error.condition === 'PREVIEW_IDENTITY_MISMATCH');
  assert.throws(() => assertReadOnlyState({ ...row, exact_identity: true, audit_events: 1 }),
    error => error.condition === 'INVENTORY_NOT_EMPTY');
});

test('admin and temporary role pools use only the pinned TLS Session pooler and pass reserved password bytes directly', () => {
  const instances = [];
  class CapturePool { constructor(config) { this.config = config; instances.push(this); } on() {} }
  const admin = createPreviewAdminPool(DB_PASSWORD, CapturePool);
  const role = createPreviewRolePool('fictional-generated-role-password', CapturePool);
  assert.deepEqual([admin.config.host, admin.config.port, admin.config.database, admin.config.user],
    [POOLER_HOST, 5432, 'postgres', `postgres.${PREVIEW_REF}`]);
  assert.equal(admin.config.password, DB_PASSWORD);
  assert.deepEqual([role.config.host, role.config.port, role.config.user],
    [POOLER_HOST, 5432, `${ROLE}.${PREVIEW_REF}`]);
  for (const pool of instances) {
    assert.equal(pool.config.ssl.rejectUnauthorized, true);
    assert.equal(pool.config.ssl.servername, POOLER_HOST);
    assert.match(pool.config.ssl.ca, /BEGIN CERTIFICATE/);
  }
  assert.doesNotMatch(JSON.stringify(instances.map(pool => ({ host: pool.config.host, user: pool.config.user }))), /:\/\//);
});

test('client TLS is proven from node-postgres TLSSocket and pinned config, independently of backend pg_stat_ssl', async () => {
  const state = freshState({ readOnlyOverrides: { backend_tls_active: false } });
  const folder = await mkdtemp(join(tmpdir(), 'u03-client-tls-proof-'));
  try {
    const result = await diagnoseReadOnlyPreflight({ databasePassword: DB_PASSWORD, runId: RUN,
      ledgerPath: join(folder, 'run.jsonl'), ...createMocks(state) });
    assert.equal(result.status, 'PASS');
    assert.ok(result.checks.includes('CLIENT_TLS'));
    const validPool = new AdminPool(state);
    const validClient = await validPool.connect();
    assert.equal(assertNodeClientTls(validClient, validPool), true);

    for (const invalid of [
      { options: { ...validPool.options, ssl: { ...validPool.options.ssl, ca: 'wrong-ca' } }, client: validClient },
      { options: { ...validPool.options, host: 'external.invalid' }, client: validClient },
      { options: { ...validPool.options, ssl: { ...validPool.options.ssl, servername: 'external.invalid' } }, client: validClient },
      { options: { ...validPool.options, ssl: false }, client: validClient },
      { options: validPool.options, client: { connection: { stream: { encrypted: false, authorized: false } } } },
      { options: validPool.options, client: { connection: { stream: { encrypted: true, authorized: false,
        authorizationError: 'CERT_HAS_EXPIRED' } } } },
    ]) assert.throws(() => assertNodeClientTls(invalid.client, invalid), error =>
      error instanceof PreflightConditionError && error.condition === 'TLS_VERIFICATION_FAILED');

    const noTlsPoolFactory = () => {
      const pool = new AdminPool(state);
      pool.options.ssl = false;
      pool.connect = async () => ({ connection: { stream: { encrypted: false, authorized: false } },
        query: (sql, params) => pool.query(sql, params), release() {} });
      return pool;
};

test('run-scoped restrictive policies allow only this run A1/A2 and B1 project identities', () => {
  const sql = buildRunScopedPolicySql(RUN, '2030-01-01T00:00:00.000Z');
  assert.equal((sql.match(/create policy/g) ?? []).length, 4);
  assert.match(sql, /as restrictive for all to rubik_audit_writer/);
  assert.match(sql, /u03-5b02bb372ef8-a/);
  assert.match(sql, /u03-5b02bb372ef8-b/);
  assert.match(sql, /s\.project_slug in \('a1','a2'\)/);
  assert.match(sql, /s\.project_slug = 'b1'/);
  assert.doesNotMatch(sql, /using \(true\)|with check \(true\)/i);
  assert.match(sql, /statement_timestamp\(\) < '2030-01-01T00:00:00.000Z'::timestamptz/);
  assert.throws(() => buildRunScopedPolicySql('not-a-run-id', '2030-01-01T00:00:00.000Z'), /RUN_SCOPE_EXPIRY_REJECTED/);
});

test('campaign role installation is NOLOGIN first, NOINHERIT and run/TLL-scoped without general grants', () => {
  const expiry = new Date(Date.now() + 15 * 60_000).toISOString();
  const sql = buildRunScopedInstallSql(RUN, 'fictional-generated-password-that-is-not-a-secret', expiry);
  const createRole = sql.match(/create role[^\n]+/i)?.[0] ?? '';
  assert.match(createRole, /rubik_preview_u03_writer nologin noinherit nobypassrls nosuperuser/i);
  assert.doesNotMatch(createRole, /(?<!no)bypassrls/i);
  assert.match(sql, /valid until/);
  assert.match(sql, /grant rubik_audit_writer to rubik_preview_u03_writer with inherit false, set true/);
  assert.match(sql, /as restrictive for all to rubik_audit_writer/);
  assert.doesNotMatch(sql, /grant all|security definer/i);
  assert.throws(() => buildRunScopedInstallSql(RUN, 'short', expiry), /RUN_SCOPE_INSTALL_INPUT_REJECTED/);
  assert.throws(() => buildRunScopedInstallSql(RUN, 'fictional-generated-password-that-is-not-a-secret',
    new Date(Date.now() + 31 * 60_000).toISOString()), /RUN_SCOPE_INSTALL_INPUT_REJECTED/);
});
    const noTls = await diagnoseReadOnlyPreflight({ databasePassword: DB_PASSWORD, runId: RUN,
      ledgerPath: join(folder, 'no-tls.jsonl'), adminPoolFactory: noTlsPoolFactory });
    assert.equal(noTls.status, 'BLOCKED');
    assert.equal(noTls.code, 'TLS_VERIFICATION_FAILED');
    assert.equal(state.readOnlyQueries, 1, 'TLS failure must block before executing READ_ONLY_SQL');
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('successful simulated run verifies fail-closed pooler identity then removes only its role and policies', async () => {
  const { result, state, ledger } = await runWithFault(null);
  assert.equal(result.status, 'PASS');
  assert.equal(state.role, false);
  assert.equal(state.policies, 0);
  assert.equal(result.final.inventoryZero, true);
  assert.equal(result.final.pendingOutbox, 0);
  assert.match(ledger, /preview-session-pooler-set-role.*POOLER.*PASS/);
  assert.match(ledger, /expired-login-rejected.*POOLER.*PASS.*28P01/);
  const phases = ledger.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line).phase);
  assert.ok(phases.indexOf('install-nologin-role-and-deny-policies') < phases.indexOf('independent-nologin-terminate-probe'));
  assert.ok(phases.indexOf('independent-nologin-terminate-probe') < phases.indexOf('activate-three-minute-role'));
  assert.ok(phases.indexOf('activate-three-minute-role') < phases.indexOf('preview-session-pooler-set-role'));
  assert.ok(phases.indexOf('preview-session-pooler-set-role') < phases.indexOf('expired-login-rejected'));
  assert.ok(phases.indexOf('expired-login-rejected') < phases.indexOf('finally-independent-containment'));
  for (const secret of secrets) assert.equal(ledger.includes(secret), false);
});

test('installation, activation and pooler failures still enter independent NOLOGIN containment and rollback', async () => {
  for (const fault of ['install', 'activation', 'pooler']) {
    const folder = await mkdtemp(join(tmpdir(), 'u03-window-role-fault-'));
    const ledgerPath = join(folder, 'run.jsonl');
    const state = freshState({ failInstallAfterApply: fault === 'install',
      failActivationAfterApply: fault === 'activation', failPoolerConnect: fault === 'pooler' });
    await assert.rejects(runWindowRolePreflight({ databasePassword: DB_PASSWORD, runId: RUN,
      ledgerPath, faultAt: fault, ...createMocks(state) }), /WINDOW_ROLE_PREFLIGHT_BLOCKED/);
    const ledger = await (await import('node:fs/promises')).readFile(ledgerPath, 'utf8');
    assert.equal(state.role, false);
    assert.equal(state.policies, 0);
    assert.match(ledger, /finally-independent-containment.*CONTAINMENT.*PASS/);
    assert.match(ledger, /operator-phase-failure.*BLOCKED/);
    for (const secret of secrets) assert.equal(ledger.includes(secret), false);
    await rm(folder, { recursive: true, force: true });
  }
});

test('failed independent NOLOGIN containment remains BLOCKED and never claims cleanup', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'u03-window-role-contain-fail-'));
  const ledgerPath = join(folder, 'run.jsonl');
  const state = freshState({ failNoLogin: true });
  await assert.rejects(runWindowRolePreflight({ databasePassword: DB_PASSWORD, runId: RUN,
    ledgerPath, faultAt: 'pooler', ...createMocks(state) }), /WINDOW_ROLE_PREFLIGHT_BLOCKED/);
  const ledger = await (await import('node:fs/promises')).readFile(ledgerPath, 'utf8');
  assert.equal(state.role, true);
  assert.match(ledger, /finally-independent-containment.*BLOCKED/);
  assert.doesNotMatch(ledger, /finally-independent-containment.*PASS/);
  for (const secret of secrets) assert.equal(ledger.includes(secret), false);
  await rm(folder, { recursive: true, force: true });
});

test('extra SECURITY DEFINER reachable before SET ROLE blocks and rolls back the temporary role', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'u03-window-role-public-definer-'));
  const ledgerPath = join(folder, 'run.jsonl');
  const state = freshState({ extraPreRoleDefiner: true });
  try {
    await assert.rejects(runWindowRolePreflight({ databasePassword: DB_PASSWORD, runId: RUN,
      ledgerPath, ...createMocks(state) }), /WINDOW_ROLE_PREFLIGHT_BLOCKED/);
    assert.equal(state.role, false);
    assert.equal(state.policies, 0);
    const ledger = await readFile(ledgerPath, 'utf8');
    assert.doesNotMatch(ledger, /unsafe_definer|public\./);
    assert.match(ledger, /finally-independent-containment.*CONTAINMENT.*PASS/);
    for (const secret of secrets) assert.equal(ledger.includes(secret), false);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('contain-only mode independently blocks, terminates and removes the owned role after a parent-process failure', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'u03-window-role-contain-only-'));
  const ledgerPath = join(folder, 'run.jsonl');
  const state = freshState();
  state.role = true; state.login = true; state.sessions = 1; state.policies = 4;
  try {
    const final = await runIndependentContainment({ databasePassword: DB_PASSWORD, runId: RUN,
      ledgerPath, ...createMocks(state) });
    assert.equal(state.role, false);
    assert.equal(state.policies, 0);
    assert.equal(final.activeSessions, 0);
    const ledger = await readFile(ledgerPath, 'utf8');
    assert.match(ledger, /containment-only-final-state.*ROLLBACK.*PASS/);
    for (const secret of secrets) assert.equal(ledger.includes(secret), false);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('contain-only mode verifies absent role and independent zero state without attempting NOLOGIN', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'u03-window-role-already-absent-'));
  const ledgerPath = join(folder, 'run.jsonl');
  const state = freshState();
  const { adminPoolFactory } = createMocks(state);
  try {
    const final = await runIndependentContainment({ databasePassword: DB_PASSWORD, runId: RUN,
      ledgerPath, adminPoolFactory, rolePoolFactory: () => { throw new Error('must not connect absent role'); } });
    assert.equal(final.rolePresent, false);
    assert.equal(final.roleLocked, null);
    assert.equal(final.activeSessions, 0);
    assert.equal(final.inventoryZero, true);
    assert.equal(state.role, false);
    assert.equal(state.policies, 0);
    const ledger = await readFile(ledgerPath, 'utf8');
    assert.match(ledger, /containment-only-final-state.*ROLLBACK.*PASS/);
    assert.doesNotMatch(ledger, /BLOCKED|CONTAINMENT/);
    for (const secret of secrets) assert.equal(ledger.includes(secret), false);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('containment blocks and terminates the owned role before refusing rollback on residual fixtures/outbox', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'u03-window-role-residue-'));
  const state = freshState({ readOnlyOverrides: { audit_events: 1, outbox_total: 1, pending_outbox: 1 } });
  state.role = true; state.login = true; state.policies = 4; state.sessions = 2;
  try {
    await assert.rejects(runIndependentContainment({ databasePassword: DB_PASSWORD, runId: RUN,
      ledgerPath: join(folder, 'run.jsonl'), ...createMocks(state) }), /INDEPENDENT_CONTAINMENT_BLOCKED/);
    assert.equal(state.login, false);
    assert.equal(state.sessions, 0);
    assert.equal(state.role, true);
    assert.equal(state.policies, 4);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('PowerShell mode prompts once and always launches an independent contain-only child', async () => {
  const ps = await readFile(new URL('./u03-preview-b4-owner.ps1', import.meta.url), 'utf8');
  assert.match(ps, /\[switch\]\$WindowRolePreflightOnly/);
  assert.match(ps, /\[switch\]\$WindowRoleReadOnlyDiagnosticOnly/);
  assert.match(ps, /Invoke-U03WindowRoleChild -Mode \$childMode/);
  assert.match(ps, /if \(\$WindowRoleReadOnlyDiagnosticOnly\) \{ 'diagnose' \}/);
  assert.match(ps, /if \(\$WindowRolePreflightOnly -or \$WindowRoleReadOnlyDiagnosticOnly -or \$WindowI2I5H1A -or \$WindowBatchAttestationOnly\)/);
  assert.match(ps, /if \(-not \$WindowRolePreflightOnly -and -not \$WindowRoleReadOnlyDiagnosticOnly -and -not \$WindowI2I5H1A/);
  assert.match(ps, /\$WindowI2I5H1A[\s\S]*Invoke-U03WindowRoleChild -Mode 'contain'/);
  assert.ok(ps.indexOf('elseif ($PlaywrightOnly)') > ps.indexOf('if ($ProviderEgressOnly)'));
  assert.doesNotMatch(ps, /if \(\$windowRolePlainPassword\)[\s\S]{0,150}elseif \(\$PlaywrightOnly\)/);
  assert.match(ps, /Read-Host -Prompt 'Database password existente[^\n]*-AsSecureString/);
  assert.match(ps, /Invoke-U03WindowRoleChild -Mode 'run'/);
  assert.match(ps, /finally \{[\s\S]*Invoke-U03WindowRoleChild -Mode 'contain'/);
  assert.match(ps, /RedirectStandardInput = \$true/);
  assert.match(ps, /StandardInput\.BaseStream/);
  assert.match(ps, /\[Text\.UTF8Encoding\]::new\(\$false\)\.GetBytes/);
  assert.doesNotMatch(ps, /StandardInputEncoding/);
  assert.match(ps, /catch \{\s*\$windowRoleContainFailed = \$true\s*\}/);
  assert.doesNotMatch(ps, /--database-password|--connection-string|U03_WINDOW_ROLE_DATABASE_PASSWORD/);
  assert.match(ps, /WINDOW_ROLE_DEPLOYMENT_PIN_REJECTED/);
  assert.ok(ps.indexOf('& node $runner --readonly-preflight') < ps.indexOf('& node $runner --credential-preflight-only'));
  assert.ok(ps.indexOf('& node $runner --credential-preflight-only') < ps.indexOf("Read-Host -Prompt 'Database password existente"));
  assert.match(ps, /WINDOW_ROLE_PREVIEW_CREDENTIALS_UNAVAILABLE/);
  const resultLine = ps.match(/'(?=\^U03_WINDOW_ROLE_RESULT \(PASS\|BLOCKED\))([^\n]+)'/u)?.[1];
  const containLine = ps.match(/'(?=\^U03_WINDOW_ROLE_CONTAINMENT PASS)([^\n]+)'/u)?.[1];
  assert.ok(resultLine);
  assert.ok(containLine);
  assert.match('U03_WINDOW_ROLE_RESULT PASS runId=5b02bb37-2ef8-4af1-8954-56fd496cd121 roleRemoved=true policies=0 inventoryZero=true outboxTotal=0 pending=0', new RegExp(resultLine));
  assert.match('U03_WINDOW_ROLE_CONTAINMENT PASS runId=5b02bb37-2ef8-4af1-8954-56fd496cd121 rolePresent=false roleLocked=null policies=0 activeSessions=0 inventoryZero=true outboxTotal=0 pending=0', new RegExp(containLine));
});

test('real Windows PowerShell 5.1 wrapper transports fictional non-ASCII JSON and contains a failed child in finally', async t => {
  if (process.platform !== 'win32') { t.skip('Windows PowerShell 5.1 process test'); return; }
  const script = new URL('./u03-preview-b4-owner.ps1', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-WindowRoleTransportSelfTestOnly'], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /U03_WINDOW_ROLE_CONTAINMENT PASS/);
  assert.match(result.stdout, /U03_WINDOW_ROLE_TRANSPORT_SELFTEST PASS utf8NonAscii=true simulatedChildFailure=true diagnosticOutputSanitized=true finallyContainment=true preparationFailureSafe=true/);
  assert.doesNotMatch(result.stdout + result.stderr, /Ficticia|東京|🔐|databasePassword|StandardInputEncoding/);
});

test('optional Windows PowerShell parser accepts the visible operator', async t => {
  if (process.platform !== 'win32') { t.skip('Windows PowerShell parser'); return; }
  const script = new URL('./u03-preview-b4-owner.ps1', import.meta.url).pathname.replace(/^\//, '').replaceAll('/', '\\');
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile('${script.replaceAll("'", "''")}',[ref]$tokens,[ref]$errors) > $null; if ($errors.Count) { exit 2 }`], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
});
