import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CASES,evaluateFunctionalPreflight} from './h1a-functional-preflight.mjs';
const headSha='1'.repeat(40),expectedDigest='2'.repeat(64);
function valid() {return {headSha,expectedDigest,contractInMain:true,evidence:{headSha,scenarioDigest:expectedDigest,testsPassed:true,cases:CASES.map(caseId=>({caseId,status:'PASS'}))},plan:{
  supabaseRef:'rhnnplewqsekrnaousyl',schema:'pre-n2-through-20261015210000',deployment:{id:'dpl_Fictional',host:'plataforma-rubik-seo-fictional.vercel.app',sha:headSha,protected:true},
  writer:{principal:'rubik_preview_u03_writer',attested:true,ttlSeconds:900},flags:{googleReads:false,googleCatalog:false,paidProviders:false},inventory:{independentRead:true,ownCount:0,outboxPending:0,foreignPreservationPlan:true},
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
])test(name+' is blocked',()=>{const v=valid();mutate(v);assert.equal(evaluateFunctionalPreflight(v).hostedPreflight,'BLOCKED');});
