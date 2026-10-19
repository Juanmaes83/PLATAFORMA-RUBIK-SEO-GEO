import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, appendFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createPreviewAdminClient } from './u03-preview-api-key.mjs';
import { createDataApiFixtureRun, U03_PREVIEW_REF } from './u03-preview-data-api.mjs';
import { PIN, networkEnvironment, preflight, runB4 } from './u03-preview-b4-runner.mjs';

const execFileAsync = promisify(execFile);
const SUPABASE_URL = `https://${U03_PREVIEW_REF}.supabase.co`;
export const EXPECTED_N1_MIGRATIONS = Object.freeze([
  '20260928120000', '20260928150000', '20261007120000', '20261007150000', '20261009071705',
  '20261009120000', '20261009150000', '20261009170000', '20261009180000', '20261010090000',
  '20261010150000', '20261010160000', '20261012090000', '20261012100000', '20261012110000',
  '20261012120000', '20261012130000', '20261015115750', '20261015145025', '20261015170000',
  '20261015171000', '20261015172000', '20261015180000', '20261015183000', '20261015190000',
  '20261015201500', '20261015210000',
]);

const PREFLIGHT_SQL = `select
  (select count(*)::int from auth.users) as auth_users,
  (select count(*)::int from public.organizations) as organizations,
  (select count(*)::int from public.projects) as projects,
  (select count(*)::int from public.organization_members) as organization_members,
  (select count(*)::int from public.project_members) as project_members,
  (select count(*)::int from public.audit_events) as audit_events,
  (select count(*)::int from private.audit_outbox) as outbox_total,
  (select count(*)::int from private.audit_outbox where state = 'pending') as pending_outbox,
  (select not rolsuper and not rolcanlogin and not rolbypassrls from pg_roles where rolname = 'rubik_audit_writer') as writer_locked,
  (select environment from private.environment_identity limit 1) as environment,
  (select project_ref from private.environment_identity limit 1) as project_ref,
  (select coalesce(json_agg(version::text order by version), '[]'::json) from supabase_migrations.schema_migrations) as migrations`;

const FINAL_SQL = `select
  (select count(*)::int from auth.users) as auth_users,
  (select count(*)::int from public.organizations) as organizations,
  (select count(*)::int from public.projects) as projects,
  (select count(*)::int from public.organization_members) as organization_members,
  (select count(*)::int from public.project_members) as project_members,
  (select count(*)::int from public.audit_events) as audit_events,
  (select count(*)::int from private.audit_outbox) as outbox_total,
  (select count(*)::int from private.audit_outbox where state = 'pending') as pending_outbox,
  (select not rolsuper and not rolcanlogin and not rolbypassrls from pg_roles where rolname = 'rubik_audit_writer') as writer_locked,
  (select environment from private.environment_identity limit 1) as environment,
  (select project_ref from private.environment_identity limit 1) as project_ref`;

const LEDGER_KEYS = new Set([
  'actor', 'namespace', 'id', 'scope', 'code', 'http', 'kind', 'reason', 'cases', 'count', 'captures',
  'path', 'viewport', 'conclusion', 'viewportWidth', 'documentWidth', 'bodyWidth', 'visibleErrorCount',
  'consoleErrorCount', 'pageErrorCount', 'hydrationErrorCount', 'version', 'projectIds', 'organizationIds',
  'userIds', 'authUsers', 'organizations', 'projects', 'organizationMembers', 'projectMembers', 'auditEvents',
  'outboxTotal', 'pendingOutbox', 'writerLocked', 'migrationCount', 'latestMigration', 'environment',
  'projectRef', 'deploymentId', 'sha', 'host', 'result', 'visualReview',
]);

function safeLedgerDetail(input = {}) {
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (!LEDGER_KEYS.has(key)) continue;
    if (typeof value === 'string') result[key] = value.slice(0, 240);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) result[key] = value;
    else if (Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === 'string')) result[key] = value.map(item => item.slice(0, 240));
  }
  return result;
}

export function parseCliJson(stdout) {
  const text = String(stdout).replace(/\u001b\[[0-9;]*m/g, '');
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{' && text[start] !== '[') continue;
    const stack = [];
    let quoted = false;
    let escaped = false;
    for (let end = start; end < text.length; end++) {
      const char = text[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') {
        const open = stack.pop();
        if ((open === '{' && char !== '}') || (open === '[' && char !== ']')) break;
        if (!stack.length) {
          let parsed;
          try { parsed = JSON.parse(text.slice(start, end + 1)); }
          catch { break; }
          const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
          if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || Array.isArray(rows[0]) || typeof rows[0] !== 'object') break;
          return rows[0];
        }
      }
    }
  }
  throw new Error('SUPABASE_SQL_JSON');
}

function sqlFailureCategory(error) {
  const detail = [error?.code, error?.cause?.code, error?.stderr, error?.message]
    .filter(value => typeof value === 'string').join(' ').toUpperCase();
  if (/ENOTFOUND|EAI_AGAIN|EAI_FAIL|DNS/.test(detail)) return 'DNS';
  if (/TLS|SSL|CERT|ERR_TLS|ERR_SSL/.test(detail)) return 'TLS';
  if (/TIMEOUT|ETIMEDOUT|ABORT|DEADLINE EXCEEDED/.test(detail)) return 'TIMEOUT';
  return 'HTTP';
}

export async function runPreviewReadOnlySql(query, {
  cli = process.env.U03_SUPABASE_CLI, ref = U03_PREVIEW_REF, exec = execFileAsync, tempRoot = tmpdir(),
} = {}) {
  if (!cli) throw new Error('SUPABASE_CLI_UNAVAILABLE');
  if (ref !== U03_PREVIEW_REF) throw new Error('SUPABASE_PROJECT_REF_REJECTED');
  if (typeof query !== 'string' || !/^\s*select\b/i.test(query)) throw new Error('SUPABASE_READ_ONLY_SQL_REJECTED');
  let sqlDir;
  try {
    sqlDir = await mkdtemp(join(tempRoot, 'u03-preview-sql-'));
    const sqlFile = join(sqlDir, 'query.sql');
    await writeFile(sqlFile, query, { encoding: 'utf8', mode: 0o600 });
    let stdout;
    try {
      // Windows .cmd shims require shell mode; quote the executable path itself
      // when Node composes the command, otherwise `C:\Program Files\...` splits.
      const executable = process.platform === 'win32' && /\s/.test(cli) ? `"${cli.replace(/"/g, '""')}"` : cli;
      ({ stdout } = await exec(executable, [
      '--yes', 'supabase@2.118.0', 'db', 'query', '--linked', '--project-ref', ref,
        '--output', 'json', '--file', sqlFile,
      ], { windowsHide: true, maxBuffer: 2 * 1024 * 1024, shell: process.platform === 'win32', env: networkEnvironment() }));
    } catch (error) { throw new Error(`SUPABASE_SQL_${sqlFailureCategory(error)}`); }
    return parseCliJson(stdout);
  } catch (error) {
    if (error?.message === 'SUPABASE_SQL_JSON' || /^SUPABASE_SQL_(DNS|TLS|TIMEOUT|HTTP)$/.test(error?.message ?? '')) throw error;
    throw new Error('SUPABASE_SQL_HTTP');
  } finally {
    if (sqlDir) await rm(sqlDir, { recursive: true, force: true }).catch(() => {});
  }
}

function authSettingsFailureCategory(error) {
  const codes = [error?.code, error?.cause?.code].filter(value => typeof value === 'string').join(' ').toUpperCase();
  if (/ENOTFOUND|EAI_AGAIN|EAI_FAIL|DNS/.test(codes)) return 'DNS';
  if (/TLS|SSL|CERT|ERR_TLS|ERR_SSL/.test(codes)) return 'TLS';
  if (/TIMEOUT|ETIMEDOUT|ABORT/.test(codes) || ['AbortError', 'TimeoutError'].includes(error?.name)) return 'TIMEOUT';
  return 'HTTP';
}

export async function readPreviewAuthSettings({ fetchImpl = fetch, apiKey } = {}) {
  if (typeof apiKey !== 'string' || !apiKey) throw new Error('AUTH_SETTINGS_HTTP');
  let response;
  try {
    response = await fetchImpl(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: apiKey }, redirect: 'manual', signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new Error(`AUTH_SETTINGS_${authSettingsFailureCategory(error)}`);
  }
  if (response.status !== 200) throw new Error('AUTH_SETTINGS_HTTP');
  try { return await response.json(); }
  catch { throw new Error('AUTH_SETTINGS_JSON'); }
}

export async function verifyInitialPreviewState({ env = process.env, fetchImpl = fetch, admin = null, publicClient = null, sql = runPreviewReadOnlySql, inspect, preflightFn = preflight } = {}) {
  const adminKey = env.U03_PREVIEW_ADMIN_KEY;
  const publicKey = env.U03_PREVIEW_PUBLIC_KEY;
  if (!adminKey || !publicKey) throw new Error('PREVIEW_KEYS_REQUIRED');
  const vercel = await preflightFn({ token: env.VERCEL_OIDC_TOKEN, fetchImpl, ...(inspect ? { inspect } : {}) });

  const settings = await readPreviewAuthSettings({ fetchImpl, apiKey: publicKey });
  if (settings?.disable_signup !== true) throw new Error('PUBLIC_SIGNUP_NOT_CONFIRMED_CLOSED');

  const identityClient = publicClient ?? createClient(SUPABASE_URL, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const identity = await identityClient.rpc('preview_environment_identity');
  if (identity.error || !Array.isArray(identity.data) || identity.data.length !== 1 ||
      identity.data[0]?.environment !== 'preview' || identity.data[0]?.project_ref !== U03_PREVIEW_REF) {
    throw new Error('PREVIEW_IDENTITY_INVALID');
  }

  const adminClient = admin ?? createPreviewAdminClient(SUPABASE_URL, adminKey);
  const adminProbe = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (adminProbe.error || !Array.isArray(adminProbe.data?.users)) throw new Error('PREVIEW_ADMIN_KEY_INVALID');
  const state = await verifyReadOnlyPreviewState({ sql });

  return {
    vercel,
    admin: adminClient,
    initial: {
      authUsers: state.authUsers, organizations: state.organizations, projects: state.projects,
      organizationMembers: state.organizationMembers, projectMembers: state.projectMembers,
      auditEvents: state.auditEvents, outboxTotal: state.outboxTotal, pendingOutbox: state.pendingOutbox,
      migrationCount: state.migrationCount, latestMigration: state.latestMigration,
      writerLocked: state.writerLocked, environment: state.environment, projectRef: state.projectRef,
    },
  };
}

export async function verifyReadOnlyPreviewState({ sql = runPreviewReadOnlySql } = {}) {
  const state = await sql(PREFLIGHT_SQL, { ref: U03_PREVIEW_REF });
  const expected = EXPECTED_N1_MIGRATIONS;
  const migrationMatch = Array.isArray(state.migrations) && state.migrations.length === expected.length &&
    expected.every((version, index) => state.migrations[index] === version);
  if (!migrationMatch) throw new Error('N1_MIGRATION_SET_MISMATCH');
  if (state.environment !== 'preview' || state.project_ref !== U03_PREVIEW_REF) throw new Error('PREVIEW_DATABASE_IDENTITY_INVALID');
  if (state.writer_locked !== true) throw new Error('WRITER_CAPABILITY_NOT_LOCKED');
  const empty = ['auth_users', 'organizations', 'projects', 'organization_members', 'project_members', 'audit_events', 'outbox_total', 'pending_outbox'];
  if (empty.some(field => state[field] !== 0)) throw new Error('PREVIEW_INITIAL_INVENTORY_NOT_EMPTY');
  return {
    authUsers: state.auth_users, organizations: state.organizations, projects: state.projects,
    organizationMembers: state.organization_members, projectMembers: state.project_members,
    auditEvents: state.audit_events, outboxTotal: state.outbox_total, pendingOutbox: state.pending_outbox,
    migrationCount: state.migrations.length, latestMigration: state.migrations.at(-1),
    writerLocked: state.writer_locked, environment: state.environment, projectRef: state.project_ref,
  };
}

export async function runReadOnlyPreflight({ token = process.env.VERCEL_OIDC_TOKEN, inspect, sql = runPreviewReadOnlySql, preflightFn = preflight } = {}) {
  const vercel = await preflightFn({ token, ...(inspect ? { inspect } : {}) });
  const initial = await verifyReadOnlyPreviewState({ sql });
  return { vercel, initial };
}

export async function verifyFinalPreviewState({ sql = runPreviewReadOnlySql } = {}) {
  const state = await sql(FINAL_SQL, { ref: U03_PREVIEW_REF });
  const inventoriesClear = ['auth_users', 'organizations', 'projects', 'organization_members', 'project_members', 'audit_events']
    .every(field => state[field] === 0);
  const outboxClear = state.outbox_total === 0 && state.pending_outbox === 0;
  const capabilitiesSafe = state.writer_locked === true && state.environment === 'preview' && state.project_ref === U03_PREVIEW_REF;
  return { inventoriesClear, outboxClear, capabilitiesSafe, state };
}

export async function runHostedU03Campaign({
  env = process.env, sha, runId = randomUUID(), ledger = null, preflightFn = verifyInitialPreviewState,
  fixtureFactory = createDataApiFixtureRun, browserFn = runB4, finalCheckFn = verifyFinalPreviewState,
  root = process.cwd(),
} = {}) {
  if (!sha) throw new Error('CAMPAIGN_SHA_REQUIRED');
  const ledgerDir = join(root, 'test-results', 'u03-hosted');
  const ledgerPath = join(ledgerDir, `${runId}.jsonl`);
  const captureRoot = join(ledgerDir, runId);
  await mkdir(ledgerDir, { recursive: true });
  if (!ledger) {
    await appendFile(ledgerPath, '', { flag: 'wx', mode: 0o600 });
    ledger = async (caseId, status, detail = {}) => {
      const row = { utc: new Date().toISOString(), runId, sha, ref: U03_PREVIEW_REF, caseId, status, ...safeLedgerDetail(detail) };
      await appendFile(ledgerPath, `${JSON.stringify(row)}\n`, { mode: 0o600 });
      console.log(`${caseId}: ${status}`);
    };
  }

  let fixtures = null;
  let verified = null;
  let browserResult = null;
  let failure = null;
  let cleanupResult = null;
  let finalCheck = null;
  await ledger('campaign-start', 'STARTED', { deploymentId: PIN.deploymentId, sha: PIN.sha, host: PIN.host, projectRef: U03_PREVIEW_REF });
  try {
    if (!env.U03_PREVIEW_ADMIN_KEY || !env.U03_PREVIEW_PUBLIC_KEY) throw new Error('PREVIEW_KEYS_REQUIRED');
    verified = await preflightFn({ env });
    await ledger('preflight', 'PASS', { ...verified.initial, deploymentId: verified.vercel?.deploymentId, sha: verified.vercel?.sha, host: verified.vercel?.host, projectRef: U03_PREVIEW_REF });
    fixtures = fixtureFactory({ runId, sha, admin: verified.admin, publicKey: env.U03_PREVIEW_PUBLIC_KEY, ledger, ref: U03_PREVIEW_REF });
    await fixtures.createUsers();
    await ledger('fixture-users', 'CREATED', { count: 3, namespace: fixtures.namespace });
    const organizations = await fixtures.createOrganizations();
    await ledger('fixture-organizations', 'CREATED', { count: 2, namespace: fixtures.namespace });
    const projects = await fixtures.createProjects(organizations);
    await ledger('fixture-projects', 'CREATED', { count: 3, namespace: fixtures.namespace });
    await fixtures.runMatrix({ ...organizations, ...projects });
    await ledger('data-api-matrix', 'PASS', { cases: 12 });
    const b4Env = { VERCEL_OIDC_TOKEN: env.VERCEL_OIDC_TOKEN, ...fixtures.browserInputs() };
    browserResult = await browserFn({ env: b4Env, runId, preflightResult: verified.vercel, ledger, captureRoot });
    await ledger('browser-b4', 'PASS', { captures: browserResult?.captures?.length ?? 0, visualReview: 'PENDING_MANUAL_REVIEW' });
  } catch (error) {
    failure = typeof error?.message === 'string' && /^[A-Z0-9_]{3,80}$/.test(error.message) ? error.message : 'CAMPAIGN_STEP_FAILED';
    try { await ledger('campaign-error', 'FAIL', { code: failure }); } catch { /* cleanup still proceeds */ }
  } finally {
    if (fixtures) {
      try {
        cleanupResult = await fixtures.cleanup();
        await ledger('fixture-cleanup', cleanupResult?.ok ? 'PASS' : 'PARTIAL', {
          userIds: cleanupResult?.userIds ?? [], organizationIds: cleanupResult?.organizationIds ?? [], projectIds: cleanupResult?.projectIds ?? [],
        });
      } catch {
        cleanupResult = { ok: false };
        try { await ledger('fixture-cleanup', 'PARTIAL'); } catch { /* continue final verification */ }
      }
    }
    if (verified) {
      try {
        finalCheck = await finalCheckFn();
        await ledger('final-inventory', finalCheck.inventoriesClear ? 'PASS' : 'FAIL', {
          authUsers: finalCheck.state?.auth_users ?? null, organizations: finalCheck.state?.organizations ?? null,
          projects: finalCheck.state?.projects ?? null, organizationMembers: finalCheck.state?.organization_members ?? null,
          projectMembers: finalCheck.state?.project_members ?? null, auditEvents: finalCheck.state?.audit_events ?? null,
        });
        await ledger('outbox-final', finalCheck.outboxClear ? 'PASS' : 'FAIL', {
          outboxTotal: finalCheck.state?.outbox_total ?? null, pendingOutbox: finalCheck.state?.pending_outbox ?? null,
        });
        await ledger('capabilities-final', finalCheck.capabilitiesSafe ? 'PASS' : 'FAIL', {
          writerLocked: finalCheck.state?.writer_locked ?? null, environment: finalCheck.state?.environment ?? null,
          projectRef: finalCheck.state?.project_ref ?? null,
        });
      } catch {
        finalCheck = null;
        try { await ledger('final-inventory', 'UNVERIFIED'); } catch { /* ledger failure cannot undo cleanup */ }
      }
    }
  }

  const clean = (!fixtures || cleanupResult?.ok === true) && (!verified || (
    finalCheck?.inventoriesClear === true && finalCheck?.outboxClear === true && finalCheck?.capabilitiesSafe === true
  ));
  const b4Pass = Boolean(browserResult) && !failure;
  const status = failure
    ? (verified === null && fixtures === null ? 'BLOCKED_NO_WRITES' : clean ? 'FAIL_CLEANED' : 'FAIL_CLEANUP_PARTIAL')
    : (b4Pass && clean ? 'AWAITING_VISUAL_REVIEW' : 'BLOCKED');
  try {
    await ledger('campaign-global', status, {
      runId, sha, deploymentId: PIN.deploymentId, visualReview: b4Pass ? 'PENDING_MANUAL_REVIEW' : 'NOT_RUN',
      result: status,
    });
    await ledger('run-artifacts', browserResult ? 'LOCAL_ONLY' : 'NONE', {
      path: browserResult ? relative(root, captureRoot) : null, captures: browserResult?.captures?.length ?? 0,
    });
  } catch { /* the persistent ledger is already marked incomplete by absence of this footer */ }
  console.log(`U03 B-4 run ${runId}: ${status}; ledger ${relative(root, ledgerPath)}; captures ${browserResult?.captures?.length ?? 0}`);
  return { runId, sha, status, failure, verified, browserResult, cleanupResult, finalCheck, ledgerPath, captureRoot };
}

async function main() {
  const sha = (await execFileAsync('git', ['rev-parse', 'HEAD'], { windowsHide: true })).stdout.trim();
  if (process.argv.includes('--readonly-preflight')) {
    try {
      const { initial } = await runReadOnlyPreflight();
      console.log(`U03 B-4 READ_ONLY_PREFLIGHT PASS; ref ${initial.projectRef}; migrations ${initial.migrationCount}; latest ${initial.latestMigration}; inventory zero; writer locked`);
    } catch (error) {
      const code = typeof error?.message === 'string' && /^[A-Z0-9_]{3,80}$/.test(error.message) ? error.message : 'READ_ONLY_PREFLIGHT_FAILED';
      console.error(`U03 B-4 READ_ONLY_PREFLIGHT FAIL; ${code}`);
      process.exitCode = 1;
    }
    return;
  }
  const adminKey = process.env.U03_PREVIEW_ADMIN_KEY;
  const publicKey = process.env.U03_PREVIEW_PUBLIC_KEY;
  if (!adminKey || !publicKey) {
    console.error('U03 B-4 BLOCKED: PREVIEW_KEYS_REQUIRED; no fixtures were created.');
    process.exitCode = 1;
    return;
  }
  const result = await runHostedU03Campaign({ sha, env: process.env });
  if (!['AWAITING_VISUAL_REVIEW'].includes(result.status)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
