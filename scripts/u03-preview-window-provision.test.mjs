import assert from 'node:assert/strict';
import test from 'node:test';
import { makeWindowVariables, provisionWindowVariables, WINDOW_BRANCH, WINDOW_VARIABLES } from './u03-preview-window-provision.mjs';

const SHA = 'a'.repeat(40);
const RUN = 'c14f4c11-570f-4e03-a3a1-33a702b85baa';

test('window config is pinned to Preview, role-specific URL, run, and server-only signing keys', () => {
  const bytes = Buffer.alloc(32, 7);
  const config = makeWindowVariables({ sha: SHA, runId: RUN, random: () => Buffer.from(bytes) });
  assert.equal(config.runId, RUN);
  assert.equal(config.values.U03_PREVIEW_WRITER_WINDOW_REF, 'rhnnplewqsekrnaousyl');
  assert.equal(config.values.U03_PREVIEW_WRITER_WINDOW_SHA, SHA);
  const url = new URL(config.values.RUBIK_AUDIT_DATABASE_URL);
  assert.equal(url.hostname, 'aws-1-eu-west-3.pooler.supabase.com');
  assert.equal(url.port, '5432');
  assert.equal(url.username, 'rubik_preview_u03_writer.rhnnplewqsekrnaousyl');
  assert.equal(url.searchParams.get('options'), '-c role=rubik_audit_writer');
  assert.equal(Buffer.from(config.values.PROVENANCE_SIGNING_KEYS.split(':')[1], 'base64').length, 32);
  assert.throws(() => makeWindowVariables({ sha: 'bad', runId: RUN }), /WINDOW_PROVISION_INPUT_REJECTED/);
});

function fakeExec({ failAddAt = -1 } = {}) {
  const calls = [];
  const stored = new Map();
  let addCount = 0;
  const exec = async (cli, args, options = {}) => {
    calls.push({ cli, args, input: options.input ?? '' });
    const gitCommand = args[0] === '-C' ? args[2] : args[0];
    if (gitCommand === 'branch') return WINDOW_BRANCH;
    if (gitCommand === 'rev-parse') return SHA;
    if (gitCommand === 'status') return '';
    if (args[0] === 'env' && args[1] === 'ls') return [...stored.keys()].join('\n');
    if (args[0] === 'env' && args[1] === 'add') {
      addCount++;
      if (addCount === failAddAt) throw new Error('PRIVATE_VERCEL_ERROR_WITH_VALUE');
      stored.set(args[2], options.input.trim());
      return '';
    }
    if (args[0] === 'env' && args[1] === 'rm') { stored.delete(args[2]); return ''; }
    throw new Error('UNEXPECTED_FAKE_COMMAND');
  };
  return { exec, calls, stored };
}

test('branch variables are sent only via stdin, scope is exact, values are not returned', async () => {
  const fake = fakeExec();
  const result = await provisionWindowVariables({ cwd: 'C:/repo', sha: SHA, env: {}, exec: fake.exec,
    read: async () => JSON.stringify({ projectId: 'prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook', orgId: 'team_hLhdb3M9MviTIysXD9whFF2c' }) });
  assert.equal(result.ref, 'rhnnplewqsekrnaousyl');
  assert.equal(result.variableNames.length, WINDOW_VARIABLES.length);
  const add = fake.calls.filter(call => call.args[1] === 'add');
  assert.equal(add.length, WINDOW_VARIABLES.length);
  for (const call of add) {
    assert.deepEqual(call.args.slice(3, 6), ['preview', WINDOW_BRANCH, '--yes']);
    assert.equal(call.args.includes(call.input.trim()), false);
    assert.ok(call.input.length > 1);
  }
  assert.doesNotMatch(JSON.stringify(result), /postgresql|base64|PRIVATE|rubik_preview_u03_writer/);
});

test('a partial env write is rolled back without logging values', async () => {
  const fake = fakeExec({ failAddAt: 3 });
  await assert.rejects(provisionWindowVariables({ cwd: 'C:/repo', sha: SHA, env: {}, exec: fake.exec,
    read: async () => JSON.stringify({ projectId: 'prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook', orgId: 'team_hLhdb3M9MviTIysXD9whFF2c' }) }),
  /WINDOW_VARIABLE_PROVISION_FAILED/);
  assert.equal(fake.stored.size, 0);
  assert.equal(fake.calls.filter(call => call.args[1] === 'rm').length, 2);
  assert.doesNotMatch(JSON.stringify(fake.calls), /PRIVATE_VERCEL_ERROR_WITH_VALUE/);
});
