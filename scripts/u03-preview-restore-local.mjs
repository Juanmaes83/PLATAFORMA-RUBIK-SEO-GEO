import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { register } from 'node:module';
import { join } from 'node:path';

register('./lib/app-ts-hooks.mjs', import.meta.url);
let commandPhase = 'PRECHECK';
const run = (file, args, options = {}) => {
  try { return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }); }
  catch { throw new Error(`LOCAL_RESTORE_${commandPhase}_FAILED`); }
};
const RUN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_KEYS = new Set(['at','captured_at','period_start','period_end','created_at','updated_at','email_confirmed_at']);

function canonical(value, key = '') {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && DATE_KEYS.has(key) && Number.isFinite(Date.parse(value)))
      return new Date(value).toISOString();
    return value;
  }
  if (Array.isArray(value)) return value.map(item => canonical(item));
  return Object.fromEntries(Object.keys(value).sort().map(name => [name, canonical(value[name], name)]));
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
const CONTENT_COLUMNS = {
  audit: ['project_id','organization_id','seq','at','actor_role','actor_id','action','target','outcome','details','prev_hash','hash','key_id','signature'],
  results: ['id','project_id','organization_id','provider','operation','status','captured_at','signed_payload','data','data_hash_alg','data_hash','key_id','signature','created_by'],
  imports: ['id','project_id','organization_id','format','source_kind','source_label','source_url','source_tool','captured_at','period_start','period_end','status','finding_count','error_count','findings','errors','file_sha256','file_bytes','created_by'],
};
function selectContent(rows, columns) {
  return rows.map(row => Object.fromEntries(columns.map(key => [key, row[key]])));
}
function contentRows(rows) {
  return {
    audit: selectContent(rows.audit, CONTENT_COLUMNS.audit),
    results: selectContent(rows.results, CONTENT_COLUMNS.results),
    imports: selectContent(rows.imports, CONTENT_COLUMNS.imports),
  };
}

function exportedRows(document) {
  return contentRows({
    audit: [...document.audit.rows].sort((a, b) => a.seq - b.seq),
    results: document.results.map(item => item.row).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    imports: [...(document.imports ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id))),
  });
}

async function main() {
  const inputChunks = [];
  let input;
  try {
    for await (const chunk of process.stdin) inputChunks.push(chunk);
  } catch { throw new Error('LOCAL_RESTORE_STDIN_READ_FAILED'); }
  try { input = JSON.parse(Buffer.concat(inputChunks).toString('utf8')); }
  catch { throw new Error('LOCAL_RESTORE_INPUT_JSON_INVALID'); }
  inputChunks.length = 0;
  const runId = input?.document ? input.runId : process.env.U03_RESTORE_DESTINATION_RUN_ID;
  const document = input?.document ?? input;
  if (!RUN.test(runId ?? '')) throw new Error('LOCAL_RESTORE_RUN_ID_INVALID');
  const projectName = `rubik-h1a-${runId.replaceAll('-', '').slice(0, 12).toLowerCase()}`;
  const workdir = join(process.cwd(), 'test-results', `${projectName}-restore-destination`);
  const db = `supabase_db_${projectName}`;
  const { loadKeyring } = await import('../src/lib/provenance/keyring.ts');
  const { planRestore } = await import('../src/lib/restore/plan.ts');
  const loaded = loadKeyring(process.env);
  if (!loaded.ok) throw new Error('LOCAL_RESTORE_KEYRING_UNAVAILABLE');
  const operatorId = document?.audit?.rows?.[0]?.actor_id;
  if (!UUID.test(operatorId ?? '')) throw new Error('LOCAL_RESTORE_OPERATOR_INVALID');
  const plan = planRestore(document, loaded.keyring, { operatorId });
  if (!plan.ok) throw new Error(`LOCAL_RESTORE_PLAN_${plan.error}`);

  let startAttempted = false;
  let cleanupOkay = true;
  const sql = statement => run('docker', ['exec', '-i', db, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-At'],
    { input: statement, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const counts = () => sql(`select (select count(*) from auth.users)::text||'|'||
    (select count(*) from public.organizations)::text||'|'||(select count(*) from public.projects)::text||'|'||
    (select count(*) from public.audit_events)::text||'|'||(select count(*) from public.provider_results)::text||'|'||
    (select count(*) from public.imports)::text||'|'||(select count(*) from private.audit_outbox)::text||'|'||
    (select count(*) from private.audit_outbox where state='pending')::text`);
  const snapshots = () => JSON.parse(sql(`select json_build_object(
    'audit',(select coalesce(json_agg(to_jsonb(a) order by a.seq),'[]'::json) from public.audit_events a where a.project_id='${plan.plan.projectId}'::uuid),
    'results',(select coalesce(json_agg(to_jsonb(r) order by r.id),'[]'::json) from public.provider_results r where r.project_id='${plan.plan.projectId}'::uuid),
    'imports',(select coalesce(json_agg(to_jsonb(i) order by i.id),'[]'::json) from public.imports i where i.project_id='${plan.plan.projectId}'::uuid)
  )::text`));
  try {
    commandPhase = 'DESTINATION_PRECHECK';
    const names = run('docker', ['ps', '-a', '--filter', `label=com.supabase.cli.project=${projectName}`, '--format', '{{.Names}}']).trim();
    if (existsSync(workdir) || names) throw new Error('LOCAL_RESTORE_DESTINATION_NOT_FRESH');
    startAttempted = true;
    const destinationEnv = { ...process.env, U03_RESTORE_DESTINATION_RUN_ID: runId };
    commandPhase = 'DESTINATION_START';
    run(process.execPath, ['scripts/u03-window-local-destination.mjs', 'start'], { env: destinationEnv });
    commandPhase = 'DESTINATION_INSPECT';
    run(process.execPath, ['scripts/u03-window-local-destination.mjs', 'inspect'], { env: destinationEnv });
    commandPhase = 'DESTINATION_COUNTS';
    if (counts() !== '0|0|0|0|0|0|0|0') throw new Error('LOCAL_RESTORE_DESTINATION_NOT_EMPTY');
    const actors = [...new Set(document.audit.rows.map(row => row.actor_id).filter(Boolean))];
    const imports = (document.imports ?? []).map(row => row.created_by).filter(Boolean);
    const results = (document.results ?? []).map(row => row.row?.created_by).filter(Boolean);
    const users = [...new Set([...actors, ...imports, ...results])];
    if (!users.every(id => UUID.test(id))) throw new Error('LOCAL_RESTORE_ACTOR_SET_INVALID');
    for (const [index, id] of users.entries()) {
      commandPhase = 'ACTOR_PREPARE';
      const email = `u03-restore-${randomUUID().slice(0, 8)}-${index}@fixture.invalid`;
      sql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
        values ('00000000-0000-0000-0000-000000000000','${id}','authenticated','authenticated','${email}','',now(),now(),now()) on conflict(id) do nothing;`);
    }
    const before = counts().split('|').map(Number);
    if (!before.length || before.slice(1).some(value => value !== 0)) throw new Error('LOCAL_RESTORE_AUTH_PREPARED_STATE_INVALID');
    const expected = exportedRows(document);
    const expectedDigest = digest(expected);
    commandPhase = 'RESTORE_APPLY_FIRST';
    sql(plan.plan.sql);
    commandPhase = 'RESTORE_READ_FIRST';
    const first = counts();
    const firstSnapshot = contentRows(snapshots());
    commandPhase = 'RESTORE_APPLY_SECOND';
    sql(plan.plan.sql);
    commandPhase = 'RESTORE_READ_SECOND';
    const second = counts();
    const secondSnapshot = contentRows(snapshots());
    const values = first.split('|').map(Number);
    if (first !== second || values[0] !== users.length || values[1] !== 1 || values[2] !== 1 ||
        values[3] !== document.audit.rows.length || values[4] !== document.results.length ||
        values[5] !== (document.imports ?? []).length || values[6] !== 0 || values[7] !== 0)
      throw new Error('LOCAL_RESTORE_IDEMPOTENCY_FAILED');
    const firstDigest = digest(firstSnapshot), secondDigest = digest(secondSnapshot);
    if (firstDigest !== expectedDigest || secondDigest !== expectedDigest || firstDigest !== secondDigest)
      throw new Error('LOCAL_RESTORE_CONTENT_OR_SIGNATURE_MISMATCH');
    return { status: 'PASS', restoreCount: 2, contentVerified: true, signaturesPreserved: true };
  } finally {
    if (startAttempted) {
      try {
        commandPhase = 'CLEANUP_SQL';
        const org = plan.plan.organizationId;
        const actorIds = [...new Set([...(document.audit?.rows ?? []).map(row => row.actor_id),
          ...(document.results ?? []).map(row => row.row?.created_by), ...(document.imports ?? []).map(row => row.created_by)]
          .filter(id => UUID.test(id ?? '')))];
        if (org && UUID.test(org)) {
          sql(`delete from public.organizations where id='${org}'::uuid;`);
        }
        const actorList = actorIds.map(id => `'${id}'::uuid`).join(',');
        if (actorList) sql(`delete from auth.users where id in (${actorList});`);
        if (counts() !== '0|0|0|0|0|0|0|0') cleanupOkay = false;
      } catch { cleanupOkay = false; }
      try { commandPhase = 'DESTINATION_STOP'; run(process.execPath, ['scripts/u03-window-local-destination.mjs', 'stop'], { env: { ...process.env, U03_RESTORE_DESTINATION_RUN_ID: runId } }); }
      catch { cleanupOkay = false; }
    }
    if (!cleanupOkay) process.exitCode = 2;
  }
}

try {
  const result = await main();
  process.stdout.write(`U03_PREVIEW_TO_LOCAL_RESTORE ${result.status} restoreCount=${result.restoreCount} contentVerified=${result.contentVerified} signaturesPreserved=${result.signaturesPreserved}\n`);
} catch (error) {
  const code = typeof error?.message === 'string' && /^[A-Z0-9_]{3,80}$/.test(error.message) ? error.message : 'LOCAL_RESTORE_FAILED';
  process.stderr.write(`U03_PREVIEW_TO_LOCAL_RESTORE BLOCKED code=${code}\n`);
  process.exitCode = 1;
}
