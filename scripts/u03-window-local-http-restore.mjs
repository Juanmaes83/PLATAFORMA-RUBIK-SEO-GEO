// Reproducible local-only loopback export/restore drill. Both disposable stacks are owned
// and retired by this runner; the destination stack excludes Supavisor by design.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT=resolve(import.meta.dirname,'..');
const sourceWorkdir=resolve(ROOT,'test-results/u03-window-local-stack');
const destinationWorkdir=resolve(ROOT,'test-results/u03-window-restore-destination');
const sourceMarker=resolve(sourceWorkdir,'.u03-owned-stack.json');
const destinationMarker=resolve(destinationWorkdir,'.u03-owned-destination.json');
const sourceProject='rubik-u03-window-20261020';
const destinationProject='rubik-u03-restore-20261020';
const run=(file,args,options={})=>spawnSync(file,args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],...options});
function safeRun(file,args,options={}) {
  const result=run(file,args,options);
  if(result.status!==0) throw new Error('LOCAL_HTTP_RESTORE_RUNNER_FAILED');
  return result.stdout;
}
function ownedContainers(project) {
  return safeRun('docker',['ps','-a','--filter',`label=com.supabase.cli.project=${project}`,'--format','{{.Names}}']).split(/\r?\n/).filter(Boolean);
}
if(ownedContainers(sourceProject).length||ownedContainers(destinationProject).length||existsSync(sourceMarker)||existsSync(destinationMarker))
  throw new Error('LOCAL_HTTP_RESTORE_REFUSES_PREEXISTING_STACK');
let sourceStarted=false,destinationStarted=false;
const node=process.execPath;
const call=(script,action)=>safeRun(node,[resolve(ROOT,'scripts',script),action]);
try {
  call('u03-window-local-stack.mjs','start'); sourceStarted=true;
  call('u03-window-local-stack.mjs','inspect');
  call('u03-window-local-destination.mjs','start'); destinationStarted=true;
  call('u03-window-local-destination.mjs','inspect');
  const vitest=process.platform==='win32'
    ? safeRun('cmd.exe',['/d','/s','/c','node_modules\\.bin\\vitest.cmd run --config vitest.integration.config.mts tests/integration/u03-window-http-restore.integration.test.ts'],{
      env:{...process.env,RUBIK_TEST_U03_WINDOW_STACK:'1',SUPABASE_CLI:`npx --yes supabase@2.118.0 --workdir ${sourceWorkdir}`}})
    : safeRun(node,[resolve(ROOT,'node_modules/vitest/vitest.mjs'),'run','--config','vitest.integration.config.mts','tests/integration/u03-window-http-restore.integration.test.ts'],{
      env:{...process.env,RUBIK_TEST_U03_WINDOW_STACK:'1',SUPABASE_CLI:`npx --yes supabase@2.118.0 --workdir ${sourceWorkdir}`}});
  process.stdout.write(vitest);
  process.stdout.write('LOCAL_HTTP_RESTORE_RESULT PASS loopback_http=real restore_destination=separate_local_stack migrations=27\n');
} finally {
  let cleanupFailed=false;
  for(const [script,marker,project,started] of [
    ['u03-window-local-destination.mjs',destinationMarker,destinationProject,destinationStarted],
    ['u03-window-local-stack.mjs',sourceMarker,sourceProject,sourceStarted],
  ]) {
    if(started||existsSync(marker)||ownedContainers(project).length) {
      const result=run(node,[resolve(ROOT,'scripts',script),'stop']);
      if(result.status!==0) cleanupFailed=true;
      else process.stdout.write(result.stdout);
    }
  }
  if(cleanupFailed) { process.stderr.write('LOCAL_HTTP_RESTORE_CLEANUP BLOCKED; preserve owned stacks for reconciliation\n'); process.exitCode=2; }
}
