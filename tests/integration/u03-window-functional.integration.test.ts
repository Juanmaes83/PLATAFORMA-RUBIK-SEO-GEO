import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { chromium, type Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createOpenSeoMcpClient } from '@/lib/openseo/mcp-client';
import { paidToolDecision } from '@/lib/budget/paid-tools';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { ProjectRef } from '@/lib/provenance/audit';
import type { ProjectExport } from '@/lib/provenance/repository';
import { appendTrustedAudit } from '@/lib/provenance/writer';
import { readAuditTrail, storeProviderResult } from '@/lib/provenance/repository';
import { importFile } from '@/lib/imports/repository';
import { removePerson } from '@/lib/project-people';
import { processAuditOutbox } from '@/lib/provenance/outbox';
import { providers } from '@/lib/core';
import { loadKeyring } from '@/lib/provenance/keyring';
import { verifyProjectExport } from '@/lib/recovery/verify-export';
import { recoverySchemaContract } from '@/lib/recovery/schema-contract';
import { ALLOWED_ROUTE_EVENT, installScopedRoutes } from '../../scripts/u03-preview-b4-runner.mjs';
import { planRestore } from '@/lib/restore/plan';
import { createConfirmedUser, deleteOrganizations, deleteUsers, email, env, signedIn, TEST_PASSPHRASE } from './support';
import { localDatabaseContainer } from '../../scripts/supabase-test-env.mjs';
import { selectedStack } from '../../scripts/test-stacks.mjs';
import { ROLE, buildMinimalInstallSql, buildMinimalRollbackSql } from '../../scripts/u03-window-minimal-principal.mjs';
import { restorePreviewDocumentLocally } from '../../scripts/u03-preview-b4-orchestrator.mjs';

const RUN = randomUUID();
const ROOT = process.cwd();
const SOURCE_DB = localDatabaseContainer();
const SOURCE_DB_PORT=selectedStack().dbPort;
const RESTORE_PROJECT = `rubik-h1a-${(process.env.U03_RESTORE_DESTINATION_RUN_ID ?? '').replaceAll('-','').slice(0,12).toLowerCase()}`;
const DEST_DB = `supabase_db_${RESTORE_PROJECT}`;
const ROLE_PASSWORD = randomBytes(32).toString('base64url');
const KEY = randomBytes(32).toString('base64');
const TENANT = `u03-${RUN.replaceAll('-', '').slice(0, 12)}-a`;
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(process.env.U03_RESTORE_DESTINATION_RUN_ID ?? ''))
  throw new Error('LOCAL_RESTORE_RUN_ID_REQUIRED');
const ledger = `${ROOT}/test-results/mvp-functional-${RUN}.jsonl`;
const users: string[] = [];
const TENANT_B=TENANT.slice(0,-1)+'b';
const FOREIGN='foreign-'+RUN.replaceAll('-','').slice(0,12);
const egressJournal=ROOT+'/test-results/functional-egress-'+RUN+'.txt';
let foreignUserId='', foreignOrgId='', foreignFingerprint='';
let ownerB:SupabaseClient<Database>;
let projectB:ProjectRef;
let projectA2:ProjectRef;
let user: SupabaseClient<Database>;
let member: SupabaseClient<Database>;
let orgId = '';
let project!: ProjectRef;
let memberId = '';
let pool: Pool | undefined;
let server: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let ownerCookie = '';
let orgCreated = false;
let roleInstalled = false;
let targetRowsCreated = false;
let destinationActorIds: string[] = [];
type HttpExport = Omit<ProjectExport,'format'> & {format:string;manifest:unknown;operations?:unknown};
let signedExportForChild: HttpExport | undefined;
const keyring = loadKeyring({ PROVENANCE_SIGNING_KEYS: `u03-http:${KEY}`, PROVENANCE_ACTIVE_KEY_ID: 'u03-http' });
if (!keyring.ok) throw new Error('LOCAL_KEYRING_INVALID');

function record(phase: string, result: 'PASS'|'FAIL'|'BLOCKED'|'ATTEMPTED', detail: Record<string,unknown> = {}) {
  const allowed = new Set(['functional-identity','functional-desktop','functional-mobile','functional-tenancy','functional-egress-cost','foreign-preserved','preflight','browser-auth-diagnostics','h1a-diagnostic-boundary','visual-h1a-measurement','visual-h1a-report','capture-h1a-measurement','capture-h1a-report',
    'browser-views-and-logout','http-export','offline-verification','tamper-rejection','restore-destination','source-cleanup','destination-cleanup','functional-restore-transport']);
  if (!allowed.has(phase)) throw new Error('LEDGER_PHASE_REJECTED');
  const safeDetail: Record<string,unknown> = {};
  if (detail.viewport === 'desktop' || detail.viewport === 'mobile') safeDetail.viewport = detail.viewport;
  if (typeof detail.consoleErrorCount === 'number' && Number.isSafeInteger(detail.consoleErrorCount) && detail.consoleErrorCount >= 0) safeDetail.consoleErrorCount = detail.consoleErrorCount;
  if (typeof detail.pageErrorCount === 'number' && Number.isSafeInteger(detail.pageErrorCount) && detail.pageErrorCount >= 0) safeDetail.pageErrorCount = detail.pageErrorCount;
  if (typeof detail.loginHttpStatus === 'number' && Number.isInteger(detail.loginHttpStatus) && detail.loginHttpStatus >= 100 && detail.loginHttpStatus <= 599) safeDetail.loginHttpStatus = detail.loginHttpStatus;
  if (detail.loginOriginCategory === 'ABSENT' || detail.loginOriginCategory === 'MATCH' || detail.loginOriginCategory === 'MISMATCH') safeDetail.loginOriginCategory=detail.loginOriginCategory;
  if (typeof detail.diagnosticInterval === 'string' && ['before-login','after-login','before-navigation','after-navigation','before-measurement','after-measurement'].includes(detail.diagnosticInterval)) safeDetail.diagnosticInterval = detail.diagnosticInterval;
  for (const diagnosticsKey of ['diagnostics','diagnosticsBefore','diagnosticsAfter','diagnosticsDelta'] as const) if (detail[diagnosticsKey] && typeof detail[diagnosticsKey] === 'object') {
    const input = detail[diagnosticsKey] as Record<string,unknown>;
    const map = (value: unknown, keyPattern: RegExp) => Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {})
      .filter(([key,count]) => keyPattern.test(key) && Number.isSafeInteger(count) && Number(count) >= 0 && Number(count) <= 1_000_000));
    safeDetail[diagnosticsKey] = {
      console: map(input.console,/^(?:error|warning|log|info|debug|dir|assert|trace|other):(?:preview|preview-supabase|external|inline|unknown)$/),
      http: map(input.http,/^[1-5]\d\d:(?:preview|preview-supabase|external|inline|unknown)$/),
      requestFailures: map(input.requestFailures,/^(?:preview|preview-supabase|external|inline|unknown)$/),
      routeEvents: map(input.routeEvents,ALLOWED_ROUTE_EVENT),
    };
  }
  mkdirSync(`${ROOT}/test-results`,{recursive:true});
  appendFileSync(ledger,`${JSON.stringify({runId:RUN,phase,category:'LOCAL_HTTP_RESTORE',result,...safeDetail})}\n`,{flag:'a'});
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
const DATE_KEYS=new Set(['at','captured_at','period_start','period_end','created_at','updated_at','email_confirmed_at']);
function canonical(value:unknown,key=''):unknown {
  if(value===null||typeof value!=='object') return typeof value==='string'&&DATE_KEYS.has(key)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():value;
  if(Array.isArray(value)) return value.map(item=>canonical(item));
  return Object.fromEntries(Object.keys(value).sort().map(name=>[name,canonical((value as Record<string,unknown>)[name],name)]));
}
function digest(value:unknown) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }

beforeAll(async () => {
  expect(sql(SOURCE_DB,'select count(*)::text||\'|\'||max(version)::text from supabase_migrations.schema_migrations')).toBe('27|20261015210000');
  if (sql(SOURCE_DB,"select count(*) from information_schema.tables where table_schema='private' and table_name='environment_identity'")==='0')
    sql(SOURCE_DB,readFileSync(`${ROOT}/scripts/u02-preview-sentinel.sql`,'utf8'));
  expect(sql(DEST_DB,'select count(*)::text||\'|\'||max(version)::text from supabase_migrations.schema_migrations')).toBe('27|20261015210000');
  expect(sql(DEST_DB,'select count(*) from auth.users')+'|'+sql(DEST_DB,'select count(*) from public.organizations')).toBe('0|0');
  users.push(await createConfirmedUser('u03-http-owner'));
  users.push(await createConfirmedUser('u03-http-member'));
  users.push(await createConfirmedUser('u03-http-minimal'));
  users.push(await createConfirmedUser('u03-http-b'));
  ownerB=await signedIn('u03-http-b');
  foreignUserId=await createConfirmedUser('u03-functional-foreign');
  const foreign=await signedIn('u03-functional-foreign');
  expect((await foreign.from('organizations').insert({slug:FOREIGN,name:'Unrelated suite sentinel'})).error).toBeNull();
  foreignOrgId=(await foreign.from('organizations').select('id').eq('slug',FOREIGN).single()).data!.id;
  foreignFingerprint=sql(SOURCE_DB,`select md5(to_jsonb(o)::text) from public.organizations o where id='${foreignOrgId}'`);
  user = await signedIn('u03-http-owner');
  member = await signedIn('u03-http-member');
  memberId = users[1];
  const createdOrg = await user.from('organizations').insert({slug:TENANT,name:'U03 loopback export'});
  if (createdOrg.error) throw new Error('LOCAL_ORGANIZATION_CREATE_FAILED');
  orgCreated = true;
  orgId = (await user.from('organizations').select('id').eq('slug',TENANT).single()).data!.id;
  const insertedProject = await user.from('projects').insert({organization_id:orgId,slug:'a1',name:'A1'});
  if (insertedProject.error) throw new Error('LOCAL_PROJECT_CREATE_FAILED');
  const projectId = (await user.from('projects').select('id').eq('organization_id',orgId).eq('slug','a1').single()).data!.id;
  project = {projectId,organizationId:orgId,scope:{tenantId:TENANT,projectId:'a1'}};
  expect((await user.from('projects').insert({organization_id:orgId,slug:'a2',name:'A2'})).error).toBeNull();
  const a2id=(await user.from('projects').select('id').eq('organization_id',orgId).eq('slug','a2').single()).data!.id;
  projectA2={projectId:a2id,organizationId:orgId,scope:{tenantId:TENANT,projectId:'a2'}};
  expect((await ownerB.from('organizations').insert({slug:TENANT_B,name:'Organization B'})).error).toBeNull();
  const bOrg=(await ownerB.from('organizations').select('id').eq('slug',TENANT_B).single()).data!.id;
  expect((await ownerB.from('projects').insert({organization_id:bOrg,slug:'b1',name:'B1'})).error).toBeNull();
  const bId=(await ownerB.from('projects').select('id').eq('organization_id',bOrg).single()).data!.id;
  projectB={projectId:bId,organizationId:bOrg,scope:{tenantId:TENANT_B,projectId:'b1'}};

  const inviteResult = await user.rpc('project_invitations', { p_project_id: projectId, p_command: 'create',
    p_payload: { email: email('u03-http-member'), role: 'analyst' } });
  if (inviteResult.error || !inviteResult.data || typeof inviteResult.data !== 'object' || !('token' in inviteResult.data))
    throw new Error('LOCAL_MEMBERSHIP_INVITE_FAILED');
  const accepted = await member.rpc('accept_project_invitation', { p_token: String(inviteResult.data.token) });
  if (accepted.error) throw new Error('LOCAL_MEMBERSHIP_ACCEPT_FAILED');

  const expiry = new Date(Date.now()+600_000).toISOString();
  sql(SOURCE_DB,buildMinimalInstallSql(RUN,ROLE_PASSWORD,expiry));
  roleInstalled=true;
  expect(sql(SOURCE_DB,`select has_function_privilege('${ROLE}','private.google_capture_command(uuid,text,jsonb)','execute')::text||'|'||has_function_privilege('${ROLE}','private.openseo_job(uuid,text,uuid,jsonb)','execute')::text||'|'||pg_has_role('${ROLE}','rubik_audit_writer','MEMBER')::text`)).toBe('false|false|false');
  sql(SOURCE_DB,`alter role ${ROLE} login valid until '${expiry}'`);
  const dsn=new URL(`postgresql://${ROLE}:${ROLE_PASSWORD}@127.0.0.1:${SOURCE_DB_PORT}/postgres`);
  process.env.RUBIK_AUDIT_DATABASE_URL=dsn.toString();
  process.env.VERCEL_ENV='development';
  delete process.env.RUBIK_RECOVERY_SCHEMA_ATTESTATION;
  expect(await recoverySchemaContract()).toBe('unknown');
  process.env.RUBIK_RECOVERY_SCHEMA_ATTESTATION='pre-n2-through-20261015210000';
  expect(await recoverySchemaContract()).toBe('legacy-v2');
  pool=new Pool({connectionString:dsn.toString(),ssl:false,max:1});
  expect((await user.auth.getUser()).data.user?.id).toBe(users[0]);
  const signed=await appendTrustedAudit(user,project,{actor:{id:users[0],role:'owner'},action:'u03.http.fixture'},keyring.keyring);
  expect(signed.ok).toBe(true);
  const synthetic=await providers.runProviderRequest({provider:'search-console',operation:'searchAnalytics',
    input:{siteUrl:'sc-domain:fixture.invalid',startDate:'2026-10-01',endDate:'2026-10-01',rowLimit:1,dimensions:['query']},
    transport:{kind:'live',request:async()=>({rows:[{query:'h1a synthetic',clicks:37,impressions:101,ctr:37/101,averagePosition:3.25}],truncated:false})},
    clock:()=>new Date('2026-10-01T00:00:00.000Z'),budget:{maxUnits:1,maxRequests:1}});
  expect(providers.isTrustedResult(synthetic)).toBe(true);
  const stored=await storeProviderResult(user,project,synthetic,keyring.keyring,{operationId:randomUUID()});
  expect(stored.ok).toBe(true);
  expect((await storeProviderResult(user,projectA2,synthetic,keyring.keyring,{operationId:randomUUID()})).ok).toBe(true);
  expect((await storeProviderResult(ownerB,projectB,synthetic,keyring.keyring,{operationId:randomUUID()})).ok).toBe(true);
  const importBytes=new TextEncoder().encode(JSON.stringify({format:'rubik-import-v1',scope:project.scope,
    source:{kind:'manual-review',label:'H1-A ficticio',url:null,tool:null},capturedAt:'2026-10-01T00:00:00.000Z',
    findings:[{url:'https://fixture.invalid/h1a',ruleId:'h1a.synthetic',severity:'info',title:'Dato ficticio',observation:'Medición sintética declarada',proposal:null,evidenceRef:RUN,status:'open'}]}));
  const imported=await importFile(user,project,importBytes,{id:users[0],role:'owner'},keyring.keyring);
  expect(imported.ok).toBe(true);
  const withdrawn = await removePerson(user, projectId, memberId);
  if (!withdrawn.ok || !withdrawn.auditReceiptId) throw new Error('LOCAL_MEMBER_WITHDRAWAL_FAILED');
  const receiptResult = await processAuditOutbox(withdrawn.auditReceiptId, keyring.keyring);
  expect(receiptResult.ok).toBe(true);
  expect(await processAuditOutbox(withdrawn.auditReceiptId, keyring.keyring)).toEqual(receiptResult);
  expect((await member.from('projects').select('id').eq('id', projectId)).data).toEqual([]);
  expect((await member.from('projects').update({name:'UNAUTHORIZED'}).eq('id',projectId).select('id')).data).toEqual([]);
  expect((await ownerB.from('provider_results').select('id').eq('project_id',projectId)).data).toEqual([]);
  expect((await ownerB.from('projects').update({name:'UNAUTHORIZED'}).eq('id',projectId).select('id')).data).toEqual([]);
  const a2Invite=await user.rpc('project_invitations',{p_project_id:projectA2.projectId,p_command:'create',p_payload:{email:email('u03-http-member'),role:'viewer'}});
  if(a2Invite.error||!a2Invite.data||typeof a2Invite.data!=='object'||!('token' in a2Invite.data))throw new Error('A2_INVITE_FAILED');
  expect((await member.rpc('accept_project_invitation',{p_token:String(a2Invite.data.token)})).error).toBeNull();
  const signedTrail = await readAuditTrail(user, project, keyring.keyring);
  expect(signedTrail.ok && signedTrail.verification.valid).toBe(true);
  expect(signedTrail.ok && signedTrail.rows.some(row => row.action === 'member.withdraw' && row.target === memberId)).toBe(true);
  expect(sql(SOURCE_DB,`select count(*) from private.audit_outbox where state='pending'`)).toBe('0');

  const sessionResult=await user.auth.getSession();
  const session=sessionResult.data.session;
  if(sessionResult.error||!session?.access_token) throw new Error('LOCAL_AUTH_SESSION_MISSING');
  const cookieValue=`base64-${Buffer.from(JSON.stringify(session),'utf8').toString('base64url')}`;
  ownerCookie=`sb-127-auth-token=${cookieValue}`;
  const port=await freePort();
  const nextBin=createRequire(import.meta.url).resolve('next/dist/bin/next');
  const appEnv:NodeJS.ProcessEnv={...process.env,NEXT_PUBLIC_SUPABASE_URL:env.apiUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:env.publishableKey,
    PROVENANCE_SIGNING_KEYS:`u03-http:${KEY}`,PROVENANCE_ACTIVE_KEY_ID:'u03-http',NEXT_TELEMETRY_DISABLED:'1',OPENSEO_GOOGLE_READS_ENABLED:'false',OPENSEO_GOOGLE_CATALOG_CHECK_ENABLED:'false',RUBIK_LOCAL_EGRESS_PORTS:`${new URL(env.apiUrl).port},${SOURCE_DB_PORT},${port}`,RUBIK_LOCAL_EGRESS_JOURNAL:egressJournal};
  delete appEnv.OPENSEO_ENDPOINT; delete appEnv.OPENSEO_API_KEY;
  try { execFileSync(process.execPath,[nextBin,'build'],{cwd:ROOT,env:appEnv,stdio:'pipe',timeout:120_000}); }
  catch { throw new Error('H1A_LOCAL_PRODUCTION_BUILD_FAILED'); }
  server=spawn(process.execPath,['--import',pathToFileURL(`${ROOT}/scripts/h1a-local-egress-guard.mjs`).href,nextBin,'start','--hostname','127.0.0.1','--port',String(port)],{
    cwd:ROOT,stdio:'ignore',env:appEnv,
  });
  await waitForServer(server,`http://127.0.0.1:${port}`);
  process.env.U03_LOCAL_HTTP_BASE=`http://127.0.0.1:${port}`;
  record('preflight','PASS');
},120_000);

afterAll(async()=>{
  await browser?.close().catch(()=>undefined);
  if(server?.pid && server.exitCode===null) {
    server.kill('SIGTERM');
    await Promise.race([once(server,'exit'),new Promise(resolve=>setTimeout(resolve,5000))]);
  }
  await pool?.end().catch(()=>undefined);
  if(roleInstalled) sql(SOURCE_DB,`alter role ${ROLE} nologin; select pg_terminate_backend(pid) from pg_stat_activity where usesysid=(select oid from pg_roles where rolname='${ROLE}') and pid<>pg_backend_pid()`);
  if(targetRowsCreated && project?.projectId) {
    sql(DEST_DB,`delete from public.organizations where id='${project.organizationId}'::uuid;${destinationActorIds.length?`delete from auth.users where id in (${destinationActorIds.map(id=>`'${id}'::uuid`).join(',')});`:''}`);
    targetRowsCreated=false;
  }
  if(orgCreated) await deleteOrganizations([TENANT,TENANT_B]);
  if(users.length) await deleteUsers(users);
  if(foreignOrgId) {
    expect(sql(SOURCE_DB,`select md5(to_jsonb(o)::text) from public.organizations o where id='${foreignOrgId}'`)).toBe(foreignFingerprint);
    expect(sql(SOURCE_DB,`select count(*) from auth.users where id='${foreignUserId}'`)).toBe('1');
    record('foreign-preserved','PASS');
    await deleteOrganizations([FOREIGN]);await deleteUsers([foreignUserId]);
  }
  const sourceGlobal=sql(SOURCE_DB,`select (select count(*) from auth.users)::text||'|'||(select count(*) from public.organizations)::text||'|'||(select count(*) from public.projects)::text||'|'||(select count(*) from public.audit_events)::text||'|'||(select count(*) from public.provider_results)::text||'|'||(select count(*) from public.imports)::text||'|'||(select count(*) from private.audit_outbox)::text||'|'||(select count(*) from private.audit_outbox where state='pending')::text`);
  if(roleInstalled) {
    if(sourceGlobal!=='0|0|0|0|0|0|0|0') throw new Error('LOCAL_RESIDUAL_DATA_PRESERVE_ROLE_NOLOGIN');
    sql(SOURCE_DB,buildMinimalRollbackSql(RUN));
    roleInstalled=false;
  }
  const sourceTemporary=sql(SOURCE_DB,`select (select count(*) from pg_roles where rolname='${ROLE}')::text||'|'||(select count(*) from pg_policy where polname like 'u03_preview_writer_%')::text||'|'||(select (not rolcanlogin)::text from pg_roles where rolname='rubik_audit_writer')`);
  expect(sourceTemporary).toBe('0|0|true');
  const destinationPresent=execFileSync('docker',['ps','-a','--filter',`label=com.supabase.cli.project=${RESTORE_PROJECT}`,'--format','{{.Names}}'],{encoding:'utf8'}).trim()!=='';
  const destGlobal=destinationPresent?sql(DEST_DB,`select (select count(*) from auth.users)::text||'|'||(select count(*) from public.organizations)::text||'|'||(select count(*) from public.projects)::text||'|'||(select count(*) from public.audit_events)::text||'|'||(select count(*) from public.provider_results)::text||'|'||(select count(*) from public.imports)::text||'|'||(select count(*) from private.audit_outbox)::text||'|'||(select count(*) from private.audit_outbox where state='pending')::text`):'0|0|0|0|0|0|0|0';
  expect(sourceGlobal).toBe('0|0|0|0|0|0|0|0');
  expect(destGlobal).toBe('0|0|0|0|0|0|0|0');
  record('source-cleanup','PASS');
  record('destination-cleanup','PASS');
},60_000);

it('MVP functional: real identity, signed populated views and isolated double recovery',async()=>{
  const origin=process.env.U03_LOCAL_HTTP_BASE!;
  browser=await chromium.launch({headless:true});
  const securityFailures:string[]=[];
  const necessaryFailures:string[]=[];
  const necessaryBodies:Promise<void>[]=[];
  const bounded=async<T>(promise:Promise<T>,stage:string):Promise<T>=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(stage)),10_000);})]);}
    finally{clearTimeout(timer);}
  };
  let completedDocuments=0;
  const visit=async(page:Page,path:string,status=200)=>{
    const response=await page.goto(`${origin}${path}`,{waitUntil:'networkidle'});
    expect(response?.status()).toBe(status);
    expect(await bounded(response!.finished(),'DOCUMENT_FINISH_TIMEOUT')).toBeNull();
    expect((await bounded(response!.body(),'DOCUMENT_BODY_TIMEOUT')).byteLength).toBeGreaterThan(0);
    expect(response!.request().failure()).toBeNull();
    expect(new URL(page.url()).origin).toBe(origin);
    completedDocuments++;
    expect(securityFailures).toEqual([]);
    expect(necessaryFailures).toEqual([]);
    return response;
  };
  const login=async(name:string)=>{
    const context=await browser!.newContext({locale:'es-ES',serviceWorkers:'block'});
    const page=await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on('response',response=>{
      const request=response.request(),headers=request.headers();
      if(!['document','fetch','xhr'].includes(request.resourceType())||headers['next-router-prefetch']==='1'||headers.purpose==='prefetch'||response.status()>=300&&response.status()<400)return;
      necessaryBodies.push((async()=>{expect(await bounded(response.finished(),'NECESSARY_FINISH_TIMEOUT')).toBeNull();expect((await bounded(response.body(),'NECESSARY_BODY_TIMEOUT')).byteLength).toBeGreaterThan(0);})().catch(()=>{necessaryFailures.push('NECESSARY_BODY_INCOMPLETE_'+request.resourceType());}));
    });
    await installScopedRoutes(context,page,null,origin,(...args:unknown[])=>{securityFailures.push(typeof args[0]==='string'?args[0]:'INTERCEPTION_FAILED');},()=>{},null,()=>{},row=>{
      if((row.stage==='REQUEST'||row.stage==='RESPONSE')&&row.result!=='CONTINUED') securityFailures.push('CDP_INTERCEPTION_FAILED');
    },true);
    page.on('requestfailed',request=>{
      const headers=request.headers();
      const auxiliary=headers['next-router-prefetch']==='1'||headers.purpose==='prefetch';
      if(!auxiliary) necessaryFailures.push('NECESSARY_REQUEST_FAILED');
    });
    await visit(page,'/acceso');
    await page.locator('#email').fill(email(name));
    await page.locator('#password').fill(TEST_PASSPHRASE);
    const post=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/auth/login');
    await page.getByRole('button',{name:'Entrar'}).click();
    const response=await post;
    expect(response.status()).toBe(303);
    expect(await bounded(response.finished(),'LOGIN_POST_FINISH_TIMEOUT')).toBeNull();
    await page.waitForURL(`${origin}/panel`);
    await page.waitForLoadState('networkidle');
    await bounded(Promise.all(necessaryBodies),'LOGIN_NECESSARY_BODIES_TIMEOUT');
    await visit(page,'/panel');
    return {context,page};
  };
  const owner=await login('u03-http-owner');
  const page=owner.page;
  ownerCookie=(await owner.context.cookies()).map(cookie=>`${cookie.name}=${cookie.value}`).join('; ');
  await page.locator(`a[href='/proyectos/${TENANT}/a1']`).first().click();
  await page.waitForURL(`${origin}/proyectos/${TENANT}/a1`);
  await expect.poll(()=>page.locator('h1').innerText()).toBeTruthy();
  await page.waitForLoadState('networkidle');
  await Promise.all(necessaryBodies);
  await visit(page,`/proyectos/${TENANT}/a1`);
  record('functional-identity','PASS');

  for(const viewport of [{width:1280,height:800},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await visit(page,`/proyectos/${TENANT}/a1/medicion`);
    await expect.poll(()=>page.getByText('Firma verificada',{exact:true}).count()).toBeGreaterThan(0);
    expect(await page.getByText('Clics',{exact:true}).locator('..').locator('dd').innerText()).toBe('37');
    expect(await page.locator('body').innerText()).toContain('2026-10-01');
    expect(await page.locator('body').innerText()).toContain('sc-domain:fixture.invalid');
    const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:window.document.documentElement.scrollWidth}));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    const accessibility=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    expect(accessibility.violations.filter(v=>v.impact==='serious'||v.impact==='critical').map(v=>v.id)).toEqual([]);
    mkdirSync(`${ROOT}/test-results/functional-${RUN}`,{recursive:true});
    await page.screenshot({path:`${ROOT}/test-results/functional-${RUN}/${viewport.width}-measurement.png`,fullPage:true});
    await page.getByRole('navigation',{name:'Secciones del proyecto'}).getByRole('link',{name:'Informe del proyecto',exact:true}).click();
    await expect.poll(()=>page.getByRole('heading',{name:'Informe del proyecto',exact:true}).count()).toBe(1);
    await page.waitForLoadState('networkidle');
    await Promise.all(necessaryBodies);
    await visit(page,`/proyectos/${TENANT}/a1/informe`);
    await expect.poll(async()=>(await page.locator('#s-measurement').innerText()).toLowerCase()).toContain('google search console: capturas verificadas');
    const measured=page.locator('#s-measurement');
    expect(await measured.locator('dl > div').filter({has:page.locator('dt').filter({hasText:/Google Search Console: capturas verificadas/i})}).locator('dd').innerText()).toBe('1');
    expect(await measured.locator('dl > div').filter({has:page.locator('dt').filter({hasText:/Google Search Console: última, filas/i})}).locator('dd').innerText()).toBe('1');
    expect(await measured.innerText()).toContain('2026-10-01');
    expect(await page.locator('body').innerText()).toContain('No es una instantánea transaccional');
    await page.screenshot({path:`${ROOT}/test-results/functional-${RUN}/${viewport.width}-report.png`,fullPage:true});
    record(viewport.width===1280?'functional-desktop':'functional-mobile','PASS');
  }

  const a2=await login('u03-http-member');
  await visit(a2.page,`/proyectos/${TENANT}/a2`);
  for(const suffix of ['', '/medicion','/informe','/exportar']) {
    const foreign=await a2.context.request.get(`${origin}/proyectos/${TENANT}/a1${suffix}`);
    const missing=await a2.context.request.get(`${origin}/proyectos/${TENANT}/missing${suffix}`);
    expect(foreign.status()).toBe(404);expect(missing.status()).toBe(404);
  }
  await a2.context.close();
  const b=await login('u03-http-b');
  await visit(b.page,`/proyectos/${TENANT_B}/b1`);
  for(const suffix of ['', '/medicion','/informe','/exportar']) expect((await b.context.request.get(`${origin}/proyectos/${TENANT}/a1${suffix}`)).status()).toBe(404);
  await b.context.close();
  record('functional-tenancy','PASS');
  expect(completedDocuments).toBeGreaterThanOrEqual(12);
  expect(securityFailures).toEqual([]);expect(necessaryFailures).toEqual([]);
  const journal=readFileSync(egressJournal,'utf8').trim().split(/\r?\n/);
  expect(journal).toContain('READY');expect(journal).not.toContain('DENIED');
  let paidInvocations=0;
  const blockedClient=createOpenSeoMcpClient({mcpUrl:'https://never.invalid/mcp',apiKey:'fictional',maxPages:10,
    fetchImpl:async()=>{paidInvocations++;throw new Error('UNEXPECTED_PROVIDER_CALL');}});
  await expect(blockedClient.callTool('get_domain_overview',{})).rejects.toMatchObject({code:'TOOL_NOT_ALLOWED'});
  await expect(blockedClient.callTool('get_search_console_performance',{})).rejects.toMatchObject({code:'TOOL_NOT_ALLOWED'});
  expect(paidInvocations).toBe(0);
  expect(paidToolDecision('get_domain_overview',{}).ok).toBe(false);
  record('functional-egress-cost','PASS');

  const response=await fetch(`${process.env.U03_LOCAL_HTTP_BASE}/proyectos/${TENANT}/a1/exportar`,{headers:{cookie:ownerCookie},redirect:'manual'});
  expect(response.status).toBe(200);
  const document=await response.json() as HttpExport;
  signedExportForChild=document;
  record('http-export','PASS');
  expect(verifyProjectExport(document,keyring.keyring)).toMatchObject({ok:true,completeness:{status:'COMPLETE'}});
  expect(document.results).toHaveLength(1);
  expect(document.results[0].verification.verified).toBe(true);
  expect(document.imports).toHaveLength(1);
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
  const actorIds=[...new Set([
    ...(document.audit.rows as Array<{actor_id?:string}>).map(row=>row.actor_id),
    ...(document.results as Array<{row?:{created_by?:string}} >).map(result=>result.row?.created_by),
    ...(document.imports as Array<{created_by?:string}>).map(row=>row.created_by),
  ].filter((id):id is string=>!!id))];
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
  const destinationSnapshot=()=>JSON.parse(sql(DEST_DB,`select json_build_object(
    'audit',(select coalesce(json_agg(to_jsonb(a) order by a.seq),'[]'::json) from public.audit_events a where a.project_id='${project.projectId}'::uuid),
    'results',(select coalesce(json_agg(to_jsonb(r) order by r.id),'[]'::json) from public.provider_results r where r.project_id='${project.projectId}'::uuid),
    'imports',(select coalesce(json_agg(to_jsonb(i) order by i.id),'[]'::json) from public.imports i where i.project_id='${project.projectId}'::uuid)
  )::text`));
  const columns={
    audit:['project_id','organization_id','seq','at','actor_role','actor_id','action','target','outcome','details','prev_hash','hash','key_id','signature'],
    results:['id','project_id','organization_id','provider','operation','status','captured_at','signed_payload','data','data_hash_alg','data_hash','key_id','signature','created_by'],
    imports:['id','project_id','organization_id','format','source_kind','source_label','source_url','source_tool','captured_at','period_start','period_end','status','finding_count','error_count','findings','errors','file_sha256','file_bytes','created_by'],
  } as const;
  const select=(rows:Array<Record<string,unknown>>,keys:readonly string[])=>rows.map(row=>Object.fromEntries(keys.map(key=>[key,row[key]])));
  const expectedSnapshot={audit:select(document.audit.rows as unknown as Array<Record<string,unknown>>,columns.audit).sort((a,b)=>Number(a.seq)-Number(b.seq)),
    results:select(document.results.map(result=>result.row as unknown as Record<string,unknown>),columns.results).sort((a,b)=>String(a.id).localeCompare(String(b.id))),
    imports:select(document.imports as Array<Record<string,unknown>>,columns.imports).sort((a,b)=>String(a.id).localeCompare(String(b.id)))};
  const projected=(snapshot:Record<string,Array<Record<string,unknown>>>)=>({
    audit:select(snapshot.audit,columns.audit),results:select(snapshot.results,columns.results),imports:select(snapshot.imports,columns.imports)});
  const firstDigest=digest(projected(destinationSnapshot()));
  expect(firstDigest).toBe(digest(expectedSnapshot));
  sql(DEST_DB,plan.plan.sql);
  const second=sql(DEST_DB,`select (select count(*) from public.organizations where id='${project.organizationId}'::uuid)::text||'|'||(select count(*) from public.projects where id='${project.projectId}'::uuid)::text||'|'||(select count(*) from public.audit_events where project_id='${project.projectId}'::uuid)::text||'|'||(select count(*) from public.provider_results where project_id='${project.projectId}'::uuid)::text||'|'||(select count(*) from public.imports where project_id='${project.projectId}'::uuid)::text`);
  expect(first).toBe(second);
  expect(digest(projected(destinationSnapshot()))).toBe(firstDigest);
  expect(first.split('|').slice(0,2)).toEqual(['1','1']);
  expect(first.split('|').slice(2).map(Number)).toEqual([document.audit.rows.length,document.results.length,document.imports.length]);
  expect(sql(DEST_DB,`select count(*) from private.audit_outbox where project_id='${project.projectId}'::uuid and state='pending'`)).toBe('0');
  record('restore-destination','PASS');
  await page.getByRole('button',{name:'Salir'}).click();
  await page.waitForURL(`${origin}/`);
  const denied=await page.goto(`${origin}/proyectos/${TENANT}/a1`,{waitUntil:'domcontentloaded'});
  expect(denied).not.toBeNull();
  expect(new URL(page.url()).pathname).toBe('/acceso');
  record('browser-views-and-logout','PASS');
  await deleteOrganizations([TENANT,TENANT_B]);
  orgCreated=false;
  sql(DEST_DB,`delete from public.organizations where id='${project.organizationId}'::uuid; delete from auth.users where id in (${actorIds.map(id=>`'${id}'::uuid`).join(',')})`);
  targetRowsCreated=false;
  expect(inventory(SOURCE_DB,project.projectId,project.organizationId)).toBe('0|0|0|0|0|0|0');
  expect(inventory(DEST_DB,project.projectId,project.organizationId)).toBe('0|0|0|0|0|0|0');
},180_000);

it('restores the real signed HTTP export through the hosted parent and child transport',async()=>{
  expect(signedExportForChild).toBeDefined();
  const childRunId=process.env.U03_RESTORE_DESTINATION_RUN_ID!;
  expect(sql(DEST_DB,'select (select count(*) from auth.users)::text||\'|\'||(select count(*) from private.audit_outbox)::text')).toBe('0|0');
  execFileSync(process.execPath,['scripts/u03-window-local-destination.mjs','stop'],{
    cwd:ROOT,env:{...process.env,U03_RESTORE_DESTINATION_RUN_ID:childRunId},stdio:'pipe',timeout:120_000,
  });
  expect(await restorePreviewDocumentLocally(signedExportForChild,
    {PROVENANCE_SIGNING_KEYS:`u03-http:${KEY}`,PROVENANCE_ACTIVE_KEY_ID:'u03-http'},childRunId)).toBe(true);
  expect(execFileSync('docker',['ps','-a','--filter',`label=com.supabase.cli.project=${RESTORE_PROJECT}`,'--format','{{.Names}}'],{encoding:'utf8'}).trim()).toBe('');
  record('functional-restore-transport','PASS');
},240_000);
