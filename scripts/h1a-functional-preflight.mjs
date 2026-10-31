// Offline plan validator. No deployment or hosted execution entry point exists here.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const CONTRACT_SHA='3a35528f4cd08432f61fc302664e8074177f269d';
export const CASES=Object.freeze(['preflight','functional-identity','functional-desktop','functional-mobile','functional-tenancy',
  'functional-egress-cost','http-export','offline-verification','tamper-rejection','restore-destination',
  'browser-views-and-logout','foreign-preserved','source-cleanup','destination-cleanup','functional-restore-transport']);
export function scenarioDigest() {
  const hash=createHash('sha256');
  for(const file of ['tests/integration/u03-window-functional.integration.test.ts','scripts/h1a-functional-local.mjs','scripts/h1a-local-egress-guard.mjs'])hash.update(file).update(readFileSync(file));
  return hash.digest('hex');
}
export function ratifiedContractInMain(readBlob) {
  const path='docs/MVP-FUNCTIONAL-ACCEPTANCE-PROPUESTA-20261031.md';
  try {return readBlob(`${CONTRACT_SHA}:${path}`)===readBlob(`origin/main:${path}`);}catch{return false;}
}
export function evaluateFunctionalPreflight({plan,evidence,headSha,contractInMain,expectedDigest,now=Date.now()}) {
  const blockers=[];
  if(!/^[a-f0-9]{40}$/.test(headSha??''))blockers.push('HEAD_REQUIRED');
  if(!evidence||evidence.headSha!==headSha||evidence.scenarioDigest!==expectedDigest||evidence.testsPassed!==true)blockers.push('LOCAL_EVIDENCE_STALE_OR_MISSING');
  if(!Array.isArray(evidence?.cases)||CASES.some(caseId=>!evidence.cases.some(row=>row.caseId===caseId&&row.status==='PASS'))||evidence?.cases?.some(row=>!CASES.includes(row.caseId)||row.status!=='PASS'))blockers.push('LOCAL_CASES_INCOMPLETE');
  const localPreflight=blockers.length?'BLOCKED':'PASS';
  if(!contractInMain)blockers.push('RATIFIED_CONTRACT_NOT_IN_MAIN');
  if(!plan||Object.keys(plan).some(key=>!['supabaseRef','schema','deployment','writer','signing','flags','inventory','containment','authorization'].includes(key)))blockers.push('PLAN_SCHEMA_REJECTED');
  if(plan?.supabaseRef!=='rhnnplewqsekrnaousyl'||plan?.schema!=='pre-n2-through-20261015210000')blockers.push('DESTINATION_OR_SCHEMA_REJECTED');
  const d=plan?.deployment;
  if(!d||d.sha!==headSha||!/^dpl_[A-Za-z0-9]+$/.test(d.id??'')||!/^plataforma-rubik-seo-[a-z0-9-]+\.vercel\.app$/.test(d.host??'')||d.protected!==true)blockers.push('PROTECTED_EXACT_DEPLOYMENT_NOT_ATTESTED');
  const w=plan?.writer;
  if(!w||w.principal!=='rubik_preview_u03_writer'||w.attested!==true||w.sha!==headSha||!/^[-a-f0-9]{36}$/.test(w.runId??'')||!Number.isInteger(w.ttlSeconds)||w.ttlSeconds<60||w.ttlSeconds>900)blockers.push('WRITER_CAPABILITY_NOT_ATTESTED');
  if(plan?.signing?.attested!==true||!/^[-A-Za-z0-9_]{1,64}$/.test(plan?.signing?.activeKeyId??''))blockers.push('SIGNING_KEYRING_NOT_ATTESTED');
  if(plan?.flags?.googleReads!==false||plan?.flags?.googleCatalog!==false||plan?.flags?.paidProviders!==false)blockers.push('PROVIDERS_NOT_FAIL_CLOSED');
  const age=now-Date.parse(plan?.inventory?.recordedAt??'');
  if(plan?.inventory?.independentRead!==true||plan?.inventory?.ownCount!==0||plan?.inventory?.outboxPending!==0||plan?.inventory?.foreignPreservationPlan!==true||!Number.isFinite(age)||age<0||age>300000)blockers.push('INDEPENDENT_INITIAL_INVENTORY_REQUIRED');
  if(!['nologin','terminateOwnedSessions','cleanupByIds','backupScope'].every(key=>plan?.containment?.[key]===true))blockers.push('CONTAINMENT_INCOMPLETE');
  if(plan?.authorization?.run!==false||plan?.authorization?.deploy!==false)blockers.push('EXECUTION_OUTSIDE_PREPARATION_SCOPE');
  return {protocol:'MVP_FUNCTIONAL_ACCEPTANCE',headSha,contractSha:CONTRACT_SHA,localPreflight,
    hostedPreflight:blockers.length?'BLOCKED':'READY_FOR_OWNER_AUTHORIZATION',hostedExecution:'NOT_RUN',blockers:[...new Set(blockers)]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(!process.argv[2])throw new Error('LOCAL_EVIDENCE_FILE_REQUIRED');
  const headSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const contractInMain=ratifiedContractInMain(ref=>execFileSync('git',['rev-parse',ref],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim());
  const plan=JSON.parse(readFileSync('docs/H1A-FUNCTIONAL-PREFLIGHT-PLAN-20261031.json','utf8'));
  const evidence=JSON.parse(readFileSync(process.argv[2],'utf8'));
  process.stdout.write(JSON.stringify(evaluateFunctionalPreflight({plan,evidence,headSha,contractInMain,expectedDigest:scenarioDigest()}),null,2)+'\n');
}
