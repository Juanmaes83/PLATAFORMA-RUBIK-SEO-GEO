// Auth-only H1-A probe. No product rows, window role, or database password.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createPreviewAdminClient } from './u03-preview-api-key.mjs';
import { PIN, preflight, GateError, installScopedRoutes, createPageDiagnostics, chromiumEnvironment } from './u03-preview-b4-runner.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAGES = new Set(['preflight','auth-create','login-post','session','xhr-interception','auth-cleanup','result']);
const CODES = new Set(['PRECHECK_FAILED','AUTH_CREATE_FAILED','LOGIN_POST_FAILED','SESSION_NOT_CONFIRMED',
  'XHR_NOT_OBSERVED','XHR_INCOMPLETE','XHR_INTERCEPTION_BLOCKED','XHR_EXTERNAL','XHR_PROTOCOL_INVALID',
  'AUTH_CLEANUP_FAILED','LEDGER_FAILED','PROBE_FAILED','OIDC_TOKEN_MISSING','VERCEL_DEPLOYMENT_INSPECTION_FAILED',
  'VERCEL_DEPLOYMENT_METADATA_INVALID','DEPLOYMENT_PIN_MISMATCH','PROTECTION_PREFLIGHT_FAILED',
  'DEPLOYMENT_PROTECTION_NOT_CONFIRMED','OIDC_AUTHENTICATION_FAILED','PREVIEW_IDENTITY_INVALID']);

export function classifyPreflightFailure(error) {
  return error instanceof GateError && CODES.has(error.code) ? error.code : 'PRECHECK_FAILED';
}
const PREFLIGHT_CATEGORIES = Object.freeze({
  OIDC_TOKEN_MISSING:'OIDC', OIDC_AUTHENTICATION_FAILED:'OIDC',
  VERCEL_DEPLOYMENT_INSPECTION_FAILED:'DEPLOYMENT', VERCEL_DEPLOYMENT_METADATA_INVALID:'DEPLOYMENT',
  DEPLOYMENT_PIN_MISMATCH:'DEPLOYMENT', PROTECTION_PREFLIGHT_FAILED:'PROTECTION',
  DEPLOYMENT_PROTECTION_NOT_CONFIRMED:'PROTECTION', PREVIEW_IDENTITY_INVALID:'IDENTITY',
});
export function preflightCategory(code) { return PREFLIGHT_CATEGORIES[code] ?? 'UNKNOWN'; }
const TRACE_ENUMS = {
  stage:['REQUEST','RESPONSE'], destinationClass:['PINNED_ORIGIN','EXTERNAL','UNKNOWN'],
  interceptionOperation:['CONTINUE_REQUEST','CONTINUE_RESPONSE','FAIL_REQUEST','CLASSIFY_URL','CLASSIFY_ORIGIN','CLASSIFY_REDIRECT','CONSTRUCT_HEADERS'],
  responseClass:['UNKNOWN','DIRECT','REDIRECT'], disposition:['ALLOWED','PINNED_REQUEST_BLOCKED'],
  result:['CONTINUED','BLOCKED'], failureCategory:['REQUEST_NOT_ACTIVE','CDP_SESSION_CLOSED','HEADER_REJECTED','CDP_OPERATION_REJECTED'],
};

export function evaluateAuthenticatedTrace(input, securityEvents = []) {
  if (!Array.isArray(input) || input.length > 128 || securityEvents.length) return { ok:false, code:'XHR_PROTOCOL_INVALID' };
  const ordinals = new Map();
  for (const row of input) {
    if (!Number.isSafeInteger(row.ordinal) || row.ordinal < 1 || row.ordinal > 128 ||
        !['REQUEST','RESPONSE'].includes(row.stage) || !/^(?:next-static|next-image|access|panel|api|project|root|other|unknown)-(?:xhr|fetch)$/.test(row.resourceClass) ||
        !['PINNED_ORIGIN','EXTERNAL','UNKNOWN'].includes(row.destinationClass) ||
        !['CONTINUE_REQUEST','CONTINUE_RESPONSE','FAIL_REQUEST','CLASSIFY_URL','CLASSIFY_ORIGIN','CLASSIFY_REDIRECT','CONSTRUCT_HEADERS'].includes(row.interceptionOperation) ||
        !['UNKNOWN','DIRECT','REDIRECT'].includes(row.responseClass) || !['ALLOWED','PINNED_REQUEST_BLOCKED'].includes(row.disposition) ||
        !['CONTINUED','BLOCKED'].includes(row.result) ||
        (row.failureCategory != null && !['REQUEST_NOT_ACTIVE','CDP_SESSION_CLOSED','HEADER_REJECTED','CDP_OPERATION_REJECTED'].includes(row.failureCategory)) ||
        (row.httpStatus != null && (!Number.isInteger(row.httpStatus) || row.httpStatus < 100 || row.httpStatus > 599)))
      return { ok:false, code:'XHR_PROTOCOL_INVALID' };
    if (row.destinationClass !== 'PINNED_ORIGIN') return { ok:false, code:'XHR_EXTERNAL' };
    if (row.result === 'BLOCKED') return { ok:false, code:'XHR_INTERCEPTION_BLOCKED', ordinal:row.ordinal,
      failureCategory:row.failureCategory ?? null };
    const stages = ordinals.get(row.ordinal) ?? new Set();
    if (stages.has(row.stage)) return { ok:false, code:'XHR_PROTOCOL_INVALID' };
    stages.add(row.stage); ordinals.set(row.ordinal, stages);
  }
  if (!ordinals.size) return { ok:false, code:'XHR_NOT_OBSERVED' };
  if ([...ordinals.values()].some(stages => !stages.has('REQUEST') || !stages.has('RESPONSE')))
    return { ok:false, code:'XHR_INCOMPLETE' };
  return { ok:true, count:ordinals.size };
}

export function safeTrace(row) {
  const safe = {};
  if (Number.isSafeInteger(row?.ordinal) && row.ordinal >= 1 && row.ordinal <= 128) safe.ordinal=row.ordinal;
  if (typeof row?.resourceClass === 'string' && /^(?:next-static|next-image|access|panel|api|project|root|other|unknown)-(?:xhr|fetch)$/.test(row.resourceClass))
    safe.resourceClass=row.resourceClass;
  for (const [key,allowed] of Object.entries(TRACE_ENUMS)) if (allowed.includes(row?.[key])) safe[key]=row[key];
  if (Number.isInteger(row?.httpStatus) && row.httpStatus >= 100 && row.httpStatus <= 599) safe.httpStatus=row.httpStatus;
  return safe;
}

export async function cleanupAuthProbe({runId,adminKey,adminFactory=createPreviewAdminClient}) {
  if (!UUID.test(runId) || typeof adminKey!=='string' || !adminKey || PIN.supabaseRef!=='rhnnplewqsekrnaousyl')
    return false;
  const email=`h1a-login-${runId.replaceAll('-','')}@example.test`;
  const admin=adminFactory(`https://${PIN.supabaseRef}.supabase.co`,adminKey);
  try {
    const listed=await admin.auth.admin.listUsers({page:1,perPage:1000});
    if (listed.error) return false;
    const matchingEmail=listed.data.users.filter(user=>user.email===email);
    if (matchingEmail.length>1 || matchingEmail.some(user=>user.user_metadata?.testRunId!==runId)) return false;
    const own=matchingEmail;
    for (const user of own) {
      const deleted=await admin.auth.admin.deleteUser(user.id);
      if (deleted.error) return false;
    }
    const check=await admin.auth.admin.listUsers({page:1,perPage:1000});
    return !check.error && !check.data.users.some(user=>user.email===email);
  } catch { return false; }
}

export async function runAuthLoginProbe({ runId, adminKey, token = process.env.VERCEL_OIDC_TOKEN,
  ledgerPath = join(process.cwd(), 'test-results', 'h1a-auth-login-probe', `${runId}.jsonl`),
  preflightImpl = preflight, adminFactory = createPreviewAdminClient, cleanupImpl = cleanupAuthProbe }) {
  if (!UUID.test(runId) || PIN.supabaseRef !== 'rhnnplewqsekrnaousyl' || !/^dpl_[A-Za-z0-9]+$/.test(PIN.deploymentId) ||
      !/^[0-9a-f]{40}$/.test(PIN.sha) || PIN.branch !== 'codex/h1a-integral-20261022' ||
      typeof adminKey !== 'string' || !adminKey) return { status:'BLOCKED', code:'PRECHECK_FAILED' };
  const origin = `https://${PIN.host}`;
  const email = `h1a-login-${runId.replaceAll('-','')}@example.test`;
  const password = randomBytes(32).toString('base64url');
  let admin, browser, ledgerFailed = false, firstFailure = null, cleanupOk = false;
  let currentStage='preflight', lastHttpStatus=null;
  const record = async (stage,status,detail = {}) => {
    if (!STAGES.has(stage) || !['ATTEMPTED','PASS','BLOCKED'].includes(status)) throw new Error('LEDGER_FIELD_REJECTED');
    const row = { utc:new Date().toISOString(), runId, sha:PIN.sha, deploymentId:PIN.deploymentId,
      ref:PIN.supabaseRef, stage, status };
    if (CODES.has(detail.code)) row.code=detail.code;
    if (detail.category && ['OIDC','DEPLOYMENT','PROTECTION','IDENTITY','UNKNOWN'].includes(detail.category)) row.category=detail.category;
    if (Number.isSafeInteger(detail.httpStatus) && detail.httpStatus >= 100 && detail.httpStatus <= 599) row.httpStatus=detail.httpStatus;
    if (Number.isSafeInteger(detail.xhrCount) && detail.xhrCount >= 0 && detail.xhrCount <= 128) row.xhrCount=detail.xhrCount;
    if (detail.trace) row.trace=safeTrace(detail.trace);
    try { await mkdir(dirname(ledgerPath),{recursive:true}); await appendFile(ledgerPath,`${JSON.stringify(row)}\n`); }
    catch { ledgerFailed=true; }
  };
  const fail = (code) => { if (!firstFailure) firstFailure=CODES.has(code)?code:'PROBE_FAILED'; };
  try {
    await record('preflight','ATTEMPTED');
    await preflightImpl({token});
    admin=adminFactory(`https://${PIN.supabaseRef}.supabase.co`, adminKey);
    if (ledgerFailed) throw new Error('LEDGER_FAILED');
    await record('preflight','PASS');
    currentStage='auth-create';
    await record('auth-create','ATTEMPTED');
    let created;
    try { created=await admin.auth.admin.createUser({email,password,email_confirm:true,
      user_metadata:{testRunId:runId}}); }
    catch { fail('AUTH_CREATE_FAILED'); throw new Error('AUTH_CREATE_FAILED'); }
    if (created.error || !created.data.user?.id) { fail('AUTH_CREATE_FAILED'); throw new Error('AUTH_CREATE_FAILED'); }
    await record('auth-create','PASS');
    browser=await chromium.launch({headless:true,env:chromiumEnvironment()});
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    const diagnostics=createPageDiagnostics(page,{allowedOrigin:origin});
    const trace=[], securityEvents=[], routeEvents=[];
    await installScopedRoutes(context,page,token,origin,
      event=>securityEvents.push(event), event=>routeEvents.push(event),runId,
      detail=>{ if (detail.disposition==='PINNED_REQUEST_BLOCKED') securityEvents.push('pinned-origin-request-failed'); },
      detail=>{ if (trace.length<129) trace.push(safeTrace(detail)); },true);
    currentStage='login-post';
    await record('login-post','ATTEMPTED');
    const access=await page.goto(`${origin}/acceso`,{waitUntil:'domcontentloaded',timeout:30000});
    if (access?.status()!==200) { fail('LOGIN_POST_FAILED'); throw new Error('LOGIN_POST_FAILED'); }
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    const post=page.waitForResponse(response=>{
      try { return response.request().method()==='POST' && new URL(response.url()).origin===origin &&
        new URL(response.url()).pathname==='/api/auth/login'; } catch { return false; }
    },{timeout:20000});
    await page.getByRole('button',{name:'Entrar'}).click();
    const response=await post;
    lastHttpStatus=response.status();
    if (lastHttpStatus!==303) { fail('LOGIN_POST_FAILED'); throw new Error('LOGIN_POST_FAILED'); }
    await record('login-post','PASS',{httpStatus:303});
    currentStage='session';
    await record('session','ATTEMPTED');
    await page.waitForURL(url=>url.origin===origin && url.pathname==='/panel',{timeout:20000});
    await page.waitForLoadState('networkidle',{timeout:20000});
    const cookies=await context.cookies(origin);
    const sessionCookie=cookies.some(cookie=>cookie.name.startsWith(`sb-${PIN.supabaseRef}-auth-token`));
    const panel=await page.getByText('Sin proyectos',{exact:true}).count();
    if (!sessionCookie || !panel) { fail('SESSION_NOT_CONFIRMED'); throw new Error('SESSION_NOT_CONFIRMED'); }
    await record('session','PASS');
    currentStage='xhr-interception';
    await record('xhr-interception','ATTEMPTED');
    const verdict=evaluateAuthenticatedTrace(trace,securityEvents);
    for (const row of trace) await record('xhr-interception',row.result==='BLOCKED'?'BLOCKED':'PASS',{trace:row});
    if (!verdict.ok || diagnostics.snapshot().routeEvents['diagnostic-cardinality-exceeded']) {
      fail(verdict.code ?? 'XHR_PROTOCOL_INVALID');
      throw new Error('XHR_BLOCKED');
    }
    await record('xhr-interception','PASS',{xhrCount:verdict.count});
    diagnostics.dispose();
    await context.close();
  } catch (error) {
    fail(currentStage==='preflight'?classifyPreflightFailure(error):'PROBE_FAILED');
    if (!ledgerFailed) await record(currentStage,'BLOCKED',{code:firstFailure,
      ...(currentStage==='preflight'?{category:preflightCategory(firstFailure)}:{}),httpStatus:lastHttpStatus});
  } finally {
    await browser?.close().catch(()=>undefined);
    await record('auth-cleanup','ATTEMPTED');
    try {
      // An ambiguous create is reconciled by the exact run-scoped email and metadata.
      cleanupOk=await cleanupImpl({runId,adminKey});
      if (!cleanupOk) throw new Error('AUTH_CLEANUP_UNVERIFIED');
      await record('auth-cleanup','PASS');
    } catch { fail('AUTH_CLEANUP_FAILED'); await record('auth-cleanup','BLOCKED',{code:'AUTH_CLEANUP_FAILED'}); }
    if (ledgerFailed) fail('LEDGER_FAILED');
  }
  const status=!firstFailure && cleanupOk && !ledgerFailed?'PASS':'BLOCKED';
  await record('result',status,{...(status==='BLOCKED'?{code:firstFailure ?? 'LEDGER_FAILED',
    ...(currentStage==='preflight'?{category:preflightCategory(firstFailure)}:{})}:{})});
  const finalStatus=ledgerFailed?'BLOCKED':status;
  return { status:finalStatus, code:finalStatus==='BLOCKED'?firstFailure ?? 'LEDGER_FAILED':null,
    category:finalStatus==='BLOCKED' && currentStage==='preflight'?preflightCategory(firstFailure):null,
    cleanup:cleanupOk?'PASS':'BLOCKED',
    deploymentId:PIN.deploymentId,sha:PIN.sha,ref:PIN.supabaseRef,runId };
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  let input;
  try { input=JSON.parse(readFileSync(0,'utf8')); }
  catch { input=null; }
  const cleanupOnly=process.argv.includes('--cleanup-only');
  const cleaned=cleanupOnly?await cleanupAuthProbe({runId:String(input?.runId??''),adminKey:input?.adminKey}):false;
  const result=cleanupOnly
    ? {status:cleaned?'PASS':'BLOCKED',code:'AUTH_CLEANUP_ONLY',cleanup:cleaned?'PASS':'BLOCKED',
      runId:String(input?.runId??''),ref:PIN.supabaseRef,deploymentId:PIN.deploymentId,sha:PIN.sha}
    : await runAuthLoginProbe({runId:String(input?.runId??''),adminKey:input?.adminKey});
  process.stdout.write(`H1A_AUTH_LOGIN_PROBE ${JSON.stringify(result)}\n`);
  if (result.status!=='PASS') process.exitCode=1;
}
