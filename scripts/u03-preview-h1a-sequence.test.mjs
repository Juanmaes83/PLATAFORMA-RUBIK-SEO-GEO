import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runDirectedPreviewSequence, SEQUENCE_PHASES, createJsonlLedger } from './u03-preview-h1a-sequence.mjs';

const RUN = 'c14f4c11-570f-4e03-a3a1-33a702b85baa';
const CLEAN = { inventoryZero: true, outboxTotal: 0, pendingOutbox: 0, roleAbsent: true, rolePresent: false, roleLocked: null, activeSessions: 0 };

test('all phase failures fail closed, stop later writes and run independent containment/final read', async () => {
  for (const failed of SEQUENCE_PHASES) {
    const seen = [], rows = [];
    const result = await runDirectedPreviewSequence({ runId: RUN,
      phase: async name => { seen.push(name); if (name === failed) throw Object.assign(new Error('fictional-secret-and-free-text'), { code: 'INJECTED_FAILURE' }); },
      ledger: async (name, status, detail) => rows.push({ name, status, detail }),
      contain: async () => ({ contained: true, roleAbsent: true, rolePresent: false, activeSessions: 0 }),
      finalRead: async () => CLEAN,
    });
    assert.equal(result.status, 'BLOCKED', failed);
    assert.equal(result.failedPhase, failed);
    assert.ok(result.containment.contained);
    assert.ok(result.final.inventoryZero);
    assert.equal(seen.at(-1), failed);
    assert.ok(rows.some(row => row.name === 'finally-independent-containment' && row.status === 'PASS'));
    assert.doesNotMatch(JSON.stringify(rows), /fictional-secret|free-text/);
    if (['deployment-preflight','admin-readonly-preflight','install-role-nologin','independent-containment-probe',
      'activate-temporary-role','session-pooler-set-role','run-scope-policy-proof'].includes(failed)) assert.equal(result.fixtureStarted, false);
  }
});

test('normal path runs exact phase order and passes only after contained zero-state final read', async () => {
  const seen = [];
  const result = await runDirectedPreviewSequence({ runId: RUN,
    phase: async name => { seen.push(name); }, ledger: async () => {},
    contain: async () => ({ contained: true, roleAbsent: true, rolePresent: false, activeSessions: 0 }),
    finalRead: async () => CLEAN,
  });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(seen, SEQUENCE_PHASES);
  assert.equal(result.fixtureStarted, true);
});

test('admin connection loss never becomes PASS and final evidence must independently verify lock and inventory', async () => {
  const result = await runDirectedPreviewSequence({ runId: RUN, phase: async () => {}, ledger: async () => {},
    contain: async () => { throw new Error('private connection detail'); },
    finalRead: async () => ({ inventoryZero: true, outboxTotal: 0, pendingOutbox: 0, rolePresent: true, roleLocked: false, activeSessions: 1 }),
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.failure, 'ADMIN_CONTAINMENT_UNVERIFIED');
});

test('persistent ledger stores attributable UUIDs but omits free text, passwords, tokens and emails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'u03-sequence-ledger-'));
  try {
    const path = join(dir, 'run.jsonl');
    const ledger = await createJsonlLedger(path, { runId: RUN, sha: 'a'.repeat(40), deploymentId: 'dpl_test', host: 'preview.example' });
    const fixtureId = '6739e760-420f-4ad3-b2d0-9d3aa674e802';
    await ledger('preflight', 'PASS', { runId: RUN, code: 'OK', password: 'fictional-password', email: 'owner@invalid',
      id: fixtureId, projectIds: [fixtureId], actorId: fixtureId, message: 'secret' });
    const text = await readFile(path, 'utf8');
    assert.doesNotMatch(text, /fictional-password|owner@invalid|actorId|secret/);
    assert.match(text, new RegExp(fixtureId));
    assert.match(text, /"code":"OK"/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
