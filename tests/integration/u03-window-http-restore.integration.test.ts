import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { chromium } from 'playwright';
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
import { ALLOWED_ROUTE_EVENT, auditAndCapture, createDiagnosticIntervalTracker, createPageDiagnostics, installScopedRoutes, summarizeDiagnosticInterval } from '../../scripts/u03-preview-b4-runner.mjs';
import { verifyH1ADiagnosticIntervals } from '../../scripts/u03-preview-window-run.mjs';
import { planRestore } from '@/lib/restore/plan';
import { createConfirmedUser, deleteOrganizations, deleteUsers, email, env, signedIn, TEST_PASSPHRASE } from './support';
import { localDatabaseContainer } from '../../scripts/supabase-test-env.mjs';
import { selectedStack } from '../../scripts/test-stacks.mjs';
import { ROLE, buildMinimalInstallSql, buildMinimalRollbackSql } from '../../scripts/u03-window-minimal-principal.mjs';

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
const ledger = `${ROOT}/test-results/u03-window-http-restore-${RUN}.jsonl`;
const users: string[] = [];
let user: SupabaseClient<Database>;
let member: SupabaseClient<Database>;
let orgId = '';
let project!: ProjectRef;
let memberId = '';
let pool: Pool | undefined;
let server: ChildProcess | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let browserPage: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>> | undefined;
let ownerCookie = '';
let orgCreated = false;
let roleInstalled = false;
let targetRowsCreated = false;
let destinationActorIds: string[] = [];
type HttpExport = Omit<ProjectExport,'format'> & {format:string;manifest:unknown;operations?:unknown};
const keyring = loadKeyring({ PROVENANCE_SIGNING_KEYS: `u03-http:${KEY}`, PROVENANCE_ACTIVE_KEY_ID: 'u03-http' });
if (!keyring.ok) throw new Error('LOCAL_KEYRING_INVALID');

function record(phase: string, result: 'PASS'|'FAIL'|'BLOCKED'|'ATTEMPTED', detail: Record<string,unknown> = {}) {
  const allowed = new Set(['preflight','browser-auth-diagnostics','h1a-diagnostic-boundary','visual-h1a-measurement','visual-h1a-report','capture-h1a-measurement','capture-h1a-report',
    'browser-views-and-logout','http-export','offline-verification','tamper-rejection','restore-destination','source-cleanup','destination-cleanup']);
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
  process.env.RUBIK_RECOVERY_SCHEMA_ATTESTATION='pre-n2-through-20261015210000';
  pool=new Pool({connectionString:dsn.toString(),ssl:false,max:1});
  expect((await user.auth.getUser()).data.user?.id).toBe(users[0]);
  const signed=await appendTrustedAudit(user,project,{actor:{id:users[0],role:'owner'},action:'u03.http.fixture'},keyring.keyring);
  expect(signed.ok).toBe(true);
  const synthetic=await providers.runProviderRequest({provider:'search-console',operation:'searchAnalytics',
    input:{siteUrl:'sc-domain:fixture.invalid',startDate:'2026-10-01',endDate:'2026-10-01',rowLimit:1},
    transport:{kind:'live',request:async()=>({rows:[{query:'h1a synthetic',clicks:1,impressions:1,ctr:1,averagePosition:1}],truncated:false})},
    clock:()=>new Date('2026-10-01T00:00:00.000Z'),budget:{maxUnits:1,maxRequests:1}});
  expect(providers.isTrustedResult(synthetic)).toBe(true);
  const stored=await storeProviderResult(user,project,synthetic,keyring.keyring,{operationId:randomUUID()});
  expect(stored.ok).toBe(true);
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
  const appEnv={...process.env,NEXT_PUBLIC_SUPABASE_URL:env.apiUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:env.publishableKey,
    PROVENANCE_SIGNING_KEYS:`u03-http:${KEY}`,PROVENANCE_ACTIVE_KEY_ID:'u03-http',NEXT_TELEMETRY_DISABLED:'1'};
  try { execFileSync(process.execPath,[nextBin,'build'],{cwd:ROOT,env:appEnv,stdio:'pipe',timeout:120_000}); }
  catch { throw new Error('H1A_LOCAL_PRODUCTION_BUILD_FAILED'); }
  server=spawn(process.execPath,[nextBin,'start','--hostname','127.0.0.1','--port',String(port)],{
    cwd:ROOT,stdio:'ignore',env:appEnv,
  });
  await waitForServer(server,`http://127.0.0.1:${port}`);
  process.env.U03_LOCAL_HTTP_BASE=`http://127.0.0.1:${port}`;
  record('preflight','PASS');
},120_000);

afterAll(async()=>{
  await browser?.close().catch(()=>undefined);
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
  const origin=process.env.U03_LOCAL_HTTP_BASE!;
  browser=await chromium.launch({headless:true});
  {
    const context=await browser.newContext({locale:'es-ES'});
    const page=await context.newPage();
    browserPage=page;
    const diagnostics=createPageDiagnostics(page,{allowedOrigin:origin});
    await installScopedRoutes(context,page,null,origin,()=>{},(...args:unknown[])=>{
      if(typeof args[0]==='string') diagnostics.addRouteEvent(args[0]);
    });
    const diagnosticIntervals=createDiagnosticIntervalTracker(diagnostics);
    const pageErrors={count:0};
    page.on('pageerror',()=>{ pageErrors.count+=1; });
    const boundary=(interval:string,status:'PASS'|'ATTEMPTED'|'BLOCKED'='PASS')=>{
      const row=diagnosticIntervals.checkpoint(interval) as unknown as {diagnosticsDelta:Record<string,Record<string,number>>;diagnosticsAfter:Record<string,unknown>;diagnosticsBefore:Record<string,unknown>};
      const summary=summarizeDiagnosticInterval(row);
      record('h1a-diagnostic-boundary',summary.status==='BLOCKED'?'BLOCKED':status,{diagnosticInterval:interval,diagnosticsAfter:row.diagnosticsAfter,
        diagnosticsBefore:row.diagnosticsBefore,diagnosticsDelta:row.diagnosticsDelta,consoleErrorCount:summary.consoleErrorCount,...(summary.code?{code:summary.code}:{})});
      if(summary.status==='BLOCKED') throw new Error(summary.code);
      return row;
    };
    boundary('before-login','ATTEMPTED');
    const access=await page.goto(`${origin}/acceso`,{waitUntil:'domcontentloaded'});
    expect(access?.status()).toBe(200);
    await page.locator('#email').fill(email('u03-http-owner'));
    await page.locator('#password').fill(TEST_PASSPHRASE);
    const loginResponse = page.waitForResponse(response => {
      try { return response.request().method()==='POST' && new URL(response.url()).pathname==='/api/auth/login'; }
      catch { return false; }
    });
    await page.getByRole('button',{name:'Entrar'}).click();
    const loginResult=await loginResponse;
    const loginStatus=loginResult.status();
    const loginOrigin=await loginResult.request().headerValue('origin');
    const loginOriginCategory=!loginOrigin?'ABSENT':loginOrigin===origin?'MATCH':'MISMATCH';
    record('browser-auth-diagnostics',loginStatus===303?'PASS':'BLOCKED',{loginHttpStatus:loginStatus,loginOriginCategory});
    expect(loginStatus).toBe(303);
    await page.waitForURL(`${origin}/panel`);
    boundary('after-login');
    record('browser-auth-diagnostics','PASS',{diagnostics:diagnostics.snapshot(),pageErrorCount:pageErrors.count});
    const captureRoot=`${ROOT}/test-results/u03-local-h1a-${RUN}`;
    mkdirSync(captureRoot,{recursive:true});
    for(const viewport of [{width:1280,height:800},{width:390,height:844}]) {
      await page.setViewportSize(viewport);
      for(const [path,label] of [['medicion','Firma verificada'],['informe','Informe del proyecto']]) {
        boundary('before-navigation','ATTEMPTED');
        const view=await page.goto(`${origin}/proyectos/${TENANT}/a1/${path}`,{waitUntil:'domcontentloaded'});
        boundary('after-navigation');
        expect(view?.status()).toBe(200);
        expect(new URL(page.url()).origin).toBe(origin);
        expect(await page.getByText(label,{exact:false}).count()).toBeGreaterThan(0);
        const screen=path==='medicion'?'h1a-measurement':'h1a-report';
        const requiredDiagnosticBoundaries=path==='medicion'&&viewport.width===1280
          ? ['before-login','after-login','before-navigation','after-navigation','before-measurement','after-measurement']
          : ['before-navigation','after-navigation','before-measurement','after-measurement'];
        const capture=await auditAndCapture(page,{runId:RUN,viewport:viewport.width===1280?'desktop':'mobile',screen,
          captureRoot,diagnostics,pageErrors,diagnosticIntervals,requiredDiagnosticBoundaries,ledger:async(caseId,status,detail)=>{
            if(caseId==='h1a-diagnostic-boundary') {
              record(caseId,status==='PASS'?'PASS':status==='ATTEMPTED'?'ATTEMPTED':'BLOCKED',detail);
              return;
            }
            const captureRecord=caseId.startsWith('capture-');
            record(`${captureRecord?'capture':'visual'}-${screen}`,status==='PASS'||status==='SAVED'?'PASS':'FAIL',detail);
          }});
        expect(capture.length).toBeGreaterThan(0);
      }
    }
    const localRows=readFileSync(ledger,'utf8').trim().split(/\r?\n/).map(line=>JSON.parse(line) as {phase:string;result:string;viewport?:string;diagnosticInterval?:string});
    const intervals=localRows.filter(row=>row.phase==='h1a-diagnostic-boundary');
    expect(intervals).toHaveLength(18);
    expect(intervals.map(row=>row.diagnosticInterval)).toEqual([
      'before-login','after-login','before-navigation','after-navigation','before-measurement','after-measurement',
      ...Array(3).fill(['before-navigation','after-navigation','before-measurement','after-measurement']).flat(),
    ]);
    const visualRows=localRows.filter(row=>row.phase==='visual-h1a-measurement'||row.phase==='visual-h1a-report');
    expect(visualRows).toHaveLength(4);
    expect(visualRows.every(row=>row.result==='PASS')).toBe(true);
    expect(visualRows.filter(row=>row.viewport==='desktop')).toHaveLength(2);
    expect(visualRows.filter(row=>row.viewport==='mobile')).toHaveLength(2);
    expect(verifyH1ADiagnosticIntervals(localRows.map(row=>({...row,caseId:row.phase,status:row.result})) as unknown as Array<Record<string,unknown>>)).toBe(true);
  }
  const response=await fetch(`${process.env.U03_LOCAL_HTTP_BASE}/proyectos/${TENANT}/a1/exportar`,{headers:{cookie:ownerCookie},redirect:'manual'});
  expect(response.status).toBe(200);
  const document=await response.json() as HttpExport;
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
  const page=browserPage!;
  await page.getByRole('button',{name:'Salir'}).click();
  await page.waitForURL(`${origin}/`);
  const denied=await page.goto(`${origin}/proyectos/${TENANT}/a1`,{waitUntil:'domcontentloaded'});
  expect(denied).not.toBeNull();
  expect(new URL(page.url()).pathname).toBe('/acceso');
  record('browser-views-and-logout','PASS');
  await deleteOrganizations([TENANT]);
  orgCreated=false;
  sql(DEST_DB,`delete from public.organizations where id='${project.organizationId}'::uuid; delete from auth.users where id in (${actorIds.map(id=>`'${id}'::uuid`).join(',')})`);
  targetRowsCreated=false;
  expect(inventory(SOURCE_DB,project.projectId,project.organizationId)).toBe('0|0|0|0|0|0|0');
  expect(inventory(DEST_DB,project.projectId,project.organizationId)).toBe('0|0|0|0|0|0|0');
},180_000);
