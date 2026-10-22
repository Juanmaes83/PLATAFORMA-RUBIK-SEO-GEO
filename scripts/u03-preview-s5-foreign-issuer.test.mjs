import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { GateError } from './u03-preview-b4-runner.mjs';
import { runS5ForeignIssuer } from './u03-preview-s5-foreign-issuer.mjs';

test('missing S-5 operator input produces a sanitized ledger row before any external call', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rubik-u03-s5-diagnostic-'));
  const prior = process.cwd();
  const runId = 'a5a55ad2-9aae-4dc0-9de5-2d613bffb553';
  const secret = 'fictional-secret-that-must-not-be-written';
  try {
    process.chdir(root);
    await assert.rejects(runS5ForeignIssuer({ env: { U03_FOREIGN_ISSUER_SERVICE_KEY: secret }, runId,
      fetchImpl: async () => { throw new Error('network must not be called'); },
      launch: async () => { throw new Error('browser must not launch'); },
      inspect: async () => { throw new Error('preflight must not run'); },
    }), error => error instanceof GateError && error.code === 'S5_OPERATOR_INPUT_INVALID');
    const rows = (await readFile(join(root, 'test-results', 'u03-hosted', `${runId}.jsonl`), 'utf8'))
      .trim().split(/\r?\n/).map(row => JSON.parse(row));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'BLOCKED');
    assert.equal(rows[0].code, 'S5_OPERATOR_INPUT_INVALID');
    const ledger = JSON.stringify(rows);
    assert.ok(!ledger.includes(secret));
    assert.ok(!ledger.includes('example.test'));
  } finally {
    process.chdir(prior);
    await rm(root, { recursive: true, force: true });
  }
});
