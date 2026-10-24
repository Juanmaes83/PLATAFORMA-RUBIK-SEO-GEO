import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupAuthProbe, evaluateAuthenticatedTrace, safeTrace } from './h1a-auth-login-probe.mjs';

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
