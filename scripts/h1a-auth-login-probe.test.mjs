import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cleanupAuthProbe, evaluateAuthenticatedTrace, safeTrace, classifyPreflightFailure } from './h1a-auth-login-probe.mjs';
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

test('PowerShell 5.1 nested owner keeps a collection for the single campaign mode', { skip: process.platform !== 'win32' }, () => {
  const owner=fileURLToPath(new URL('./u03-preview-b4-owner.ps1',import.meta.url));
  const command=`Set-StrictMode -Version Latest; & '${owner.replaceAll("'","''")}' -WindowTransportSelfTestOnly`;
  const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',
    Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',timeout:30000});
  const output=`${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  assert.match(output,/WRONG_MODE_BRANCH/);
  assert.doesNotMatch(output,/PropertyNotFoundStrict|No se encuentra la propiedad 'Count'/);
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
