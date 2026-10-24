// Recovery of one failed H1-A run. No role activation, fixture creation, or receipt deletion.
// The existing completed receipts are checked before the run's project cascade is used.
import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPreviewAdminClient } from './u03-preview-api-key.mjs';
import { assertNodeClientTls, createPreviewAdminPool, recoverInstalledRun,
  EXPECTED_N1_MIGRATIONS } from './u03-window-role-preflight.mjs';
import { policyNames, ROLE } from './u03-window-minimal-principal.mjs';

export const H1A_RECOVERY = Object.freeze({
  runId: 'f7ee4d0a-edb4-4276-88fc-03bbab570a19',
  ref: 'rhnnplewqsekrnaousyl',
  sha: '0c06a300f3870af9cca5e5468a9401ccf7488b41',
  deploymentId: 'dpl_HR7dit3yEnunZWCHi4cXUNS7Vrn9',
  host: 'plataforma-rubik-seo-a0b46g2ws-juanma-espinosas-projects.vercel.app',
  branch: 'codex/h1a-integral-20261022',
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEDGER_CASES = Object.freeze({
  ownerA: 'fixture-user-ownera', ownerB: 'fixture-user-ownerb', outsider: 'fixture-user-outsider',
  orgA: 'fixture-org-ownera', orgB: 'fixture-org-ownerb',
  a1: 'fixture-project-a1', a2: 'fixture-project-a2', b1: 'fixture-project-b1',
});
const OWNED_PROJECT_TABLES = Object.freeze([
  'public.project_members', 'public.audit_events', 'public.provider_results', 'public.imports',
  'private.project_invitations', 'private.audit_idempotency', 'private.audit_outbox',
]);
const EMPTY_TABLES = Object.freeze([
  'private.openseo_project_jobs', 'private.openseo_project_connections', 'private.webmaster_properties',
  'private.provider_budgets', 'private.provider_spend', 'private.openseo_google_properties', 'private.google_captures',
]);
const RECOVERY_CODES = new Set([
  'RECOVERY_INPUT_REJECTED', 'RECOVERY_LEDGER_REJECTED', 'RECOVERY_TARGET_REJECTED',
  'RECOVERY_DATABASE_IDENTITY_REJECTED', 'RECOVERY_ROLE_OWNERSHIP_REJECTED',
  'RECOVERY_POLICY_SCOPE_REJECTED', 'RECOVERY_GUARD_REJECTED', 'RECOVERY_INVENTORY_SCOPE_REJECTED',
  'RECOVERY_RECEIPT_UNRESOLVED', 'RECOVERY_DELETE_REJECTED', 'RECOVERY_AUTH_DELETE_REJECTED',
  'RECOVERY_ROLLBACK_REJECTED', 'RECOVERY_FINAL_READ_REJECTED', 'RECOVERY_CONTAINMENT_UNVERIFIED',
  'RECOVERY_DATABASE_UNAVAILABLE', 'RECOVERY_LEDGER_WRITE_FAILED',
]);
const fail = code => { throw new Error(code); };
const count = value => Number(value);
const sameSet = (left, right) => left.length === right.length &&
  left.every(value => right.includes(value)) && new Set(left).size === left.length;
const namespace = `u03-${H1A_RECOVERY.runId.replaceAll('-', '').slice(0, 12)}`;
const ORIGINAL_SHA256 = Object.freeze({
  window: '1f36744b31b875413956359fa667a8327b7afee20a150581e064111c987dd192',
  hosted: '94034ffcd1fa21ed4f159e35a0049079b6d37940861713d33a4ca4f24effb144',
});
const sha256 = value => createHash('sha256').update(value).digest('hex');

/** Reads only the immutable campaign ledger; never emits its identifiers. */
export function ownedIdsFromLedger(text) {
  let rows;
  try { rows = text.trim().split(/\r?\n/).map(line => JSON.parse(line)); }
  catch { fail('RECOVERY_LEDGER_REJECTED'); }
  if (!rows.length || rows.some(row => row.runId !== H1A_RECOVERY.runId ||
      row.ref !== H1A_RECOVERY.ref ||
      (row.functionalSha === undefined && row.deploymentId === undefined && row.host === undefined
        ? row.caseId !== 'h1a-global-result' || row.status !== 'BLOCKED'
        : row.functionalSha !== H1A_RECOVERY.sha || row.deploymentId !== H1A_RECOVERY.deploymentId ||
          row.host !== H1A_RECOVERY.host)))
    fail('RECOVERY_LEDGER_REJECTED');
  const ids = {};
  for (const [alias, caseId] of Object.entries(LEDGER_CASES)) {
    const matches = rows.filter(row => row.caseId === caseId && row.status === 'CREATED');
    if (matches.length !== 1 || typeof matches[0].id !== 'string' || !UUID.test(matches[0].id))
      fail('RECOVERY_LEDGER_REJECTED');
    ids[alias] = matches[0].id;
    const reconciled = rows.filter(row => row.caseId === caseId && row.status === 'RECOVERED');
    if (reconciled.some(row => row.id !== ids[alias])) fail('RECOVERY_LEDGER_REJECTED');
  }
  if (new Set(Object.values(ids)).size !== Object.keys(ids).length) fail('RECOVERY_LEDGER_REJECTED');
  return ids;
}

function assertRecoveryEnvironment(env) {
  if (env.U03_PIN_DEPLOYMENT_ID !== H1A_RECOVERY.deploymentId ||
      env.U03_PIN_DEPLOYMENT_HOST !== H1A_RECOVERY.host ||
      env.U03_PIN_DEPLOYMENT_SHA !== H1A_RECOVERY.sha ||
      env.U03_PIN_DEPLOYMENT_BRANCH !== H1A_RECOVERY.branch ||
      env.U03_PREVIEW_WRITER_WINDOW_REF !== H1A_RECOVERY.ref ||
      env.U03_PREVIEW_WRITER_WINDOW_SHA !== H1A_RECOVERY.sha ||
      env.U03_PREVIEW_WRITER_WINDOW_RUN_ID !== H1A_RECOVERY.runId ||
      !env.U03_PREVIEW_ADMIN_KEY) fail('RECOVERY_TARGET_REJECTED');
}

async function queryRows(db, sql, values = []) { return (await db.query(sql, values)).rows; }

/** Scope and ownership checks run before any DELETE and again inside its transaction. */
export async function verifyOwnedRecoveryState(db, ids) {
  const users = [ids.ownerA, ids.ownerB, ids.outsider];
  const orgs = [ids.orgA, ids.orgB];
  const projects = [ids.a1, ids.a2, ids.b1];
  const [identity] = await queryRows(db, `select current_database() = 'postgres' as database_ok,
    session_user = 'postgres' and current_user = 'postgres' as admin_ok,
    (select count(*)=1 from private.environment_identity where environment='preview' and project_ref=$1) as ref_ok,
    (select count(*)=1 from private.environment_identity) as closed_ref,
    (select array_agg(version::text order by version) from supabase_migrations.schema_migrations) as migrations,
    (select rolcanlogin=false and rolbypassrls=false from pg_roles where rolname='rubik_audit_writer') as writer_locked`, [H1A_RECOVERY.ref]);
  if (!identity?.database_ok || !identity.admin_ok || !identity.ref_ok || !identity.closed_ref ||
      !identity.writer_locked || !sameSet(identity.migrations ?? [], EXPECTED_N1_MIGRATIONS))
    fail('RECOVERY_DATABASE_IDENTITY_REJECTED');

  const role = await queryRows(db, `select shobj_description(oid,'pg_authid') as marker, rolcanlogin, rolbypassrls
    from pg_roles where rolname=$1`, [ROLE]);
  const sessions = await queryRows(db, `select count(*)::int as n from pg_stat_activity where usename=$1`, [ROLE]);
  if (role.length !== 1 || role[0].marker !== `u03-window:${H1A_RECOVERY.runId}` ||
      role[0].rolcanlogin !== false || role[0].rolbypassrls !== false || sessions[0]?.n !== 0)
    fail('RECOVERY_ROLE_OWNERSHIP_REJECTED');

  const policies = await queryRows(db, `select policyname,schemaname,tablename,cmd,permissive,roles::text[] as roles,qual,with_check
    from pg_policies where policyname like 'u03_preview_writer_%' order by policyname`);
  const expected = policyNames(H1A_RECOVERY.runId);
  const tables = [['public','audit_events'],['public','provider_results'],['private','audit_idempotency'],['private','audit_outbox']];
  if (policies.length !== 4 || !sameSet(policies.map(row => row.policyname), expected) ||
      policies.some(row => { const index = expected.indexOf(row.policyname); return index < 0 ||
        row.schemaname !== tables[index][0] || row.tablename !== tables[index][1] ||
        row.cmd !== 'ALL' || row.permissive !== 'PERMISSIVE' || !sameSet(row.roles ?? [], [ROLE]) ||
        typeof row.qual !== 'string' || row.qual !== row.with_check ||
        !row.qual.includes(`u03-window:${H1A_RECOVERY.runId}`) ||
        !row.qual.includes(`${namespace}-a`) || !row.qual.includes(`${namespace}-b`) ||
        !row.qual.includes('rolcanlogin') || !row.qual.includes('rolvaliduntil'); }))
    fail('RECOVERY_POLICY_SCOPE_REJECTED');
  const guard = await queryRows(db, `select pg_get_functiondef(oid) as body, prosecdef as security_definer
    from pg_proc where oid='private.trusted_provider_insert_guard()'::regprocedure`);
  if (guard.length !== 1 || guard[0].security_definer !== false ||
      !guard[0].body.includes(`u03-window:${H1A_RECOVERY.runId}`) || !guard[0].body.includes(ROLE))
    fail('RECOVERY_GUARD_REJECTED');

  const authRows = await queryRows(db, 'select id,email from auth.users');
  if (authRows.some(row => !users.includes(row.id) ||
      row.email?.toLowerCase() !== `${Object.entries(ids).find(([, id]) => id === row.id)?.[0]?.toLowerCase()}-${namespace}@ejemplo.test`))
    fail('RECOVERY_INVENTORY_SCOPE_REJECTED');
  const orgRows = await queryRows(db, 'select id,slug,created_by from public.organizations');
  if (orgRows.some(row => !orgs.includes(row.id) || row.slug !== `${namespace}-${row.id === ids.orgA ? 'a' : 'b'}` ||
      row.created_by !== (row.id === ids.orgA ? ids.ownerA : ids.ownerB))) fail('RECOVERY_INVENTORY_SCOPE_REJECTED');
  const projectRows = await queryRows(db, 'select id,slug,organization_id from public.projects');
  if (projectRows.some(row => !projects.includes(row.id) ||
      row.slug !== Object.entries(ids).find(([, id]) => id === row.id)?.[0] ||
      row.organization_id !== (row.id === ids.b1 ? ids.orgB : ids.orgA))) fail('RECOVERY_INVENTORY_SCOPE_REJECTED');
  const orgMembers = await queryRows(db, 'select organization_id,user_id from public.organization_members');
  if (orgMembers.some(row => !orgs.includes(row.organization_id) || !users.includes(row.user_id)))
    fail('RECOVERY_INVENTORY_SCOPE_REJECTED');
  const projectMembers = await queryRows(db, 'select project_id,organization_id,user_id from public.project_members');
  if (projectMembers.some(row => !projects.includes(row.project_id) || !orgs.includes(row.organization_id) || !users.includes(row.user_id)))
    fail('RECOVERY_INVENTORY_SCOPE_REJECTED');
  for (const table of OWNED_PROJECT_TABLES) {
    const result = await queryRows(db, `select count(*)::int as total,
      count(*) filter(where not(project_id=any($1::uuid[])))::int as foreign_rows from ${table}`, [projects]);
    if (result[0]?.foreign_rows !== 0) fail('RECOVERY_INVENTORY_SCOPE_REJECTED');
  }
  for (const table of EMPTY_TABLES) {
    const result = await queryRows(db, `select count(*)::int as total from ${table}`);
    if (result[0]?.total !== 0) fail('RECOVERY_INVENTORY_SCOPE_REJECTED');
  }
  const receipts = await queryRows(db, `select o.state,o.event_seq,
    exists(select 1 from public.audit_events e where e.project_id=o.project_id and e.seq=o.event_seq
      and e.details->>'receiptId'=o.id::text) as linked
    from private.audit_outbox o`);
  // A previous recovery attempt may have committed the project cascade before
  // Auth deletion failed. That cascade removes both completed receipts atomically.
  if (!([0, 3].includes(projectRows.length) && [0, 2].includes(orgRows.length)) ||
      (projectRows.length === 0) !== (orgRows.length === 0) ||
      receipts.length !== (projectRows.length === 3 ? 2 : 0) ||
      receipts.some(row => row.state !== 'completed' || !Number.isInteger(row.event_seq) || !row.linked))
    fail('RECOVERY_RECEIPT_UNRESOLVED');
  return { users: authRows.map(row => row.id), organizations: orgRows.map(row => row.id),
    projects: projectRows.map(row => row.id), receipts: receipts.length };
}

async function independentFinalRead(password) {
  const pool = createPreviewAdminPool(password);
  try {
    const client = await pool.connect();
    try {
      assertNodeClientTls(client, pool);
      const [row] = await queryRows(client, `select
        current_database() = 'postgres' and session_user = 'postgres' and current_user = 'postgres' as admin_identity,
        (select count(*)=1 from private.environment_identity where environment='preview' and project_ref=$3) as preview_identity,
        (select count(*)=1 from private.environment_identity) as closed_ref,
        (select array_agg(version::text order by version) from supabase_migrations.schema_migrations) as migrations,
        (select count(*) from auth.users)=0 as users_zero,
        (select count(*) from public.organizations)=0 as orgs_zero,
        (select count(*) from public.organization_members)=0 as org_members_zero,
        (select count(*) from public.projects)=0 as projects_zero,
        (select count(*) from public.project_members)=0 as project_members_zero,
        (select count(*) from public.audit_events)=0 as audit_zero,
        (select count(*) from public.provider_results)=0 as results_zero,
        (select count(*) from public.imports)=0 as imports_zero,
        (select count(*) from private.project_invitations)=0 as invitations_zero,
        (select count(*) from private.audit_idempotency)=0 as idempotency_zero,
        (select count(*) from private.audit_outbox)=0 as outbox_zero,
        (select count(*) from private.audit_outbox where state='pending')=0 as pending_zero,
        (select count(*) from pg_roles where rolname=$1)=0 as role_absent,
        (select count(*) from pg_policies where policyname like 'u03_preview_writer_%')=0 as policies_absent,
        (select count(*) from pg_stat_activity where usename=$1)=0 as sessions_absent,
        (select rolcanlogin=false from pg_roles where rolname='rubik_audit_writer') as writer_locked,
        (select prosecdef=false and pg_get_functiondef(oid) not like $2 and
          pg_get_functiondef(oid) like '%trusted provider writer required%'
          from pg_proc where oid='private.trusted_provider_insert_guard()'::regprocedure) as guard_original`,
      [ROLE, `%${ROLE}%`, H1A_RECOVERY.ref]);
      if (!row || !sameSet(row.migrations ?? [], EXPECTED_N1_MIGRATIONS) ||
          Object.entries(row).some(([key, value]) => key !== 'migrations' && value !== true))
        fail('RECOVERY_FINAL_READ_REJECTED');
      return true;
    } finally { client.release(); }
  } finally { await pool.end().catch(() => {}); }
}

export async function recoverH1ARun({ databasePassword, env = process.env, root = process.cwd(),
  adminPoolFactory = createPreviewAdminPool, adminClientFactory = createPreviewAdminClient } = {}) {
  if (typeof databasePassword !== 'string' || !databasePassword) fail('RECOVERY_INPUT_REJECTED');
  assertRecoveryEnvironment(env);
  const originalPath = join(root, 'test-results', 'u03-hosted-window', `${H1A_RECOVERY.runId}.jsonl`);
  const hostedPath = join(root, 'test-results', 'u03-hosted', `${H1A_RECOVERY.runId}.jsonl`);
  const original = await readFile(originalPath);
  const hosted = await readFile(hostedPath);
  if (sha256(original) !== ORIGINAL_SHA256.window || sha256(hosted) !== ORIGINAL_SHA256.hosted)
    fail('RECOVERY_LEDGER_REJECTED');
  const ids = ownedIdsFromLedger(original.toString('utf8'));
  const recoveryDir = join(root, 'test-results', 'u03-hosted-recovery');
  await mkdir(recoveryDir, { recursive: true });
  const ledgerPath = join(recoveryDir, `${H1A_RECOVERY.runId}-recovery.jsonl`);
  let phase = 'recovery-start';
  const ledger = async (caseId, status, code = null, counts = null) => {
    const row = { utc: new Date().toISOString(), runId: H1A_RECOVERY.runId, ref: H1A_RECOVERY.ref,
      deploymentId: H1A_RECOVERY.deploymentId, sha: H1A_RECOVERY.sha, caseId, status,
      ...(code ? { code } : {}), ...(counts ? { counts } : {}) };
    try { await appendFile(ledgerPath, `${JSON.stringify(row)}\n`, { mode: 0o600 }); }
    catch { fail('RECOVERY_LEDGER_WRITE_FAILED'); }
  };
  let pool;
  let cleanupStarted = false;
  try {
    await ledger('recovery-start', 'ATTEMPTED');
    try {
      await independentFinalRead(databasePassword);
      await ledger('recovery-independent-final', 'PASS');
      await ledger('recovery-global', 'PASS');
      return { status: 'PASS', ledgerPath };
    } catch (error) {
      if (error?.message !== 'RECOVERY_FINAL_READ_REJECTED') throw error;
    }
    pool = adminPoolFactory(databasePassword);
    let client = await pool.connect();
    try {
      assertNodeClientTls(client, pool);
      phase = 'recovery-ownership';
      await ledger(phase, 'ATTEMPTED');
      const state = await verifyOwnedRecoveryState(client, ids);
      await ledger(phase, 'PASS', null, { users: state.users.length, organizations: state.organizations.length,
        projects: state.projects.length, completedReceipts: state.receipts });
    } finally { client.release(); }

    phase = 'recovery-owned-delete';
    await ledger(phase, 'ATTEMPTED');
    client = await pool.connect();
    try {
      assertNodeClientTls(client, pool);
      await client.query('begin isolation level serializable');
      try {
        await client.query("set local statement_timeout = '15s'");
        await client.query("set local lock_timeout = '5s'");
        const current = await verifyOwnedRecoveryState(client, ids);
        cleanupStarted = true;
        const deletedProjects = await queryRows(client, 'delete from public.projects where id=any($1::uuid[]) returning id', [current.projects]);
        if (!sameSet(deletedProjects.map(row => row.id), current.projects)) fail('RECOVERY_DELETE_REJECTED');
        const deletedOrgs = await queryRows(client, 'delete from public.organizations where id=any($1::uuid[]) returning id', [current.organizations]);
        if (!sameSet(deletedOrgs.map(row => row.id), current.organizations)) fail('RECOVERY_DELETE_REJECTED');
        const [remaining] = await queryRows(client, `select (select count(*) from public.projects) as projects,
          (select count(*) from public.organizations) as organizations,
          (select count(*) from private.audit_outbox) as outbox_total,
          (select count(*) from private.audit_outbox where state='pending') as pending`);
        if (Object.values(remaining).some(value => count(value) !== 0)) fail('RECOVERY_DELETE_REJECTED');
        await client.query('commit');
      } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
    } finally { client.release(); }
    await ledger(phase, 'PASS');

    phase = 'recovery-auth-delete';
    await ledger(phase, 'ATTEMPTED');
    const admin = adminClientFactory(`https://${H1A_RECOVERY.ref}.supabase.co`, env.U03_PREVIEW_ADMIN_KEY);
    for (const id of [ids.outsider, ids.ownerB, ids.ownerA]) {
      const user = await admin.auth.admin.getUserById(id);
      if (user.error && user.error.status !== 404) fail('RECOVERY_AUTH_DELETE_REJECTED');
      if (!user.data?.user) continue;
      const alias = Object.entries(ids).find(([, value]) => value === id)?.[0];
      if (user.data.user.email?.toLowerCase() !== `${alias.toLowerCase()}-${namespace}@ejemplo.test`)
        fail('RECOVERY_INVENTORY_SCOPE_REJECTED');
      const deleted = await admin.auth.admin.deleteUser(id);
      if (deleted.error) fail('RECOVERY_AUTH_DELETE_REJECTED');
    }
    await ledger(phase, 'PASS');

    phase = 'recovery-rollback';
    await ledger(phase, 'ATTEMPTED');
    await pool.end(); pool = null;
    const rollback = await recoverInstalledRun({ databasePassword, runId: H1A_RECOVERY.runId,
      ledgerPath: join(recoveryDir, `${H1A_RECOVERY.runId}-role-rollback.jsonl`) });
    if (rollback.status !== 'PASS' || !rollback.guardOriginal || !rollback.writerLocked ||
        rollback.outboxTotal !== 0 || rollback.pendingOutbox !== 0) fail('RECOVERY_ROLLBACK_REJECTED');
    await ledger(phase, 'PASS');
    phase = 'recovery-independent-final';
    await ledger(phase, 'ATTEMPTED');
    await independentFinalRead(databasePassword);
    await ledger(phase, 'PASS');
    await ledger('recovery-global', 'PASS');
    return { status: 'PASS', ledgerPath };
  } catch (error) {
    const code = RECOVERY_CODES.has(error?.message) ? error.message : 'RECOVERY_DATABASE_UNAVAILABLE';
    await ledger(phase, 'BLOCKED', code).catch(() => {});
    if (cleanupStarted) {
      try {
        const independent = adminPoolFactory(databasePassword);
        try {
          const client = await independent.connect();
          try {
            assertNodeClientTls(client, independent);
            const role = await queryRows(client, `select shobj_description(oid,'pg_authid') as marker from pg_roles where rolname=$1`, [ROLE]);
            if (role.length === 1 && role[0].marker === `u03-window:${H1A_RECOVERY.runId}`) {
              await client.query(`alter role ${ROLE} nologin`);
              await client.query(`select pg_terminate_backend(pid) from pg_stat_activity where usename=$1 and pid<>pg_backend_pid()`, [ROLE]);
              const locked = await queryRows(client, `select rolcanlogin from pg_roles where rolname=$1`, [ROLE]);
              const sessions = await queryRows(client, `select count(*)::int as n from pg_stat_activity where usename=$1`, [ROLE]);
              if (locked[0]?.rolcanlogin !== false || sessions[0]?.n !== 0) fail('RECOVERY_CONTAINMENT_UNVERIFIED');
            } else if (role.length !== 0) fail('RECOVERY_CONTAINMENT_UNVERIFIED');
            await ledger('recovery-containment', 'PASS');
          } finally { client.release(); }
        } finally { await independent.end().catch(() => {}); }
      } catch { await ledger('recovery-containment', 'BLOCKED', 'RECOVERY_CONTAINMENT_UNVERIFIED').catch(() => {}); }
    }
    throw new Error(code);
  } finally { if (pool) await pool.end().catch(() => {}); databasePassword = ''; }
}

async function main() {
  let input;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (input?.mode !== 'h1a-recover' || input?.runId !== H1A_RECOVERY.runId) fail('RECOVERY_INPUT_REJECTED');
    const result = await recoverH1ARun({ databasePassword: input.databasePassword });
    process.stdout.write(`H1A_RECOVERY PASS runId=${H1A_RECOVERY.runId} ledger=${result.ledgerPath.replaceAll('\\','/')}\n`);
  } catch (error) {
    const code = RECOVERY_CODES.has(error?.message) ? error.message : 'RECOVERY_DATABASE_UNAVAILABLE';
    process.stdout.write(`H1A_RECOVERY BLOCKED code=${code}\n`);
    process.exitCode = 1;
  } finally { if (input) input.databasePassword = ''; }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
