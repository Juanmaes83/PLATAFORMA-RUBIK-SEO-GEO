// Direct PostgreSQL proof on the owned disposable N1 stack. No hosted SQL.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { ROLE, buildMinimalInstallSql, buildMinimalRollbackSql } from './u03-window-minimal-principal.mjs';

const root = resolve(import.meta.dirname, '..');
const db = 'supabase_db_rubik-u03-window-20261020';
const marker = JSON.parse(readFileSync(resolve(root,'test-results/u03-window-local-stack/.u03-owned-stack.json'),'utf8'));
if (marker.project !== 'rubik-u03-window-20261020' || marker.migrations !== 27)
  throw new Error('LOCAL_STACK_IDENTITY_REJECTED');
const runId = randomUUID();
const credential = randomBytes(32).toString('base64url');
const expiresAt = new Date(Date.now()+6*60_000).toISOString();
const ledger = resolve(root,'test-results/u03-window-minimal-local.jsonl');
const write = (phase,result,code=null) => appendFileSync(ledger,JSON.stringify({runId,phase,result,...(code?{code}:{})})+'\n');
function admin(sql) {
  try { return execFileSync('docker',['exec','-i',db,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-q','-At'],
    {input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim(); }
  catch(error) {
    const state=String(error?.stderr??'').match(/\b(?:42501|42704|42710|0A000|28P01|28000|23505|42601|42P01|42883|42703|2BP01)\b/)?.[0];
    if (state) {
      const detail=String(error?.stderr??'');
      const near=detail.match(/syntax error at or near "([A-Za-z_]+)"/)?.[1];
      process.stderr.write(`LOCAL_SQLSTATE ${state} line=${detail.match(/LINE\s+(\d+):/)?.[1]??'unknown'} token=${near??'unknown'}\n`);
    }
    throw new Error(state?`SQLSTATE_${state}`:'LOCAL_ADMIN_SQL_FAILED');
  }
}
const scalar = sql => admin(sql).split(/\r?\n/).filter(Boolean).at(-1);
const assert = (condition,code) => { if (!condition) throw new Error(code); };
let installed=false; let pool; let activeClient;
try {
  write('preflight','ATTEMPTED');
  assert(scalar("select count(*)::text||'|'||max(version)::text from supabase_migrations.schema_migrations") === '27|20261015210000','MIGRATION_SET_REJECTED');
  assert(scalar("select count(*) from private.environment_identity where environment='preview' and project_ref='rhnnplewqsekrnaousyl'") === '1','LOCAL_SENTINEL_REJECTED');
  assert(scalar(`select count(*) from pg_roles where rolname='${ROLE}'`) === '0','ROLE_EXISTS');
  write('preflight','PASS');
  write('install-nologin','ATTEMPTED');
  admin(buildMinimalInstallSql(runId,credential,expiresAt)); installed=true;
  assert(scalar(`select rolcanlogin::text||'|'||rolinherit::text||'|'||rolbypassrls::text from pg_roles where rolname='${ROLE}'`) === 'false|false|false','ROLE_ATTRIBUTES_REJECTED');
  write('install-nologin','PASS');
  const url=new URL(`postgresql://${ROLE}:${credential}@127.0.0.1:63422/postgres`);
  pool=new Pool({connectionString:url.toString(),ssl:false,max:1,connectionTimeoutMillis:3000});
  let denied=false;
  try { await pool.query('select 1'); } catch(error) { denied=['28P01','28000'].includes(error?.code); }
  assert(denied,'NOLOGIN_NEW_SESSION_NOT_DENIED');
  await pool.end(); pool=null;
  admin(`alter role ${ROLE} login valid until '${expiresAt}';`);
  pool=new Pool({connectionString:url.toString(),ssl:false,max:1,connectionTimeoutMillis:3000});
  const client=await pool.connect(); activeClient=client;
  const effective=(await client.query(`select session_user::text as session_user,current_user::text as current_user,
    has_table_privilege(current_user,'public.audit_events','insert') as audit_insert,
    has_table_privilege(current_user,'public.provider_results','insert') as result_insert,
    has_table_privilege(current_user,'public.imports','insert') as import_insert,
    has_schema_privilege(current_user,'auth','usage') as auth_usage,
    pg_has_role(current_user,'rubik_audit_writer','MEMBER') as writer_member,
    has_function_privilege(current_user,'private.google_capture_command(uuid,text,jsonb)','execute') as google_rpc,
    has_function_privilege(current_user,'private.openseo_job(uuid,text,uuid,jsonb)','execute') as openseo_rpc`)).rows[0];
  assert(effective.session_user===ROLE && effective.current_user===ROLE && effective.audit_insert && effective.result_insert &&
    !effective.import_insert && !effective.auth_usage && !effective.writer_member && !effective.google_rpc && !effective.openseo_rpc,
  'EFFECTIVE_PRIVILEGES_REJECTED');
  const definer=(await client.query(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prokind in ('f','p') and p.prosecdef and has_schema_privilege(current_user,n.oid,'USAGE')
    and has_function_privilege(current_user,p.oid,'EXECUTE')`)).rows[0].n;
  assert(definer===2,'SECURITY_DEFINER_ALLOWLIST_REJECTED');
  denied=false;
  try { await client.query('set role rubik_audit_writer'); } catch(error) { denied=error?.code==='42501'; }
  assert(denied,'SET_ROLE_WRITER_NOT_DENIED');
  await client.query('select 1');
  write('effective-principal','PASS');
  admin(`alter role ${ROLE} valid until '${new Date(Date.now()-1000).toISOString()}';`);
  const visible=(await client.query(`select count(*)::int as n from public.audit_events`)).rows[0].n;
  assert(visible===0,'EXPIRED_SESSION_RLS_NOT_CLOSED');
  client.release(); activeClient=null;
  await pool.end(); pool=null;
  write('existing-session-ttl','PASS');
} catch(error) {
  write('principal-probe','BLOCKED',/^[A-Z_]+$/.test(error?.message??'')?error.message:'OTHER_LOCAL_FAILURE');
  process.exitCode=1;
} finally {
  if(installed) {
    try {
      admin(`alter role ${ROLE} nologin;`);
      assert(scalar(`select not rolcanlogin from pg_roles where rolname='${ROLE}'`) === 't','NOLOGIN_NOT_VERIFIED');
      admin(`select pg_terminate_backend(pid) from pg_stat_activity where usesysid=(select oid from pg_roles where rolname='${ROLE}') and pid<>pg_backend_pid();`);
      activeClient?.release(); activeClient=null;
      await pool?.end().catch(()=>{}); pool=null;
      admin(buildMinimalRollbackSql(runId));
      assert(scalar(`select count(*) from pg_roles where rolname='${ROLE}'`) === '0','ROLE_RESIDUE');
      assert(scalar("select count(*) from pg_policies where policyname like 'u03_preview_writer_%'") === '0','POLICY_RESIDUE');
      write('independent-rollback','PASS');
    } catch { write('independent-rollback','BLOCKED','ROLLBACK_NOT_VERIFIED'); process.exitCode=2; }
  }
  if (activeClient) activeClient.release();
  await pool?.end().catch(()=>{});
}
if(!process.exitCode) process.stdout.write(`U03_MINIMAL_LOCAL PASS runId=${runId} effective_definers=2 provider_rpc=denied cleanup=zero\n`);
