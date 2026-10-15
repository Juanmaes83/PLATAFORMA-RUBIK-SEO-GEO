// Tests the exact S1 RPC containment rollback on the isolated LOCAL S1 stack.
// All SQL changes are performed inside an outer transaction and rolled back.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { STACKS, selectedStack } from './test-stacks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, 'supabase/rollbacks/20261015190000_s1_provider_rpc_boundary.sql');
const functions = [
  'private.google_capture_command(uuid,text,jsonb)',
  'public.google_capture(uuid,text,jsonb)',
  'private.openseo_job(uuid,text,uuid,jsonb)',
  'public.openseo_job(uuid,text,uuid,jsonb)',
];
const roles = ['public', 'anon', 'authenticated', 'rubik_audit_writer'];
const checkedRoles = roles.slice(1);
const insist = (ok, why) => { if (!ok) throw new Error(why); };

function rollbackStatement() {
  const sql = readFileSync(path, 'utf8').replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  const body = 'revoke execute on function ' + functions.join(', ') + ' from ' + roles.join(', ') + ';';
  insist(sql.toLowerCase() === ('begin; ' + body + ' commit;').toLowerCase(),
    'Rollback SQL changed; review before using this probe.');
  return body;
}
function checkedAdminUrl() {
  const raw = process.env.S1_LOCAL_POSTGRES_ADMIN_URL;
  insist(raw, 'Set S1_LOCAL_POSTGRES_ADMIN_URL to the isolated LOCAL S1 postgres account.');
  const u = new URL(raw);
  insist(['postgres:', 'postgresql:'].includes(u.protocol), 'PostgreSQL required.');
  // Codex's S1 stack by default; Claude's own S1 stack only under its exclusive selector.
  const port = String((selectedStack() === STACKS.claudeS1 ? STACKS.claudeS1 : STACKS.s1).dbPort);
  insist(['127.0.0.1', 'localhost'].includes(u.hostname) && u.port === port,
    `Refusing any destination except the selected LOCAL S1 port ${port}.`);
  insist(u.username === 'postgres' && u.pathname === '/postgres' && !u.search && !u.hash,
    'Refusing non-admin database or connection overrides.');
  return raw;
}
async function snapshot(db) {
  const ordinary = await db.query(
    "select r.role_name, f.function_name, has_function_privilege(r.role_name,f.function_name,'EXECUTE') permitted " +
    'from unnest($1::text[]) as r(role_name) cross join unnest($2::text[]) as f(function_name) ' +
    'order by r.role_name,f.function_name', [checkedRoles, functions]);
  const publicAcl = await db.query(
    'select f.function_name, exists(select 1 from ' +
    "aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a " +
    "where a.grantee=0 and a.privilege_type='EXECUTE') permitted " +
    'from unnest($1::text[]) as f(function_name) ' +
    'join pg_proc p on p.oid=f.function_name::regprocedure order by f.function_name', [functions]);
  const trigger = await db.query(
    "select t.tgenabled,p.proname,n.nspname,p.prosecdef from pg_trigger t " +
    'join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace ' +
    "where t.tgrelid='public.provider_results'::regclass " +
    "and t.tgname='provider_results_trusted_insert'");
  insist(trigger.rowCount === 1 && trigger.rows[0].tgenabled === 'O' &&
    trigger.rows[0].proname === 'trusted_provider_insert_guard' &&
    trigger.rows[0].nspname === 'private' && !trigger.rows[0].prosecdef,
    'Provider HMAC INSERT guard missing or changed.');
  const grants = await db.query(
    "select r.role_name,has_table_privilege(r.role_name,'public.provider_results','INSERT') tbl," +
    "has_column_privilege(r.role_name,'public.provider_results','signature','INSERT') col " +
    "from unnest(array['anon','authenticated']) as r(role_name)");
  insist(grants.rows.every(r => !r.tbl && !r.col), 'JWT can INSERT signed provider results.');
  return ordinary.rows.map(r => [r.role_name,r.function_name,r.permitted].join(':')).concat(
    publicAcl.rows.map(r => ['public',r.function_name,r.permitted].join(':'))).join('|');
}
async function main() {
  const statement = rollbackStatement();
  if (process.argv.length === 3 && process.argv[2] === '--check') {
    console.log('PASS: rollback SQL matches the reviewed statement (no DB connected).');
    return;
  }
  insist(process.argv.length === 2, 'Usage: node script.mjs [--check]');
  const { Client } = await import('pg');
  const db = new Client({ connectionString: checkedAdminUrl(), ssl: false,
    connectionTimeoutMillis: 3000, application_name: 'rubik_s1_rpc_rollback_probe' });
  let active = false;
  try {
    await db.connect();
    await db.query('begin'); active = true;
    await db.query("set local statement_timeout = '8s'");
    const before = await snapshot(db);
    insist(functions.filter(f => f.startsWith('private.')).every(f =>
      before.includes('rubik_audit_writer:' + f + ':true')),
      'Dedicated writer RPC grants missing before rollback.');
    await db.query(statement);
    const stopped = await snapshot(db);
    insist(stopped.split('|').every(x => x.endsWith(':false')),
      'A privileged RPC path remains after containment rollback.');
    console.log('PASS: RPC EXECUTE revoked; provider HMAC guard and JWT denial remain.');
    await db.query('rollback'); active = false;
    await db.query('begin'); active = true;
    insist(await snapshot(db) === before, 'Privilege state changed after transaction rollback.');
    console.log('PASS: original function privileges restored; no committed DB change.');
  } finally {
    if (active) try { await db.query('rollback'); } catch { /* disconnected */ }
    try { await db.end(); } catch { /* disconnected */ }
  }
}
main().catch(e => { console.error('FAIL S1 RPC rollback probe: ' + e.message); process.exitCode = 1; });
