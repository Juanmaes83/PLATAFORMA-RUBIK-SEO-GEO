// Reproducible local-only loopback export/restore drill. Both disposable stacks are owned
// and retired by this runner; the destination stack excludes Supavisor by design.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const ROOT=resolve(import.meta.dirname,'..');
const runId=randomUUID();
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
    if (args.some(value => String(value).includes('u03-window-http-restore.integration.test.ts'))) {
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
try {
  const localEnv={U03_RESTORE_DESTINATION_RUN_ID:runId};
  call('h1a-local-source-stack.mjs','start',localEnv);
  call('h1a-local-source-stack.mjs','inspect',localEnv);
  const destinationEnv={U03_RESTORE_DESTINATION_RUN_ID:runId};
  call('u03-window-local-destination.mjs','start',destinationEnv);
  call('u03-window-local-destination.mjs','inspect',destinationEnv);
  const vitest=process.platform==='win32'
    ? safeRun('cmd.exe',['/d','/s','/c','node_modules\\.bin\\vitest.cmd run --config vitest.integration.config.mts tests/integration/u03-window-http-restore.integration.test.ts'],{
      env:h1aTestEnv()})
    : safeRun(node,[resolve(ROOT,'node_modules/vitest/vitest.mjs'),'run','--config','vitest.integration.config.mts','tests/integration/u03-window-http-restore.integration.test.ts'],{
      env:h1aTestEnv()});
  process.stdout.write(vitest);
  process.stdout.write('LOCAL_HTTP_RESTORE_RESULT PASS loopback_http=real restore_destination=separate_local_stack migrations=27\n');
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
  if(cleanupFailed) { process.stderr.write('LOCAL_HTTP_RESTORE_CLEANUP BLOCKED; preserve owned stacks for reconciliation\n'); process.exitCode=2; }
}
