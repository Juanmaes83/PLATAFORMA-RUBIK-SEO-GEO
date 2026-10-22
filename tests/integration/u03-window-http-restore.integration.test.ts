import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { ProjectRef } from '@/lib/provenance/audit';
import type { ProjectExport } from '@/lib/provenance/repository';
import { appendTrustedAudit } from '@/lib/provenance/writer';
import { loadKeyring } from '@/lib/provenance/keyring';
import { verifyProjectExport } from '@/lib/recovery/verify-export';
import { planRestore } from '@/lib/restore/plan';
import { createConfirmedUser, deleteOrganizations, deleteUsers, env, signedIn } from './support';
import { localDatabaseContainer } from '../../scripts/supabase-test-env.mjs';
import { ROLE, buildMinimalInstallSql, buildMinimalRollbackSql } from '../../scripts/u03-window-minimal-principal.mjs';

const RUN = randomUUID();
const ROOT = process.cwd();
const SOURCE_DB = localDatabaseContainer();
const DEST_DB = 'supabase_db_rubik-u03-restore-20261020';
const ROLE_PASSWORD = randomBytes(32).toString('base64url');
const KEY = randomBytes(32).toString('base64');
const TENANT = `u03-${RUN.replaceAll('-', '').slice(0, 12)}-a`;
const ledger = `${ROOT}/test-results/u03-window-http-restore.jsonl`;
const users: string[] = [];
let user: SupabaseClient<Database>;
let orgId = '';
let project!: ProjectRef;
let pool: Pool | undefined;
let server: ChildProcess | undefined;
let ownerCookie = '';
let orgCreated = false;
let roleInstalled = false;
let targetRowsCreated = false;
let destinationActorIds: string[] = [];
type HttpExport = Omit<ProjectExport,'format'> & {format:string;manifest:unknown;operations?:unknown};
const keyring = loadKeyring({ PROVENANCE_SIGNING_KEYS: `u03-http:${KEY}`, PROVENANCE_ACTIVE_KEY_ID: 'u03-http' });
if (!keyring.ok) throw new Error('LOCAL_KEYRING_INVALID');

function record(phase: string, result: 'PASS'|'FAIL'|'BLOCKED') {
  const allowed = new Set(['preflight','http-export','offline-verification','tamper-rejection','restore-destination','source-cleanup','destination-cleanup']);
  if (!allowed.has(phase)) throw new Error('LEDGER_PHASE_REJECTED');
  mkdirSync(`${ROOT}/test-results`,{recursive:true});
  appendFileSync(ledger,`${JSON.stringify({runId:RUN,phase,category:'LOCAL_HTTP_RESTORE',result})}\n`,{flag:'a'});
}
function sql(db: string, statement: string) {
  return execFileSync('docker',['exec','-i',db,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q','-At'],
    { input: statement, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
}
async function freePort() {
  const socket = createServer();
  socket.listen(0,'127.0.0.1');
  await once(socket,'listening');
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('LOCAL_HTTP_PORT_ALLOCATION_FAILED');
  await new Promise<void>((resolve,reject)=>socket.close(error=>error?reject(error):resolve()));
  return address.port;
}
async function waitForServer(child: ChildProcess, url: string) {
  const until = Date.now()+60_000;
  while (Date.now()<until) {
    if (child.exitCode !== null) throw new Error('LOCAL_NEXT_SERVER_EXITED');
    try { const response = await fetch(`${url}/api/salud`,{signal:AbortSignal.timeout(1000)}); if (response.ok) return; } catch { /* startup only */ }
    await new Promise(resolve=>setTimeout(resolve,400));
  }
  throw new Error('LOCAL_NEXT_SERVER_START_TIMEOUT');
}
function inventory(db: string, projectId: string, organizationId: string) {
  return sql(db,`select
   (select count(*) from public.organizations where id='${organizationId}'::uuid)::text||'|'||
   (select count(*) from public.projects where id='${projectId}'::uuid)::text||'|'||
   (select count(*) from public.audit_events where project_id='${projectId}'::uuid)::text||'|'||
   (select count(*) from public.provider_results where project_id='${projectId}'::uuid)::text||'|'||
   (select count(*) from public.imports where project_id='${projectId}'::uuid)::text||'|'||
   (select count(*) from private.audit_outbox)::text||'|'||
   (select count(*) from private.audit_outbox where state='pending')::text`);
}

beforeAll(async () => {
  expect(sql(SOURCE_DB,'select count(*)::text||\'|\'||max(version)::text from supabase_migrations.schema_migrations')).toBe('27|20261015210000');
  if (sql(SOURCE_DB,"select count(*) from information_schema.tables where table_schema='private' and table_name='environment_identity'")==='0')
    sql(SOURCE_DB,readFileSync(`${ROOT}/scripts/u02-preview-sentinel.sql`,'utf8'));
  expect(sql(DEST_DB,'select count(*)::text||\'|\'||max(version)::text from supabase_migrations.schema_migrations')).toBe('27|20261015210000');
  expect(sql(DEST_DB,'select count(*) from auth.users')+'|'+sql(DEST_DB,'select count(*) from public.organizations')).toBe('0|0');
  users.push(await createConfirmedUser('u03-http-owner'));
  user = await signedIn('u03-http-owner');
  const createdOrg = await user.from('organizations').insert({slug:TENANT,name:'U03 loopback export'});
  if (createdOrg.error) throw new Error('LOCAL_ORGANIZATION_CREATE_FAILED');
  orgCreated = true;
  orgId = (await user.from('organizations').select('id').eq('slug',TENANT).single()).data!.id;
  const insertedProject = await user.from('projects').insert({organization_id:orgId,slug:'a1',name:'A1'});
  if (insertedProject.error) throw new Error('LOCAL_PROJECT_CREATE_FAILED');
  const projectId = (await user.from('projects').select('id').eq('organization_id',orgId).eq('slug','a1').single()).data!.id;
  project = {projectId,organizationId:orgId,scope:{tenantId:TENANT,projectId:'a1'}};

  const expiry = new Date(Date.now()+600_000).toISOString();
  sql(SOURCE_DB,buildMinimalInstallSql(RUN,ROLE_PASSWORD,expiry));
  roleInstalled=true;
  expect(sql(SOURCE_DB,`select has_function_privilege('${ROLE}','private.google_capture_command(uuid,text,jsonb)','execute')::text||'|'||has_function_privilege('${ROLE}','private.openseo_job(uuid,text,uuid,jsonb)','execute')::text||'|'||pg_has_role('${ROLE}','rubik_audit_writer','MEMBER')::text`)).toBe('false|false|false');
  sql(SOURCE_DB,`alter role ${ROLE} login valid until '${expiry}'`);
  const dsn=new URL(`postgresql://${ROLE}:${ROLE_PASSWORD}@127.0.0.1:63422/postgres`);
  process.env.RUBIK_AUDIT_DATABASE_URL=dsn.toString();
  process.env.RUBIK_TEST_U03_WINDOW_STACK='1';
  process.env.VERCEL_ENV='development';
  process.env.RUBIK_RECOVERY_SCHEMA_ATTESTATION='pre-n2-through-20261015210000';
  pool=new Pool({connectionString:dsn.toString(),ssl:false,max:1});
  expect((await user.auth.getUser()).data.user?.id).toBe(users[0]);
  const signed=await appendTrustedAudit(user,project,{actor:{id:users[0],role:'owner'},action:'u03.http.fixture'},keyring.keyring);
  expect(signed.ok).toBe(true);

  const sessionResult=await user.auth.getSession();
  const session=sessionResult.data.session;
  if(sessionResult.error||!session?.access_token) throw new Error('LOCAL_AUTH_SESSION_MISSING');
  const cookieValue=`base64-${Buffer.from(JSON.stringify(session),'utf8').toString('base64url')}`;
  ownerCookie=`sb-127-auth-token=${cookieValue}`;
  const port=await freePort();
  const nextBin=createRequire(import.meta.url).resolve('next/dist/bin/next');
  server=spawn(process.execPath,[nextBin,'dev','--hostname','127.0.0.1','--port',String(port)],{
    cwd:ROOT,stdio:'ignore',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:env.apiUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:env.publishableKey,
      PROVENANCE_SIGNING_KEYS:`u03-http:${KEY}`,PROVENANCE_ACTIVE_KEY_ID:'u03-http',NEXT_TELEMETRY_DISABLED:'1'},
  });
  await waitForServer(server,`http://127.0.0.1:${port}`);
  process.env.U03_LOCAL_HTTP_BASE=`http://127.0.0.1:${port}`;
  record('preflight','PASS');
},120_000);

afterAll(async()=>{
  if(server?.pid) {
    server.kill('SIGTERM');
    await Promise.race([once(server,'exit'),new Promise(resolve=>setTimeout(resolve,5000))]);
  }
  await pool?.end().catch(()=>undefined);
  if(roleInstalled) sql(SOURCE_DB,`alter role ${ROLE} nologin; select pg_terminate_backend(pid) from pg_stat_activity where usesysid=(select oid from pg_roles where rolname='${ROLE}') and pid<>pg_backend_pid()`);
  if(targetRowsCreated && project?.projectId) {
    sql(DEST_DB,`delete from public.organizations where id='${project.organizationId}'::uuid;${destinationActorIds.length?`delete from auth.users where id in (${destinationActorIds.map(id=>`'${id}'::uuid`).join(',')});`:''}`);
    targetRowsCreated=false;
  }
  if(orgCreated) await deleteOrganizations([TENANT]);
  if(users.length) await deleteUsers(users);
  const sourceGlobal=sql(SOURCE_DB,`select (select count(*) from auth.users)::text||'|'||(select count(*) from public.organizations)::text||'|'||(select count(*) from public.projects)::text||'|'||(select count(*) from public.audit_events)::text||'|'||(select count(*) from public.provider_results)::text||'|'||(select count(*) from public.imports)::text||'|'||(select count(*) from private.audit_outbox)::text||'|'||(select count(*) from private.audit_outbox where state='pending')::text`);
  if(roleInstalled) {
    if(sourceGlobal!=='0|0|0|0|0|0|0|0') throw new Error('LOCAL_RESIDUAL_DATA_PRESERVE_ROLE_NOLOGIN');
    sql(SOURCE_DB,buildMinimalRollbackSql(RUN));
    roleInstalled=false;
  }
  const sourceTemporary=sql(SOURCE_DB,`select (select count(*) from pg_roles where rolname='${ROLE}')::text||'|'||(select count(*) from pg_policy where polname like 'u03_preview_writer_%')::text||'|'||(select (not rolcanlogin)::text from pg_roles where rolname='rubik_audit_writer')`);
  expect(sourceTemporary).toBe('0|0|true');
  const destGlobal=sql(DEST_DB,`select (select count(*) from auth.users)::text||'|'||(select count(*) from public.organizations)::text||'|'||(select count(*) from public.projects)::text||'|'||(select count(*) from public.audit_events)::text||'|'||(select count(*) from public.provider_results)::text||'|'||(select count(*) from public.imports)::text||'|'||(select count(*) from private.audit_outbox)::text||'|'||(select count(*) from private.audit_outbox where state='pending')::text`);
  expect(sourceGlobal).toBe('0|0|0|0|0|0|0|0');
  expect(destGlobal).toBe('0|0|0|0|0|0|0|0');
  record('source-cleanup','PASS');
  record('destination-cleanup','PASS');
});

it('exports over a loopback HTTP socket and restores the verified signed manifest twice into a second empty local stack',async()=>{
  const response=await fetch(`${process.env.U03_LOCAL_HTTP_BASE}/proyectos/${TENANT}/a1/exportar`,{headers:{cookie:ownerCookie},redirect:'manual'});
  expect(response.status).toBe(200);
  const document=await response.json() as HttpExport;
  record('http-export','PASS');
  expect(verifyProjectExport(document,keyring.keyring)).toMatchObject({ok:true,completeness:{status:'COMPLETE'}});
  record('offline-verification','PASS');
  const altered=structuredClone(document);
  altered.audit.rows[0].action='project.delete';
  const tamper=verifyProjectExport(altered,keyring.keyring);
  expect(tamper.ok).toBe(true);
  if(tamper.ok) expect(tamper.audit.valid).toBe(false);
  expect(planRestore(altered,keyring.keyring,{operatorId:users[0]})).toMatchObject({ok:false,error:'TAMPERED'});
  record('tamper-rejection','PASS');

  const plan=planRestore(document,keyring.keyring,{operatorId:users[0]});
  if(!plan.ok) throw new Error('LOCAL_RESTORE_PLAN_REJECTED');
  const actorIds=[...new Set((document.audit.rows as Array<{actor_id?:string}>).map(row=>row.actor_id).filter((id):id is string=>!!id))];
  expect(actorIds).toContain(users[0]);
  destinationActorIds=actorIds;
  targetRowsCreated=true;
  for(const [index,id] of actorIds.entries()) {
    if(!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('RESTORE_ACTOR_ID_INVALID');
    sql(DEST_DB,`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000','${id}','authenticated','authenticated','u03-restore-${RUN.slice(0,8)}-${index}@example.test','',now(),now(),now()) on conflict(id) do nothing`);
  }
  const before=sql(DEST_DB,'select (select count(*) from public.organizations)::text||\'|\'||(select count(*) from public.projects)::text||\'|\'||(select count(*) from public.audit_events)::text');
  expect(before).toBe('0|0|0');
  sql(DEST_DB,plan.plan.sql);
  const first=sql(DEST_DB,`select (select count(*) from public.organizations where id='${project.organizationId}'::uuid)::text||'|'||(select count(*) from public.projects where id='${project.projectId}'::uuid)::text||'|'||(select count(*) from public.audit_events where project_id='${project.projectId}'::uuid)::text||'|'||(select count(*) from public.provider_results where project_id='${project.projectId}'::uuid)::text||'|'||(select count(*) from public.imports where project_id='${project.projectId}'::uuid)::text`);
  const auditSnapshot=()=>sql(DEST_DB,`select coalesce(json_agg(json_build_object('seq',seq,'actor_id',actor_id,'action',action,'outcome',outcome,'hash',hash,'prev_hash',prev_hash,'signature',signature) order by seq),'[]'::json)::text from public.audit_events where project_id='${project.projectId}'::uuid`);
  const sourceAudit=document.audit.rows.map(row=>({seq:row.seq,actor_id:row.actor_id,action:row.action,outcome:row.outcome,hash:row.hash,prev_hash:row.prev_hash,signature:row.signature}));
  expect(JSON.parse(auditSnapshot())).toEqual(sourceAudit);
  sql(DEST_DB,plan.plan.sql);
  const second=sql(DEST_DB,`select (select count(*) from public.organizations where id='${project.organizationId}'::uuid)::text||'|'||(select count(*) from public.projects where id='${project.projectId}'::uuid)::text||'|'||(select count(*) from public.audit_events where project_id='${project.projectId}'::uuid)::text||'|'||(select count(*) from public.provider_results where project_id='${project.projectId}'::uuid)::text||'|'||(select count(*) from public.imports where project_id='${project.projectId}'::uuid)::text`);
  expect(first).toBe(second);
  expect(JSON.parse(auditSnapshot())).toEqual(sourceAudit);
  expect(first.split('|').slice(0,3)).toEqual(['1','1','2']);
  expect(sql(DEST_DB,`select count(*) from private.audit_outbox where project_id='${project.projectId}'::uuid and state='pending'`)).toBe('0');
  record('restore-destination','PASS');
  await deleteOrganizations([TENANT]);
  orgCreated=false;
  sql(DEST_DB,`delete from public.organizations where id='${project.organizationId}'::uuid; delete from auth.users where id in (${actorIds.map(id=>`'${id}'::uuid`).join(',')})`);
  targetRowsCreated=false;
  expect(inventory(SOURCE_DB,project.projectId,project.organizationId)).toBe('0|0|0|0|0|0|0');
  expect(inventory(DEST_DB,project.projectId,project.organizationId)).toBe('0|0|0|0|0|0|0');
},120_000);
