import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { providers } from '@/lib/core';
import { loadKeyring } from '@/lib/provenance/keyring';
import { appendAudit, loadProviderResult, readAuditTrail, storeProviderResult } from '@/lib/provenance/repository';
import { processAuditOutbox } from '@/lib/provenance/outbox';
import { eraseImport, getImport, importFile } from '@/lib/imports/repository';
import { createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from './support';
import { ROLE, buildMinimalInstallSql, buildMinimalRollbackSql } from '../../scripts/u03-window-minimal-principal.mjs';
import { buildAuditRow, type AuditRow, type ProjectRef } from '@/lib/provenance/audit';

const RUN = randomUUID();
const TAG = `u03-${RUN.replaceAll('-','').slice(0,12)}`;
const A = `${TAG}-a`, B = `${TAG}-b`, OTHER = `other-${RUN.replaceAll('-','').slice(0,12)}`;
const DB = 'supabase_db_rubik-u03-window-20261020';
const LEDGER = 'test-results/u03-window-principal-signed.jsonl';
const temporaryCredential = randomBytes(32).toString('base64url');
const keyringResult = loadKeyring({PROVENANCE_SIGNING_KEYS:`u03-min:${randomBytes(32).toString('base64')}`,
  PROVENANCE_ACTIVE_KEY_ID:'u03-min'});
if (!keyringResult.ok) throw new Error('LOCAL_KEYRING_REJECTED');
const keyring = keyringResult.keyring;
const users: string[]=[];
let ownerA: Awaited<ReturnType<typeof signedIn>>;
let ownerB: Awaited<ReturnType<typeof signedIn>>;
let projectA: ProjectRef;
let otherProject: ProjectRef;
let installed=false;
let pool: Pool|undefined;
function record(phase:'preflight'|'fixtures'|'principal'|'signed-rows'|'isolation'|'receipts'|'active-session-expiry'|'cleanup',
  result:'PASS'|'BLOCKED',ids?:Record<string,string[]>) {
  appendFileSync(LEDGER,`${JSON.stringify({runId:RUN,phase,result,...(ids?{ids}:{})})}\n`);
}

function sql(statement:string) {
  try { return execFileSync('docker',['exec','-i',DB,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q','-At'],
    {input:statement,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim(); }
  catch { throw new Error('LOCAL_SQL_PHASE_FAILED'); }
}
function count(statement:string) { return Number(sql(statement).split(/\r?\n/).filter(Boolean).at(-1)); }
const uuid = (value:string) => { if(!/^[0-9a-f-]{36}$/i.test(value)) throw new Error('UUID_REJECTED'); return `'${value}'::uuid`; };

beforeAll(async()=>{
  expect(sql("select count(*)::text||'|'||max(version)::text from supabase_migrations.schema_migrations")).toBe('27|20261015210000');
  expect(count(`select count(*) from pg_roles where rolname='${ROLE}'`)).toBe(0);
  record('preflight','PASS');
  users.push(await createConfirmedUser('u03-min-a'),await createConfirmedUser('u03-min-b'));
  [ownerA,ownerB]=await Promise.all([signedIn('u03-min-a'),signedIn('u03-min-b')]);
  expect((await ownerA.from('organizations').insert({slug:A,name:'A'})).error).toBeNull();
  expect((await ownerB.from('organizations').insert({slug:B,name:'B'})).error).toBeNull();
  expect((await ownerB.from('organizations').insert({slug:OTHER,name:'Outside run'})).error).toBeNull();
  const oa=(await ownerA.from('organizations').select('id').eq('slug',A).single()).data!.id;
  const ob=(await ownerB.from('organizations').select('id').eq('slug',B).single()).data!.id;
  const oo=(await ownerB.from('organizations').select('id').eq('slug',OTHER).single()).data!.id;
  expect((await ownerA.from('projects').insert({organization_id:oa,slug:'a1',name:'A1'})).error).toBeNull();
  expect((await ownerB.from('projects').insert({organization_id:ob,slug:'b1',name:'B1'})).error).toBeNull();
  expect((await ownerB.from('projects').insert({organization_id:oo,slug:'x1',name:'Outside'})).error).toBeNull();
  projectA={projectId:(await ownerA.from('projects').select('id').eq('organization_id',oa).single()).data!.id,
    organizationId:oa,scope:{tenantId:A,projectId:'a1'}};
  otherProject={projectId:(await ownerB.from('projects').select('id').eq('organization_id',oo).single()).data!.id,
    organizationId:oo,scope:{tenantId:OTHER,projectId:'x1'}};
  record('fixtures','PASS',{users,organizations:[oa,ob,oo],projects:[projectA.projectId,otherProject.projectId]});
  const expiry=new Date(Date.now()+10*60_000).toISOString();
  sql(buildMinimalInstallSql(RUN,temporaryCredential,expiry)); installed=true;
  const dsn=`postgresql://${ROLE}:${temporaryCredential}@127.0.0.1:63422/postgres`;
  sql(`alter role ${ROLE} login valid until '${expiry}'`);
  process.env.RUBIK_AUDIT_DATABASE_URL=dsn;
  process.env.VERCEL_ENV='development';
  pool=new Pool({connectionString:dsn,ssl:false,max:1});
  pool.on('error',()=>{ /* administrative containment may terminate an idle connection */ });
  record('principal','PASS');
},60_000);

afterAll(async()=>{
  if(installed) sql(`alter role ${ROLE} nologin`);
  await pool?.end().catch(()=>undefined);
  if(installed) sql(`select pg_terminate_backend(pid) from pg_stat_activity where usesysid=(select oid from pg_roles where rolname='${ROLE}') and pid<>pg_backend_pid()`);
  if(users.length) {
    expect(count("select count(*) from private.audit_outbox where state='pending'")).toBe(0);
    await deleteOrganizations([A,B,OTHER]);
    await deleteUsers(users);
  }
  const inventory=sql(`select (select count(*) from auth.users)::text||'|'||(select count(*) from public.organizations)::text||'|'||
    (select count(*) from public.projects)::text||'|'||(select count(*) from public.audit_events)::text||'|'||
    (select count(*) from public.provider_results)::text||'|'||(select count(*) from public.imports)::text||'|'||
    (select count(*) from private.audit_idempotency)::text||'|'||(select count(*) from private.audit_outbox)::text`);
  expect(inventory).toBe('0|0|0|0|0|0|0|0');
  if(installed) { sql(buildMinimalRollbackSql(RUN)); installed=false; }
  expect(count(`select count(*) from pg_roles where rolname='${ROLE}'`)).toBe(0);
  expect(count("select count(*) from pg_policies where policyname like 'u03_preview_writer_%'")).toBe(0);
  expect(count(`select count(*) from pg_stat_activity where usename='${ROLE}'`)).toBe(0);
  expect(sql("select rolcanlogin::text from pg_roles where rolname='rubik_audit_writer'")).toBe('false');
  expect(sql("select position('rubik_preview_u03_writer' in pg_get_functiondef('private.trusted_provider_insert_guard()'::regprocedure))")).toBe('0');
  record('cleanup','PASS');
},60_000);

it('uses a separate SQL principal for genuine signed rows and reconciles receipts',async()=>{
  const principal=await pool!.connect();
  try {
    const caps=(await principal.query(`select session_user::text as session_user,current_user::text as current_user,
      has_function_privilege(current_user,'private.google_capture_command(uuid,text,jsonb)','execute') as google,
      has_function_privilege(current_user,'private.openseo_job(uuid,text,uuid,jsonb)','execute') as openseo,
      pg_has_role(current_user,'rubik_audit_writer','MEMBER') as member`)).rows[0];
    expect([caps.session_user,caps.current_user,caps.google,caps.openseo,caps.member]).toEqual([ROLE,ROLE,false,false,false]);
    await expect(principal.query("select private.google_capture_command($1::uuid,'store','{}'::jsonb)",[projectA.projectId]))
      .rejects.toMatchObject({code:'42501'});
    await expect(principal.query("select private.openseo_job($1::uuid,'complete',$2::uuid,'{}'::jsonb)",[projectA.projectId,randomUUID()]))
      .rejects.toMatchObject({code:'42501'});
    const outside=buildAuditRow(null,{at:new Date().toISOString(),actor:{id:users[1],role:'owner'},
      action:'u03.other-run.negative',target:null,outcome:'allowed',details:{}},otherProject,keyring);
    expect(outside.ok).toBe(true);
    if(outside.ok) await expect(principal.query(`insert into public.audit_events
      (project_id,organization_id,seq,at,actor_role,actor_id,action,target,outcome,details,prev_hash,hash,key_id,signature)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [outside.row.project_id,outside.row.organization_id,outside.row.seq,outside.row.at,outside.row.actor_role,users[1],outside.row.action,
        outside.row.target,outside.row.outcome,outside.row.details,outside.row.prev_hash,outside.row.hash,outside.row.key_id,outside.row.signature]))
      .rejects.toMatchObject({code:'42501'});
  } finally { principal.release(); }

  const audit=await appendAudit(ownerA,projectA,{actor:{id:users[0],role:'owner'},action:'u03.minimal.audit'},keyring);
  expect(audit.ok).toBe(true);
  const synthetic=await providers.runProviderRequest({provider:'search-console',operation:'searchAnalytics',
    input:{siteUrl:'sc-domain:fixture.invalid',startDate:'2026-10-01',endDate:'2026-10-01',rowLimit:1},
    transport:{kind:'live',request:async()=>({rows:[{query:'u03',clicks:1,impressions:1,ctr:1,averagePosition:1}],truncated:false})},
    clock:()=>new Date(),budget:{maxUnits:1,maxRequests:1}});
  const result=await storeProviderResult(ownerA,projectA,synthetic,keyring);
  expect(result.ok).toBe(true);
  if(!result.ok) return;
  const bytes=new TextEncoder().encode(JSON.stringify({format:'rubik-import-v1',scope:projectA.scope,
    source:{kind:'manual-review',label:'U03 local',url:null,tool:null},capturedAt:new Date().toISOString(),
    findings:[{url:'https://fixture.invalid/u03',ruleId:'u03.local',severity:'info',title:'Fixture',
      observation:'Dato ficticio',proposal:null,evidenceRef:RUN,status:'open'}]}));
  const imported=await importFile(ownerA,projectA,bytes,{id:users[0],role:'owner'},keyring);
  expect(imported.ok).toBe(true);
  if(!imported.ok) return;
  const trail=await readAuditTrail(ownerA,projectA,keyring);
  expect(trail.ok && trail.verification.valid).toBe(true);
  const opened=await loadProviderResult(ownerA,projectA,result.id,keyring);
  expect(opened.ok && opened.verification.verified).toBe(true);
  record('signed-rows','PASS',{results:[result.id],imports:[imported.id]});
  expect(await getImport(ownerA,projectA,imported.id)).not.toBeNull();
  expect((await ownerB.from('audit_events').select('seq').eq('project_id',projectA.projectId)).data).toEqual([]);
  expect(await loadProviderResult(ownerB,projectA,result.id,keyring)).toEqual({ok:false,error:'NOT_FOUND'});
  expect(await getImport(ownerB,projectA,imported.id)).toBeNull();
  record('isolation','PASS');
  expect(count(`select count(*) from private.audit_outbox where id=${uuid(imported.id)} and state='completed'`)).toBe(1);
  expect((await processAuditOutbox(imported.id,keyring)).ok).toBe(true);
  const erasedImport=await eraseImport(ownerA,projectA,imported.id,{id:users[0],role:'owner'},keyring);
  expect(erasedImport.ok).toBe(true);
  const erasedResult=await ownerA.from('provider_results').delete().eq('id',result.id).select('id');
  expect(erasedResult.error).toBeNull();
  expect((await processAuditOutbox(result.id,keyring)).ok).toBe(true);
  expect((await processAuditOutbox(result.id,keyring)).ok).toBe(true);
  expect(count("select count(*) from private.audit_outbox where state='pending'")).toBe(0);
  record('receipts','PASS');
  const activeSession=await pool!.connect();
  try {
    const signedRows=(await activeSession.query<AuditRow>('select * from public.audit_events where project_id=$1 order by seq',[projectA.projectId])).rows;
    expect(signedRows.length).toBeGreaterThan(0);
    const next=buildAuditRow(signedRows.at(-1)!,{at:new Date().toISOString(),actor:{id:users[0],role:'owner'},
      action:'u03.expired.negative',target:null,outcome:'allowed',details:{}},projectA,keyring);
    expect(next.ok).toBe(true);
    if(!next.ok) return;
    sql(`alter role ${ROLE} valid until '${new Date(Date.now()-1000).toISOString()}'`);
    const after=(await activeSession.query('select count(*)::int as n from public.audit_events where project_id=$1',[projectA.projectId])).rows[0].n;
    expect(after).toBe(0);
    await expect(activeSession.query(`insert into public.audit_events
      (project_id,organization_id,seq,at,actor_role,actor_id,action,target,outcome,details,prev_hash,hash,key_id,signature)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [next.row.project_id,next.row.organization_id,next.row.seq,next.row.at,next.row.actor_role,users[0],next.row.action,
        next.row.target,next.row.outcome,next.row.details,next.row.prev_hash,next.row.hash,next.row.key_id,next.row.signature]))
      .rejects.toMatchObject({code:'42501'});
    sql(`alter role ${ROLE} login valid until '${new Date(Date.now()+60_000).toISOString()}'`);
    expect((await activeSession.query('select count(*)::int as n from public.audit_events where project_id=$1',[projectA.projectId])).rows[0].n)
      .toBeGreaterThan(0);
    sql(`alter role ${ROLE} nologin`);
    expect((await activeSession.query('select count(*)::int as n from public.audit_events where project_id=$1',[projectA.projectId])).rows[0].n)
      .toBe(0);
    record('active-session-expiry','PASS');
  } finally { activeSession.release(); }
},90_000);
