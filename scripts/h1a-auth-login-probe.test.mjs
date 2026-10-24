import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cleanupAuthProbe, evaluateAuthenticatedTrace, safeTrace, classifyPreflightFailure,
  preflightCategory, runAuthLoginProbe } from './h1a-auth-login-probe.mjs';
import { GateError } from './u03-preview-b4-runner.mjs';

test('preflight preserves only closed gate codes',()=>{
  for (const code of ['OIDC_TOKEN_MISSING','VERCEL_DEPLOYMENT_INSPECTION_FAILED',
    'VERCEL_DEPLOYMENT_METADATA_INVALID','DEPLOYMENT_PIN_MISMATCH','PROTECTION_PREFLIGHT_FAILED',
    'DEPLOYMENT_PROTECTION_NOT_CONFIRMED','OIDC_AUTHENTICATION_FAILED','PREVIEW_IDENTITY_INVALID']) {
    assert.equal(classifyPreflightFailure(new GateError(code)),code);
  }
  assert.equal(classifyPreflightFailure(new GateError('secret-free-text')),'PRECHECK_FAILED');
  assert.equal(classifyPreflightFailure(new Error('https://example.invalid/?token=secret')),'PRECHECK_FAILED');
});

test('real probe ledger preserves each closed preflight barrier and blocks before Auth creation',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'h1a-probe-preflight-'));
  const cases=[['OIDC_TOKEN_MISSING','OIDC'],['OIDC_AUTHENTICATION_FAILED','OIDC'],
    ['VERCEL_DEPLOYMENT_INSPECTION_FAILED','DEPLOYMENT'],['VERCEL_DEPLOYMENT_METADATA_INVALID','DEPLOYMENT'],
    ['DEPLOYMENT_PIN_MISMATCH','DEPLOYMENT'],['PROTECTION_PREFLIGHT_FAILED','PROTECTION'],
    ['DEPLOYMENT_PROTECTION_NOT_CONFIRMED','PROTECTION'],['PREVIEW_IDENTITY_INVALID','IDENTITY'],
    ['FREE_TEXT_NOT_ALLOWED','UNKNOWN']];
  try {
    for(let i=0;i<cases.length;i++) {
      const [injected,expectedCategory]=cases[i];
      const runId=`11111111-1111-4111-8111-${String(i+1).padStart(12,'0')}`;
      const ledgerPath=join(dir,`${i}.jsonl`);
      let created=false, cleaned=false;
      const result=await runAuthLoginProbe({runId,adminKey:'fictional-only-secret',ledgerPath,
        adminFactory:()=>({auth:{admin:{createUser:async()=>{created=true;throw Error('must not run');}}}}),
        preflightImpl:async()=>{throw new GateError(injected);},
        cleanupImpl:async()=>{cleaned=true;return true;}});
      const expectedCode=injected==='FREE_TEXT_NOT_ALLOWED'?'PRECHECK_FAILED':injected;
      const rows=readFileSync(ledgerPath,'utf8').trim().split('\n').map(JSON.parse);
      assert.deepEqual(rows.map(row=>[row.stage,row.status]),[
        ['preflight','ATTEMPTED'],['preflight','BLOCKED'],['auth-cleanup','ATTEMPTED'],
        ['auth-cleanup','PASS'],['result','BLOCKED']]);
      assert.equal(rows[1].code,expectedCode);
      assert.equal(rows[1].category,expectedCategory);
      assert.equal(rows.at(-1).category,expectedCategory);
      assert.equal(result.code,expectedCode);
      assert.equal(result.category,expectedCategory);
      assert.equal(result.status,'BLOCKED');
      assert.equal(created,false);
      assert.equal(cleaned,true);
      assert.doesNotMatch(readFileSync(ledgerPath,'utf8'),/fictional-only-secret|FREE_TEXT_NOT_ALLOWED|https:\/\//);
      assert.equal(preflightCategory(expectedCode),expectedCategory);
    }
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('PowerShell 5.1 nested owner keeps a collection for the single campaign mode', { skip: process.platform !== 'win32' }, () => {
  const owner=fileURLToPath(new URL('./u03-preview-b4-owner.ps1',import.meta.url));
  const command=`Set-StrictMode -Version Latest; & '${owner.replaceAll("'","''")}' -WindowTransportSelfTestOnly`;
  const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',
    Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',timeout:30000});
  const output=`${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  assert.match(output,/WRONG_MODE_BRANCH/);
  assert.doesNotMatch(output,/PropertyNotFoundStrict|No se encuentra la propiedad 'Count'/);
});

test('PowerShell 5.1 transports fictional UTF-8 to the real child without requiring an optional category',
  { skip: process.platform !== 'win32' },()=>{
  const owner=fileURLToPath(new URL('./h1a-auth-login-probe-owner.ps1',import.meta.url));
  const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',owner,
    '-RunId','11111111-1111-4111-8111-111111111111','-DeploymentId','dpl_FictionalOnly',
    '-DeploymentHost','fictional-only.vercel.app','-DeploymentSha','1111111111111111111111111111111111111111',
    '-TransportSelfTestOnly'],{encoding:'utf8',timeout:30000});
  assert.equal(result.status,0);
  assert.match(result.stdout,/H1A_AUTH_LOGIN_PROBE_TRANSPORT PASS/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`,/fictional-only-.*[:/?&%]|PropertyNotFoundStrict|CHILD_TRANSPORT_FAILED/);
});

test('PowerShell 5.1 preserves fictional OIDC only across nested attestation and into the real child',
  { skip: process.platform !== 'win32' },()=>{
  const owner=fileURLToPath(new URL('./h1a-auth-login-probe-owner.ps1',import.meta.url));
  const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',owner,
    '-RunId','11111111-1111-4111-8111-111111111111','-DeploymentId','dpl_FictionalOnly',
    '-DeploymentHost','fictional-only.vercel.app','-DeploymentSha','1111111111111111111111111111111111111111',
    '-OidcTransportSelfTestOnly'];
  const token='fictional-oidc-only';
  for(const [label,env,extra,expectedExit,expected] of [
    ['present',{...process.env,VERCEL_OIDC_TOKEN:token},[],0,/H1A_AUTH_LOGIN_OIDC_TRANSPORT PASS/],
    ['absent',{...process.env,VERCEL_OIDC_TOKEN:''},[],1,/OIDC_TOKEN_MISSING/],
    ['attestation failure',{...process.env,VERCEL_OIDC_TOKEN:token},['-SimulateAttestationFailure'],1,/ATTESTATION_FAILED/],
  ]) {
    const result=spawnSync('powershell.exe',[...args,...extra],{encoding:'utf8',timeout:30000,env});
    const output=`${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    assert.equal(result.status,expectedExit,label);
    assert.match(output,expected,label);
    assert.doesNotMatch(output,/fictional-oidc-only|fictional-only-.*[:/?&%]|PropertyNotFoundStrict/,label);
    if(label!=='present') assert.doesNotMatch(output,/OIDC_TRANSPORT PASS/);
  }
});

const request={ordinal:1,stage:'REQUEST',resourceClass:'panel-xhr',destinationClass:'PINNED_ORIGIN',
  interceptionOperation:'CONTINUE_REQUEST',responseClass:'UNKNOWN',disposition:'ALLOWED',result:'CONTINUED'};
const response={...request,stage:'RESPONSE',interceptionOperation:'CONTINUE_RESPONSE',responseClass:'DIRECT',httpStatus:200};

test('authenticated XHR needs a correlated request and response at the pinned origin',()=>{
  assert.deepEqual(evaluateAuthenticatedTrace([request,response]),{ok:true,count:1});
  assert.equal(evaluateAuthenticatedTrace([]).code,'XHR_NOT_OBSERVED');
  assert.equal(evaluateAuthenticatedTrace([request]).code,'XHR_INCOMPLETE');
  assert.equal(evaluateAuthenticatedTrace([request,response,response]).code,'XHR_PROTOCOL_INVALID');
});

test('terminal outcomes are explicit and never turn a missing response into PASS',()=>{
  for(const [operation,failureCategory] of [
    ['NETWORK_LOADING_FAILED','NETWORK_CANCELLED'],
    ['NETWORK_LOADING_FAILED','NETWORK_FAILED'],
    ['NETWORK_FINISHED','RESPONSE_NOT_OBSERVED'],
  ]) {
    const terminal={...request,stage:'TERMINAL',interceptionOperation:operation,
      result:'BLOCKED',disposition:'PINNED_REQUEST_BLOCKED',failureCategory};
    assert.deepEqual(evaluateAuthenticatedTrace([request,terminal]),
      {ok:false,code:'XHR_TERMINAL_UNVERIFIED',ordinal:1,failureCategory});
    assert.equal(safeTrace(terminal).failureCategory,failureCategory);
  }
  assert.equal(evaluateAuthenticatedTrace([request]).code,'XHR_INCOMPLETE');
  assert.equal(evaluateAuthenticatedTrace([request,response,{...request,stage:'TERMINAL',
    interceptionOperation:'NETWORK_LOADING_FAILED',result:'BLOCKED',
    disposition:'PINNED_REQUEST_BLOCKED',failureCategory:'NETWORK_FAILED'}]).code,'XHR_TERMINAL_UNVERIFIED');
  assert.doesNotMatch(JSON.stringify(safeTrace({...request,stage:'TERMINAL',
    failureCategory:'network failed https://secret.invalid/?token=secret'})),/secret|https:/);
});

test('blocked interception and external destinations cannot pass',()=>{
  assert.deepEqual(evaluateAuthenticatedTrace([{...request,result:'BLOCKED',failureCategory:'REQUEST_NOT_ACTIVE'}]),
    {ok:false,code:'XHR_INTERCEPTION_BLOCKED',ordinal:1,failureCategory:'REQUEST_NOT_ACTIVE'});
  assert.equal(evaluateAuthenticatedTrace([{...request,destinationClass:'EXTERNAL'},response]).code,'XHR_EXTERNAL');
  assert.equal(evaluateAuthenticatedTrace([request,response],['external-navigation-blocked']).code,'XHR_PROTOCOL_INVALID');
});

test('trace serializer drops free text and unapproved values',()=>{
  const serialized=JSON.stringify(safeTrace({...request,resourceClass:'https://outside.invalid/?token=secret',
    failureCategory:'secret PostgreSQL message',url:'https://outside.invalid/private',cookie:'secret'}));
  assert.doesNotMatch(serialized,/outside|token|cookie|secret|PostgreSQL/);
  assert.equal(evaluateAuthenticatedTrace([{...request,resourceClass:'https://outside.invalid'},response]).code,'XHR_PROTOCOL_INVALID');
});

test('cleanup deletes only the exact run-owned Auth user and verifies absence',async()=>{
  const runId='11111111-1111-4111-8111-111111111111';
  const email=`h1a-login-${runId.replaceAll('-','')}@example.test`;
  const users=[{id:'own',email,user_metadata:{testRunId:runId}},
    {id:'other',email:'other@example.test',user_metadata:{testRunId:'another-run'}}];
  const removed=[];
  const adminFactory=()=>({auth:{admin:{
    listUsers:async()=>({data:{users:[...users]},error:null}),
    deleteUser:async id=>{removed.push(id);users.splice(users.findIndex(user=>user.id===id),1);return {error:null};},
  }}});
  assert.equal(await cleanupAuthProbe({runId,adminKey:'fictional-only',adminFactory}),true);
  assert.deepEqual(removed,['own']);
  assert.equal(users.length,1);
});

test('cleanup blocks when exact email lacks the run ownership marker',async()=>{
  const runId='11111111-1111-4111-8111-111111111111';
  let deleted=false;
  const adminFactory=()=>({auth:{admin:{
    listUsers:async()=>({data:{users:[{id:'unknown',email:`h1a-login-${runId.replaceAll('-','')}@example.test`,user_metadata:{}}]},error:null}),
    deleteUser:async()=>{deleted=true;return {error:null};},
  }}});
  assert.equal(await cleanupAuthProbe({runId,adminKey:'fictional-only',adminFactory}),false);
  assert.equal(deleted,false);
});
