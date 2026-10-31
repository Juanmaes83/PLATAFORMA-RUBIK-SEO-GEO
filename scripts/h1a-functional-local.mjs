// Reproducible local-only loopback export/restore drill. Both disposable stacks are owned
// and retired by this runner; the destination stack excludes Supavisor by design.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { CASES, scenarioDigest, hasUncommittedSource } from './h1a-functional-preflight.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const runId=randomUUID();
const startedAt=Date.now();
const sourceProject=`rubik-h1a-src-${runId.replaceAll('-','').slice(0,12).toLowerCase()}`;
const sourceWorkdir=resolve(ROOT,`test-results/${sourceProject}-source-stack`);
const destinationProject=`rubik-h1a-${runId.replaceAll('-','').slice(0,12).toLowerCase()}`;
const destinationWorkdir=resolve(ROOT,`test-results/${destinationProject}-restore-destination`);
const sourceMarker=resolve(sourceWorkdir,'.h1a-owned-source.json');
const destinationMarker=resolve(destinationWorkdir,'.u03-owned-destination.json');
const run=(file,args,options={})=>spawnSync(file,args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],...options});
function safeRun(file,args,options={}) {
  const result=run(file,args,options);
  if(result.status!==0) {
    if (args.some(value => String(value).includes('u03-window-functional.integration.test.ts'))) {
      const report=[result.stdout,result.stderr].filter(Boolean).join('\n');
      if (/^(?:\s*(?:RUN|✓|✔|❯|FAIL|Test Files|Tests|Duration|Error|AssertionError|⎯|Expected|Received| ❯).*)/m.test(report))
        process.stderr.write(report.slice(-12000));
    }
    throw new Error('LOCAL_HTTP_RESTORE_RUNNER_FAILED');
  }
  return result.stdout;
}
function ownedContainers(project) {
  return safeRun('docker',['ps','-a','--filter',`label=com.supabase.cli.project=${project}`,'--format','{{.Names}}']).split(/\r?\n/).filter(Boolean);
}
if(ownedContainers(sourceProject).length||ownedContainers(destinationProject).length||existsSync(sourceMarker)||existsSync(destinationMarker))
  throw new Error('LOCAL_HTTP_RESTORE_REFUSES_PREEXISTING_STACK');
const node=process.execPath;
const call=(script,action,extraEnv={})=>safeRun(node,[resolve(ROOT,'scripts',script),action],{env:{...process.env,...extraEnv}});
function h1aTestEnv() {
  const env={...process.env};
  for(const name of Object.keys(env)) if(/^RUBIK_TEST_.*_STACK$/.test(name)) delete env[name];
  return {...env,RUBIK_TEST_H1A_RESTORE_STACK:'1',U03_RESTORE_DESTINATION_RUN_ID:runId,
    SUPABASE_CLI:`npx --yes supabase@2.118.0 --workdir ${sourceWorkdir}`};
}
let pendingEvidence;
let caughtError;
if(hasUncommittedSource(safeRun('git',['status','--porcelain','--untracked-files=all'])))throw new Error('FUNCTIONAL_SOURCE_NOT_COMMITTED');
const headSha=safeRun('git',['rev-parse','HEAD']).trim(),digest=scenarioDigest();
try {
  process.stdout.write(safeRun(node,['--test','scripts/h1a-functional-preflight.test.mjs','scripts/h1a-local-egress-guard.test.mjs']));
  const localEnv={U03_RESTORE_DESTINATION_RUN_ID:runId};
  call('h1a-local-source-stack.mjs','start',localEnv);
  call('h1a-local-source-stack.mjs','inspect',localEnv);
  const destinationEnv={U03_RESTORE_DESTINATION_RUN_ID:runId};
  call('u03-window-local-destination.mjs','start',destinationEnv);
  call('u03-window-local-destination.mjs','inspect',destinationEnv);
  const vitest=process.platform==='win32'
    ? safeRun('cmd.exe',['/d','/s','/c','node_modules\\.bin\\vitest.cmd run --config vitest.integration.config.mts tests/integration/u03-window-functional.integration.test.ts'],{
      env:h1aTestEnv()})
    : safeRun(node,[resolve(ROOT,'node_modules/vitest/vitest.mjs'),'run','--config','vitest.integration.config.mts','tests/integration/u03-window-functional.integration.test.ts'],{
      env:h1aTestEnv()});
  process.stdout.write(vitest);
  const ledgers=readdirSync(resolve(ROOT,'test-results')).filter(name=>/^mvp-functional-[0-9a-f-]+\.jsonl$/.test(name)&&statSync(resolve(ROOT,'test-results',name)).mtimeMs>=startedAt);
  if(ledgers.length!==1)throw new Error('FUNCTIONAL_LEDGER_AMBIGUOUS');
  const rows=readFileSync(resolve(ROOT,'test-results',ledgers[0]),'utf8').trim().split(/\r?\n/).map(line=>JSON.parse(line));
  const cases=CASES.map(caseId=>({caseId,status:rows.findLast(row=>row.phase===caseId)?.result??'NOT_RUN'}));
  if(cases.some(row=>row.status!=='PASS'))throw new Error('FUNCTIONAL_CASE_NOT_PASSED');
  const evidencePath=resolve(ROOT,`test-results/mvp-functional-local-${runId}.json`);
  if(safeRun('git',['rev-parse','HEAD']).trim()!==headSha||scenarioDigest()!==digest||hasUncommittedSource(safeRun('git',['status','--porcelain','--untracked-files=all'])))throw new Error('FUNCTIONAL_SOURCE_CHANGED_DURING_RUN');
  pendingEvidence={evidencePath,document:{headSha,scenarioDigest:digest,testsPassed:true,cases,runId,ledgerFile:ledgers[0]}};
} catch(error) {
  caughtError=error;
} finally {
  let cleanupFailed=false;
  for(const [script,marker,project] of [
    ['u03-window-local-destination.mjs',destinationMarker,destinationProject],
    ['h1a-local-source-stack.mjs',sourceMarker,sourceProject],
  ]) {
    if(existsSync(marker)||ownedContainers(project).length) {
      const result=run(node,[resolve(ROOT,'scripts',script),'stop'],{env:{...process.env,U03_RESTORE_DESTINATION_RUN_ID:runId}});
      if(result.status!==0) cleanupFailed=true;
      else process.stdout.write(result.stdout);
    }
  }
  if(cleanupFailed) throw new Error('LOCAL_HTTP_RESTORE_CLEANUP_BLOCKED_PRESERVE_OWNED_STACKS');
}
if(caughtError) {
  const ledgers=existsSync(resolve(ROOT,'test-results'))?readdirSync(resolve(ROOT,'test-results')).filter(name=>/^mvp-functional-[0-9a-f-]+\.jsonl$/.test(name)&&statSync(resolve(ROOT,'test-results',name)).mtimeMs>=startedAt):[];
  const rows=ledgers.length===1?readFileSync(resolve(ROOT,'test-results',ledgers[0]),'utf8').trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)):[];
  const evidencePath=resolve(ROOT,`test-results/mvp-functional-local-${runId}.json`);
  writeFileSync(evidencePath,JSON.stringify({headSha,scenarioDigest:digest,testsPassed:false,runId,ledgerFile:ledgers.length===1?ledgers[0]:null,
    cases:CASES.map(caseId=>({caseId,status:rows.findLast(row=>row.phase===caseId)?.result??'NOT_RUN'}))},null,2),{flag:'wx'});
  process.stdout.write(`MVP_FUNCTIONAL_EVIDENCE_BLOCKED ${evidencePath}\n`);
  throw caughtError;
}
if(!pendingEvidence)throw new Error('FUNCTIONAL_EVIDENCE_MISSING');
writeFileSync(pendingEvidence.evidencePath,JSON.stringify(pendingEvidence.document,null,2),{flag:'wx'});
process.stdout.write(`MVP_FUNCTIONAL_EVIDENCE ${pendingEvidence.evidencePath}\n`);
process.stdout.write('MVP_FUNCTIONAL_LOCAL_RESULT PASS loopback_http=real restore_destination=separate_local_stack migrations=27\n');
