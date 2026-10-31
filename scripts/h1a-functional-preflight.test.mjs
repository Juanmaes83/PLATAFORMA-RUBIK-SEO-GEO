import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CASES,evaluateFunctionalPreflight,ratifiedContractInMain,isAuxiliaryPrefetch} from './h1a-functional-preflight.mjs';
const headSha='1'.repeat(40),expectedDigest='2'.repeat(64);
function valid() {return {headSha,expectedDigest,contractInMain:true,evidence:{headSha,scenarioDigest:expectedDigest,testsPassed:true,cases:CASES.map(caseId=>({caseId,status:'PASS'}))},plan:{
  supabaseRef:'rhnnplewqsekrnaousyl',schema:'pre-n2-through-20261015210000',deployment:{id:'dpl_Fictional',host:'plataforma-rubik-seo-fictional.vercel.app',sha:headSha,protected:true},
  writer:{principal:'rubik_preview_u03_writer',attested:true,ttlSeconds:900,sha:headSha,runId:'11111111-1111-4111-8111-111111111111'},signing:{attested:true,activeKeyId:'fixture-key'},flags:{googleReads:false,googleCatalog:false,paidProviders:false},inventory:{independentRead:true,ownCount:0,outboxPending:0,foreignPreservationPlan:true,recordedAt:new Date().toISOString()},
  containment:{nologin:true,terminateOwnedSessions:true,cleanupByIds:true,backupScope:true},authorization:{run:false,deploy:false}}};}
test('complete offline proof permits asking for authorization, never executes',()=>{
  assert.equal(evaluateFunctionalPreflight(valid()).hostedPreflight,'READY_FOR_OWNER_AUTHORIZATION');
  assert.equal(evaluateFunctionalPreflight(valid()).hostedExecution,'NOT_RUN');
});
for(const [name,mutate] of [
  ['missing contract in main',v=>{v.contractInMain=false;}],['stale SHA',v=>{v.evidence.headSha='3'.repeat(40);}],
  ['stale scenario',v=>{v.evidence.scenarioDigest='4'.repeat(64);}],['incomplete recovery',v=>{v.evidence.cases=v.evidence.cases.filter(r=>r.caseId!=='restore-destination');}],
  ['failed necessary request',v=>{v.evidence.cases[0].status='BLOCKED';}],['foreign or Production database',v=>{v.plan.supabaseRef='yvdgmklgwlshizzgefpv';}],
  ['wrong deployment SHA',v=>{v.plan.deployment.sha='5'.repeat(40);}],['provider enabled',v=>{v.plan.flags.paidProviders=true;}],
  ['ambiguous cleanup',v=>{v.plan.inventory.foreignPreservationPlan=false;}],['excessive writer TTL',v=>{v.plan.writer.ttlSeconds=901;}],
  ['secret-bearing unknown field',v=>{v.plan.password='fictional';}],['implicit run authorization',v=>{v.plan.authorization.run=true;}],
  ['stale inventory',v=>{v.plan.inventory.recordedAt='2020-01-01T00:00:00Z';}],['writer SHA mismatch',v=>{v.plan.writer.sha='9'.repeat(40);}],['missing signing keyring',v=>{v.plan.signing.attested=false;}],
])test(name+' is blocked',()=>{const v=valid();mutate(v);assert.equal(evaluateFunctionalPreflight(v).hostedPreflight,'BLOCKED');});
test('ratified blob is accepted after squash merge and rejected if changed or missing',()=>{
  assert.equal(ratifiedContractInMain(()=> 'same-blob'),true);
  assert.equal(ratifiedContractInMain(ref=>ref.startsWith('origin/main:')?'changed':'ratified'),false);
  assert.equal(ratifiedContractInMain(()=>{throw new Error('missing');}),false);
});
for(const value of ['1','2','3'])test('explicit Next prefetch '+value+' is auxiliary',()=>assert.equal(isAuxiliaryPrefetch({'next-router-prefetch':value}),true));
test('unknown or missing prefetch hints remain necessary',()=>{
  for(const headers of [{},{rsc:'1'},{'next-router-prefetch':'4'}])assert.equal(isAuxiliaryPrefetch(headers),false);
});
