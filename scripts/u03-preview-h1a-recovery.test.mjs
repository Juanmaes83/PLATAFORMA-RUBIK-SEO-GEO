import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { H1A_RECOVERY, ownedIdsFromLedger, recoverH1ARun } from './u03-preview-h1a-recovery.mjs';

const cases = ['fixture-user-ownera','fixture-user-ownerb','fixture-user-outsider',
  'fixture-org-ownera','fixture-org-ownerb','fixture-project-a1','fixture-project-a2','fixture-project-b1'];
const row = (caseId, id = randomUUID()) => ({ runId:H1A_RECOVERY.runId, ref:H1A_RECOVERY.ref,
  functionalSha:H1A_RECOVERY.sha, deploymentId:H1A_RECOVERY.deploymentId,
  host:H1A_RECOVERY.host, caseId, status:'CREATED', id });
const source = () => [...cases.map(caseId => row(caseId)),
  { runId:H1A_RECOVERY.runId, ref:H1A_RECOVERY.ref, caseId:'h1a-global-result', status:'BLOCKED' }];

test('recovery extracts exactly the eight owned IDs from an immutable campaign ledger', () => {
  const ids = ownedIdsFromLedger(source().map(value => JSON.stringify(value)).join('\n'));
  assert.deepEqual(Object.keys(ids), ['ownerA','ownerB','outsider','orgA','orgB','a1','a2','b1']);
  assert.equal(new Set(Object.values(ids)).size, 8);
});

test('reconciled fixture IDs must agree with their created IDs', () => {
  const evidence = source();
  evidence.splice(3, 0, { ...evidence[0], status:'RECOVERED' });
  assert.equal(Object.keys(ownedIdsFromLedger(evidence.map(value => JSON.stringify(value)).join('\n'))).length, 8);
  evidence[3] = { ...evidence[3], id:randomUUID() };
  assert.throws(() => ownedIdsFromLedger(evidence.map(value => JSON.stringify(value)).join('\n')), /RECOVERY_LEDGER_REJECTED/);
});

test('recovery rejects missing, duplicate and foreign fixture evidence before any database access', async () => {
  const original = source();
  for (const changed of [
    original.slice(1),
    [...original, original[0]],
    original.map((value, index) => index === 3 ? { ...value, id: original[0].id } : value),
    original.map((value, index) => index === 4 ? { ...value, ref:'different-ref' } : value),
    original.map((value, index) => index === 4 ? { ...value, functionalSha:'0'.repeat(40) } : value),
  ]) assert.throws(() => ownedIdsFromLedger(changed.map(value => JSON.stringify(value)).join('\n')), /RECOVERY_LEDGER_REJECTED/);
  let connected = false;
  await assert.rejects(recoverH1ARun({ databasePassword:'fictional-only', env:{},
    adminPoolFactory:() => { connected=true; throw new Error('must not connect'); } }), /RECOVERY_TARGET_REJECTED/);
  assert.equal(connected, false);
});

test('the two original ledgers are read only and the recovery child never writes to their paths', async () => {
  const sourceCode = await readFile(new URL('./u03-preview-h1a-recovery.mjs', import.meta.url), 'utf8');
  const wrapper = await readFile(new URL('./u03-preview-b4-owner.ps1', import.meta.url), 'utf8');
  assert.match(sourceCode, /u03-hosted-recovery/);
  assert.match(sourceCode, /sha256\(original\) !== ORIGINAL_SHA256\.window/);
  assert.match(sourceCode, /sha256\(hosted\) !== ORIGINAL_SHA256\.hosted/);
  assert.match(sourceCode, /ownedIdsFromLedger\(original\.toString\('utf8'\)\)/);
  assert.doesNotMatch(sourceCode, /appendFile\(originalPath|writeFile\(originalPath/);
  assert.match(wrapper, /\[switch\]\$H1ARecoveryOnly/);
  assert.match(wrapper, /Invoke-U03WindowRoleChild -Mode 'h1a-recover'/);
  assert.match(wrapper, /Read-Host -Prompt 'Recuperación H1-A: Database password existente de Supabase Preview \(entrada oculta\)' -AsSecureString/);
});
