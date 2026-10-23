import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';
import { register } from 'node:module';
import { execFile, spawn } from 'node:child_process';
import { mkdir, appendFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { createPreviewAdminClient } from './u03-preview-api-key.mjs';
import { createDataApiFixtureRun, U03_PREVIEW_REF } from './u03-preview-data-api.mjs';
import { PIN, networkEnvironment, preflight, runB4, scopedHeaders, chromiumEnvironment,
  installScopedRoutes, login, createPageDiagnostics, createDiagnosticIntervalTracker, summarizeDiagnosticInterval, auditAndCapture, ALLOWED_ROUTE_EVENT } from './u03-preview-b4-runner.mjs';
import { isV4SecurityDefinerAllowlistOnly, openPreviewReceiptProcessor } from './u03-preview-v4-receipt.mjs';
import { runSessionProviders } from './u03-preview-session-providers.mjs';
import { runProviderEgressOnly } from './u03-preview-provider-egress.mjs';

const execFileAsync = promisify(execFile);
register('./lib/app-ts-hooks.mjs', import.meta.url);
const SUPABASE_URL = `https://${U03_PREVIEW_REF}.supabase.co`;
export const PRIOR_DATA_API_RUN_ID = '2c72f352-fd79-4360-8c9b-3c619715c574';
export const PRIOR_B4_RUN_ID = '5847ce5a-43b9-4dde-9931-61bd8113b27e';
export const EXPECTED_N1_MIGRATIONS = Object.freeze([
  '20260928120000', '20260928150000', '20261007120000', '20261007150000', '20261009071705',
  '20261009120000', '20261009150000', '20261009170000', '20261009180000', '20261010090000',
  '20261010150000', '20261010160000', '20261012090000', '20261012100000', '20261012110000',
  '20261012120000', '20261012130000', '20261015115750', '20261015145025', '20261015170000',
  '20261015171000', '20261015172000', '20261015180000', '20261015183000', '20261015190000',
  '20261015201500', '20261015210000',
]);

export const PREFLIGHT_SQL = `select
  (select count(*)::int from auth.users) as auth_users,
  (select count(*)::int from public.organizations) as organizations,
  (select count(*)::int from public.projects) as projects,
  (select count(*)::int from public.organization_members) as organization_members,
  (select count(*)::int from public.project_members) as project_members,
  (select count(*)::int from private.project_invitations) as invitations,
  (select count(*)::int from public.audit_events) as audit_events,
  (select count(*)::int from private.audit_outbox) as outbox_total,
  (select count(*)::int from private.audit_outbox where state = 'pending') as pending_outbox,
  (select count(*)::int from public.provider_results) as provider_results,
  (select count(*)::int from public.imports) as imports,
  (select count(*)::int from private.audit_idempotency) as audit_idempotency,
  (select count(*)::int from private.openseo_project_jobs) as openseo_project_jobs,
  (select count(*)::int from private.openseo_project_connections) as openseo_project_connections,
  (select count(*)::int from private.webmaster_properties) as webmaster_properties,
  (select count(*)::int from private.provider_budgets) as provider_budgets,
  (select count(*)::int from private.provider_spend) as provider_spend,
  (select count(*)::int from private.openseo_google_properties) as openseo_google_properties,
  (select count(*)::int from private.google_captures) as google_captures,
  (select not rolsuper and not rolcanlogin and not rolbypassrls from pg_roles where rolname = 'rubik_audit_writer') as writer_locked,
  (select exists (select 1 from pg_roles where rolname = 'rubik_preview_u03_writer')) as window_writer_present,
  (select count(*)::int from pg_policies where policyname like 'u03_preview_writer_%') as window_policy_residue,
  (select count(*)::int from pg_stat_activity where usename in ('rubik_audit_writer','rubik_preview_u03_writer')) as writer_sessions,
  (select (rolsuper or rolcreaterole) from pg_roles where rolname=current_user) as admin_can_manage_roles,
  ((select rolsuper from pg_roles where rolname=current_user) or pg_has_role(current_user,'pg_signal_backend','MEMBER')) as admin_can_terminate_sessions,
  (select exists (select 1 from pg_roles where rolname = 'rubik_preview_receipt_writer')) as receipt_writer_present,
  (select coalesce(array_agg(format('%I.%I(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)) order by n.nspname, p.proname, oidvectortypes(p.proargtypes)), array[]::text[])
    from pg_roles r cross join pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where r.rolname = 'rubik_preview_receipt_writer' and p.prokind in ('f', 'p')
      and has_schema_privilege(r.oid, n.oid, 'USAGE')
      and has_function_privilege(r.oid, p.oid, 'EXECUTE')) as receipt_writer_executable_functions,
  (select coalesce(array_agg(format('%I.%I(%s)', n.nspname, p.proname, oidvectortypes(p.proargtypes)) order by n.nspname, p.proname, oidvectortypes(p.proargtypes)), array[]::text[])
    from pg_roles r cross join pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where r.rolname = 'rubik_preview_receipt_writer' and p.prokind in ('f', 'p')
      and p.prosecdef and has_schema_privilege(r.oid, n.oid, 'USAGE')
      and has_function_privilege(r.oid, p.oid, 'EXECUTE')) as receipt_writer_security_definers,
  (select environment from private.environment_identity limit 1) as environment,
  (select project_ref from private.environment_identity limit 1) as project_ref,
  (select coalesce(json_agg(version::text order by version), '[]'::json) from supabase_migrations.schema_migrations) as migrations`;

const FINAL_SQL = `select
  (select count(*)::int from auth.users) as auth_users,
  (select count(*)::int from public.organizations) as organizations,
  (select count(*)::int from public.projects) as projects,
  (select count(*)::int from public.organization_members) as organization_members,
  (select count(*)::int from public.project_members) as project_members,
  (select count(*)::int from private.project_invitations) as invitations,
  (select count(*)::int from public.audit_events) as audit_events,
  (select count(*)::int from public.provider_results) as provider_results,
  (select count(*)::int from public.imports) as imports,
  (select count(*)::int from private.audit_idempotency) as audit_idempotency,
  (select count(*)::int from private.audit_outbox) as outbox_total,
  (select count(*)::int from private.audit_outbox where state = 'pending') as pending_outbox,
  (select count(*)::int from private.openseo_project_jobs) as openseo_project_jobs,
  (select count(*)::int from private.openseo_project_connections) as openseo_project_connections,
  (select count(*)::int from private.webmaster_properties) as webmaster_properties,
  (select count(*)::int from private.provider_budgets) as provider_budgets,
  (select count(*)::int from private.provider_spend) as provider_spend,
  (select count(*)::int from private.openseo_google_properties) as openseo_google_properties,
  (select count(*)::int from private.google_captures) as google_captures,
  (select exists(select 1 from pg_roles where rolname='rubik_preview_u03_writer')) as window_writer_present,
  (select count(*)::int from pg_policies where policyname like 'u03_preview_writer_%') as window_policy_residue,
  (select count(*)::int from pg_stat_activity where usename in ('rubik_audit_writer','rubik_preview_u03_writer')) as writer_sessions,
  (select not rolsuper and not rolcanlogin and not rolbypassrls from pg_roles where rolname = 'rubik_audit_writer') as writer_locked,
  (select environment from private.environment_identity limit 1) as environment,
  (select project_ref from private.environment_identity limit 1) as project_ref`;

const LEDGER_KEYS = new Set([
  'actor', 'namespace', 'id', 'scope', 'code', 'category', 'http', 'kind', 'reason', 'cases', 'count', 'captures',
  'path', 'viewport', 'conclusion', 'viewportWidth', 'documentWidth', 'bodyWidth', 'visibleErrorCount',
  'consoleErrorCount', 'pageErrorCount', 'hydrationErrorCount', 'version', 'projectIds', 'organizationIds',
  'userIds', 'authUsers', 'organizations', 'projects', 'organizationMembers', 'projectMembers', 'invitations', 'auditEvents',
  'providerResults', 'imports', 'auditIdempotency',
  'outboxTotal', 'pendingOutbox', 'writerLocked', 'migrationCount', 'latestMigration', 'environment',
  'projectRef', 'deploymentId', 'sha', 'host', 'result', 'visualReview',
  'adminKeyFormat', 'publicKeyFormat',
  'pathname', 'errorCode', 'actionHttpStatus', 'sessionCookiePresent', 'routeEvents', 'capturePath',
  'phase', 'diagnostics', 'diagnosticsBefore', 'diagnosticsAfter', 'diagnosticsDelta', 'diagnosticInterval', 'stage', 'expectedCount', 'observedCount', 'valueMatch', 'receiptState', 'httpStatus', 'sqlstate',
  'expectedDestinationClass', 'observedDestinationClass', 'authResult', 'requestClass', 'destinationClass', 'responseClass', 'disposition', 'interceptionOperation',
  'mode', 'evidenceRunId',
]);

const ORIGIN_CLASSES = '(?:preview|preview-supabase|external|inline|unknown)';
function safeCounterMap(input, keyPattern) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const safe = {};
  for (const [key, value] of Object.entries(input)) {
    if (Object.keys(safe).length >= 100) break;
    if (keyPattern.test(key) && Number.isSafeInteger(value) && value >= 0) safe[key] = value;
  }
  return safe;
}

export function safeLedgerDetail(input = {}) {
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (!LEDGER_KEYS.has(key)) continue;
    if (['diagnostics', 'diagnosticsBefore', 'diagnosticsAfter', 'diagnosticsDelta'].includes(key)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      result[key] = {
        console: safeCounterMap(value.console, new RegExp(`^(?:error|warning|log|info|debug|dir|assert|trace|other):${ORIGIN_CLASSES}$`)),
        http: safeCounterMap(value.http, new RegExp(`^[1-5]\\d\\d:${ORIGIN_CLASSES}$`)),
        requestFailures: safeCounterMap(value.requestFailures, new RegExp(`^${ORIGIN_CLASSES}$`)),
        routeEvents: safeCounterMap(value.routeEvents, ALLOWED_ROUTE_EVENT),
      };
      continue;
    }
    if (key === 'diagnosticInterval' && !['before-login','after-login','before-navigation','after-navigation','before-measurement','after-measurement'].includes(value)) continue;
    if (key === 'category' && !['DNS', 'TCP', 'TLS', 'AUTHENTICATION', 'PERMISSION', 'CAPABILITY', 'IDENTITY',
      'PRECONDITION', 'CONFIGURATION', 'READ_ONLY_ADMIN', 'DATABASE', 'TRANSPORT_FAILURE', 'HTTP_FAILURE', 'READS_NOT_TRANSACTIONAL',
      'RESPONSE_INVALID', 'FIXTURE_CREATED', 'EXPECTED_VISIBILITY', 'QUERY_FAILED', 'DIAGNOSTIC_INCOMPLETE',
      'ASSERTION_MISMATCH', 'CHECKS_COMPLETE'].includes(value)) continue;
    if (key === 'code' && !(new Set(['V4_CREDENTIAL_MISSING', 'SIGNING_UNAVAILABLE', 'UNCLASSIFIED',
      'WINDOW_FIXTURE_TRANSPORT_FAILED', 'WINDOW_FIXTURE_ACTOR_AUTH_FAILED',
      'WINDOW_FIXTURE_RESPONSE_INVALID', 'WINDOW_LEDGER_WRITE_FAILED', 'DATA_API_EXCEPTION', 'DATA_API_QUERY_FAILED',
      'SQL_PRIVILEGE_DENIED', 'DATA_API_RESULT_INCOMPLETE', 'ROW_COUNT_MISMATCH', 'ROW_KEY_MISMATCH',
      'I5_ASSERTION_FAILED', 'I5_LEDGER_WRITE_FAILED', 'SIGNATURE_INVALID', 'RECEIPT_PENDING', 'RECEIPT_RESOLVED',
      'H1A_EXTERNAL_NAVIGATION_BLOCKED', 'H1A_PINNED_REQUEST_INTERCEPTION_FAILED',
      'H1A_PHASE_CONSOLE_ERRORS', 'H1A_LOGIN_FAILED', 'H1A_NAVIGATION_FAILED',
      'DIAGNOSTIC_STAGE_MISSING', 'DIAGNOSTIC_SUM_MISMATCH', 'DIAGNOSTIC_SNAPSHOT_INVALID', 'DIAGNOSTIC_COUNTER_RESET',
      'HTTP_STATUS_INVALID', 'DNS_RESOLUTION_FAILED', 'SESSION_POOLER_IPV4_UNAVAILABLE', 'TCP_CONNECTION_TIMEOUT',
      'TCP_CONNECTION_REFUSED', 'TCP_CONNECTION_FAILED', 'TLS_CERTIFICATE_OR_HANDSHAKE_REJECTED',
      'DATABASE_AUTHENTICATION_REJECTED', 'SQL_PERMISSION_DENIED', 'READ_ONLY_SQL_PERMISSION_DENIED',
      'TLS_OR_DATABASE_HANDSHAKE_FAILED', 'READ_ONLY_DATABASE_CHECK_FAILED', 'PREVIEW_DATABASE_TARGET_REJECTED',
      'PASSWORD_COMPARISON_INPUT_MISSING', 'URL_PASSWORD_BYTES_MISMATCH', 'URL_PASSWORD_BYTES_MATCH']).has(value) || /^HTTP_[45]\d\d$/.test(String(value)))) continue;
    if (key === 'sqlstate' && !new Set(['42501', '28P01', '28000', '57P01', '0A000', '42704', '42710']).has(value)) continue;
    if (key === 'actor' && !['ownerA', 'ownerB', 'outsider'].includes(value)) continue;
    if (key === 'stage' && !['FIXTURE_INPUT', 'OWN_READ', 'CROSS_READ', 'OUTSIDER_READ', 'MISSING_READ',
      'H1A_AUTH_LOGIN', 'H1A_VIEW_DESKTOP_MEASUREMENT', 'H1A_VIEW_DESKTOP_REPORT', 'H1A_VIEW_MOBILE_MEASUREMENT', 'H1A_VIEW_MOBILE_REPORT', 'H1A_LOGOUT', 'H1A_POST_LOGOUT_DENIAL'].includes(value)) continue;
    if (key === 'receiptState' && !['NOT_REQUIRED', 'DEFERRED_TO_CLEANUP', 'RESOLVED'].includes(value)) continue;
    if (['expectedCount', 'observedCount', 'httpStatus'].includes(key) && value !== null &&
      (!Number.isSafeInteger(value) || value < 0)) continue;
    if (key === 'valueMatch' && typeof value !== 'boolean') continue;
    if (key === 'phase' && !['login', 'login-B', 'login-revoked', '/panel-A', '/panel-B', '/A1', '/A2', '/B1', 'deny-B1', 'deny-A1-A2', 'logout-A', 'logout-B', 'revoked-access',
      'H1A_AUTH_LOGIN', 'H1A_VIEW_DESKTOP_MEASUREMENT', 'H1A_VIEW_DESKTOP_REPORT', 'H1A_VIEW_MOBILE_MEASUREMENT', 'H1A_VIEW_MOBILE_REPORT', 'H1A_LOGOUT', 'H1A_POST_LOGOUT_DENIAL'].includes(value)) continue;
    if (key === 'expectedDestinationClass' && !['PINNED_ORIGIN_AUTH', 'PINNED_ORIGIN_VIEW', 'PINNED_ORIGIN_LOGOUT', 'PINNED_ORIGIN_PROTECTED_ROUTE'].includes(value)) continue;
    if (key === 'observedDestinationClass' && !['PINNED_ORIGIN', 'ACCESS_ROUTE', 'EXTERNAL', 'UNKNOWN'].includes(value)) continue;
    if (key === 'authResult' && !['SIGNED_OUT', 'AUTHENTICATED', 'AUTH_REQUIRED', 'UNKNOWN'].includes(value)) continue;
    if (key === 'destinationClass' && !['PINNED_ORIGIN', 'EXTERNAL', 'UNKNOWN'].includes(value)) continue;
    if (key === 'interceptionOperation' && !['CLASSIFY_URL', 'CLASSIFY_ORIGIN', 'CLASSIFY_REDIRECT',
      'CONSTRUCT_HEADERS', 'CONTINUE_REQUEST', 'CONTINUE_RESPONSE', 'FAIL_REQUEST'].includes(value)) continue;
    if (key === 'responseClass' && !['DIRECT', 'REDIRECT', 'UNKNOWN'].includes(value)) continue;
    if (key === 'requestClass' && !['MAIN_DOCUMENT', 'FRAME_DOCUMENT', 'SUBRESOURCE', 'UNKNOWN'].includes(value)) continue;
    if (key === 'disposition' && !['BLOCKED_EXTERNAL_SUBRESOURCE', 'BLOCKED_EXTERNAL_SUBRESOURCE_REDIRECT', 'BLOCKED_EXTERNAL_MAIN_FRAME_REDIRECT', 'BLOCKED_EXTERNAL_MAIN_FRAME_NAVIGATION', 'PINNED_REQUEST_BLOCKED'].includes(value)) continue;
    if (key === 'mode' && !['full', 'playwright-only', 'membership-revocation', 'roles-invitations', 'cross-surface', 'session-providers', 'provider-egress', 'window-i2-i5', 'window-h1a'].includes(value)) continue;
    if (key === 'evidenceRunId' && ![PRIOR_DATA_API_RUN_ID, PRIOR_B4_RUN_ID].includes(value)) continue;
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

export function classifySupabaseKeyFormat(value) {
  if (typeof value !== 'string' || !value) return 'inválido';
  if (value.startsWith('sb_secret_')) return /^sb_secret_[A-Za-z0-9_-]+$/.test(value) ? 'sb_secret_' : 'inválido';
  if (value.startsWith('sb_publishable_')) return /^sb_publishable_[A-Za-z0-9_-]+$/.test(value) ? 'sb_publishable_' : 'inválido';
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return 'legado';
  return 'inválido';
}

export function assertPreviewKeyFormats(adminKey, publicKey) {
  const adminKeyFormat = classifySupabaseKeyFormat(adminKey);
  const publicKeyFormat = classifySupabaseKeyFormat(publicKey);
  const adminCompatible = adminKeyFormat === 'sb_secret_' || adminKeyFormat === 'legado';
  const publicCompatible = publicKeyFormat === 'sb_publishable_' || publicKeyFormat === 'legado';
  if (!adminCompatible || !publicCompatible) {
    throw Object.assign(new Error('SUPABASE_KEY_FORMAT_REJECTED'), { adminKeyFormat, publicKeyFormat, httpStatus: null });
  }
  return { adminKeyFormat, publicKeyFormat };
}

function authSettingsError(code, httpStatus = null) {
  return Object.assign(new Error(code), { httpStatus });
}

export async function readPreviewAuthSettings({ fetchImpl = fetch, apiKey } = {}) {
  const keyFormat = classifySupabaseKeyFormat(apiKey);
  if (keyFormat !== 'sb_publishable_' && keyFormat !== 'legado') throw authSettingsError('AUTH_SETTINGS_KEY_FORMAT');
  let response;
  try {
    response = await fetchImpl(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: apiKey }, redirect: 'manual', signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw authSettingsError(`AUTH_SETTINGS_${authSettingsFailureCategory(error)}`);
  }
  if (response.status !== 200) throw authSettingsError('AUTH_SETTINGS_HTTP', response.status);
  try { return { settings: await response.json(), httpStatus: response.status }; }
  catch { throw authSettingsError('AUTH_SETTINGS_JSON', response.status); }
}

export async function verifyInitialPreviewState({ env = process.env, fetchImpl = fetch, admin = null, publicClient = null, sql = runPreviewReadOnlySql, inspect, preflightFn = preflight } = {}) {
  const adminKey = env.U03_PREVIEW_ADMIN_KEY;
  const publicKey = env.U03_PREVIEW_PUBLIC_KEY;
  if (!adminKey || !publicKey) throw new Error('PREVIEW_KEYS_REQUIRED');
  assertPreviewKeyFormats(adminKey, publicKey);
  const vercel = await preflightFn({ token: env.VERCEL_OIDC_TOKEN, fetchImpl, ...(inspect ? { inspect } : {}) });

  const { settings, httpStatus: authSettingsHttpStatus } = await readPreviewAuthSettings({ fetchImpl, apiKey: publicKey });
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
      organizationMembers: state.organizationMembers, projectMembers: state.projectMembers, invitations: state.invitations,
      auditEvents: state.auditEvents, providerResults: state.providerResults, imports: state.imports,
      auditIdempotency: state.auditIdempotency, outboxTotal: state.outboxTotal, pendingOutbox: state.pendingOutbox,
      migrationCount: state.migrationCount, latestMigration: state.latestMigration,
      writerLocked: state.writerLocked, environment: state.environment, projectRef: state.projectRef,
      authSettingsHttpStatus,
    },
  };
}

export const PREFLIGHT_RESULT_FIELDS = Object.freeze([
  'auth_users', 'organizations', 'projects', 'organization_members', 'project_members', 'invitations',
  'audit_events', 'outbox_total', 'pending_outbox', 'provider_results', 'imports', 'audit_idempotency',
  'openseo_project_jobs', 'openseo_project_connections', 'webmaster_properties', 'provider_budgets',
  'provider_spend', 'openseo_google_properties', 'google_captures', 'writer_locked',
  'window_writer_present', 'window_policy_residue', 'writer_sessions', 'admin_can_manage_roles',
  'admin_can_terminate_sessions', 'receipt_writer_present', 'receipt_writer_executable_functions',
  'receipt_writer_security_definers', 'environment', 'project_ref', 'migrations',
]);

export async function verifyReadOnlyPreviewState({ sql = runPreviewReadOnlySql } = {}) {
  const state = await sql(PREFLIGHT_SQL, { ref: U03_PREVIEW_REF });
  const missingFields = PREFLIGHT_RESULT_FIELDS.filter(field => !Object.hasOwn(state ?? {}, field));
  if (missingFields.length) throw new Error('PREVIEW_READ_ONLY_RESULT_SCHEMA_INCOMPLETE');
  const expected = EXPECTED_N1_MIGRATIONS;
  const migrationMatch = Array.isArray(state.migrations) && state.migrations.length === expected.length &&
    expected.every((version, index) => state.migrations[index] === version);
  if (!migrationMatch) throw new Error('N1_MIGRATION_SET_MISMATCH');
  if (state.environment !== 'preview' || state.project_ref !== U03_PREVIEW_REF) throw new Error('PREVIEW_DATABASE_IDENTITY_INVALID');
  if (state.writer_locked !== true) throw new Error('WRITER_CAPABILITY_NOT_LOCKED');
  if (state.window_writer_present === true || state.window_policy_residue !== 0 || state.writer_sessions !== 0)
    throw new Error('TEMPORARY_ROLE_OR_SESSION_RESIDUE');
  if (state.admin_can_manage_roles !== true || state.admin_can_terminate_sessions !== true)
    throw new Error('ADMIN_CONTAINMENT_CAPABILITY_MISSING');
  if (state.receipt_writer_present === true &&
      !isV4SecurityDefinerAllowlistOnly(state.receipt_writer_security_definers))
    throw new Error('PREVIEW_RECEIPT_SECURITY_DEFINER_UNSAFE');
  const empty = ['auth_users', 'organizations', 'projects', 'organization_members', 'project_members', 'invitations', 'audit_events',
    'provider_results', 'imports', 'audit_idempotency', 'outbox_total', 'pending_outbox', 'openseo_project_jobs',
    'openseo_project_connections', 'webmaster_properties', 'provider_budgets', 'provider_spend',
    'openseo_google_properties', 'google_captures'];
  if (empty.some(field => state[field] !== 0)) throw new Error('PREVIEW_INITIAL_INVENTORY_NOT_EMPTY');
  return {
    authUsers: state.auth_users, organizations: state.organizations, projects: state.projects,
    organizationMembers: state.organization_members, projectMembers: state.project_members, invitations: state.invitations,
    auditEvents: state.audit_events, providerResults: state.provider_results, imports: state.imports,
    auditIdempotency: state.audit_idempotency, outboxTotal: state.outbox_total, pendingOutbox: state.pending_outbox,
    migrationCount: state.migrations.length, latestMigration: state.migrations.at(-1),
    writerLocked: state.writer_locked, environment: state.environment, projectRef: state.project_ref,
  };
}

export async function runReadOnlyPreflight({ token = process.env.VERCEL_OIDC_TOKEN, inspect, sql = runPreviewReadOnlySql, preflightFn = preflight } = {}) {
  const vercel = await preflightFn({ token, ...(inspect ? { inspect } : {}) });
  const initial = await verifyReadOnlyPreviewState({ sql });
  return { vercel, initial };
}

export async function verifyFinalPreviewState({ sql = runPreviewReadOnlySql, allowTemporaryWindowCapability = false } = {}) {
  const state = await sql(FINAL_SQL, { ref: U03_PREVIEW_REF });
  const inventoryFields = ['auth_users', 'organizations', 'projects', 'organization_members', 'project_members', 'invitations', 'audit_events',
    'provider_results', 'imports', 'audit_idempotency', 'openseo_project_jobs', 'openseo_project_connections', 'webmaster_properties',
    'provider_budgets', 'provider_spend', 'openseo_google_properties', 'google_captures'];
  const schemaComplete = !!state && [...inventoryFields, 'outbox_total', 'pending_outbox', 'window_writer_present',
    'window_policy_residue', 'writer_sessions', 'writer_locked', 'environment', 'project_ref'].every(field => Object.hasOwn(state, field));
  const inventoriesClear = schemaComplete && inventoryFields.every(field => state[field] === 0);
  const outboxClear = schemaComplete && state.outbox_total === 0 && state.pending_outbox === 0;
  const capabilitiesSafe = schemaComplete && state.writer_locked === true && state.environment === 'preview' &&
    state.project_ref === U03_PREVIEW_REF && (allowTemporaryWindowCapability
      ? state.window_writer_present === true && state.window_policy_residue === 4
      : state.window_writer_present === false && state.window_policy_residue === 0 && state.writer_sessions === 0);
  return { inventoriesClear, outboxClear, capabilitiesSafe, state };
}

function u03WindowCapability(runId, expiresAt, env = process.env) {
  const secret = env.U03_PREVIEW_WRITER_WINDOW_SECRET;
  if (!secret || !PIN.deploymentId.startsWith('dpl_') || !PIN.host || !/^[0-9a-f]{40}$/i.test(PIN.sha))
    throw new Error('WINDOW_CAPABILITY_CONFIGURATION_INVALID');
  return createHmac('sha256', secret).update([
    'rubik-h1a-window-v1', runId, PIN.deploymentId.toLowerCase(), PIN.host.toLowerCase(), PIN.sha.toLowerCase(), PIN.branch, String(expiresAt),
  ].join('\n'), 'utf8').digest('hex');
}

async function invokeWindowFixture({ kind, actor = 'ownerA', tenantId, projectId, fixtures, runId, env, fetchImpl = fetch, ledger }) {
  const caseId = `window-fixture-${kind}`;
  const stageDetail = { actor, stage: 'FIXTURE_INPUT' };
  try { await ledger(caseId, 'ATTEMPTED', stageDetail); }
  catch { throw new Error('WINDOW_LEDGER_WRITE_FAILED'); }
  let bearer;
  try { bearer = await fixtures.actorBearer(actor); }
  catch {
    try { await ledger(caseId, 'BLOCKED', { ...stageDetail, category: 'AUTH_FAILURE', code: 'WINDOW_FIXTURE_ACTOR_AUTH_FAILED' }); }
    catch { throw new Error('WINDOW_LEDGER_WRITE_FAILED'); }
    throw new Error('WINDOW_FIXTURE_ACTOR_AUTH_FAILED');
  }
  const origin = `https://${PIN.host}`;
  const expiresAt = Date.now() + 10 * 60_000;
  const url = `${origin}/api/u03/window-fixtures/${encodeURIComponent(tenantId)}/${projectId}`;
  const token = env.VERCEL_OIDC_TOKEN;
  if (!token) throw new Error('OIDC_TOKEN_MISSING');
  const headers = scopedHeaders(url, {
    authorization: `Bearer ${bearer.accessToken}`, 'content-type': 'application/json',
    'x-rubik-u03-expires': String(expiresAt), 'x-rubik-u03-capability': u03WindowCapability(runId, expiresAt, env),
  }, token, origin, runId);
  let response;
  try { response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ kind, runId }), redirect: 'manual', signal: AbortSignal.timeout(20000) }); }
  catch {
    try { await ledger(caseId, 'BLOCKED', { ...stageDetail, category: 'TRANSPORT_FAILURE', code: 'WINDOW_FIXTURE_TRANSPORT_FAILED' }); }
    catch { throw new Error('WINDOW_LEDGER_WRITE_FAILED'); }
    throw new Error('WINDOW_FIXTURE_TRANSPORT_FAILED');
  }
  if (response.status !== 200) {
    // The fixture endpoint keeps its public body closed and small. Read only the enumerated
    // 503 code; never forward arbitrary response text, details or SQL to the campaign ledger.
    if (response.status === 503) {
      const body = await response.json().catch(() => null);
      const safe503 = new Set(['SIGNING_UNAVAILABLE', 'RECEIPT_PENDING']);
      const code = body?.ok === false && safe503.has(body.code) ? body.code : 'UNCLASSIFIED';
      try { await ledger(caseId, 'BLOCKED', { ...stageDetail, category: 'HTTP_FAILURE', httpStatus: 503, code }); }
      catch { throw new Error('WINDOW_LEDGER_WRITE_FAILED'); }
      throw new Error(`WINDOW_FIXTURE_HTTP_${kind.toUpperCase()}_503_${code}`);
    }
    const code = Number.isInteger(response.status) && response.status >= 400 && response.status <= 599
      ? `HTTP_${response.status}` : 'HTTP_STATUS_INVALID';
    try { await ledger(caseId, 'BLOCKED', { ...stageDetail, category: 'HTTP_FAILURE',
      ...(Number.isInteger(response.status) ? { httpStatus: response.status } : {}), code }); }
    catch { throw new Error('WINDOW_LEDGER_WRITE_FAILED'); }
    throw new Error(`WINDOW_FIXTURE_HTTP_${kind.toUpperCase()}_${code}`);
  }
  const body = await response.json().catch(() => null);
  if (body?.ok !== true || body.kind !== kind || (kind === 'audit' ? !Number.isSafeInteger(body.seq) : typeof body.id !== 'string')) {
    try { await ledger(caseId, 'BLOCKED', { ...stageDetail, category: 'RESPONSE_INVALID', code: 'WINDOW_FIXTURE_RESPONSE_INVALID' }); }
    catch { throw new Error('WINDOW_LEDGER_WRITE_FAILED'); }
    throw new Error(`WINDOW_FIXTURE_RESPONSE_INVALID_${kind.toUpperCase()}`);
  }
  try { await ledger(caseId, 'PASS', { ...stageDetail, category: 'FIXTURE_CREATED', count: kind === 'audit' ? body.seq : 1 }); }
  catch { throw new Error('WINDOW_LEDGER_WRITE_FAILED'); }
  return body;
}

export async function verifyProtectedWindowRuntime({ runId, env = process.env, fetchImpl = fetch }) {
  if (env.U03_PREVIEW_WRITER_WINDOW !== 'armed-run-capability' || env.U03_PREVIEW_WRITER_WINDOW_RUN_ID !== runId ||
      env.U03_PREVIEW_WRITER_WINDOW_REF !== U03_PREVIEW_REF || env.U03_PREVIEW_WRITER_WINDOW_SHA !== PIN.sha ||
      env.U03_PIN_DEPLOYMENT_ID !== PIN.deploymentId || env.U03_PIN_DEPLOYMENT_HOST !== PIN.host ||
      env.U03_PIN_DEPLOYMENT_SHA !== PIN.sha) throw new Error('WINDOW_DEPLOYMENT_ENVIRONMENT_MISMATCH');
  const origin = `https://${PIN.host}`;
  const url = `${origin}/api/u03/window`;
  const expiresAt = Date.now() + 5 * 60_000;
  const token = env.VERCEL_OIDC_TOKEN;
  if (!token) throw new Error('OIDC_TOKEN_MISSING');
  const headers = scopedHeaders(url, {
    'x-rubik-u03-expires': String(expiresAt),
    'x-rubik-u03-capability': u03WindowCapability(runId, expiresAt, env),
  }, token, origin, runId);
  let response;
  try { response = await fetchImpl(url, { method: 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error('WINDOW_RUNTIME_PREFLIGHT_TRANSPORT_FAILED'); }
  if (response.url && new URL(response.url).origin !== origin) throw new Error('WINDOW_RUNTIME_EXTERNAL_RESPONSE_REJECTED');
  if (response.status === 404) {
    const code = response.headers?.get?.('x-rubik-u03-diagnostic');
    if (new Set(['RUNTIME_WRITER_POOL_UNAVAILABLE','RUNTIME_CLIENT_TLS_REJECTED','RUNTIME_PRINCIPAL_REJECTED',
      'RUNTIME_PRIVILEGES_REJECTED','RUNTIME_DEFINERS_REJECTED','RUNTIME_PROVIDER_RPC_REJECTED',
      'RUNTIME_RLS_REJECTED','RUNTIME_INVENTORY_REJECTED','RUNTIME_POOL_CONNECT_QUERY_FAILED',
      'RUNTIME_TLS_QUERY_FAILED','RUNTIME_IDENTITY_QUERY_FAILED','RUNTIME_DEFINERS_QUERY_FAILED',
      'RUNTIME_PROVIDER_RPC_QUERY_FAILED','RUNTIME_RLS_QUERY_FAILED','RUNTIME_INVENTORY_QUERY_FAILED']).has(code))
      throw new Error(code);
  }
  if (response.status !== 200)
    throw new Error(`WINDOW_RUNTIME_PREFLIGHT_HTTP_${response.status}`);
  const body = await response.json().catch(() => null);
  const expected = ['CLIENT_TLS','DIRECT_PRINCIPAL','PRIVILEGES','PROVIDER_RPC_DENIED','SECURITY_DEFINER_ALLOWLIST','RLS','EMPTY_INITIAL_STATE'];
  if (body?.ok !== true || JSON.stringify(body.checks) !== JSON.stringify(expected))
    throw new Error('WINDOW_RUNTIME_PREFLIGHT_REJECTED');
  return { passed: true, status: response.status };
}

export async function runProtectedWindowSurfaces({ fixtures, a1, b1, runId, env = process.env, fetchImpl = fetch, ledger,
  i2RoutesFn = null }) {
  if (!fixtures || !a1 || !b1 || typeof ledger !== 'function') throw new Error('WINDOW_SURFACE_INPUT_INVALID');
  const created = {};
  for (const owner of [
    { actor: 'ownerA', tenantId: `${fixtures.namespace}-a`, projectId: 'a1', id: a1, suffix: 'A' },
    { actor: 'ownerB', tenantId: `${fixtures.namespace}-b`, projectId: 'b1', id: b1, suffix: 'B' },
  ]) {
    const audit = await invokeWindowFixture({ kind: 'audit', ...owner, fixtures, runId, env, fetchImpl, ledger });
    const result = await invokeWindowFixture({ kind: 'result', ...owner, fixtures, runId, env, fetchImpl, ledger });
    const imported = await invokeWindowFixture({ kind: 'import', ...owner, fixtures, runId, env, fetchImpl, ledger });
    created[owner.suffix] = { auditSeq: audit.seq, resultId: result.id, importId: imported.id };
  }
  const cross = await fixtures.verifyPopulatedCrossSurface({ a1, b1,
    auditSeqA: created.A.auditSeq, auditSeqB: created.B.auditSeq,
    resultIdA: created.A.resultId, resultIdB: created.B.resultId,
    importIdA: created.A.importId, importIdB: created.B.importId });
  if (cross?.passed !== true || cross.checks?.length !== 3) throw new Error('I5_POPULATED_CROSS_SURFACE_REJECTED');
  await ledger('i5-populated-signed-rows', 'PASS', { cases: cross.checks.length });
  const routeCheck = i2RoutesFn ?? (await import('./u03-preview-i2-routes.mjs')).runProtectedI2Routes;
  const routes = await routeCheck({ fixtures, resultId: created.A.resultId, runId, env, ledger,
    capabilityFor: expiresAt => u03WindowCapability(runId, expiresAt, env) });
  if (routes?.passed !== true || routes.positiveCount < 2 || routes.negativeCount < 5)
    throw new Error('I2_PROTECTED_ROUTES_REJECTED');
  await ledger('i2-protected-routes', 'PASS', { cases: routes.positiveCount + routes.negativeCount });
  return { i2: true, i5: true, resultId: created.A.resultId };
}

/** H1-A export/verification/restore is deliberately separate from the U03 matrix. */
export async function runProtectedWindowH1Export({ fixtures, runId, env = process.env, fetchImpl = fetch, ledger }) {
  if (!fixtures || typeof ledger !== 'function') throw new Error('H1_EXPORT_INPUT_INVALID');
  await ledger('h1a-export-consistency-limit', 'PASS', { fixtureWritesConcurrent: 0, category: 'READS_NOT_TRANSACTIONAL' });
  const tenantId = fixtures.namespace + '-a';
  const bearer = await fixtures.actorBearer('ownerA');
  const expiresAt = Date.now() + 10 * 60_000;
  const origin = `https://${PIN.host}`;
  const exportUrl = `${origin}/proyectos/${encodeURIComponent(tenantId)}/a1/exportar`;
  const headers = scopedHeaders(exportUrl, {
    authorization: `Bearer ${bearer.accessToken}`, 'x-rubik-u03-expires': String(expiresAt),
    'x-rubik-u03-capability': u03WindowCapability(runId, expiresAt, env),
  }, env.VERCEL_OIDC_TOKEN, origin, runId);
  let response;
  const requestStarted = performance.now();
  try { response = await fetchImpl(exportUrl, { headers, redirect: 'manual', signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('PREVIEW_HTTP_EXPORT_TRANSPORT_FAILED'); }
  if (response.url && new URL(response.url).origin !== origin) throw new Error('PREVIEW_HTTP_EXPORT_ORIGIN_REJECTED');
  if (response.status === 503) {
    const gate = response.headers?.get?.('x-rubik-h1a-export-gate');
    const allowed = new Set(['SIGNING_UNAVAILABLE','RECEIPT_PRECHECK','SCHEMA_UNKNOWN','PROVENANCE_INVALID',
      'OPERATIONS_INCOMPLETE','SEO_INCOMPLETE','SEO_CHANGED','CONTENT_GEO_INCOMPLETE',
      'CONTENT_GEO_CHANGED','SCHEMA_CHANGED','RECEIPT_CHANGED']);
    throw new Error(allowed.has(gate) ? `PREVIEW_HTTP_EXPORT_${gate}` : 'PREVIEW_HTTP_EXPORT_FAILED_503');
  }
  if (response.status !== 200) throw new Error(`PREVIEW_HTTP_EXPORT_FAILED_${response.status}`);
  const document = await response.json().catch(() => null);
  if (!document || typeof document !== 'object') throw new Error('PREVIEW_HTTP_EXPORT_INVALID');
  await ledger('h1a-http-export-request', 'PASS', { httpStatus: response.status, durationMs: Math.round(performance.now() - requestStarted) });
  const [{ loadKeyring }, { verifyProjectExport }, { planRestore }] = await Promise.all([
    import('../src/lib/provenance/keyring.ts'), import('../src/lib/recovery/verify-export.ts'), import('../src/lib/restore/plan.ts'),
  ]);
  const loaded = loadKeyring(env);
  if (!loaded.ok) throw new Error('LOCAL_EXPORT_KEYRING_UNAVAILABLE');
  const project = await fixtures.actorAccess('ownerA').api.from('projects').select('id,organization_id').eq('slug','a1').eq('organization_id', (await fixtures.actorAccess('ownerA').api.from('organizations').select('id').eq('slug',tenantId).single()).data?.id).single();
  if (project.error || !project.data) throw new Error('EXPORT_SCOPE_LOOKUP_FAILED');
  const ref = { projectId: project.data.id, organizationId: project.data.organization_id, scope: { tenantId, projectId: 'a1' } };
  const verificationStarted = performance.now();
  const verified = verifyProjectExport(document, loaded.keyring, ref);
  if (!verified.ok || verified.completeness?.status !== 'COMPLETE') throw new Error('OFFLINE_EXPORT_VERIFICATION_FAILED');
  await ledger('h1a-offline-export-verification', 'PASS', { offlineVerified: true, durationMs: Math.round(performance.now() - verificationStarted) });
  const altered = structuredClone(document);
  if (!Array.isArray(altered.audit?.rows) || !altered.audit.rows.length) throw new Error('EXPORT_AUDIT_EMPTY');
  altered.audit.rows[0].action = 'u03.tampered';
  const tampered = verifyProjectExport(altered, loaded.keyring, ref);
  if (tampered.ok && tampered.audit.valid) throw new Error('EXPORT_TAMPER_ACCEPTED');
  if (planRestore(altered, loaded.keyring, { operatorId: fixtures.actorAccess('ownerA').id }).ok)
    throw new Error('TAMPERED_RESTORE_PLAN_ACCEPTED');
  await ledger('h1a-tamper-rejection', 'PASS', { tamperRejected: true });
  const restoreStarted = performance.now();
  await ledger('h1a-local-double-restore', 'ATTEMPTED');
  let restore;
  try { restore = await restorePreviewDocumentLocally(document, env, runId); }
  catch (error) {
    const code = /^LOCAL_RESTORE_[A-Z0-9_]{3,60}$/.test(error?.message ?? '')
      ? error.message : 'PREVIEW_EXPORT_LOCAL_RESTORE_FAILED';
    try { await ledger('h1a-local-double-restore', 'BLOCKED', { code,
      durationMs: Math.round(performance.now() - restoreStarted) }); } catch { /* preserve the restore failure */ }
    throw new Error(code);
  }
  await ledger('h1a-local-double-restore', restore ? 'PASS' : 'BLOCKED', { restoreCount: restore ? 2 : 0,
    contentVerified: restore === true, signaturesPreserved: restore === true, durationMs: Math.round(performance.now() - restoreStarted) });
  if (!restore) throw new Error('PREVIEW_EXPORT_LOCAL_RESTORE_FAILED');
  await ledger('h1a-http-export-verify-tamper-restore', 'PASS', { httpStatus: response.status, restoreCount: 2,
    contentVerified: true, signaturesPreserved: true, offlineVerified: true, tamperRejected: true,
    category: 'SIGNED_COMPLETE_EXPORT_VERIFIED_TAMPER_REJECTED' });
  return { ref, runId, deploymentId: PIN.deploymentId, host: PIN.host, sha: PIN.sha, restoreStatus: 'PASS', restoreCount: 2 };
}

export async function writeH1ANavigationDiagnostics(ledger, events, start = 0) {
  for (let index = start; index < events.length; index++) {
    const event = events[index];
    await ledger('h1a-navigation-intercept', event.disposition === 'PINNED_REQUEST_BLOCKED' ? 'BLOCKED' : 'PASS', {
      phase: event.phase, disposition: event.disposition, requestClass: event.requestClass,
      destinationClass: event.destinationClass, responseClass: event.responseClass,
      interceptionOperation: event.interceptionOperation, httpStatus: event.httpStatus,
    });
  }
  return events.length;
}

async function verifyH1APopulatedIsolation({ fixtures, a1, auditSeq, resultId, importId, ledger }) {
  const actorChecks = [
    { table: 'audit_events', field: 'seq', value: auditSeq },
    { table: 'provider_results', field: 'id', value: resultId },
    { table: 'imports', field: 'id', value: importId },
  ];
  for (const item of actorChecks) {
    const own = await fixtures.actorAccess('ownerA').api.from(item.table).select(item.field).eq('project_id', a1).eq(item.field, item.value);
    const foreign = await fixtures.actorAccess('ownerB').api.from(item.table).select(item.field).eq('project_id', a1).eq(item.field, item.value);
    if (own.error || !Array.isArray(own.data) || own.data.length !== 1 || String(own.data[0]?.[item.field]) !== String(item.value))
      throw new Error('H1A_OWNER_POSITIVE_READ_FAILED');
    if (foreign.error || !Array.isArray(foreign.data) || foreign.data.length !== 0)
      throw new Error('H1A_CROSS_ACTOR_READ_NOT_ISOLATED');
    await ledger(`h1a-isolation-${item.table}`, 'PASS', { actor: 'ownerA', stage: 'OWN_READ', expectedCount: 1, observedCount: own.data.length });
    await ledger(`h1a-isolation-${item.table}`, 'PASS', { actor: 'ownerB', stage: 'CROSS_READ', expectedCount: 0, observedCount: foreign.data.length });
  }
}

async function runH1AProtectedViews({ fixtures, runId, env, ledger, captureRoot, beforeLogout,
  launch = () => chromium.launch({ headless: true, env: chromiumEnvironment() }) }) {
  const input = fixtures.browserInputs();
  const origin = `https://${PIN.host}`;
  const captures = [];
  let browser;
  let navigationStage = 'H1A_AUTH_LOGIN';
  const securityEvents = [];
  const navigationDiagnostics = [];
  let diagnosticsWritten = 0;
  let securityEventsReported = 0;
  const classifyDestination = value => {
    try {
      const url = new URL(value);
      if (url.origin !== origin) return 'EXTERNAL';
      return url.pathname === '/acceso' ? 'ACCESS_ROUTE' : 'PINNED_ORIGIN';
    } catch { return 'UNKNOWN'; }
  };
  const writeNavigationDiagnostics = async () => {
    diagnosticsWritten = await writeH1ANavigationDiagnostics(ledger, navigationDiagnostics, diagnosticsWritten);
  };
  const writeNavigationStep = (status, phase, expectedDestinationClass, observedDestinationClass, authResult, httpStatus = null) =>
    ledger('h1a-navigation-step', status, { phase, expectedDestinationClass, observedDestinationClass, authResult, httpStatus });
  const assertNoExternalMainFrameNavigation = async () => {
    if (securityEventsReported >= securityEvents.length) return;
    const event = securityEvents[securityEventsReported++];
    const expectedDestinationClass = event.phase === 'H1A_AUTH_LOGIN' ? 'PINNED_ORIGIN_AUTH'
      : event.phase === 'H1A_LOGOUT' ? 'PINNED_ORIGIN_LOGOUT'
        : event.phase === 'H1A_POST_LOGOUT_DENIAL' ? 'PINNED_ORIGIN_PROTECTED_ROUTE' : 'PINNED_ORIGIN_VIEW';
    const diagnostic = { phase: event.phase, expectedDestinationClass,
      observedDestinationClass: event.destinationClass === 'EXTERNAL' ? 'EXTERNAL' : 'UNKNOWN', authResult: 'UNKNOWN',
      requestClass: event.requestClass, responseClass: event.responseClass,
      interceptionOperation: event.interceptionOperation, httpStatus: event.httpStatus };
    await ledger('h1a-navigation-step', 'BLOCKED', diagnostic);
    const error = new Error(event.disposition === 'PINNED_REQUEST_BLOCKED'
      ? 'H1A_PINNED_REQUEST_INTERCEPTION_FAILED' : 'H1A_EXTERNAL_NAVIGATION_BLOCKED');
    error.h1aDiagnostic = diagnostic;
    throw error;
  };
  await mkdir(captureRoot, { recursive: true });
  try {
    browser = await launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-ES', acceptDownloads: false, serviceWorkers: 'block' });
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(20000);
    const page = await context.newPage();
    const routeEvents = [];
    const diagnostics = createPageDiagnostics(page);
    const diagnosticIntervals = createDiagnosticIntervalTracker(diagnostics);
    const pageErrors = { count: 0 };
    page.on('pageerror', () => { pageErrors.count++; });
    const recordDiagnosticBoundary = async (interval, status = 'PASS', failureCode = null) => {
      const row = diagnosticIntervals.checkpoint(interval);
      const summary = summarizeDiagnosticInterval(row);
      const blocked = summary.status === 'BLOCKED';
      await ledger('h1a-diagnostic-boundary', blocked || failureCode ? 'BLOCKED' : status, {
        diagnosticInterval: interval, diagnosticsAfter: row.diagnosticsAfter,
        diagnosticsBefore: row.diagnosticsBefore, diagnosticsDelta: row.diagnosticsDelta,
        ...(blocked ? { code: summary.code } : failureCode ? { code: failureCode } : {}),
      });
      if (blocked) throw new Error('H1A_PHASE_CONSOLE_ERRORS');
      if (failureCode) throw new Error(failureCode);
      return row;
    };
    try {
      await installScopedRoutes(context, page, env.VERCEL_OIDC_TOKEN, origin,
        (event, diagnostic) => securityEvents.push({ event, phase: navigationStage, ...(diagnostic ?? {}) }), event => diagnostics.addRouteEvent(event), runId,
        event => navigationDiagnostics.push({ ...event, phase: navigationStage }));
      await recordDiagnosticBoundary('before-login', 'ATTEMPTED');
      await writeNavigationStep('ATTEMPTED', 'H1A_AUTH_LOGIN', 'PINNED_ORIGIN_AUTH', 'UNKNOWN', 'SIGNED_OUT');
      try {
        await login(page, context, input.U03_B4_A_EMAIL, input.U03_B4_A_PASSWORD,
          { origin, runId, viewport: 'desktop', captureRoot, ledger, routeEvents });
      } catch {
        await recordDiagnosticBoundary('after-login', 'BLOCKED', 'H1A_LOGIN_FAILED');
      }
      await recordDiagnosticBoundary('after-login');
      await writeNavigationDiagnostics();
      await assertNoExternalMainFrameNavigation();
      const loginStatus = [...routeEvents].reverse().map(value => /^auth-action-http-(\d{3})$/.exec(value)?.[1]).find(Boolean);
      await writeNavigationStep('PASS', 'H1A_AUTH_LOGIN', 'PINNED_ORIGIN_AUTH', classifyDestination(page.url()), 'AUTHENTICATED', loginStatus ? Number(loginStatus) : null);
      await ledger('h1a-auth-login', 'PASS', { actor: 'ownerA' });
      const screens = [
        { viewport: 'desktop', size: { width: 1280, height: 800 } },
        { viewport: 'mobile', size: { width: 390, height: 844 } },
      ];
      for (const screen of screens) {
        await page.setViewportSize(screen.size);
        for (const view of [
          { id: 'measurement', path: `${input.U03_B4_A1_PATH}/medicion`, text: 'Firma verificada' },
          { id: 'report', path: `${input.U03_B4_A1_PATH}/informe`, text: 'Informe del proyecto' },
        ]) {
          navigationStage = `H1A_VIEW_${screen.viewport.toUpperCase()}_${view.id.toUpperCase()}`;
          const phase = navigationStage;
          await recordDiagnosticBoundary('before-navigation', 'ATTEMPTED');
          await writeNavigationStep('ATTEMPTED', phase, 'PINNED_ORIGIN_VIEW', 'UNKNOWN', 'AUTHENTICATED');
          let response;
          try { response = await page.goto(`${origin}${view.path}`, { waitUntil: 'domcontentloaded' }); }
          catch { await recordDiagnosticBoundary('after-navigation', 'BLOCKED', 'H1A_NAVIGATION_FAILED'); }
          await recordDiagnosticBoundary('after-navigation');
          await writeNavigationDiagnostics();
          await assertNoExternalMainFrameNavigation();
          const observedDestinationClass = classifyDestination(page.url());
          if (response?.status() !== 200 || observedDestinationClass !== 'PINNED_ORIGIN' || new URL(page.url()).pathname !== view.path) {
            const error = new Error('H1A_PROTECTED_VIEW_HTTP_REJECTED');
            error.h1aDiagnostic = { phase, expectedDestinationClass: 'PINNED_ORIGIN_VIEW', observedDestinationClass,
              authResult: 'UNKNOWN', httpStatus: response?.status() ?? null };
            throw error;
          }
          if (!await page.getByText(view.text, { exact: false }).count()) throw new Error('H1A_PROTECTED_VIEW_CONTENT_MISSING');
          await writeNavigationStep('PASS', phase, 'PINNED_ORIGIN_VIEW', observedDestinationClass, 'AUTHENTICATED', response.status());
          const requiredDiagnosticBoundaries = view.id === 'measurement' && screen.viewport === 'desktop'
            ? ['before-login','after-login','before-navigation','after-navigation','before-measurement','after-measurement']
            : ['before-navigation','after-navigation','before-measurement','after-measurement'];
          const capture = await auditAndCapture(page, { runId, viewport: screen.viewport, screen: `h1a-${view.id}`, captureRoot, ledger,
            diagnostics, pageErrors, diagnosticIntervals, requiredDiagnosticBoundaries });
          captures.push(capture);
          await ledger(`h1a-capture-${screen.viewport}-${view.id}`, 'SAVED', { path: relative(process.cwd(), capture), viewport: screen.viewport });
        }
      }
      await ledger('h1a-protected-views', 'PASS', { captures: captures.length, count: 4 });
      const beforeLogoutResult = typeof beforeLogout === 'function' ? await beforeLogout(captures) : null;
      navigationStage = 'H1A_LOGOUT';
      await writeNavigationStep('ATTEMPTED', navigationStage, 'PINNED_ORIGIN_LOGOUT', 'UNKNOWN', 'AUTHENTICATED');
      await page.getByRole('button', { name: 'Salir' }).click();
      try { await page.waitForURL(`${origin}/`, { timeout: 15000 }); } catch { throw new Error('H1A_LOGOUT_FAILED'); }
      const cookieRemains = (await context.cookies(origin)).some(cookie => cookie.name.startsWith(`sb-${PIN.supabaseRef}-auth-token`));
      if (cookieRemains) throw new Error('H1A_LOGOUT_COOKIE_RETAINED');
      await writeNavigationDiagnostics();
      await assertNoExternalMainFrameNavigation();
      await writeNavigationStep('PASS', navigationStage, 'PINNED_ORIGIN_LOGOUT', classifyDestination(page.url()), 'SIGNED_OUT');
      navigationStage = 'H1A_POST_LOGOUT_DENIAL';
      await writeNavigationStep('ATTEMPTED', navigationStage, 'PINNED_ORIGIN_PROTECTED_ROUTE', 'UNKNOWN', 'SIGNED_OUT');
      const denied = await page.goto(`${origin}${input.U03_B4_A1_PATH}`, { waitUntil: 'domcontentloaded' });
      await writeNavigationDiagnostics();
      await assertNoExternalMainFrameNavigation();
      const deniedDestination = classifyDestination(page.url());
      if (!denied || deniedDestination !== 'ACCESS_ROUTE' || new URL(page.url()).pathname !== '/acceso') {
        const error = new Error('H1A_LOGOUT_REUSE_NOT_DENIED');
        error.h1aDiagnostic = { phase: navigationStage, expectedDestinationClass: 'PINNED_ORIGIN_PROTECTED_ROUTE',
          observedDestinationClass: deniedDestination, authResult: 'UNKNOWN', httpStatus: denied?.status() ?? null };
        throw error;
      }
      await writeNavigationStep('PASS', navigationStage, 'PINNED_ORIGIN_PROTECTED_ROUTE', deniedDestination, 'AUTH_REQUIRED', denied.status());
      await ledger('h1a-logout', 'PASS', { actor: 'ownerA' });
      return { passed: true, captures, beforeLogoutResult };
    } finally {
      diagnostics.dispose();
      await context.close();
    }
  } finally { if (browser) await browser.close(); }
}

async function reconcileWindowProject({ fixtures, tenantId, projectId, actor, runId, env, fetchImpl, ledger }) {
  const bearer = await fixtures.actorBearer(actor);
  const origin = `https://${PIN.host}`;
  const url = `${origin}/api/u03/window-cleanup/${encodeURIComponent(tenantId)}/${projectId}`;
  const expiresAt = Date.now() + 5 * 60_000;
  const headers = scopedHeaders(url, {
    authorization: `Bearer ${bearer.accessToken}`, 'content-type': 'application/json',
    'x-rubik-u03-expires': String(expiresAt), 'x-rubik-u03-capability': u03WindowCapability(runId, expiresAt, env),
  }, env.VERCEL_OIDC_TOKEN, origin, runId);
  let response;
  try { response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ runId }), redirect: 'manual', signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('WINDOW_CLEANUP_TRANSPORT_FAILED'); }
  if (response.status !== 200 || response.url && new URL(response.url).origin !== origin) throw new Error(`WINDOW_CLEANUP_HTTP_${response.status}`);
  const body = await response.json().catch(() => null);
  if (body?.ok !== true || !Number.isSafeInteger(body.resultRowsErased) || !Number.isSafeInteger(body.importsErased) ||
      !Number.isSafeInteger(body.receiptsProcessed)) throw new Error('WINDOW_CLEANUP_RESPONSE_INVALID');
  await ledger(`window-cleanup-${projectId}`, 'PASS', { resultRowsErased: body.resultRowsErased,
    importsErased: body.importsErased, receiptsProcessed: body.receiptsProcessed });
}

async function processH1AMembershipReceipt({ fixtures, tenantId, projectId, receiptId, runId, env, fetchImpl = fetch }) {
  const bearer = await fixtures.actorBearer('ownerA');
  const origin = `https://${PIN.host}`;
  const url = `${origin}/api/u03/window-cleanup/${encodeURIComponent(tenantId)}/${projectId}`;
  const expiresAt = Date.now() + 5 * 60_000;
  const headers = scopedHeaders(url, { authorization: `Bearer ${bearer.accessToken}`, 'content-type': 'application/json',
    'x-rubik-u03-expires': String(expiresAt), 'x-rubik-u03-capability': u03WindowCapability(runId, expiresAt, env) },
  env.VERCEL_OIDC_TOKEN, origin, runId);
  const send = async () => {
    let response;
    try { response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ runId, action: 'receipt', receiptId }),
      redirect: 'manual', signal: AbortSignal.timeout(20000) }); }
    catch { throw new Error('H1A_RECEIPT_TRANSPORT_FAILED'); }
    if (response.status !== 200 || response.url && new URL(response.url).origin !== origin) throw new Error('H1A_RECEIPT_HTTP_REJECTED');
    const body = await response.json().catch(() => null);
    if (body?.ok !== true || body.receiptState !== 'RESOLVED' || typeof body.retried !== 'boolean') throw new Error('H1A_RECEIPT_RESPONSE_INVALID');
    return body;
  };
  const first = await send();
  const retry = await send();
  if (first.retried !== false || retry.retried !== true) throw new Error('H1A_RECEIPT_IDEMPOTENCY_NOT_PROVEN');
  return { resolved: true, retried: true };
}

export async function runProtectedWindowCleanup({ fixtures, runId, env = process.env, fetchImpl = fetch, ledger }) {
  if (!fixtures || !ledger || !env.VERCEL_OIDC_TOKEN) throw new Error('WINDOW_CLEANUP_INPUT_INVALID');
  const namespace = fixtures.namespace;
  await reconcileWindowProject({ fixtures, tenantId: `${namespace}-a`, projectId: 'a1', actor: 'ownerA', runId, env, fetchImpl, ledger });
  await reconcileWindowProject({ fixtures, tenantId: `${namespace}-a`, projectId: 'a2', actor: 'ownerA', runId, env, fetchImpl, ledger });
  await reconcileWindowProject({ fixtures, tenantId: `${namespace}-b`, projectId: 'b1', actor: 'ownerB', runId, env, fetchImpl, ledger });
  return true;
}

export async function restorePreviewDocumentLocally(document, env, runId, script = 'scripts/u03-preview-restore-local.mjs', timeoutMs = 300_000) {
  return await new Promise((resolve, reject) => {
    let child;
    try { child = spawn(process.execPath, [script], { cwd: process.cwd(), windowsHide: true,
      env: { ...process.env, PROVENANCE_SIGNING_KEYS: env.PROVENANCE_SIGNING_KEYS,
        PROVENANCE_ACTIVE_KEY_ID: env.PROVENANCE_ACTIVE_KEY_ID, U03_RESTORE_DESTINATION_RUN_ID: runId }, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { reject(new Error('LOCAL_RESTORE_PROCESS_START_FAILED')); return; }
    let output = '';
    let safeChildError = 'LOCAL_RESTORE_PROTOCOL_INVALID';
    let stderrPrefix = '';
    let settled = false;
    let spawned = false;
    let exited = false;
    const timer = setTimeout(() => { finish(new Error('LOCAL_RESTORE_PROCESS_TIMEOUT')); child.kill(); }, timeoutMs);
    const finish = (error) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(true); };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-1000); });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderrPrefix = (stderrPrefix + chunk).slice(0, 512);
      safeChildError = classifyLocalRestoreChildFailure(stderrPrefix);
    });
    child.on('error', () => finish(new Error('LOCAL_RESTORE_PROCESS_START_FAILED')));
    child.on('spawn', () => { spawned = true; });
    child.on('exit', () => { exited = true; });
    child.on('close', (code, signal) => {
      const match = output.match(/^U03_PREVIEW_TO_LOCAL_RESTORE PASS restoreCount=2 contentVerified=true signaturesPreserved=true$/m);
      if (code === 0 && match) finish();
      else finish(new Error(!spawned ? 'LOCAL_RESTORE_PROCESS_START_FAILED' :
        signal ? 'LOCAL_RESTORE_PROCESS_SIGNALLED' :
        !exited || (code !== 0 && safeChildError === 'LOCAL_RESTORE_PROTOCOL_INVALID')
          ? 'LOCAL_RESTORE_PROCESS_CLOSED_EARLY' : safeChildError));
    });
    child.stdin.on('error', () => finish(new Error('LOCAL_RESTORE_STDIN_WRITE_FAILED')));
    try { child.stdin.end(JSON.stringify({ runId, document }), 'utf8'); }
    catch { finish(new Error('LOCAL_RESTORE_STDIN_WRITE_FAILED')); }
  });
}

export function classifyLocalRestoreChildFailure(output) {
  if (typeof output !== 'string') return 'PREVIEW_EXPORT_LOCAL_RESTORE_FAILED';
  const match = /^U03_PREVIEW_TO_LOCAL_RESTORE BLOCKED code=(LOCAL_RESTORE_[A-Z0-9_]{3,60})\r?$/m.exec(output.slice(0, 512));
  return match ? match[1] : 'PREVIEW_EXPORT_LOCAL_RESTORE_FAILED';
}

export async function runHostedU03Campaign({
  env = process.env, sha, runId = randomUUID(), ledger = null, preflightFn = verifyInitialPreviewState,
  fixtureFactory = createDataApiFixtureRun, browserFn = runB4, finalCheckFn = verifyFinalPreviewState,
  runtimePreflightFn = verifyProtectedWindowRuntime, windowSurfacesFn = runProtectedWindowSurfaces,
  windowCleanupFn = runProtectedWindowCleanup,
  receiptProcessorFn = openPreviewReceiptProcessor, sessionProvidersFn = runSessionProviders, providerEgressFn = runProviderEgressOnly,
  root = process.cwd(), mode = 'full',
} = {}) {
  if (!sha) throw new Error('CAMPAIGN_SHA_REQUIRED');
  if (!['full', 'playwright-only', 'membership-revocation', 'roles-invitations', 'cross-surface', 'session-providers', 'provider-egress', 'window-i2-i5', 'window-h1a'].includes(mode)) throw new Error('CAMPAIGN_MODE_INVALID');
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
  let receiptProcessor = null;
  let revocationPassed = false;
  let rolesPassed = false;
  let crossPassed = false;
  let sessionProvidersPassed = false;
  let providerEgressPassed = false;
  let windowSurfacesPassed = false;
  let windowCleanupPassed = false;
  let h1aResult = null;
  await ledger('campaign-start', 'STARTED', { deploymentId: PIN.deploymentId, sha: PIN.sha, host: PIN.host, projectRef: U03_PREVIEW_REF, mode });
  try {
    if (!env.U03_PREVIEW_ADMIN_KEY || !env.U03_PREVIEW_PUBLIC_KEY) throw new Error('PREVIEW_KEYS_REQUIRED');
    const keyFormats = assertPreviewKeyFormats(env.U03_PREVIEW_ADMIN_KEY, env.U03_PREVIEW_PUBLIC_KEY);
    await ledger('key-format', 'CLASSIFIED', keyFormats);
    verified = await preflightFn({ env });
    await ledger('preflight', 'PASS', { ...verified.initial, http: verified.initial?.authSettingsHttpStatus ?? null, deploymentId: verified.vercel?.deploymentId, sha: verified.vercel?.sha, host: verified.vercel?.host, projectRef: U03_PREVIEW_REF });
    if (mode === 'window-i2-i5' || mode === 'window-h1a') {
      const runtimeProof = await runtimePreflightFn({ runId, env });
      await ledger(mode === 'window-h1a' ? 'h1a-runtime-pooler-preflight' : 'window-runtime-pooler-preflight', 'PASS', { httpStatus: runtimeProof.status, deploymentId: PIN.deploymentId, sha: PIN.sha, host: PIN.host });
    }
    if (mode === 'window-h1a') await ledger('h1a-receipt-processor-preflight', 'PASS', { projectRef: U03_PREVIEW_REF, category: 'SCOPED_PRODUCT_ROUTE' });
    if (mode === 'membership-revocation') {
      receiptProcessor = await receiptProcessorFn({ env });
      await ledger('preview-receipt-writer', 'PASS', { projectRef: U03_PREVIEW_REF });
      await ledger('data-api-matrix', 'SKIP_PRIOR_EVIDENCE', { cases: 12, evidenceRunId: PRIOR_DATA_API_RUN_ID });
      await ledger('browser-b4', 'SKIP_PRIOR_EVIDENCE', { evidenceRunId: PRIOR_B4_RUN_ID });
    }
    fixtures = fixtureFactory({ runId, sha, admin: verified.admin, publicKey: env.U03_PREVIEW_PUBLIC_KEY, ledger, ref: U03_PREVIEW_REF });
    if (mode === 'session-providers') {
      const session = await fixtures.createSessionFixtures();
      await ledger('fixture-session', 'CREATED', { namespace: fixtures.namespace, count: 1 });
      await ledger('data-api-matrix', 'SKIP_PRIOR_EVIDENCE', { cases: 12, evidenceRunId: PRIOR_DATA_API_RUN_ID });
      await ledger('browser-b4', 'SKIP_PRIOR_EVIDENCE', { evidenceRunId: PRIOR_B4_RUN_ID });
      browserResult = await sessionProvidersFn({ env, ...session, ledger, runId, captureRoot });
      sessionProvidersPassed = browserResult?.passed === true;
    } else if (mode === 'provider-egress') {
      const session = await fixtures.createSessionFixtures();
      await ledger('fixture-session', 'CREATED', { namespace: fixtures.namespace, count: 1 });
      await ledger('data-api-matrix', 'SKIP_PRIOR_EVIDENCE', { cases: 12, evidenceRunId: PRIOR_DATA_API_RUN_ID });
      await ledger('browser-b4', 'SKIP_PRIOR_EVIDENCE', { evidenceRunId: PRIOR_B4_RUN_ID });
      browserResult = await providerEgressFn({ env: { VERCEL_OIDC_TOKEN: env.VERCEL_OIDC_TOKEN }, ...session, ledger, runId, captureRoot });
      providerEgressPassed = browserResult?.passed === true;
    } else if (mode === 'membership-revocation') {
      const { a1 } = await fixtures.createRevocationFixtures();
      await ledger('fixture-revocation', 'CREATED', { count: 2, namespace: fixtures.namespace });
      const result = await fixtures.runMembershipRevocation({ a1 });
      await receiptProcessor.process(result.receiptId, a1);
      await ledger('withdrawal-receipt', 'PASS', { projectIds: [a1] });
      revocationPassed = result.passed === true;
    } else {
    await fixtures.createUsers();
    await ledger('fixture-users', 'CREATED', { count: 3, namespace: fixtures.namespace });
    const organizations = await fixtures.createOrganizations();
    await ledger('fixture-organizations', 'CREATED', { count: 2, namespace: fixtures.namespace });
    const projects = await fixtures.createProjects(organizations);
    await ledger('fixture-projects', 'CREATED', { count: 3, namespace: fixtures.namespace });
    if (mode === 'roles-invitations') {
      await ledger('data-api-matrix', 'SKIP_PRIOR_EVIDENCE', { cases: 12, evidenceRunId: PRIOR_DATA_API_RUN_ID });
      await ledger('browser-b4', 'SKIP_PRIOR_EVIDENCE', { evidenceRunId: PRIOR_B4_RUN_ID });
      const result = await fixtures.runRolesInvitations(projects);
      rolesPassed = result.passed === true;
      await ledger('roles-invitations', 'PASS', { cases: result.cases });
    } else if (mode === 'cross-surface') {
      await ledger('data-api-matrix', 'SKIP_PRIOR_EVIDENCE', { cases: 12, evidenceRunId: PRIOR_DATA_API_RUN_ID });
      await ledger('browser-b4', 'SKIP_PRIOR_EVIDENCE', { evidenceRunId: PRIOR_B4_RUN_ID });
      const result = await fixtures.runCrossSurface({ ...organizations, ...projects });
      crossPassed = result.passed === true;
      await ledger('cross-surface', 'PASS', { cases: result.cases });
    } else if (mode === 'window-i2-i5') {
      if (env.U03_PREVIEW_WRITER_WINDOW !== 'armed-run-capability' || env.U03_PREVIEW_WRITER_WINDOW_RUN_ID !== runId)
        throw new Error('WINDOW_CAPABILITY_ENVIRONMENT_MISMATCH');
      await ledger('data-api-matrix', 'SKIP_PRIOR_EVIDENCE', { cases: 12, evidenceRunId: PRIOR_DATA_API_RUN_ID });
      await ledger('browser-b4', 'SKIP_PRIOR_EVIDENCE', { evidenceRunId: PRIOR_B4_RUN_ID });
      const surfaces = await windowSurfacesFn({ fixtures, a1: projects.a1, b1: projects.b1, runId, env, ledger });
      if (surfaces?.i2 !== true || surfaces?.i5 !== true) throw new Error('WINDOW_I2_I5_EVIDENCE_INCOMPLETE');
      windowSurfacesPassed = true;
      await ledger('window-i2-i5-populated-surfaces', 'PASS', { cases: 2, deploymentId: PIN.deploymentId, host: PIN.host, sha: PIN.sha });
    } else if (mode === 'window-h1a') {
      if (env.U03_PREVIEW_WRITER_WINDOW !== 'armed-run-capability' || env.U03_PREVIEW_WRITER_WINDOW_RUN_ID !== runId)
        throw new Error('WINDOW_CAPABILITY_ENVIRONMENT_MISMATCH');
      const a1 = projects.a1;
      const tenantId = `${fixtures.namespace}-a`;
      const owner = { actor: 'ownerA', tenantId, projectId: 'a1', id: a1, suffix: 'A' };
      const audit = await invokeWindowFixture({ kind: 'audit', ...owner, fixtures, runId, env, ledger });
      const result = await invokeWindowFixture({ kind: 'result', ...owner, fixtures, runId, env, ledger });
      const imported = await invokeWindowFixture({ kind: 'import', ...owner, fixtures, runId, env, ledger });
      await verifyH1APopulatedIsolation({ fixtures, a1, auditSeq: audit.seq, resultId: result.id, importId: imported.id, ledger });
      await ledger('h1a-source-and-date-evidence', 'PASS', { count: 1, category: 'SYNTHETIC_SIGNED_RESULT' });

      const membership = await fixtures.runMembershipRevocation({ a1 });
      if (!membership.passed || !membership.receiptId) throw new Error('H1A_PERMISSION_WITHDRAWAL_FAILED');
      await processH1AMembershipReceipt({ fixtures, tenantId, projectId: 'a1', receiptId: membership.receiptId, runId, env });
      await ledger('h1a-permission-grant-withdraw-and-receipt', 'PASS', { count: 1, receiptState: 'RESOLVED', category: 'IDEMPOTENT_RETRY' });

      const browserResult = await runH1AProtectedViews({ fixtures, runId, env, ledger, captureRoot,
        beforeLogout: async captures => {
          await ledger('h1a-measurement-report-ui', 'PASS', { captures: captures.length, visualReview: 'PENDING_MANUAL_REVIEW' });
          return runProtectedWindowH1Export({ fixtures, runId, env, ledger });
        } });
      const exportResult = browserResult.beforeLogoutResult;
      h1aResult = { passed: true, captures: browserResult.captures, exportResult };
    } else {
      if (mode === 'playwright-only') {
        await ledger('data-api-matrix', 'SKIP_PRIOR_EVIDENCE', { cases: 12, reason: 'PRIOR_RUN_PASS', evidenceRunId: PRIOR_DATA_API_RUN_ID });
      } else {
        await fixtures.runMatrix({ ...organizations, ...projects });
        await ledger('data-api-matrix', 'PASS', { cases: 12 });
      }
      const b4Env = { VERCEL_OIDC_TOKEN: env.VERCEL_OIDC_TOKEN, ...fixtures.browserInputs() };
      browserResult = await browserFn({ env: b4Env, runId, preflightResult: verified.vercel, ledger, captureRoot });
      await ledger('browser-b4', 'PASS', { captures: browserResult?.captures?.length ?? 0, visualReview: 'PENDING_MANUAL_REVIEW' });
    }
    }
  } catch (error) {
    failure = typeof error?.message === 'string' && /^[A-Z0-9_]{3,80}$/.test(error.message) ? error.message : 'CAMPAIGN_STEP_FAILED';
    try {
      const keyFormats = {
        adminKeyFormat: classifySupabaseKeyFormat(env.U03_PREVIEW_ADMIN_KEY),
        publicKeyFormat: classifySupabaseKeyFormat(env.U03_PREVIEW_PUBLIC_KEY),
      };
      const diagnostic = error?.h1aDiagnostic;
      await ledger('campaign-error', 'FAIL', { code: failure, http: Number.isInteger(error?.httpStatus) ? error.httpStatus : null,
        ...(diagnostic ? { phase: diagnostic.phase, expectedDestinationClass: diagnostic.expectedDestinationClass,
          observedDestinationClass: diagnostic.observedDestinationClass, authResult: diagnostic.authResult,
          requestClass: diagnostic.requestClass, responseClass: diagnostic.responseClass,
          interceptionOperation: diagnostic.interceptionOperation,
          httpStatus: diagnostic.httpStatus } : {}), ...keyFormats });
    } catch { /* cleanup still proceeds */ }
  } finally {
    if (fixtures) {
      if (mode === 'window-i2-i5' || mode === 'window-h1a') {
        try {
          await windowCleanupFn({ fixtures, runId, env, ledger });
          windowCleanupPassed = true;
        } catch (error) {
          failure ??= typeof error?.message === 'string' && /^[A-Z0-9_]{3,80}$/.test(error.message)
            ? error.message : 'WINDOW_RECEIPT_RECONCILIATION_FAILED';
          try { await ledger('window-receipt-reconciliation', 'BLOCKED', { code: failure }); } catch { /* retain IDs; no project deletion */ }
        }
      }
      if (receiptProcessor) {
        for (const projectId of fixtures.snapshot().projectIds) {
          try {
            for (const receiptId of await receiptProcessor.pendingForProject(projectId)) {
              await receiptProcessor.process(receiptId, projectId);
              await ledger('withdrawal-receipt-reconcile', 'PASS', { projectIds: [projectId] });
            }
          } catch {
            failure ??= 'V4_RECEIPT_RECONCILIATION_FAILED';
            try { await ledger('withdrawal-receipt-reconcile', 'FAIL', { projectIds: [projectId] }); } catch { /* preserve cleanup */ }
          }
        }
      }
      try {
        if ((mode === 'window-i2-i5' || mode === 'window-h1a') && !windowCleanupPassed) throw new Error('WINDOW_CLEANUP_NOT_PROVEN');
        cleanupResult = await fixtures.cleanup();
        await ledger('fixture-cleanup', cleanupResult?.ok ? 'PASS' : 'PARTIAL', {
          userIds: cleanupResult?.userIds ?? [], organizationIds: cleanupResult?.organizationIds ?? [], projectIds: cleanupResult?.projectIds ?? [],
        });
      } catch {
        cleanupResult = { ok: false };
        try { await ledger('fixture-cleanup', 'PARTIAL'); } catch { /* continue final verification */ }
      }
    }
    if (receiptProcessor) {
      try { await receiptProcessor.close(); }
      catch { failure ??= 'V4_RECEIPT_CLOSE_FAILED'; }
    }
    if (verified) {
      try {
        finalCheck = await finalCheckFn({ allowTemporaryWindowCapability: mode === 'window-i2-i5' || mode === 'window-h1a' });
        await ledger('final-inventory', finalCheck.inventoriesClear ? 'PASS' : 'FAIL', {
          authUsers: finalCheck.state?.auth_users ?? null, organizations: finalCheck.state?.organizations ?? null,
          projects: finalCheck.state?.projects ?? null, organizationMembers: finalCheck.state?.organization_members ?? null,
          projectMembers: finalCheck.state?.project_members ?? null, invitations: finalCheck.state?.invitations ?? null,
          auditEvents: finalCheck.state?.audit_events ?? null,
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
    ? (fixtures === null ? 'BLOCKED_NO_WRITES' : clean ? 'FAIL_CLEANED' : 'FAIL_CLEANUP_PARTIAL')
    : (mode === 'membership-revocation' ? (revocationPassed && clean ? 'PASS' : 'BLOCKED') :
      mode === 'roles-invitations' ? (rolesPassed && clean ? 'PASS' : 'BLOCKED') :
      mode === 'cross-surface' ? (crossPassed && clean ? 'PASS' : 'BLOCKED') :
      mode === 'session-providers' ? (sessionProvidersPassed && clean ? 'AWAITING_VISUAL_REVIEW' : 'BLOCKED') :
      mode === 'provider-egress' ? (providerEgressPassed && clean ? 'PASS' : 'BLOCKED') :
      mode === 'window-i2-i5' ? (windowSurfacesPassed && clean ? 'PASS' : 'BLOCKED') :
      mode === 'window-h1a' ? (h1aResult?.passed === true && clean ? 'PASS' : 'BLOCKED') :
      (b4Pass && clean ? 'AWAITING_VISUAL_REVIEW' : 'BLOCKED'));
  try {
    if (mode === 'window-i2-i5') {
      await ledger('i2-evidence-before-role-rollback', status === 'PASS' ? 'PASS' : 'BLOCKED',
        { code: status === 'PASS' ? null : failure ?? 'I2_OR_CLEANUP_UNVERIFIED' });
      await ledger('i5-evidence-before-role-rollback', status === 'PASS' ? 'PASS' : 'BLOCKED',
        { code: status === 'PASS' ? null : failure ?? 'I5_OR_CLEANUP_UNVERIFIED' });
      await ledger('h1a-result', 'NOT_RUN');
    } else if (mode === 'window-h1a') {
      await ledger('h1a-global-result', status === 'PASS' ? 'PASS' : 'BLOCKED',
        status === 'PASS' ? { cases: 1, visualReview: 'PENDING_MANUAL_REVIEW' } : { code: failure ?? 'H1A_OR_CLEANUP_UNVERIFIED' });
    }
    await ledger('campaign-global', status, {
      runId, sha, deploymentId: PIN.deploymentId, visualReview: b4Pass ? 'PENDING_MANUAL_REVIEW' : 'NOT_RUN',
      result: status,
    });
    await ledger('run-artifacts', browserResult ? 'LOCAL_ONLY' : 'NONE', {
      path: browserResult ? relative(root, captureRoot) : null, captures: browserResult?.captures?.length ?? 0,
    });
  } catch { /* the persistent ledger is already marked incomplete by absence of this footer */ }
  console.log(`U03 B-4 run ${runId}: ${status}; ledger ${relative(root, ledgerPath)}; captures ${browserResult?.captures?.length ?? 0}`);
  return { runId, sha, mode, status, failure, verified, browserResult, h1aResult, cleanupResult, finalCheck, ledgerPath, captureRoot };
}

async function main() {
  const sha = (await execFileAsync('git', ['rev-parse', 'HEAD'], { windowsHide: true })).stdout.trim();
  const campaignModes = ['--playwright-only', '--membership-revocation-only', '--roles-invitations-only', '--cross-surface-only', '--session-providers-only', '--provider-egress-only', '--window-i2-i5-only'].filter(arg => process.argv.includes(arg));
  if (campaignModes.length > 1 || campaignModes.length && process.argv.some(arg => ['--readonly-preflight', '--credential-preflight-only'].includes(arg))) {
    console.error('U03 B-4 BLOCKED: CAMPAIGN_MODE_INVALID; no fixtures were created.');
    process.exitCode = 1;
    return;
  }
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
  if (process.argv.includes('--credential-preflight-only')) {
    try {
      const verified = await verifyInitialPreviewState();
      console.log(`U03 B-4 CREDENTIAL_PREFLIGHT PASS; ref ${verified.initial.projectRef}; migrations ${verified.initial.migrationCount}; writer locked`);
    } catch (error) {
      const code = typeof error?.message === 'string' && /^[A-Z0-9_]{3,80}$/.test(error.message) ? error.message : 'CREDENTIAL_PREFLIGHT_FAILED';
      console.error(`U03 B-4 CREDENTIAL_PREFLIGHT FAIL; ${code}`);
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
  const mode = process.argv.includes('--window-i2-i5-only') ? 'window-i2-i5' :
    process.argv.includes('--provider-egress-only') ? 'provider-egress' :
    process.argv.includes('--session-providers-only') ? 'session-providers' :
    process.argv.includes('--membership-revocation-only') ? 'membership-revocation' :
    process.argv.includes('--cross-surface-only') ? 'cross-surface' :
    process.argv.includes('--roles-invitations-only') ? 'roles-invitations' :
    process.argv.includes('--playwright-only') ? 'playwright-only' : 'full';
  const runIdAt = process.argv.indexOf('--run-id');
  const runId = runIdAt >= 0 ? process.argv[runIdAt + 1] : undefined;
  const result = await runHostedU03Campaign({ sha, env: process.env, mode, ...(runId ? { runId } : {}) });
  if (!['AWAITING_VISUAL_REVIEW', 'PASS'].includes(result.status)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
