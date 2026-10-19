import { randomBytes } from 'node:crypto';
import { register } from 'node:module';
import { lookup } from 'node:dns/promises';
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

export async function createPreviewAdminPool(rawUrl, { PoolClass = Pool, allowLocal = false, ca } = {}) {
  const parsed = validatePreviewAdminPoolerUrl(rawUrl, { allowLocal });
  if (!parsed.local) {
    const addresses = await lookup(parsed.url.hostname, { all: true });
    if (!addresses.some(address => address.family === 4)) throw new Error('V4_SESSION_POOLER_IPV4_UNAVAILABLE');
    if (!ca) {
      const { SUPABASE_ROOT_2021_CA } = await import('../src/lib/provenance/supabase-root-ca.ts');
      ca = SUPABASE_ROOT_2021_CA;
    }
  }
  return new PoolClass({ connectionString: rawUrl, max: 1, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000, ssl: parsed.local ? false : { rejectUnauthorized: true, ca } });
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
  root = ROOT, allowLocal = false } = {}) {
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
  const pool = await createPreviewAdminPool(adminUrl, { PoolClass, allowLocal });
  let rolePassword = null;
  let signingKey = null;
  let campaignEnv = null;
  let result = null;
  let containmentError = null;
  try {
    await ledger('campaign-start', 'STARTED', { mode: 'membership-revocation', deploymentId: 'dpl_6fqataMxfkGFSZJKVGk5xJe8snXq', projectRef: PREVIEW_REF });
    const preflight = async ({ env: campaignEnvironment }) => {
      const verified = await preflightFn({ env: campaignEnvironment });
      await assertPreviewAdminPreflight(pool);
      await ledger('session-pooler-preflight', 'PASS', { projectRef: PREVIEW_REF, migrationCount: 27, latestMigration: N1_LATEST });
      rolePassword = randomBytes(32).toString('base64url');
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
    const code = /^[A-Z0-9_]{3,80}$/.test(error?.message ?? '') ? error.message : 'V4_OPERATOR_FAILED';
    try { await ledger('operator-error', 'FAIL', { code }); } catch { /* retain any earlier ledger rows */ }
    process.exitCode = 1;
  } finally {
    if (signingKey) signingKey = '';
    if (rolePassword) rolePassword = '';
    if (campaignEnv) {
      for (const name of ['U03_PREVIEW_RECEIPT_DATABASE_URL', 'U03_PREVIEW_RECEIPT_KEY_ID', 'U03_PREVIEW_RECEIPT_SIGNING_KEY']) delete campaignEnv[name];
    }
    delete process.env.U03_PREVIEW_ADMIN_DATABASE_URL;
    if (pool) {
      try {
        const contained = await blockAndRollbackPreviewReceiptRole(pool, runId);
        await ledger('receipt-role-containment', 'PASS', { result: contained.result,
          outboxTotal: contained.outboxTotal ?? 0, pendingOutbox: contained.pendingOutbox ?? 0 });
      } catch (error) {
        const code = /^[A-Z0-9_]{3,80}$/.test(error?.message ?? '') ? error.message : 'V4_CONTAINMENT_FAILED';
        containmentError = code;
        process.exitCode = 1;
        try { await ledger('receipt-role-containment', 'BLOCKED', { code }); } catch { /* preserve fixtures ledger */ }
      }
      await pool.end().catch(() => {});
    }
    if (containmentError) console.error(`V4_OPERATOR_CONTAINMENT_BLOCKED: ${containmentError}; preserve run ledger and IDs.`);
    if (result?.status) console.log(`V-4 Preview run ${runId}: ${result.status}; ledger test-results/u03-hosted/${runId}.jsonl`);
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
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
      const code = /^[A-Z0-9_]{3,80}$/.test(error?.message ?? '') ? error.message : 'V4_OPERATOR_FAILED';
      console.error(`V4_OPERATOR_BLOCKED: ${code}; no fixture write is assumed.`);
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
  } catch (error) {
    const code = /^[A-Z0-9_]{3,80}$/.test(error?.message ?? '') ? error.message : 'V4_CONTAINMENT_FAILED';
    console.error(`V4_OPERATOR_CONTAINMENT_BLOCKED: ${code}; preserve run ledger and IDs.`);
    process.exitCode = 1;
  } finally {
    delete process.env.U03_PREVIEW_ADMIN_DATABASE_URL;
    await pool?.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
