// Real N1 integration exercise. Requires a fresh, isolated local Supabase stack
// rubik-u03-v4-rollback-local on 127.0.0.1:62321/62322; never accepts a remote URL.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { Client, Pool } from 'pg';
import { PREFLIGHT_SQL, verifyReadOnlyPreviewState } from './u03-preview-b4-orchestrator.mjs';
import { EFFECTIVE_FUNCTION_AUDIT_SQL, isV4SecurityDefinerAllowlistOnly,
  V4_SECURITY_DEFINER_ALLOWLIST } from './u03-preview-v4-receipt.mjs';

const { loadKeyring } = await import('../src/lib/provenance/keyring.ts');
const { processAuditOutboxWithPool } = await import('../src/lib/provenance/outbox.ts');
const { verifyAuditTrail } = await import('../src/lib/provenance/audit.ts');

const container = 'supabase_db_rubik-u03-v4-rollback-local';
const database = 'postgresql://postgres:postgres@127.0.0.1:62322/postgres';
const apiUrl = 'http://127.0.0.1:62321';
const writerPassword = `local-${randomBytes(24).toString('hex')}`;
const writerUrl = `postgresql://rubik_preview_receipt_writer:${writerPassword}@127.0.0.1:62322/postgres`;
const label = `u03-v4-local-${randomBytes(4).toString('hex')}`;
const password = 'fictional-local-auth-password-2026';
const check = (condition, name) => { assert.ok(condition, name); console.log(`PASS ${name}`); };
const sql = async (db, text, values = []) => (await db.query(text, values)).rows;
function runFile(name, expectedFailure) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres',
    '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/dev/stdin'],
  { input: readFileSync(new URL(`./${name}`, import.meta.url)), encoding: 'utf8' });
  if (expectedFailure) {
    check(result.status !== 0 && result.stderr.includes(expectedFailure), `${name} rejects ${expectedFailure}`);
  } else if (result.status !== 0) {
    throw new Error(`${name} failed: ${String(result.stderr).slice(0, 400)}`);
  }
}

const containers = execFileSync('docker', ['ps', '--filter', `name=^/${container}$`, '--format', '{{.Names}}'], { encoding: 'utf8' }).trim();
assert.equal(containers, container, 'dedicated local container required');
const statusText = execFileSync('cmd.exe', ['/d', '/s', '/c',
  'npx.cmd --yes supabase@2.118.0 --workdir test-results/u03-v4-rollback-local status -o json'],
{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const status = JSON.parse(statusText.slice(statusText.indexOf('{'), statusText.lastIndexOf('}') + 1));
assert.equal(status.API_URL, apiUrl);
assert.equal(status.DB_URL, database);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const adminApi = createClient(apiUrl, status.SECRET_KEY, opts);
const actor = () => createClient(apiUrl, status.PUBLISHABLE_KEY, opts);
const db = new Client({ connectionString: database, ssl: false });
await db.connect();
const ids = { users: [], organization: null, project: null, receipt: null };
let writer;
try {
  const state = await sql(db, `select (select count(*)::int from supabase_migrations.schema_migrations) migrations,
    (select max(version)::text from supabase_migrations.schema_migrations) latest,
    (select count(*)::int from auth.users) users`);
  check(state[0].migrations === 27 && state[0].latest === '20261015210000' && state[0].users === 0,
    'fresh N1 stack: 27 migrations, no users');
  runFile('u02-preview-sentinel.sql');
  runFile('u03-preview-v4-role.sql');
  const installed = await sql(db, `select rolcanlogin, rolsuper, rolbypassrls, rolinherit,
    has_table_privilege('rubik_preview_receipt_writer','public.audit_events','INSERT') audit_insert,
    has_column_privilege('rubik_preview_receipt_writer','private.audit_outbox','state','UPDATE') outbox_update,
    has_table_privilege('rubik_preview_receipt_writer','private.audit_outbox','DELETE') outbox_delete,
    has_table_privilege('rubik_preview_receipt_writer','public.provider_results','INSERT') provider_insert,
    has_table_privilege('rubik_preview_receipt_writer','auth.users','SELECT') auth_read,
    has_table_privilege('rubik_preview_receipt_writer','public.project_members','INSERT') membership_insert,
    has_table_privilege('rubik_preview_receipt_writer','public.audit_events','DELETE') audit_delete,
    (select count(*)::int from pg_policies where policyname like 'u03 preview receipt %') policies
    from pg_roles where rolname='rubik_preview_receipt_writer'`);
  check(installed.length === 1 && !installed[0].rolcanlogin && !installed[0].rolsuper &&
    !installed[0].rolbypassrls && !installed[0].rolinherit && installed[0].audit_insert &&
    installed[0].outbox_update && !installed[0].outbox_delete && !installed[0].provider_insert &&
    !installed[0].auth_read && !installed[0].membership_insert && !installed[0].audit_delete &&
    installed[0].policies === 4, 'installed role has narrow grants and four U03 policies');
  const appendPolicy = await sql(db, `select with_check from pg_policies where schemaname='public'
    and tablename='audit_events' and policyname='u03 preview receipt appends audit'`);
  check(appendPolicy.length === 1 && appendPolicy[0].with_check.includes('audit_events.details') &&
    !appendPolicy[0].with_check.includes('o.details'), 'receipt policy binds the inserted event details');
  const expectedFunctions = (await db.query(EFFECTIVE_FUNCTION_AUDIT_SQL, ['rubik_preview_receipt_writer'])).rows[0];
  check(isV4SecurityDefinerAllowlistOnly(expectedFunctions.executable_security_definer_functions) &&
    V4_SECURITY_DEFINER_ALLOWLIST.every(name => expectedFunctions.executable_functions.includes(name)),
  'effective SECURITY DEFINER set matches V-4 allowlist after PUBLIC inheritance');
  let campaignPreflightState = (await db.query(PREFLIGHT_SQL)).rows[0];
  check((await verifyReadOnlyPreviewState({ sql: async () => campaignPreflightState })).migrationCount === 27,
    'read-only campaign preflight accepts the intended local role configuration');
  await db.query(`create function public.u03_test_unapproved_definer() returns boolean
    language sql security definer as 'select true'`);
  campaignPreflightState = (await db.query(PREFLIGHT_SQL)).rows[0];
  await assert.rejects(verifyReadOnlyPreviewState({ sql: async () => campaignPreflightState }),
    /PREVIEW_RECEIPT_SECURITY_DEFINER_UNSAFE/);
  const unsafeFunctions = (await db.query(EFFECTIVE_FUNCTION_AUDIT_SQL, ['rubik_preview_receipt_writer'])).rows[0];
  check(unsafeFunctions.executable_security_definer_functions.includes('public.u03_test_unapproved_definer()') &&
    !isV4SecurityDefinerAllowlistOnly(unsafeFunctions.executable_security_definer_functions),
  'additional PUBLIC-executable SECURITY DEFINER fails the preflight allowlist');
  await db.query('drop function public.u03_test_unapproved_definer()');
  const restoredFunctions = (await db.query(EFFECTIVE_FUNCTION_AUDIT_SQL, ['rubik_preview_receipt_writer'])).rows[0];
  check(isV4SecurityDefinerAllowlistOnly(restoredFunctions.executable_security_definer_functions),
    'local preflight passes again after removing the test-only function');
  await db.query(`alter role rubik_preview_receipt_writer password '${writerPassword}'`);
  runFile('u03-preview-v4-activate.sql');
  runFile('u03-preview-v4-activate.sql', 'V4_PREVIEW_ROLE_REJECTED');

  for (const name of ['owner', 'viewer']) {
    const created = await adminApi.auth.admin.createUser({ email: `${label}-${name}@ejemplo.test`, password, email_confirm: true });
    assert.ifError(created.error);
    ids.users.push(created.data.user.id);
  }
  const owner = actor('owner'), viewer = actor('viewer');
  for (const [client, name] of [[owner, 'owner'], [viewer, 'viewer']]) {
    const signed = await client.auth.signInWithPassword({ email: `${label}-${name}@ejemplo.test`, password });
    assert.ifError(signed.error);
  }
  const createdOrg = await owner.from('organizations').insert({ slug: label, name: 'Local U03 V4' });
  assert.ifError(createdOrg.error);
  const ownOrg = await owner.from('organizations').select('id').eq('slug', label).single();
  assert.ifError(ownOrg.error); ids.organization = ownOrg.data.id;
  const createdProject = await owner.from('projects').insert({ organization_id: ids.organization, slug: 'a1', name: 'A1' });
  assert.ifError(createdProject.error);
  const ownProject = await owner.from('projects').select('id').eq('organization_id', ids.organization).eq('slug', 'a1').single();
  assert.ifError(ownProject.error); ids.project = ownProject.data.id;
  const invitation = await owner.rpc('project_invitations', { p_project_id: ids.project, p_command: 'create',
    p_payload: { email: `${label}-viewer@ejemplo.test`, role: 'viewer' } });
  assert.ifError(invitation.error);
  const accepted = await viewer.rpc('accept_project_invitation', { p_token: invitation.data.token });
  assert.ifError(accepted.error);
  const before = await viewer.from('projects').select('id').eq('id', ids.project);
  check(!before.error && before.data.length === 1, 'viewer has A1 access before withdrawal');
  const jwt = (await viewer.auth.getSession()).data.session.access_token;
  const removed = await owner.rpc('project_people', { p_project_id: ids.project, p_command: 'remove',
    p_payload: { userId: ids.users[1] } });
  assert.ifError(removed.error); ids.receipt = removed.data.auditReceiptId;
  const after = await viewer.from('projects').select('id').eq('id', ids.project);
  const stillValid = await viewer.auth.getUser();
  check(!after.error && after.data.length === 0 && !stillValid.error &&
    (await viewer.auth.getSession()).data.session.access_token === jwt,
  'V-4 denies the same still-valid JWT after withdrawal');
  check((await sql(db, `select state from private.audit_outbox where id=$1`, [ids.receipt]))[0]?.state === 'pending',
    'withdrawal leaves pending receipt');

  runFile('u03-preview-v4-block.sql');
  check((await sql(db, `select rolcanlogin from pg_roles where rolname='rubik_preview_receipt_writer'`))[0]?.rolcanlogin === false,
    'emergency block commits NOLOGIN while fixtures remain');
  runFile('u03-preview-v4-activate.sql');
  runFile('u03-preview-v4-rollback.sql', 'V4_PREVIEW_RESIDUES_KEEP_NOLOGIN');
  check((await sql(db, `select rolcanlogin from pg_roles where rolname='rubik_preview_receipt_writer'`))[0]?.rolcanlogin === false,
    'failed rollback has already committed NOLOGIN');
  const blocked = new Client({ connectionString: writerUrl, ssl: false });
  await assert.rejects(blocked.connect());
  await blocked.end().catch(() => {});
  check(true, 'NOLOGIN rejects a fresh writer session');
  runFile('u03-preview-v4-block.sql');
  runFile('u03-preview-v4-activate.sql');
  writer = new Pool({ connectionString: writerUrl, ssl: false, max: 1 });
  writer.on('connect', client => {
    const query = client.query.bind(client);
    client.query = async (...args) => {
      try { return await query(...args); }
      catch (error) {
        const statement = String(args[0]).trim().split(/\s+/).slice(0, 3).join(' ').toUpperCase();
        console.error('LOCAL_WRITER_SQL_ERROR', error.code ?? 'UNKNOWN', statement);
        throw error;
      }
    };
  });
  const key = loadKeyring({ PROVENANCE_SIGNING_KEYS: `u03-v4-local:${randomBytes(32).toString('base64')}`,
    PROVENANCE_ACTIVE_KEY_ID: 'u03-v4-local' });
  assert.equal(key.ok, true);
  const signed = await processAuditOutboxWithPool(ids.receipt, key.keyring, writer);
  check(signed.ok && Number.isInteger(signed.seq), 'V-4 receipt signed with narrow Preview role');
  const retry = await processAuditOutboxWithPool(ids.receipt, key.keyring, writer);
  check(retry.ok && retry.seq === signed.seq, 'receipt retry is idempotent');
  const trail = await sql(db, `select * from public.audit_events where project_id=$1 order by seq`, [ids.project]);
  check(verifyAuditTrail(trail, { projectId: ids.project, organizationId: ids.organization,
    scope: { tenantId: label, projectId: 'a1' } }, key.keyring).valid,
  'signed audit trail verifies');
  await writer.end(); writer = null;
  const projectDeleted = await adminApi.from('projects').delete().eq('id', ids.project).select('id');
  assert.ifError(projectDeleted.error);
  check(projectDeleted.data.length === 1, 'signed receipt permits project deletion');
  const orgDeleted = await adminApi.from('organizations').delete().eq('id', ids.organization).select('id');
  assert.ifError(orgDeleted.error);
  check(orgDeleted.data.length === 1, 'own organization removed');
  for (const id of ids.users) assert.ifError((await adminApi.auth.admin.deleteUser(id)).error);
  const left = await sql(db, `select (select count(*)::int from auth.users) users,
    (select count(*)::int from public.organizations) organizations,
    (select count(*)::int from public.projects) projects,
    (select count(*)::int from public.project_members) members,
    (select count(*)::int from public.audit_events) audit_events,
    (select count(*)::int from private.audit_outbox) outbox`);
  check(Object.values(left[0]).every(value => value === 0), 'final local inventory and outbox zero');
  runFile('u03-preview-v4-block.sql');
  runFile('u03-preview-v4-rollback.sql');
  runFile('u03-preview-v4-rollback.sql');
  const final = await sql(db, `select (select count(*)::int from pg_roles where rolname='rubik_preview_receipt_writer') roles,
    (select count(*)::int from pg_policies where policyname like 'u03 preview receipt %') policies`);
  check(final[0].roles === 0 && final[0].policies === 0, 'rollback removes role and policies; second run is idempotent');
  await db.query('delete from private.environment_identity');
  runFile('u03-preview-v4-block.sql', 'V4_PREVIEW_IDENTITY_REJECTED');
  runFile('u03-preview-v4-rollback.sql', 'V4_PREVIEW_IDENTITY_REJECTED');
} finally {
  if (writer) await writer.end().catch(() => {});
  await db.end();
}
