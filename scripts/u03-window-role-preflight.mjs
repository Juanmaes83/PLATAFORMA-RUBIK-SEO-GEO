// Preview-only, no-fixture proof for the separate temporary SQL principal. The only
// credential input is a JSON line on stdin; neither URL nor password is logged.
import { randomUUID, createHmac } from 'node:crypto';
import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { EXPECTED_N1_MIGRATIONS } from './u03-preview-b4-orchestrator.mjs';
import { buildMinimalInstallSql, buildMinimalRollbackSql, policyNames } from './u03-window-minimal-principal.mjs';

register('./lib/app-ts-hooks.mjs', import.meta.url);
const { SUPABASE_ROOT_2021_CA } = await import('../src/lib/provenance/supabase-root-ca.ts');

export const PREVIEW_REF = 'rhnnplewqsekrnaousyl';
export const POOLER_HOST = 'aws-1-eu-west-3.pooler.supabase.com';
export const ROLE = 'rubik_preview_u03_writer';
export const WRITER = 'rubik_audit_writer';
export const POLICY_PREFIX = 'u03_preview_writer_';
export const PINNED_POOLER_CA = SUPABASE_ROOT_2021_CA;
export { EXPECTED_N1_MIGRATIONS };
export const EXPECTED_DEFINERS = Object.freeze([
  'private.audit_writer_actor(uuid, uuid)',
  'private.audit_writer_project(uuid)',
]);
const TABLES = Object.freeze([
  ['public', 'audit_events', 'audit_events'],
  ['public', 'provider_results', 'provider_results'],
  ['private', 'audit_idempotency', 'audit_idempotency'],
  ['private', 'audit_outbox', 'audit_outbox'],
]);
const INVENTORY = Object.freeze([
  ['auth.users', 'auth_users'], ['public.organizations', 'organizations'],
  ['public.organization_members', 'organization_members'], ['public.projects', 'projects'],
  ['public.project_members', 'project_members'], ['public.audit_events', 'audit_events'],
  ['public.provider_results', 'provider_results'], ['public.imports', 'imports'],
  ['private.project_invitations', 'invitations'], ['private.audit_idempotency', 'audit_idempotency'],
  ['private.audit_outbox', 'outbox_total'],
  ['private.openseo_project_jobs','openseo_project_jobs'], ['private.openseo_project_connections','openseo_project_connections'],
  ['private.webmaster_properties','webmaster_properties'], ['private.provider_budgets','provider_budgets'],
  ['private.provider_spend','provider_spend'], ['private.openseo_google_properties','openseo_google_properties'],
  ['private.google_captures','google_captures'],
]);
const LEDGER_ROOT = join(process.cwd(), 'test-results', 'u03-hosted');
const RECOVERY_RUN = '840261c6-e410-4e25-893a-9206fd3f74ef';
const SAFE_SQLSTATES = new Set(['42501', '28P01', '28000', '57P01', '0A000', '42704', '42710']);
const SAFE_TRANSPORT_CODES = new Set(['ENOTFOUND','EAI_AGAIN','EAI_FAIL','ETIMEDOUT','ECONNREFUSED','ECONNRESET',
  'EHOSTUNREACH','ENETUNREACH','EPIPE','ENETDOWN','ECONNABORTED','ERR_TLS_CERT_ALTNAME_INVALID','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN',
  'ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED','ERR_TLS_HANDSHAKE_TIMEOUT','ERR_SSL_WRONG_VERSION_NUMBER']);
const PREFLIGHT_CONDITIONS = new Set(['PREVIEW_READ_ONLY_RESULT_SCHEMA_INCOMPLETE','DATABASE_IDENTITY_MISMATCH',
  'PREVIEW_IDENTITY_MISMATCH','MIGRATION_SET_MISMATCH','GENERAL_WRITER_NOT_LOCKED','ADMIN_CAPABILITY_MISSING',
  'WRITER_SESSION_RESIDUE','TEMPORARY_ROLE_RESIDUE','TEMPORARY_POLICY_RESIDUE','TLS_VERIFICATION_FAILED',
  'INVENTORY_NOT_EMPTY','PENDING_OUTBOX_NOT_EMPTY','ROLE_OWNERSHIP_UNVERIFIED','ROLE_ABSENCE_NOT_VERIFIED',
  'ROLE_POLICY_RESIDUE','ROLE_SESSION_RESIDUE','FINAL_INVENTORY_NOT_EMPTY','TEMP_ROLE_CREDENTIAL_MISSING','TEMP_ROLE_CREDENTIAL_INVALID']);
const PREINSTALL_CODES = new Set(['SECDEF_QUERY_FAILED','SECDEF_UNEXPECTED_RESULT','SECDEF_LEDGER_FAILED',
  'RLS_QUERY_FAILED','RLS_UNEXPECTED_RESULT','RLS_LEDGER_FAILED']);
const CONTAINMENT_STAGES = Object.freeze(['ownership','nologin','nologin-readback','role-oid',
  'terminate-sessions','sessions-readback','new-login']);
const CONTAINMENT_CODES = new Set(CONTAINMENT_STAGES.flatMap(stage =>
  [`CONTAINMENT_${stage.toUpperCase().replaceAll('-','_')}_QUERY_FAILED`,
    `CONTAINMENT_${stage.toUpperCase().replaceAll('-','_')}_UNEXPECTED_RESULT`]));
CONTAINMENT_CODES.add('CONTAINMENT_NEW_LOGIN_CATALOG_ONLY');
const LEDGER_PHASES = new Set(['readonly-diagnostic','admin-read-only-preflight','security-definer-allowlist','writer-rls',
  'install-role-nologin','independent-containment-probe','activate-temporary-role','session-pooler-set-role',
  'role-sequence-failure','independent-role-containment','session-pooler-direct-role',
  'writer-allowlist-preflight','install-nologin-role-and-deny-policies',
  'independent-nologin-terminate-probe','activate-three-minute-role','preview-session-pooler-set-role','expire-login-window',
  'expired-login-rejected','nologin-and-session-termination','independent-final-state','operator-phase-failure',
  'finally-independent-containment','containment-only-read-only-preflight','containment-only-final-state',
  ...CONTAINMENT_STAGES.map(stage => `containment-${stage}`),
  'recovery-read-only','recovery-owned-role','recovery-rollback','recovery-final-read']);
function qPassword(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(value)) throw new Error('TEMP_CREDENTIAL_REJECTED');
  return `'${value}'`;
}
function errorCodes(error, depth = 0, seen = new Set()) {
  if (!error || depth > 4 || seen.has(error)) return [];
  seen.add(error);
  const own = typeof error.code === 'string' ? [error.code.toUpperCase()] : [];
  const nested = [error.cause, ...(Array.isArray(error.errors) ? error.errors : [])]
    .flatMap(child => errorCodes(child, depth + 1, seen));
  return [...own, ...nested];
}

export class PreflightConditionError extends Error {
  constructor(condition) {
    if (!PREFLIGHT_CONDITIONS.has(condition)) throw new Error('PREFLIGHT_CONDITION_REJECTED');
    super(condition);
    this.name = 'PreflightConditionError';
    this.condition = condition;
  }
}

export class ContainmentStageError extends Error {
  constructor(stage, kind, cause = null) {
    if (!CONTAINMENT_STAGES.includes(stage) || !['QUERY_FAILED','UNEXPECTED_RESULT'].includes(kind))
      throw new Error('CONTAINMENT_STAGE_REJECTED');
    const code = `CONTAINMENT_${stage.toUpperCase().replaceAll('-','_')}_${kind}`;
    super(code, cause ? { cause } : undefined);
    this.name = 'ContainmentStageError';
    this.stage = stage;
    this.code = code;
  }
}

export function classifyDiagnosticError(error) {
  if (error instanceof PreflightConditionError)
    return { category: 'PREFLIGHT', code: error.condition, sqlstate: null, condition: error.condition };
  if (error instanceof ContainmentStageError) {
    const sqlstate = errorCodes(error).find(value => SAFE_SQLSTATES.has(value)) ?? null;
    return { category: 'CONTAINMENT', code: error.code, sqlstate, condition: null };
  }
  const codes = errorCodes(error);
  const directSqlstate = typeof error?.code === 'string' && SAFE_SQLSTATES.has(error.code.toUpperCase())
    ? error.code.toUpperCase() : null;
  const sqlstate = directSqlstate ?? codes.find(value => SAFE_SQLSTATES.has(value)) ?? null;
  if (sqlstate?.startsWith('28'))
    return { category: 'AUTHENTICATION', code: `SQLSTATE_${sqlstate}`, sqlstate, condition: null };
  if (sqlstate === '42501')
    return { category: 'PERMISSION', code: `SQLSTATE_${sqlstate}`, sqlstate, condition: null };
  if (sqlstate && directSqlstate)
    return { category: 'DATABASE', code: `SQLSTATE_${sqlstate}`, sqlstate, condition: null };
  const directCode = typeof error?.code === 'string' ? error.code.toUpperCase() : '';
  if ((directCode.startsWith('ERR_TLS_') || directCode.startsWith('ERR_SSL_')) && !SAFE_TRANSPORT_CODES.has(directCode))
    return { category: 'TLS', code: 'TLS_ERROR_UNCLASSIFIED', sqlstate: null, condition: null };
  const code = codes.find(value => SAFE_TRANSPORT_CODES.has(value));
  if (code && ['ENOTFOUND','EAI_AGAIN','EAI_FAIL'].includes(code))
    return { category: 'DNS', code, sqlstate: null, condition: null };
  if (code && ['ETIMEDOUT','ECONNREFUSED','ECONNRESET','EHOSTUNREACH','ENETUNREACH','EPIPE','ENETDOWN','ECONNABORTED'].includes(code))
    return { category: 'TCP', code, sqlstate: null, condition: null };
  if (code && !['ENOTFOUND','EAI_AGAIN','EAI_FAIL','ETIMEDOUT','ECONNREFUSED','ECONNRESET','EHOSTUNREACH','ENETUNREACH','EPIPE','ENETDOWN','ECONNABORTED'].includes(code))
    return { category: 'TLS', code, sqlstate: null, condition: null };
  if (codes.some(value => value.startsWith('ERR_TLS_') || value.startsWith('ERR_SSL_')))
    return { category: 'TLS', code: 'TLS_ERROR_UNCLASSIFIED', sqlstate: null, condition: null };
  if (sqlstate?.startsWith('28'))
    return { category: 'AUTHENTICATION', code: `SQLSTATE_${sqlstate}`, sqlstate, condition: null };
  if (sqlstate === '42501')
    return { category: 'PERMISSION', code: `SQLSTATE_${sqlstate}`, sqlstate, condition: null };
  if (sqlstate)
    return { category: 'DATABASE', code: `SQLSTATE_${sqlstate}`, sqlstate, condition: null };
  return { category: 'DATABASE', code: 'DATABASE_ERROR_UNCLASSIFIED', sqlstate: null, condition: null };
}

function makeLedger(runId, sha, ledgerPath, append = appendFile) {
  return async (phase, result, category = 'NONE', sqlstate = null, code = null, condition = null) => {
    if (!LEDGER_PHASES.has(phase) || !['PASS', 'FAIL', 'BLOCKED', 'ATTEMPTED'].includes(result) ||
        !/^(?:NONE|PREFLIGHT|ADMIN|ADMIN_WRITE|POOLER|ROLE_OR_POOLER|ADMIN_CONTAINMENT|CONTAINMENT|ROLLBACK|IDENTITY|CAPABILITY|DNS|TCP|TLS|AUTHENTICATION|PERMISSION|DATABASE)$/.test(category) ||
        (sqlstate !== null && !SAFE_SQLSTATES.has(sqlstate)) ||
        (code !== null && !SAFE_TRANSPORT_CODES.has(code) && !PREFLIGHT_CONDITIONS.has(code) && !PREINSTALL_CODES.has(code) && !CONTAINMENT_CODES.has(code) && !/^SQLSTATE_(?:42501|28P01|28000|57P01|0A000|42704|42710)$/.test(code) && code !== 'DATABASE_ERROR_UNCLASSIFIED') ||
        (condition !== null && !PREFLIGHT_CONDITIONS.has(condition))) throw new Error('LEDGER_FIELD_REJECTED');
    const row = { utc: new Date().toISOString(), runId, sha, ref: PREVIEW_REF, phase, category, result,
      ...(sqlstate ? { sqlstate } : {}), ...(code ? { code } : {}), ...(condition ? { condition } : {}) };
    await append(ledgerPath, `${JSON.stringify(row)}\n`, { mode: 0o600 });
  };
}

export function deriveTemporaryPassword(databasePassword, runId) {
  if (typeof databasePassword !== 'string' || !databasePassword || !/^[0-9a-f-]{36}$/i.test(runId))
    throw new Error('TEMP_CREDENTIAL_INPUT_REJECTED');
  return createHmac('sha256', databasePassword).update(`rubik-u03-preview-window:${PREVIEW_REF}:${runId}`).digest('base64url');
}

export function previewWindowRolePassword(env = process.env) {
  const raw = env.RUBIK_AUDIT_DATABASE_URL;
  if (!raw) throw new PreflightConditionError('TEMP_ROLE_CREDENTIAL_MISSING');
  let url;
  try { url = new URL(raw); } catch { throw new PreflightConditionError('TEMP_ROLE_CREDENTIAL_INVALID'); }
  let username; let password;
  try { username = decodeURIComponent(url.username); password = decodeURIComponent(url.password); }
  catch { throw new PreflightConditionError('TEMP_ROLE_CREDENTIAL_INVALID'); }
  if (url.protocol !== 'postgresql:' || url.hostname !== POOLER_HOST || url.port !== '5432' ||
      username !== `${ROLE}.${PREVIEW_REF}` || url.pathname !== '/postgres' || !/^[A-Za-z0-9_-]{40,50}$/.test(password) ||
      [...url.searchParams.keys()].length !== 0 || url.hash)
    throw new PreflightConditionError('TEMP_ROLE_CREDENTIAL_INVALID');
  return password;
}

function poolConfig({ user, password, host = POOLER_HOST, port = 5432, ssl = true }) {
  if (host !== POOLER_HOST || port !== 5432) throw new Error('POOLER_TARGET_REJECTED');
  return { host, port, user, password, database: 'postgres', max: 1, connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 3000, ssl: ssl ? { ca: SUPABASE_ROOT_2021_CA, rejectUnauthorized: true, servername: POOLER_HOST } : false };
}

// pg_stat_ssl describes the pooler's backend connection. This check inspects
// the actual Node -> pooler TLSSocket and the exact pinned pg connection config.
export function assertNodeClientTls(client, pool) {
  const ssl = pool?.options?.ssl;
  const stream = client?.connection?.stream;
  if (pool?.options?.host !== POOLER_HOST || pool?.options?.port !== 5432 ||
      !ssl || ssl === false || ssl.rejectUnauthorized !== true ||
      ssl.servername !== POOLER_HOST || ssl.ca !== PINNED_POOLER_CA ||
      stream?.encrypted !== true || stream?.authorized !== true ||
      stream?.authorizationError != null) {
    throw new PreflightConditionError('TLS_VERIFICATION_FAILED');
  }
  return true;
}

export function createPreviewAdminPool(password, PoolClass = Pool) {
  const pool = new PoolClass(poolConfig({ user: `postgres.${PREVIEW_REF}`, password }));
  pool.on?.('error', () => {});
  return pool;
}
export function createPreviewRolePool(password, PoolClass = Pool) {
  const pool = new PoolClass(poolConfig({ user: `${ROLE}.${PREVIEW_REF}`, password }));
  pool.on?.('error', () => {});
  return pool;
}

const READ_ONLY_SQL = `select current_database() = 'postgres' as database_ok,
  session_user = 'postgres' and current_user = 'postgres' as exact_admin,
  coalesce((select environment='preview' and project_ref=$1 from private.environment_identity),false) as exact_identity,
  (select count(*)=1 from private.environment_identity) as closed_identity,
  (select count(*)::int from supabase_migrations.schema_migrations) as migration_count,
  (select max(version)::text from supabase_migrations.schema_migrations) as latest_migration,
  (select coalesce(array_agg(version::text order by version),array[]::text[]) from supabase_migrations.schema_migrations) as migrations,
  (select rolcanlogin=false and rolsuper=false and rolbypassrls=false from pg_roles where rolname='rubik_audit_writer') as writer_locked,
  (select rolsuper or rolcreaterole from pg_roles where rolname=current_user) as may_manage_role,
  ((select rolsuper from pg_roles where rolname=current_user) or pg_has_role(current_user,'pg_signal_backend','MEMBER')) as may_terminate_session,
  (select count(*)::int from pg_stat_activity where usename in ('rubik_audit_writer','rubik_preview_u03_writer')) as writer_sessions,
  (select count(*)::int from pg_stat_activity where usename='rubik_audit_writer') as writer_role_sessions,
  (select count(*)::int from pg_stat_activity where usename='rubik_preview_u03_writer') as temporary_role_sessions,
  (select count(*)::int from pg_roles where rolname='rubik_preview_u03_writer') as temporary_role_count,
  (select count(*)::int from pg_policies where policyname like 'u03_preview_writer_%') as temporary_policy_count,
  (select count(*)::int from auth.users) as auth_users,
  (select count(*)::int from public.organizations) as organizations,
  (select count(*)::int from public.organization_members) as organization_members,
  (select count(*)::int from public.projects) as projects,
  (select count(*)::int from public.project_members) as project_members,
  (select count(*)::int from public.audit_events) as audit_events,
  (select count(*)::int from public.provider_results) as provider_results,
  (select count(*)::int from public.imports) as imports,
  (select count(*)::int from private.project_invitations) as invitations,
  (select count(*)::int from private.audit_idempotency) as audit_idempotency,
  (select count(*)::int from private.audit_outbox) as outbox_total,
  (select count(*)::int from private.audit_outbox where state='pending') as pending_outbox,
  (select count(*)::int from private.openseo_project_jobs) as openseo_project_jobs,
  (select count(*)::int from private.openseo_project_connections) as openseo_project_connections,
  (select count(*)::int from private.webmaster_properties) as webmaster_properties,
  (select count(*)::int from private.provider_budgets) as provider_budgets,
  (select count(*)::int from private.provider_spend) as provider_spend,
  (select count(*)::int from private.openseo_google_properties) as openseo_google_properties,
  (select count(*)::int from private.google_captures) as google_captures,
  (select ssl from pg_stat_ssl where pid=pg_backend_pid()) as backend_tls_active`;

const definerSql = role => `select coalesce(array_agg(format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) order by 1),array[]::text[]) as executable,
  coalesce(array_agg(format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) order by 1) filter (where p.prosecdef),array[]::text[]) as definers
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prokind in ('f','p') and has_schema_privilege(${role},n.oid,'USAGE')
    and has_function_privilege(${role},p.oid,'EXECUTE')`;
const DEFiner_SQL = definerSql('current_user');
// The admin's executable functions are not the temporary role's effective capabilities.
const WRITER_DEFINER_SQL = definerSql("'rubik_audit_writer'");

const PREINSTALL_RLS_SQL = `select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where (n.nspname,c.relname) in (('public','audit_events'),('public','provider_results'),('private','audit_idempotency'),('private','audit_outbox')) and c.relrowsecurity`;

async function recordPreinstallCheck(ledger, phase, result, code = null, sqlstate = null) {
  try { await ledger(phase, result, 'PREFLIGHT', code, sqlstate); }
  catch {
    // A one-off append failure can still leave a safe diagnostic. Persistent ledger
    // failure remains fatal; neither case permits the first installation write.
    try { await ledger(phase, 'BLOCKED', 'PREFLIGHT', `${phase === 'security-definer-allowlist' ? 'SECDEF' : 'RLS'}_LEDGER_FAILED`); }
    catch { /* no trustworthy evidence channel remains */ }
    throw new Error(`${phase === 'security-definer-allowlist' ? 'SECDEF' : 'RLS'}_LEDGER_FAILED`);
  }
}

async function probePreinstallCheck(admin, ledger, { phase, sql, valid, prefix }) {
  await recordPreinstallCheck(ledger, phase, 'ATTEMPTED');
  let row;
  try { row = (await admin.query(sql)).rows[0]; }
  catch (error) {
    const sqlstate = typeof error?.code === 'string' && SAFE_SQLSTATES.has(error.code.toUpperCase())
      ? error.code.toUpperCase() : null;
    await recordPreinstallCheck(ledger, phase, 'BLOCKED', `${prefix}_QUERY_FAILED`, sqlstate);
    throw new Error(`${prefix}_QUERY_FAILED`);
  }
  if (!valid(row)) {
    await recordPreinstallCheck(ledger, phase, 'BLOCKED', `${prefix}_UNEXPECTED_RESULT`);
    throw new Error(`${prefix}_UNEXPECTED_RESULT`);
  }
  await recordPreinstallCheck(ledger, phase, 'PASS');
}

const READ_ONLY_RESULT_FIELDS = Object.freeze(['database_ok','exact_admin','exact_identity','closed_identity','migration_count',
  'latest_migration','migrations','writer_locked','may_manage_role','may_terminate_session','writer_sessions',
  'writer_role_sessions','temporary_role_sessions','temporary_role_count','temporary_policy_count','backend_tls_active',
  ...INVENTORY.map(([, field]) => field),'pending_outbox']);

export function assertReadOnlyState(row, { allowOwnedTemporaryResidue = false, allowOwnedFixtureInventory = false } = {}) {
  if (!row || READ_ONLY_RESULT_FIELDS.some(field => !Object.hasOwn(row, field)))
    throw new PreflightConditionError('PREVIEW_READ_ONLY_RESULT_SCHEMA_INCOMPLETE');
  if (!row.database_ok || !row.exact_admin) throw new PreflightConditionError('DATABASE_IDENTITY_MISMATCH');
  if (!row.exact_identity || !row.closed_identity) throw new PreflightConditionError('PREVIEW_IDENTITY_MISMATCH');
  if (row.migration_count !== 27 || row.latest_migration !== '20261015210000' ||
      JSON.stringify(row.migrations) !== JSON.stringify(EXPECTED_N1_MIGRATIONS))
    throw new PreflightConditionError('MIGRATION_SET_MISMATCH');
  if (!row.writer_locked) throw new PreflightConditionError('GENERAL_WRITER_NOT_LOCKED');
  if (!row.may_manage_role || !row.may_terminate_session) throw new PreflightConditionError('ADMIN_CAPABILITY_MISSING');
  if (row.writer_role_sessions !== 0 || (!allowOwnedTemporaryResidue && row.writer_sessions !== 0))
    throw new PreflightConditionError('WRITER_SESSION_RESIDUE');
  if (!allowOwnedTemporaryResidue && row.temporary_role_count !== 0)
    throw new PreflightConditionError('TEMPORARY_ROLE_RESIDUE');
  if (!allowOwnedTemporaryResidue && row.temporary_policy_count !== 0)
    throw new PreflightConditionError('TEMPORARY_POLICY_RESIDUE');
  if (allowOwnedTemporaryResidue && (row.temporary_role_count > 1 || row.temporary_policy_count > TABLES.length ||
      row.writer_sessions !== row.writer_role_sessions + row.temporary_role_sessions))
    throw new PreflightConditionError('TEMPORARY_ROLE_RESIDUE');
  if (!allowOwnedFixtureInventory) {
    if (INVENTORY.some(([, field]) => Number(row[field]) !== 0)) throw new PreflightConditionError('INVENTORY_NOT_EMPTY');
    if (Number(row.pending_outbox) !== 0) throw new PreflightConditionError('PENDING_OUTBOX_NOT_EMPTY');
  }
}

async function runReadOnlyPreflight(pool, { allowOwnedTemporaryResidue = false, allowOwnedFixtureInventory = false } = {}) {
  const client = await pool.connect();
  try {
    assertNodeClientTls(client, pool);
    const result = await client.query(READ_ONLY_SQL, [PREVIEW_REF]);
    assertReadOnlyState(result.rows[0], { allowOwnedTemporaryResidue, allowOwnedFixtureInventory });
    return result.rows[0];
  } finally { client.release(); }
}

function expectedPolicyNames(runId) {
  const tag = runId.replaceAll('-', '').slice(0, 12);
  return TABLES.map(([, , suffix]) => `${POLICY_PREFIX}${tag}_${suffix}`);
}

export function buildRunScopedInstallSql(runId, rolePassword, expiresAt) {
  return buildMinimalInstallSql(runId, rolePassword, expiresAt);
}

async function inspectRunScopedRole(pool, runId, expiresAt, expectedCanLogin = false) {
  const role = (await pool.query(`select r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolinherit,r.rolcreaterole,r.rolcreatedb,
      shobj_description(r.oid,'pg_authid') as marker,
      (select count(*)::int from pg_auth_members where member=r.oid) as membership_count
      from pg_roles r where r.rolname=$1`, [ROLE])).rows[0];
  if (!role || role.rolcanlogin !== expectedCanLogin || role.rolsuper || role.rolbypassrls || role.rolinherit || role.rolcreaterole || role.rolcreatedb ||
      role.marker !== `u03-window:${runId}` || role.membership_count !== 0) throw new Error('TEMP_ROLE_ATTRIBUTES_REJECTED');
  const rows = (await pool.query(`select policyname,schemaname,tablename,cmd,permissive,qual,with_check,roles::text[] as roles
    from pg_policies where policyname = any($1::text[]) order by policyname`, [expectedPolicyNames(runId)])).rows;
  const namespace = `u03-${runId.replaceAll('-', '').slice(0, 12).toLowerCase()}`;
  const policiesExact = TABLES.every(([schema, table], index) => {
    const row = rows.find(candidate => candidate.policyname === expectedPolicyNames(runId)[index]);
    return row?.schemaname === schema && row?.tablename === table && row?.cmd === 'ALL' && row?.permissive === 'PERMISSIVE' &&
      row.roles.includes(ROLE) && row.qual.includes(`${namespace}-a`) && row.qual.includes(`${namespace}-b`) &&
      row.qual.includes('statement_timestamp()') && row.qual.includes(new Date(expiresAt).toISOString().slice(0, 10)) && row.with_check === row.qual;
  });
  if (rows.length !== TABLES.length || !policiesExact) throw new Error('RUN_SCOPE_POLICIES_REJECTED');
  return true;
}

/** Installs and proves only the temporary run role; it deliberately creates no fixture. */
export async function installAndProbeRunScopedRole({ databasePassword, runId, expiresAt,
  rolePassword: suppliedRolePassword, PoolClass = Pool, adminPoolFactory = createPreviewAdminPool, rolePoolFactory = createPreviewRolePool,
  ledger = async () => {} } = {}) {
  if (typeof databasePassword !== 'string' || !databasePassword || !/^[0-9a-f-]{36}$/i.test(runId ?? ''))
    throw new Error('RUN_SCOPE_INPUT_REJECTED');
  let rolePassword = suppliedRolePassword ?? deriveTemporaryPassword(databasePassword, runId);
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(rolePassword)) throw new Error('TEMP_ROLE_CREDENTIAL_INVALID');
  let admin; let installAttempted = false; let succeeded = false;
  try {
    admin = adminPoolFactory(databasePassword, PoolClass);
    await ledger('admin-read-only-preflight', 'ATTEMPTED', 'PREFLIGHT');
    await runReadOnlyPreflight(admin);
    await ledger('admin-read-only-preflight', 'PASS', 'PREFLIGHT');
    await probePreinstallCheck(admin, ledger, { phase: 'security-definer-allowlist', sql: WRITER_DEFINER_SQL,
      valid: row => Array.isArray(row?.definers) && row.definers.length === 4 &&
        EXPECTED_DEFINERS.every(name => row.definers.includes(name)) &&
        row.definers.includes('private.google_capture_command(uuid, text, jsonb)') &&
        row.definers.includes('private.openseo_job(uuid, text, uuid, jsonb)'),
      prefix: 'SECDEF' });
    await probePreinstallCheck(admin, ledger, { phase: 'writer-rls', sql: PREINSTALL_RLS_SQL,
      valid: row => row?.n === TABLES.length, prefix: 'RLS' });
    installAttempted = true;
    await ledger('install-role-nologin', 'ATTEMPTED', 'ADMIN_WRITE');
    await admin.query(buildRunScopedInstallSql(runId, rolePassword, expiresAt));
    await inspectRunScopedRole(admin, runId, expiresAt);
    await ledger('install-role-nologin', 'PASS', 'ADMIN_WRITE');
    const independent = adminPoolFactory(databasePassword, PoolClass);
    try {
      await blockRole(independent, rolePassword, PoolClass, runId, rolePoolFactory, ledger);
      await ledger('independent-containment-probe', 'PASS', 'CONTAINMENT');
    } finally { await independent.end().catch(() => {}); }
    await admin.query(`alter role ${ROLE} with login password ${qPassword(rolePassword)} valid until '${new Date(expiresAt).toISOString()}'`);
    const active = (await admin.query(`select rolcanlogin and rolvaliduntil > now() as active from pg_roles where rolname=$1`, [ROLE])).rows[0];
    if (!active?.active) throw new Error('TEMP_ROLE_ACTIVATION_REJECTED');
    await ledger('activate-temporary-role', 'PASS', 'ADMIN_WRITE');
    const proof = await checkPooler(rolePassword, PoolClass, rolePoolFactory);
    if (!proof.denyPoliciesVerified) throw new Error('RUN_SCOPE_RLS_PROBE_FAILED');
    await inspectRunScopedRole(admin, runId, expiresAt, true);
    await ledger('session-pooler-direct-role', 'PASS', 'POOLER');
    succeeded = true;
    return { runId, rolePassword, expiresAt, pooler: proof };
  } catch (error) {
    const diagnostic = classifyDiagnosticError(error);
    await ledger('role-sequence-failure', 'BLOCKED', diagnostic.category, diagnostic.code, diagnostic.sqlstate);
    throw Object.assign(new Error('RUN_SCOPED_ROLE_PREFLIGHT_BLOCKED'), { cause: error });
  } finally {
    if (!succeeded && installAttempted) {
      try {
        const emergency = adminPoolFactory(databasePassword, PoolClass);
        try { await blockRole(emergency, rolePassword, PoolClass, runId, rolePoolFactory, ledger); } finally { await emergency.end().catch(() => {}); }
      } catch { await ledger('independent-role-containment', 'BLOCKED', 'ADMIN_CONTAINMENT'); }
    }
    await admin?.end().catch(() => {});
    databasePassword = '';
    if (!succeeded) rolePassword = '';
  }
}

async function checkPooler(password, PoolClass = Pool, rolePoolFactory = createPreviewRolePool) {
  const pool = rolePoolFactory(password, PoolClass);
  let client;
  try {
    client = await pool.connect();
    assertNodeClientTls(client, pool);
    const principalFunctions = (await client.query(DEFiner_SQL)).rows[0];
    if (JSON.stringify(principalFunctions.definers) !== JSON.stringify(EXPECTED_DEFINERS))
      throw new Error('SECURITY_DEFINER_ALLOWLIST_REJECTED');
    let inheritedWriter = false;
    try { await client.query(`set role ${WRITER}`); inheritedWriter = true; }
    catch (error) { if (error?.code !== '42501') throw error; }
    if (inheritedWriter) throw new Error('PRODUCT_WRITER_MEMBERSHIP_REJECTED');
    const identity = (await client.query(`select session_user::text as session_user,current_user::text as current_user,
      has_table_privilege(current_user,'public.audit_events','insert') as audit_insert,
      has_table_privilege(current_user,'public.audit_events','select') as audit_select,
      has_table_privilege(current_user,'public.provider_results','insert') as result_insert,
      has_table_privilege(current_user,'public.provider_results','select') as result_select,
      has_table_privilege(current_user,'private.audit_idempotency','insert') as idempotency_insert,
      has_table_privilege(current_user,'private.audit_outbox','select') as outbox_select,
      has_column_privilege(current_user,'private.audit_outbox','state','update') as outbox_state_update,
      has_table_privilege(current_user,'public.imports','insert') as import_insert,
      has_schema_privilege(current_user,'auth','usage') as auth_schema,
      has_table_privilege(current_user,'public.organization_members','select') as org_members_select,
      has_table_privilege(current_user,'public.project_members','select') as project_members_select,
      has_table_privilege(current_user,'public.organizations','select') as organizations_select,
      has_table_privilege(current_user,'public.projects','select') as projects_select,
      has_table_privilege(current_user,'public.imports','select') as imports_select,
      has_table_privilege(current_user,'public.audit_events','delete') as audit_delete,
      has_table_privilege(current_user,'private.audit_outbox','delete') as outbox_delete,
      has_schema_privilege(current_user,'public','create') as public_create,
      has_schema_privilege(current_user,'private','create') as private_create,
      (select ssl from pg_stat_ssl where pid=pg_backend_pid()) as backend_tls_active`)).rows[0];
    if (identity.session_user !== ROLE || identity.current_user !== ROLE || !identity.audit_insert || !identity.audit_select ||
        !identity.result_insert || !identity.result_select || !identity.idempotency_insert || !identity.outbox_select ||
        !identity.outbox_state_update || identity.public_create || identity.private_create ||
        identity.import_insert || identity.imports_select || identity.auth_schema || identity.org_members_select || identity.project_members_select ||
        identity.organizations_select || identity.projects_select ||
        identity.audit_delete || identity.outbox_delete) throw new Error('POOLER_EFFECTIVE_PRIVILEGES_REJECTED');
    const functions = (await client.query(DEFiner_SQL)).rows[0];
    if (JSON.stringify(functions.definers) !== JSON.stringify(EXPECTED_DEFINERS)) throw new Error('SECURITY_DEFINER_ALLOWLIST_REJECTED');
    const providerRpc = (await client.query(`select
      has_function_privilege(current_user,'private.google_capture_command(uuid,text,jsonb)','EXECUTE') as google,
      has_function_privilege(current_user,'private.openseo_job(uuid,text,uuid,jsonb)','EXECUTE') as openseo,
      pg_has_role(current_user,'rubik_audit_writer','MEMBER') as member`)).rows[0];
    if (providerRpc.google || providerRpc.openseo || providerRpc.member) throw new Error('PROVIDER_RPC_CAPABILITY_REJECTED');
    const tablePolicies = (await client.query(`select count(*)::int as rls_count from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where (n.nspname,c.relname) in (('public','audit_events'),('public','provider_results'),('private','audit_idempotency'),('private','audit_outbox')) and c.relrowsecurity`)).rows[0];
    if (tablePolicies.rls_count !== TABLES.length) throw new Error('RLS_CONFIGURATION_REJECTED');
    const deny = (await client.query(`select (select count(*)=0 from public.audit_events) as audit_hidden,
      (select count(*)=0 from public.provider_results) as results_hidden,
      (select count(*)=0 from private.audit_idempotency) as receipts_hidden,
      (select count(*)=0 from private.audit_outbox) as outbox_hidden`)).rows[0];
    if (!Object.values(deny).every(Boolean)) throw new Error('PREFLIGHT_DENY_RLS_FAILED');
    return { sessionUser: identity.session_user, currentUser: identity.current_user, clientTlsVerified: true,
      backendTlsActive: identity.backend_tls_active === true,
      preSetRoleSecurityDefinerCount: principalFunctions.definers.length,
      executableFunctionCount: functions.executable.length, securityDefinerCount: functions.definers.length,
      denyPoliciesVerified: true, positiveRlsDeferred: true };
  } finally { client?.release(); await pool.end().catch(() => {}); }
}

export async function blockRole(adminPool, rolePassword, PoolClass = Pool, runId,
  rolePoolFactory = createPreviewRolePool, ledger = async () => {}) {
  async function stage(name, action, valid = () => true, passCode = () => null) {
    await ledger(`containment-${name}`, 'ATTEMPTED', 'CONTAINMENT');
    let value;
    try { value = await action(); }
    catch (error) {
      const failure = new ContainmentStageError(name, 'QUERY_FAILED', error);
      const diagnostic = classifyDiagnosticError(failure);
      await ledger(`containment-${name}`, 'BLOCKED', diagnostic.category, diagnostic.code, diagnostic.sqlstate);
      throw failure;
    }
    if (!valid(value)) {
      const failure = new ContainmentStageError(name, 'UNEXPECTED_RESULT');
      await ledger(`containment-${name}`, 'BLOCKED', 'CONTAINMENT', failure.code);
      throw failure;
    }
    await ledger(`containment-${name}`, 'PASS', 'CONTAINMENT', passCode(value));
    return value;
  }
  const marker = `u03-window:${runId}`;
  const role = await stage('ownership', async () =>
    (await adminPool.query(`select shobj_description(oid,'pg_authid') as marker from pg_roles where rolname=$1`, [ROLE])).rows[0],
    row => !row || row.marker === marker);
  if (!role) return { absent: true, contained: true };
  await stage('nologin', () => adminPool.query(`alter role ${ROLE} nologin`));
  await stage('nologin-readback', async () =>
    (await adminPool.query(`select not rolcanlogin as locked from pg_roles where rolname=$1`, [ROLE])).rows[0], row => row?.locked === true);
  const target = await stage('role-oid', async () =>
    (await adminPool.query(`select oid from pg_roles where rolname=$1`, [ROLE])).rows[0], row => Number.isInteger(Number(row?.oid)));
  await stage('terminate-sessions', () => adminPool.query(
    `select pg_terminate_backend(pid) from pg_stat_activity where usesysid=$1 and pid<>pg_backend_pid()`, [target.oid]));
  await stage('sessions-readback', async () =>
    (await adminPool.query(`select count(*)::int as count from pg_stat_activity where usesysid=$1 and pid<>pg_backend_pid()`, [target.oid])).rows[0],
  row => row?.count === 0);
  const loginProof = await stage('new-login', async () => {
    const testPool = rolePoolFactory(rolePassword, PoolClass);
    try {
      const c = await testPool.connect();
      c.release();
      return false;
    } catch (error) {
      if (['28P01','28000'].includes(error?.code)) return 'SQLSTATE_REJECTED';
      // Supavisor may return a node-postgres DatabaseError without SQLSTATE for
      // a NOLOGIN role. That error alone is not authentication proof: re-read
      // the catalog and sessions on the independent administrative connection.
      if (error?.constructor?.name === 'DatabaseError' && error?.code == null) {
        const state = (await adminPool.query(`select not r.rolcanlogin as locked,
          (select count(*)::int from pg_stat_activity where usesysid=r.oid) as sessions
          from pg_roles r where r.rolname=$1`, [ROLE])).rows[0];
        if (state?.locked === true && state?.sessions === 0) return 'CATALOG_ONLY';
      }
      throw error;
    } finally { await testPool.end().catch(() => {}); }
  }, value => value === 'SQLSTATE_REJECTED' || value === 'CATALOG_ONLY',
  value => value === 'CATALOG_ONLY' ? 'CONTAINMENT_NEW_LOGIN_CATALOG_ONLY' : null);
  return { absent: false, contained: true, noLogin: true, sessions: 0,
    reloginRejected: loginProof === 'SQLSTATE_REJECTED', catalogOnly: loginProof === 'CATALOG_ONLY' };
}

async function finalState(pool, runId, { remove = true } = {}) {
  const names = expectedPolicyNames(runId);
  const ownership = (await pool.query(`select shobj_description(oid,'pg_authid') as marker,rolcanlogin from pg_roles where rolname=$1`, [ROLE])).rows[0];
  const active = ownership ? (await pool.query(`select count(*)::int as n from pg_stat_activity where usesysid=(select oid from pg_roles where rolname=$1)`, [ROLE])).rows[0].n : 0;
  const rolePolicies = (await pool.query(`select count(*)::int as n from pg_policies where policyname=any($1::text[])`, [names])).rows[0].n;
  const counts = (await pool.query(`select (select count(*) from auth.users) as auth_users,
    (select count(*) from public.organizations) as organizations,(select count(*) from public.organization_members) as organization_members,
    (select count(*) from public.projects) as projects,(select count(*) from public.project_members) as project_members,
    (select count(*) from public.audit_events) as audit_events,(select count(*) from public.provider_results) as provider_results,
    (select count(*) from public.imports) as imports,(select count(*) from private.project_invitations) as invitations,
    (select count(*) from private.audit_idempotency) as audit_idempotency,
    (select count(*) from private.audit_outbox) as outbox_total,
    (select count(*) from private.audit_outbox where state='pending') as pending_outbox,
    (select count(*) from private.openseo_project_jobs) as openseo_project_jobs,
    (select count(*) from private.openseo_project_connections) as openseo_project_connections,
    (select count(*) from private.webmaster_properties) as webmaster_properties,
    (select count(*) from private.provider_budgets) as provider_budgets,
    (select count(*) from private.provider_spend) as provider_spend,
    (select count(*) from private.openseo_google_properties) as openseo_google_properties,
    (select count(*) from private.google_captures) as google_captures,
    (select not rolcanlogin and not rolsuper and not rolbypassrls from pg_roles where rolname='rubik_audit_writer') as writer_locked`)).rows[0];
  const zero = Object.entries(counts).filter(([k]) => k !== 'writer_locked').every(([,v]) => Number(v) === 0) && counts.writer_locked === true;
  if (ownership && ownership.marker !== `u03-window:${runId}`) throw new Error('ROLE_OWNERSHIP_UNVERIFIED');
  if (ownership?.rolcanlogin || active !== 0) throw new Error(`ROLE_NOT_CONTAINED_${String(ownership?.rolcanlogin)}_${String(active)}`);
  if (!zero) throw new Error('PREVIEW_RESIDUES_FOUND');
  if (remove && ownership) {
    if (rolePolicies !== names.length) throw new Error('TEMP_POLICIES_MISMATCH');
    await pool.query(buildMinimalRollbackSql(runId));
  } else if (remove && rolePolicies) throw new Error('ORPHAN_TEMP_POLICIES');
  const residual = (await pool.query(`select exists(select 1 from pg_roles where rolname='${ROLE}') as role_exists,
    (select count(*)::int from pg_policies where policyname like '${POLICY_PREFIX}%') as policy_count`)).rows[0];
  if (remove && (residual.role_exists || residual.policy_count !== 0)) throw new Error('ROLLBACK_NOT_VERIFIED');
  if (remove) {
    const guard = (await pool.query(`select position($1 in pg_get_functiondef('private.trusted_provider_insert_guard()'::regprocedure)) as n`, [ROLE])).rows[0];
    if (Number(guard?.n) !== 0) throw new Error('TRIGGER_GUARD_ROLLBACK_UNVERIFIED');
  }
  return { rolePresent: residual.role_exists, roleLocked: ownership ? true : null, policies: residual.policy_count,
    activeSessions: active, inventoryZero: zero, outboxTotal: Number(counts.outbox_total), pendingOutbox: Number(counts.pending_outbox) };
}

export async function runWindowRolePreflight({ databasePassword, runId = randomUUID(), PoolClass = Pool,
  ledgerPath = null, adminPoolFactory = createPreviewAdminPool, rolePoolFactory = createPreviewRolePool } = {}) {
  if (typeof databasePassword !== 'string' || !databasePassword || !/^[0-9a-f-]{36}$/i.test(runId)) throw new Error('INPUT_REJECTED');
  const path = ledgerPath ?? join(LEDGER_ROOT, `${runId}.jsonl`);
  await mkdir(join(path, '..'), { recursive: true });
  await appendFile(path, '', { flag: 'wx', mode: 0o600 });
  const ledger = makeLedger(runId, process.env.U03_FUNCTIONAL_SHA ?? 'LOCAL_TEST_ONLY', path);
  const rolePassword = deriveTemporaryPassword(databasePassword, runId);
  let failure = null;
  let proof = null;
  let final = null;
  try {
    proof = await installAndProbeRunScopedRole({ databasePassword, runId, rolePassword,
      expiresAt: new Date(Date.now() + 3 * 60_000).toISOString(), PoolClass, adminPoolFactory, rolePoolFactory,
      ledger: (phase, result, category, code, sqlstate) => ledger(phase, result, category, sqlstate, code) });
  } catch (error) { failure = error; }
  try {
    final = await runIndependentContainment({ databasePassword, runId, rolePassword, PoolClass,
      adminPoolFactory, rolePoolFactory, ledgerPath: path });
    await ledger('finally-independent-containment', 'PASS', 'CONTAINMENT');
  } catch {
    await ledger('finally-independent-containment', 'BLOCKED', 'CONTAINMENT');
    throw new Error('INDEPENDENT_CONTAINMENT_BLOCKED');
  } finally { databasePassword = ''; }
  if (failure || !proof) throw new Error('WINDOW_ROLE_PREFLIGHT_BLOCKED');
  return { status: 'PASS', runId, final };
}

// Diagnostic-only entry point: one PostgreSQL read-only query bundle, no role
// installation, temporary policies, Auth actions, fixtures or cleanup writes.
export async function diagnoseReadOnlyPreflight({ databasePassword, runId = randomUUID(), PoolClass = Pool,
  adminPoolFactory = createPreviewAdminPool, ledgerPath = null } = {}) {
  if (typeof databasePassword !== 'string' || !databasePassword || !/^[0-9a-f-]{36}$/i.test(runId))
    throw new Error('DIAGNOSTIC_INPUT_REJECTED');
  const path = ledgerPath ?? join(LEDGER_ROOT, `${runId}.jsonl`);
  await mkdir(join(path, '..'), { recursive: true });
  await appendFile(path, '', { flag: 'wx', mode: 0o600 });
  const sha = process.env.U03_FUNCTIONAL_SHA ?? 'LOCAL_TEST_ONLY';
  const ledger = makeLedger(runId, sha, path);
  let pool;
  await ledger('readonly-diagnostic', 'ATTEMPTED', 'PREFLIGHT');
  try {
    pool = adminPoolFactory(databasePassword, PoolClass);
    await runReadOnlyPreflight(pool);
    await ledger('readonly-diagnostic', 'PASS', 'PREFLIGHT');
    return { status: 'PASS', runId, category: 'NONE', code: 'NONE', sqlstate: null, condition: null,
      checks: ['IDENTITY','MIGRATIONS','WRITER_LOCK','ADMIN_CAPABILITIES','INVENTORY','OUTBOX','CLIENT_TLS'] };
  } catch (error) {
    const diagnostic = classifyDiagnosticError(error);
    await ledger('readonly-diagnostic', 'BLOCKED', diagnostic.category, diagnostic.sqlstate,
      diagnostic.code, diagnostic.condition);
    return { status: 'BLOCKED', runId, ...diagnostic };
  } finally {
    await pool?.end().catch(() => {});
    databasePassword = '';
  }
}

export async function runIndependentContainment({ databasePassword, runId, rolePassword: suppliedRolePassword, PoolClass = Pool,
  adminPoolFactory = createPreviewAdminPool, rolePoolFactory = createPreviewRolePool, ledgerPath = null } = {}) {
  if (typeof databasePassword !== 'string' || !databasePassword || !/^[0-9a-f-]{36}$/i.test(runId ?? ''))
    throw new Error('CONTAINMENT_INPUT_REJECTED');
  const path = ledgerPath ?? join(LEDGER_ROOT, `${runId}.jsonl`);
  await mkdir(join(path, '..'), { recursive: true });
  const sha = process.env.U03_FUNCTIONAL_SHA ?? 'LOCAL_TEST_ONLY';
  const ledger = makeLedger(runId, sha, path);
  const admin = adminPoolFactory(databasePassword, PoolClass);
  const rolePassword = suppliedRolePassword ?? deriveTemporaryPassword(databasePassword, runId);
  try {
    // Containment must happen even when fixture/outbox rows remain. This read-only mode
    // still checks identity, schema, TLS, general-writer lock and admin capabilities first.
    const state = await runReadOnlyPreflight(admin, { allowOwnedTemporaryResidue: true, allowOwnedFixtureInventory: true });
    // The independent path first proves database identity, schema, migration,
    // TLS, inventory and the general writer state while allowing only the
    // expected temporary-role residue to be reconciled below.
    assertReadOnlyState(state, { allowOwnedTemporaryResidue: true, allowOwnedFixtureInventory: true });
    await ledger('containment-only-read-only-preflight', 'PASS', 'PREFLIGHT');
    const owned = (await admin.query(`select shobj_description(oid,'pg_authid') as marker,rolcanlogin
      from pg_roles where rolname=$1`, [ROLE])).rows[0];
    const policyRows = (await admin.query(`select policyname from pg_policies where policyname = any($1::text[])`,
      [expectedPolicyNames(runId)])).rows;
    const roleSessions = Number((await admin.query(`select count(*)::int as count from pg_stat_activity
      where usename='rubik_preview_u03_writer'`)).rows[0]?.count);
    if (!owned) {
      if (Number(state.temporary_role_count) !== 0)
        throw new PreflightConditionError('ROLE_ABSENCE_NOT_VERIFIED');
      if (policyRows.length !== 0 || Number(state.temporary_policy_count) !== 0)
        throw new PreflightConditionError('ROLE_POLICY_RESIDUE');
      if (roleSessions !== 0 || Number(state.temporary_role_sessions) !== 0)
        throw new PreflightConditionError('ROLE_SESSION_RESIDUE');
      if (Number(state.writer_role_sessions) !== 0)
        throw new PreflightConditionError('WRITER_SESSION_RESIDUE');
    } else {
      if (owned.marker !== `u03-window:${runId}`)
        throw new PreflightConditionError('ROLE_OWNERSHIP_UNVERIFIED');
      await blockRole(admin, rolePassword, PoolClass, runId, rolePoolFactory,
        (phase, result, category, code, sqlstate) => ledger(phase, result, category, sqlstate, code));
      if (Number(state.temporary_role_count) !== 1 || policyRows.length !== TABLES.length ||
          Number(state.temporary_policy_count) !== TABLES.length)
        throw new PreflightConditionError('ROLE_POLICY_RESIDUE');
      if (roleSessions !== Number(state.temporary_role_sessions))
        throw new PreflightConditionError('ROLE_SESSION_RESIDUE');
    }
    const final = await finalState(admin, runId, { remove: true });
    await ledger('containment-only-final-state', 'PASS', 'ROLLBACK');
    return final;
  } catch (error) {
    const diagnostic = classifyDiagnosticError(error);
    await ledger('containment-only-final-state', 'BLOCKED', diagnostic.category, diagnostic.sqlstate,
      diagnostic.code, diagnostic.condition);
    throw new Error('INDEPENDENT_CONTAINMENT_BLOCKED');
  } finally { await admin.end().catch(() => {}); databasePassword = ''; }
}

function originalGuardVerified(definition, securityDefiner) {
  return securityDefiner === false && typeof definition === 'string' && !definition.includes(ROLE) &&
    definition.includes("session_user <> 'rubik_audit_writer'") &&
    definition.includes("current_setting('role', true) <> 'rubik_audit_writer'") &&
    definition.includes("session_user = 'postgres'") &&
    definition.includes("raise exception 'trusted provider writer required'");
}

/** One-run administrative recovery. It never installs or activates a role or creates fixtures. */
export async function recoverInstalledRun({ databasePassword, runId, PoolClass = Pool,
  adminPoolFactory = createPreviewAdminPool, ledgerPath = null } = {}) {
  if (runId !== RECOVERY_RUN || typeof databasePassword !== 'string' || !databasePassword)
    throw new Error('RECOVERY_INPUT_REJECTED');
  const path = ledgerPath ?? join(LEDGER_ROOT, `${runId}-recovery.jsonl`);
  await mkdir(join(path, '..'), { recursive: true });
  const ledger = makeLedger(runId, process.env.U03_FUNCTIONAL_SHA ?? 'LOCAL_TEST_ONLY', path);
  const first = adminPoolFactory(databasePassword, PoolClass);
  let rollbackAttempted = false;
  try {
    await ledger('recovery-read-only', 'ATTEMPTED', 'PREFLIGHT');
    const state = await runReadOnlyPreflight(first, { allowOwnedTemporaryResidue: true });
    const ownership = (await first.query(`select shobj_description(oid,'pg_authid') as marker,rolcanlogin
      from pg_roles where rolname=$1`, [ROLE])).rows[0];
    const policies = (await first.query(`select policyname,schemaname,tablename,cmd,permissive,
      roles::text[] as roles,qual,with_check from pg_policies where policyname like $1 order by policyname`,
      [`${POLICY_PREFIX}%`])).rows;
    const sessions = Number((await first.query(`select count(*)::int as n from pg_stat_activity where usename=$1`, [ROLE])).rows[0]?.n);
    const guard = (await first.query(`select pg_get_functiondef(p.oid) as body,p.prosecdef as security_definer
      from pg_proc p where p.oid='private.trusted_provider_insert_guard()'::regprocedure`)).rows[0];
    const definition = guard?.body;
    const namespace = `u03-${runId.replaceAll('-', '').slice(0, 12)}`;
    const expected = policyNames(runId);
    const exactPolicies = policies.length === 4 && TABLES.every(([schema, table], index) => {
      const row = policies.find(item => item.policyname === expected[index]);
      return row?.schemaname === schema && row?.tablename === table && row?.cmd === 'ALL' &&
        row?.permissive === 'PERMISSIVE' && JSON.stringify(row?.roles) === JSON.stringify([ROLE]) &&
        typeof row?.qual === 'string' && row.qual.includes(`${namespace}-a`) && row.qual.includes(`${namespace}-b`) &&
        row.qual.includes(`u03-window:${runId}`) && row.qual.includes('statement_timestamp()') &&
        row.qual.includes('rolcanlogin') && row.qual.includes('rolvaliduntil') &&
        row.with_check === row.qual;
    });
    const alreadyClean = !ownership && policies.length === 0 && sessions === 0 &&
      Number(state.temporary_role_count) === 0 && Number(state.temporary_policy_count) === 0 &&
      originalGuardVerified(definition, guard?.security_definer);
    if (!alreadyClean && (ownership?.marker !== `u03-window:${runId}` || ownership.rolcanlogin !== false ||
        sessions !== 0 || Number(state.temporary_role_count) !== 1 || Number(state.temporary_policy_count) !== 4 ||
        !exactPolicies || guard?.security_definer !== false || typeof definition !== 'string' || !definition.includes(ROLE) ||
        !definition.includes(`u03-window:${runId}`) ||
        !definition.includes("session_user <> 'rubik_audit_writer'") ||
        !definition.includes("current_setting('role', true) <> 'rubik_audit_writer'")))
      throw new PreflightConditionError('ROLE_POLICY_RESIDUE');
    await ledger('recovery-read-only', 'PASS', 'PREFLIGHT');
    await ledger('recovery-owned-role', 'PASS', 'PREFLIGHT');
    if (!alreadyClean) {
      await ledger('recovery-rollback', 'ATTEMPTED', 'ROLLBACK');
      rollbackAttempted = true;
      await first.query(buildMinimalRollbackSql(runId));
      await ledger('recovery-rollback', 'PASS', 'ROLLBACK');
    }
    const independent = adminPoolFactory(databasePassword, PoolClass);
    try {
      await ledger('recovery-final-read', 'ATTEMPTED', 'PREFLIGHT');
      const finalState = await runReadOnlyPreflight(independent);
      const finalGuard = (await independent.query(`select pg_get_functiondef(p.oid) as body,p.prosecdef as security_definer
        from pg_proc p where p.oid='private.trusted_provider_insert_guard()'::regprocedure`)).rows[0];
      if (!originalGuardVerified(finalGuard?.body, finalGuard?.security_definer) || Number(finalState.temporary_role_count) !== 0 ||
          Number(finalState.temporary_policy_count) !== 0 || Number(finalState.temporary_role_sessions) !== 0)
        throw new PreflightConditionError('ROLE_POLICY_RESIDUE');
      await ledger('recovery-final-read', 'PASS', 'ROLLBACK');
      return { status: 'PASS', rolePresent: false, policies: 0, sessions: 0, inventoryZero: true,
        outboxTotal: Number(finalState.outbox_total), pendingOutbox: Number(finalState.pending_outbox),
        guardOriginal: true, writerLocked: true, rollbackAttempted };
    } finally { await independent.end().catch(() => {}); }
  } catch (error) {
    const diagnostic = classifyDiagnosticError(error);
    await ledger(rollbackAttempted ? 'recovery-rollback' : 'recovery-read-only', 'BLOCKED',
      diagnostic.category, diagnostic.sqlstate, diagnostic.code, diagnostic.condition);
    throw new Error('OWNED_WINDOW_RECOVERY_BLOCKED');
  } finally { await first.end().catch(() => {}); databasePassword = ''; }
}

async function main() {
  const lines = [];
  for await (const chunk of process.stdin) lines.push(chunk);
  let input;
  try { input = JSON.parse(Buffer.concat(lines).toString('utf8')); } catch { process.stderr.write('WINDOW_ROLE_INPUT_REJECTED\n'); process.exitCode=2; return; }
  const databasePassword = input?.databasePassword;
  const runId = input?.runId;
  if (!['run','contain','diagnose','recover'].includes(input?.mode) || typeof databasePassword !== 'string' || !runId) { process.stderr.write('WINDOW_ROLE_INPUT_REJECTED\n'); process.exitCode=2; return; }
  try {
    if (input.mode === 'run') {
      const result = await runWindowRolePreflight({ databasePassword, runId });
      process.stdout.write(`U03_WINDOW_ROLE_RESULT PASS runId=${result.runId} roleRemoved=${!result.final.rolePresent} policies=${result.final.policies} inventoryZero=${result.final.inventoryZero} outboxTotal=${result.final.outboxTotal} pending=${result.final.pendingOutbox}\n`);
    } else if (input.mode === 'contain') {
      const rolePassword = process.env.RUBIK_AUDIT_DATABASE_URL ? previewWindowRolePassword(process.env) : undefined;
      const final = await runIndependentContainment({ databasePassword, rolePassword, runId });
      process.stdout.write(`U03_WINDOW_ROLE_CONTAINMENT PASS runId=${runId} rolePresent=${final.rolePresent} roleLocked=${final.roleLocked} policies=${final.policies} activeSessions=${final.activeSessions} inventoryZero=${final.inventoryZero} outboxTotal=${final.outboxTotal} pending=${final.pendingOutbox}\n`);
    } else if (input.mode === 'recover') {
      const result = await recoverInstalledRun({ databasePassword, runId });
      process.stdout.write(`U03_WINDOW_RECOVERY PASS runId=${runId} rolePresent=${result.rolePresent} policies=${result.policies} sessions=${result.sessions} inventoryZero=${result.inventoryZero} outboxTotal=${result.outboxTotal} pending=${result.pendingOutbox} guardOriginal=${result.guardOriginal} writerLocked=${result.writerLocked}\n`);
    } else {
      const result = await diagnoseReadOnlyPreflight({ databasePassword, runId });
      if (result.status === 'PASS') {
        process.stdout.write(`U03_WINDOW_ROLE_READONLY_DIAGNOSTIC PASS runId=${result.runId} checks=IDENTITY,MIGRATIONS,WRITER_LOCK,ADMIN_CAPABILITIES,INVENTORY,OUTBOX,TLS\n`);
      } else {
        const sqlstate = result.sqlstate ?? 'NONE';
        const condition = result.condition ?? 'NONE';
        process.stdout.write(`U03_WINDOW_ROLE_READONLY_DIAGNOSTIC BLOCKED runId=${result.runId} category=${result.category} code=${result.code} sqlstate=${sqlstate} condition=${condition}\n`);
        process.exitCode = 1;
      }
    }
  } catch {
    process.stderr.write('U03_WINDOW_ROLE_RESULT BLOCKED; inspect sanitized ledger, no fixtures were created\n');
    process.exitCode=1;
  } finally { input.databasePassword=''; lines.length=0; }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
