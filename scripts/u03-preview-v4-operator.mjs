import { randomBytes, timingSafeEqual } from 'node:crypto';
import { register } from 'node:module';
import { lookup } from 'node:dns/promises';
import { createConnection } from 'node:net';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from 'pg';

register('./lib/app-ts-hooks.mjs', import.meta.url);

import { PREFLIGHT_SQL, verifyInitialPreviewState, verifyReadOnlyPreviewState,
  runHostedU03Campaign, safeLedgerDetail } from './u03-preview-b4-orchestrator.mjs';
import { PREVIEW_REF, RECEIPT_ROLE, openPreviewReceiptProcessor } from './u03-preview-v4-receipt.mjs';

const ROOT = process.cwd();
const SQL_DIR = join(dirname(fileURLToPath(import.meta.url)));
const RUN_MARKER_PREFIX = 'u03-v4-run:';
const N1_LATEST = '20261015210000';
const PREVIEW_POOLER_HOST = 'aws-1-eu-west-3.pooler.supabase.com';
const SQL_PATHS = Object.freeze({
  install: join(SQL_DIR, 'u03-preview-v4-role.sql'),
  activate: join(SQL_DIR, 'u03-preview-v4-activate.sql'),
  block: join(SQL_DIR, 'u03-preview-v4-block.sql'),
  rollback: join(SQL_DIR, 'u03-preview-v4-rollback.sql'),
});

export function validatePreviewAdminPoolerUrl(raw, { allowLocal = false } = {}) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('V4_ADMIN_DATABASE_URL_INVALID'); }
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const local = allowLocal && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'postgresql:' || url.pathname !== '/postgres' || url.port !== (local ? '62322' : '5432') ||
      !password || url.hash || [...url.searchParams.keys()].length ||
      (!local && (url.hostname !== PREVIEW_POOLER_HOST || username !== `postgres.${PREVIEW_REF}`)) ||
      (local && username !== 'postgres')) throw new Error('V4_ADMIN_DATABASE_URL_INVALID');
  return { url, local };
}

export function verifyPreviewAdminPasswordTransport(rawUrl, expectedPassword) {
  if (typeof expectedPassword !== 'string' || expectedPassword.length === 0)
    return safeDiagnosticFailure('CONFIGURATION', 'PASSWORD_COMPARISON_INPUT_MISSING');
  try {
    const { url } = validatePreviewAdminPoolerUrl(rawUrl);
    const actualBytes = Buffer.from(decodeURIComponent(url.password), 'utf8');
    const expectedBytes = Buffer.from(expectedPassword, 'utf8');
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes))
      return safeDiagnosticFailure('CONFIGURATION', 'URL_PASSWORD_BYTES_MISMATCH');
    return { status: 'PASS', category: 'TRANSPORT', code: 'URL_PASSWORD_BYTES_MATCH' };
  } catch {
    return safeDiagnosticFailure('CONFIGURATION', 'URL_PASSWORD_BYTES_MISMATCH');
  }
}

export async function createPreviewAdminPool(rawUrl, { PoolClass = Pool, allowLocal = false, ca, skipDns = false } = {}) {
  const parsed = validatePreviewAdminPoolerUrl(rawUrl, { allowLocal });
  if (!parsed.local) {
    if (!skipDns) {
      const addresses = await lookup(parsed.url.hostname, { all: true });
      if (!addresses.some(address => address.family === 4)) throw new Error('V4_SESSION_POOLER_IPV4_UNAVAILABLE');
    }
    if (!ca) {
      const { SUPABASE_ROOT_2021_CA } = await import('../src/lib/provenance/supabase-root-ca.ts');
      ca = SUPABASE_ROOT_2021_CA;
    }
  }
  return new PoolClass({ connectionString: rawUrl, max: 1, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000, ssl: parsed.local ? false : { rejectUnauthorized: true, ca } });
}

const ADMIN_DIAGNOSTIC_SQL = `select current_database() = 'postgres' as database_ok,
    session_user = current_user as session_identity_ok,
    (select rolsuper or rolcreaterole from pg_roles where rolname = current_user) as may_create_role,
    (select count(*) = 1 from private.environment_identity where environment='preview' and project_ref=$1) as exact_identity,
    (select count(*) = 1 from private.environment_identity) as closed_identity`;
const TLS_ERROR_CODES = new Set(['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'ERR_SSL_WRONG_VERSION_NUMBER', 'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA']);

function safeDiagnosticFailure(category, code) { return { status: 'FAIL', category, code }; }

export function classifyPreviewAdminError(error, phase) {
  const codes = [];
  const queue = [error];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (typeof current.code === 'string') codes.push(current.code.toUpperCase());
    if (current.cause) queue.push(current.cause);
    if (Array.isArray(current.errors)) queue.push(...current.errors);
  }
  if (codes.some(code => TLS_ERROR_CODES.has(code) || code.startsWith('ERR_SSL_') || code.startsWith('ERR_TLS_')))
    return safeDiagnosticFailure('TLS', 'TLS_CERTIFICATE_OR_HANDSHAKE_REJECTED');
  if (codes.some(code => code.startsWith('28'))) return safeDiagnosticFailure('AUTHENTICATION', 'DATABASE_AUTHENTICATION_REJECTED');
  if (codes.includes('42501')) return safeDiagnosticFailure('PERMISSION', 'SQL_PERMISSION_DENIED');
  if (phase === 'dns') return safeDiagnosticFailure('DNS', 'DNS_RESOLUTION_FAILED');
  if (phase === 'tcp') {
    if (codes.includes('ETIMEDOUT')) return safeDiagnosticFailure('TCP', 'TCP_CONNECTION_TIMEOUT');
    if (codes.includes('ECONNREFUSED')) return safeDiagnosticFailure('TCP', 'TCP_CONNECTION_REFUSED');
    return safeDiagnosticFailure('TCP', 'TCP_CONNECTION_FAILED');
  }
  if (phase === 'connect') {
    if (codes.includes('ETIMEDOUT')) return safeDiagnosticFailure('TCP', 'TCP_CONNECTION_TIMEOUT');
    if (codes.includes('ECONNREFUSED')) return safeDiagnosticFailure('TCP', 'TCP_CONNECTION_REFUSED');
    return safeDiagnosticFailure('TLS', 'TLS_OR_DATABASE_HANDSHAKE_FAILED');
  }
  if (phase === 'permission') return safeDiagnosticFailure('PERMISSION', 'READ_ONLY_SQL_PERMISSION_DENIED');
  return safeDiagnosticFailure('DATABASE', 'READ_ONLY_DATABASE_CHECK_FAILED');
}

function tcpProbe(host, port, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const timer = setTimeout(() => {
      const error = new Error('TCP_TIMEOUT');
      error.code = 'ETIMEDOUT';
      socket.destroy(error);
    }, timeoutMs);
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(); });
    socket.once('error', error => { clearTimeout(timer); reject(error); });
  });
}

export async function diagnosePreviewAdminConnection(rawUrl, {
  PoolClass = Pool, lookupFn = lookup, tcpProbeFn = tcpProbe, ca,
  allowLocal = false, stateValidator = verifyReadOnlyPreviewState,
} = {}) {
  let parsed;
  try { parsed = validatePreviewAdminPoolerUrl(rawUrl, { allowLocal }); }
  catch { return safeDiagnosticFailure('CONFIGURATION', 'PREVIEW_DATABASE_TARGET_REJECTED'); }

  if (!parsed.local) {
    try {
      const addresses = await lookupFn(parsed.url.hostname, { all: true });
      if (!addresses.some(address => address.family === 4)) return safeDiagnosticFailure('DNS', 'SESSION_POOLER_IPV4_UNAVAILABLE');
    } catch (error) { return classifyPreviewAdminError(error, 'dns'); }
  }
  try { await tcpProbeFn(parsed.url.hostname, Number(parsed.url.port), 5000); }
  catch (error) { return classifyPreviewAdminError(error, 'tcp'); }

  let pool;
  let client;
  try {
    if (!parsed.local && !ca) {
      const { SUPABASE_ROOT_2021_CA } = await import('../src/lib/provenance/supabase-root-ca.ts');
      ca = SUPABASE_ROOT_2021_CA;
    }
    pool = new PoolClass({ connectionString: rawUrl, max: 1, connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000, ssl: parsed.local ? false : { rejectUnauthorized: true, ca } });
    try { client = await pool.connect(); }
    catch (error) { return classifyPreviewAdminError(error, 'connect'); }

    let admin;
    try { admin = (await client.query(ADMIN_DIAGNOSTIC_SQL, [PREVIEW_REF])).rows[0]; }
    catch (error) { return classifyPreviewAdminError(error, 'permission'); }
    if (!admin || !admin.database_ok || !admin.session_identity_ok || !admin.exact_identity || !admin.closed_identity)
      return safeDiagnosticFailure('IDENTITY', 'PREVIEW_DATABASE_IDENTITY_REJECTED');
    if (!admin.may_create_role) return safeDiagnosticFailure('CAPABILITY', 'ADMIN_CREATE_ROLE_CAPABILITY_MISSING');

    let state;
    try { state = (await client.query(PREFLIGHT_SQL)).rows[0]; }
    catch (error) { return classifyPreviewAdminError(error, 'permission'); }
    try { await stateValidator({ sql: async () => state }); }
    catch { return safeDiagnosticFailure('PRECONDITION', 'PREVIEW_READ_ONLY_PREFLIGHT_REJECTED'); }
    if (state.receipt_writer_present) return safeDiagnosticFailure('CAPABILITY', 'TEMP_RECEIPT_ROLE_ALREADY_PRESENT');
    return { status: 'PASS', category: 'READ_ONLY_ADMIN', code: 'PREVIEW_ADMIN_CONNECTION_AND_CAPABILITIES_VERIFIED' };
  } finally {
    client?.release();
    await pool?.end().catch(() => {});
  }
}

async function readSql(path) { return readFile(path, 'utf8'); }

export async function assertPreviewAdminPreflight(pool) {
  const admin = await pool.query(`select current_database() = 'postgres' as database_ok,
      session_user = current_user as session_identity_ok,
      (select rolsuper or rolcreaterole from pg_roles where rolname = current_user) as may_create_role,
      (select count(*) = 1 from private.environment_identity
        where environment = 'preview' and project_ref = $1) as exact_identity,
      (select count(*) = 1 from private.environment_identity) as closed_identity
    from pg_roles where rolname = current_user`, [PREVIEW_REF]);
  if (admin.rows.length !== 1 || !Object.values(admin.rows[0]).every(Boolean))
    throw new Error('V4_ADMIN_TARGET_OR_CAPABILITY_REJECTED');
  const state = (await pool.query(PREFLIGHT_SQL)).rows[0];
  await verifyReadOnlyPreviewState({ sql: async () => state });
  if (state.receipt_writer_present) throw new Error('V4_ROLE_ALREADY_PRESENT');
  return state;
}

export async function installPreviewReceiptRole(pool, runId) {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new Error('V4_RUN_ID_INVALID');
  let sql = await readSql(SQL_PATHS.install);
  const commit = sql.lastIndexOf('\ncommit;');
  if (commit < 0) throw new Error('V4_INSTALL_SQL_INVALID');
  sql = `${sql.slice(0, commit)}\ncomment on role ${RECEIPT_ROLE} is '${RUN_MARKER_PREFIX}${runId}';${sql.slice(commit)}`;
  await pool.query(sql);
  const row = (await pool.query(`select r.rolcanlogin, r.rolsuper, r.rolbypassrls,
      r.rolinherit, r.rolcreaterole, r.rolcreatedb,
      shobj_description(r.oid, 'pg_authid') as comment
    from pg_roles r where r.rolname = $1`, [RECEIPT_ROLE])).rows[0];
  if (!row || row.rolcanlogin || row.rolsuper || row.rolbypassrls || row.rolinherit ||
      row.rolcreaterole || row.rolcreatedb || row.comment !== `${RUN_MARKER_PREFIX}${runId}`)
    throw new Error('V4_ROLE_INSTALL_VERIFY_FAILED');
}

export async function activatePreviewReceiptRole(pool, password) {
  if (typeof password !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(password))
    throw new Error('V4_ROLE_PASSWORD_INVALID');
  await pool.query(`alter role ${RECEIPT_ROLE} password '${password}'`);
  await pool.query(await readSql(SQL_PATHS.activate));
  const row = (await pool.query(`select rolcanlogin, rolsuper, rolbypassrls, rolinherit,
      rolcreaterole, rolcreatedb, rolvaliduntil > now() + interval '10 minutes' as validity_ok
    from pg_roles where rolname = $1`, [RECEIPT_ROLE])).rows[0];
  if (!row || !row.rolcanlogin || row.rolsuper || row.rolbypassrls || row.rolinherit ||
      row.rolcreaterole || row.rolcreatedb || !row.validity_ok) throw new Error('V4_ROLE_ACTIVATION_VERIFY_FAILED');
}

export function buildPreviewReceiptPoolerUrl(adminUrl, password) {
  const { url, local } = validatePreviewAdminPoolerUrl(adminUrl, { allowLocal: true });
  url.username = local ? RECEIPT_ROLE : `${RECEIPT_ROLE}.${PREVIEW_REF}`;
  url.password = password;
  url.search = '';
  url.hash = '';
  return url.toString();
}

const ZERO_STATE_SQL = `select
  (select count(*) = 1 from private.environment_identity where environment='preview' and project_ref='${PREVIEW_REF}') as exact_identity,
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.organizations) as organizations,
  (select count(*) from public.organization_members) as organization_members,
  (select count(*) from public.projects) as projects,
  (select count(*) from public.project_members) as project_members,
  (select count(*) from public.audit_events) as audit_events,
  (select count(*) from public.provider_results) as provider_results,
  (select count(*) from public.imports) as imports,
  (select count(*) from private.project_invitations) as invitations,
  (select count(*) from private.audit_outbox) as outbox_total,
  (select count(*) from private.audit_outbox where state='pending') as pending_outbox,
  (select count(*) from private.audit_idempotency) as audit_idempotency,
  (select count(*) from private.openseo_project_jobs) as openseo_project_jobs,
  (select count(*) from private.openseo_project_connections) as openseo_project_connections,
  (select count(*) from private.webmaster_properties) as webmaster_properties,
  (select count(*) from private.provider_budgets) as provider_budgets,
  (select count(*) from private.provider_spend) as provider_spend,
  (select count(*) from private.openseo_google_properties) as openseo_google_properties,
  (select count(*) from private.google_captures) as google_captures,
  (select not rolsuper and not rolcanlogin and not rolbypassrls from pg_roles where rolname='rubik_audit_writer') as product_writer_locked`;
const ZERO_FIELDS = ['auth_users', 'organizations', 'organization_members', 'projects', 'project_members', 'audit_events',
  'provider_results', 'imports', 'invitations', 'outbox_total', 'pending_outbox', 'audit_idempotency',
  'openseo_project_jobs', 'openseo_project_connections', 'webmaster_properties', 'provider_budgets',
  'provider_spend', 'openseo_google_properties', 'google_captures'];

export async function blockAndRollbackPreviewReceiptRole(pool, runId) {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new Error('V4_RUN_ID_INVALID');
  const identity = (await pool.query(`select count(*)=1 as exact_identity from private.environment_identity
    where environment='preview' and project_ref=$1`, [PREVIEW_REF])).rows[0];
  if (!identity?.exact_identity) throw new Error('V4_PREVIEW_IDENTITY_REJECTED');
  const role = (await pool.query(`select rolcanlogin, shobj_description(oid,'pg_authid') as comment
    from pg_roles where rolname=$1`, [RECEIPT_ROLE])).rows[0];
  if (!role) {
    const state = (await pool.query(ZERO_STATE_SQL)).rows[0];
    if (!state?.exact_identity || !state.product_writer_locked || ZERO_FIELDS.some(field => Number(state[field]) !== 0))
      throw new Error('V4_RESIDUES_ROLE_ABSENT_KEEP_LEDGER');
    return { result: 'ROLE_ALREADY_ABSENT' };
  }
  if (role.comment !== `${RUN_MARKER_PREFIX}${runId}`) throw new Error('V4_ROLE_OWNERSHIP_UNVERIFIED');
  await pool.query(await readSql(SQL_PATHS.block));
  const blocked = (await pool.query(`select not rolcanlogin as locked from pg_roles where rolname=$1`, [RECEIPT_ROLE])).rows[0];
  if (!blocked?.locked) throw new Error('V4_NOLOGIN_NOT_CONFIRMED');
  const beforeRollback = (await pool.query(ZERO_STATE_SQL)).rows[0];
  if (!beforeRollback?.exact_identity || !beforeRollback.product_writer_locked || ZERO_FIELDS.some(field => Number(beforeRollback[field]) !== 0))
    throw new Error('V4_RESIDUES_KEEP_NOLOGIN');
  const rollback = await readSql(SQL_PATHS.rollback);
  const transactionStart = rollback.lastIndexOf('\nbegin;');
  if (transactionStart < 0) throw new Error('V4_ROLLBACK_SQL_INVALID');
  await pool.query(rollback.slice(transactionStart + 1));
  const finalState = (await pool.query(`${ZERO_STATE_SQL},
    not exists (select 1 from pg_roles where rolname='${RECEIPT_ROLE}') as receipt_role_removed,
    (select count(*) from pg_policies where policyname like 'u03 preview receipt %') as receipt_policies`)).rows[0];
  if (!finalState?.exact_identity || !finalState.product_writer_locked || !finalState.receipt_role_removed ||
      Number(finalState.receipt_policies) !== 0 || ZERO_FIELDS.some(field => Number(finalState[field]) !== 0))
    throw new Error('V4_ROLLBACK_FINAL_STATE_UNVERIFIED');
  return { result: 'BLOCKED_AND_ROLLED_BACK', inventory: 0,
    outboxTotal: Number(finalState.outbox_total), pendingOutbox: Number(finalState.pending_outbox) };
}

function ledgerWriter(runId, sha, ledgerPath) {
  return async (caseId, status, detail = {}) => {
    const row = { utc: new Date().toISOString(), runId, sha, ref: PREVIEW_REF, caseId, status,
      ...safeLedgerDetail(detail) };
    const { appendFile } = await import('node:fs/promises');
    await appendFile(ledgerPath, `${JSON.stringify(row)}\n`, { mode: 0o600 });
    console.log(`${caseId}: ${status}`);
  };
}

export async function runPreviewV4Operator({ env = process.env, runId, PoolClass = Pool,
  preflightFn = verifyInitialPreviewState, campaignFn = runHostedU03Campaign,
  diagnosticFn = diagnosePreviewAdminConnection, root = ROOT, allowLocal = false } = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(runId ?? '')) throw new Error('V4_RUN_ID_INVALID');
  const adminUrl = env.U03_PREVIEW_ADMIN_DATABASE_URL;
  if (!adminUrl) throw new Error('V4_ADMIN_CREDENTIAL_MISSING');
  const sha = (await import('node:child_process')).execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const ledgerDir = join(root, 'test-results', 'u03-hosted');
  const { mkdir, appendFile } = await import('node:fs/promises');
  await mkdir(ledgerDir, { recursive: true });
  const ledgerPath = join(ledgerDir, `${runId}.jsonl`);
  await appendFile(ledgerPath, '', { flag: 'wx', mode: 0o600 });
  const ledger = ledgerWriter(runId, sha, ledgerPath);
  let pool = null;
  let roleInstallAttempted = false;
  let rolePassword = null;
  let signingKey = null;
  let campaignEnv = null;
  let result = null;
  let containmentError = null;
  try {
    await ledger('campaign-start', 'STARTED', { mode: 'membership-revocation', deploymentId: 'dpl_6fqataMxfkGFSZJKVGk5xJe8snXq', projectRef: PREVIEW_REF });
    const transport = verifyPreviewAdminPasswordTransport(adminUrl, env.U03_PREVIEW_ADMIN_PASSWORD_EXPECTED);
    await ledger('admin-password-transport', transport.status, { category: transport.category, code: transport.code });
    if (transport.status !== 'PASS') { process.exitCode = 1; return null; }
    const diagnosis = await diagnosticFn(adminUrl, { PoolClass, allowLocal });
    await ledger('admin-connection-diagnostic', diagnosis.status, { category: diagnosis.category, code: diagnosis.code });
    if (diagnosis.status !== 'PASS') { process.exitCode = 1; return null; }
    pool = await createPreviewAdminPool(adminUrl, { PoolClass, allowLocal, skipDns: true });
    const preflight = async ({ env: campaignEnvironment }) => {
      const verified = await preflightFn({ env: campaignEnvironment });
      await assertPreviewAdminPreflight(pool);
      await ledger('session-pooler-preflight', 'PASS', { projectRef: PREVIEW_REF, migrationCount: 27, latestMigration: N1_LATEST });
      rolePassword = randomBytes(32).toString('base64url');
      roleInstallAttempted = true;
      await ledger('receipt-role-install', 'ATTEMPTED', { namespace: RUN_MARKER_PREFIX + runId });
      await installPreviewReceiptRole(pool, runId);
      await ledger('receipt-role-install', 'PASS', { namespace: RUN_MARKER_PREFIX + runId });
      await activatePreviewReceiptRole(pool, rolePassword);
      await ledger('receipt-role-activation', 'PASS', { result: 'LOGIN_30_MINUTES' });
      const receiptUrl = buildPreviewReceiptPoolerUrl(adminUrl, rolePassword);
      signingKey = randomBytes(32).toString('base64');
      campaignEnv = { ...campaignEnvironment, U03_PREVIEW_REF: PREVIEW_REF,
        U03_PREVIEW_RECEIPT_DATABASE_URL: receiptUrl,
        U03_PREVIEW_RECEIPT_KEY_ID: `u03-v4-${runId.slice(0, 8)}`,
        U03_PREVIEW_RECEIPT_SIGNING_KEY: signingKey };
      return verified;
    };
    result = await campaignFn({ env, sha, runId, ledger, root, mode: 'membership-revocation',
      preflightFn: preflight,
      receiptProcessorFn: options => openPreviewReceiptProcessor({ ...options, env: campaignEnv }) });
    if (result.status !== 'PASS') process.exitCode = 1;
  } catch (error) {
    const diagnostic = classifyPreviewAdminError(error, 'connect');
    try { await ledger('operator-error', 'FAIL', { category: diagnostic.category, code: diagnostic.code }); } catch { /* retain any earlier ledger rows */ }
    process.exitCode = 1;
  } finally {
    if (signingKey) signingKey = '';
    if (rolePassword) rolePassword = '';
    if (campaignEnv) {
      for (const name of ['U03_PREVIEW_RECEIPT_DATABASE_URL', 'U03_PREVIEW_RECEIPT_KEY_ID', 'U03_PREVIEW_RECEIPT_SIGNING_KEY']) delete campaignEnv[name];
    }
    delete process.env.U03_PREVIEW_ADMIN_DATABASE_URL;
    delete process.env.U03_PREVIEW_ADMIN_PASSWORD_EXPECTED;
    if (pool && roleInstallAttempted) {
      try {
        const contained = await blockAndRollbackPreviewReceiptRole(pool, runId);
        await ledger('receipt-role-containment', 'PASS', { result: contained.result,
          outboxTotal: contained.outboxTotal ?? 0, pendingOutbox: contained.pendingOutbox ?? 0 });
      } catch {
        containmentError = 'V4_CONTAINMENT_FAILED';
        process.exitCode = 1;
        try { await ledger('receipt-role-containment', 'BLOCKED', { category: 'DATABASE', code: containmentError }); } catch { /* preserve fixtures ledger */ }
      }
    }
    await pool?.end().catch(() => {});
    if (containmentError) console.error(`V4_OPERATOR_CONTAINMENT_BLOCKED: ${containmentError}; preserve run ledger and IDs.`);
    if (result?.status) console.log(`V-4 Preview run ${runId}: ${result.status}; ledger test-results/u03-hosted/${runId}.jsonl`);
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const diagnose = args.length === 1 && args[0] === '--diagnose-connection';
  if (diagnose) {
    const url = process.env.U03_PREVIEW_ADMIN_DATABASE_URL;
    try {
      const transport = verifyPreviewAdminPasswordTransport(url, process.env.U03_PREVIEW_ADMIN_PASSWORD_EXPECTED);
      const result = transport.status !== 'PASS' ? transport : await diagnosePreviewAdminConnection(url);
      console.log(`V4_CONNECTION_DIAGNOSTIC: ${result.status} category=${result.category} code=${result.code}`);
      if (result.status !== 'PASS') process.exitCode = 1;
    } catch {
      console.log('V4_CONNECTION_DIAGNOSTIC: FAIL category=DIAGNOSTIC code=SAFE_DIAGNOSTIC_FAILURE');
      process.exitCode = 1;
    } finally {
      delete process.env.U03_PREVIEW_ADMIN_DATABASE_URL;
      delete process.env.U03_PREVIEW_ADMIN_PASSWORD_EXPECTED;
    }
    return;
  }
  const run = args.includes('--run');
  const contain = args.includes('--contain');
  const idIndex = args.indexOf('--run-id');
  const runId = idIndex >= 0 ? args[idIndex + 1] : undefined;
  if (run === contain || idIndex < 0 || !runId || args.some(arg => !['--run', '--contain', '--run-id', runId].includes(arg))) {
    console.error('V4_OPERATOR_BLOCKED: ARGUMENTS_INVALID'); process.exitCode = 2; return;
  }
  if (run) {
    try { await runPreviewV4Operator({ runId }); }
    catch (error) {
      const diagnostic = classifyPreviewAdminError(error, 'database');
      console.error(`V4_OPERATOR_BLOCKED: category=${diagnostic.category} code=${diagnostic.code}; no fixture write is assumed.`);
      process.exitCode = 1;
    }
    return;
  }
  const url = process.env.U03_PREVIEW_ADMIN_DATABASE_URL;
  let pool;
  try {
    if (!url) throw new Error('V4_ADMIN_CREDENTIAL_MISSING');
    pool = await createPreviewAdminPool(url);
    const result = await blockAndRollbackPreviewReceiptRole(pool, runId);
    console.log(`V4_OPERATOR_CONTAINMENT_PASS: ${result.result}; run=${runId}`);
  } catch {
    console.error('V4_OPERATOR_CONTAINMENT_BLOCKED: category=CONTAINMENT code=V4_CONTAINMENT_FAILED; preserve run ledger and IDs.');
    process.exitCode = 1;
  } finally {
    delete process.env.U03_PREVIEW_ADMIN_DATABASE_URL;
    await pool?.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
