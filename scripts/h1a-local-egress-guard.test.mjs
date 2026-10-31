import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
function probe(code,extra={}) {
  mkdirSync('test-results',{recursive:true});
  const journal=resolve('test-results','egress-guard-test-'+randomUUID()+'.txt');
  try {
    const child=spawnSync(process.execPath,['--import',pathToFileURL(resolve('scripts/h1a-local-egress-guard.mjs')).href,'--input-type=module','-e',code],{
      env:{...process.env,VERCEL_ENV:'development',RUBIK_LOCAL_EGRESS_PORTS:'65421',RUBIK_LOCAL_EGRESS_JOURNAL:journal,...extra},encoding:'utf8'});
    return {status:child.status,out:child.stdout,err:child.stderr,journal:readFileSync(journal,'utf8')};
  } finally {rmSync(journal,{force:true});}
}
test('external socket is rejected synchronously before DNS or connect',()=>{
  const r=probe("import net from 'node:net';try{net.connect({host:'never.invalid',port:443});process.exit(2)}catch(e){if(e.message!=='LOCAL_EXTERNAL_EGRESS_BLOCKED')process.exit(3)}");
  assert.equal(r.status,0);assert.equal(r.journal,'READY\nDENIED\n');
});
test('loopback outside the selected local ports is rejected',()=>{
  const r=probe("import net from 'node:net';try{net.connect({host:'127.0.0.1',port:54321});process.exit(2)}catch(e){if(e.message!=='LOCAL_EXTERNAL_EGRESS_BLOCKED')process.exit(3)}");
  assert.equal(r.status,0);assert.equal(r.journal,'READY\nDENIED\n');
});
