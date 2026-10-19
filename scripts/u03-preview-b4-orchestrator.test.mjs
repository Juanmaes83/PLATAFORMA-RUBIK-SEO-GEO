import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromiumEnvironment, PIN } from './u03-preview-b4-runner.mjs';
import { runHostedU03Campaign } from './u03-preview-b4-orchestrator.mjs';

const runId = 'u03-orchestrator-test-run';
const sha = 'a'.repeat(40);
const secrets = {
  U03_PREVIEW_ADMIN_KEY: 'fictional-admin-key-do-not-log',
  U03_PREVIEW_PUBLIC_KEY: 'fictional-public-key-do-not-log',
  VERCEL_OIDC_TOKEN: 'fictional-oidc-secret-do-not-log',
};

function fakeFixture(failAt = null, calls = []) {
  const failAfter = stage => { calls.push(stage); if (failAt === stage) throw new Error(`INJECTED_${stage.toUpperCase()}_FAILURE`); };
  return {
    namespace: 'u03-test-namespace',
    createUsers: async () => { const created = ['user-a', 'user-b', 'outsider']; failAfter('users'); return created; },
    createOrganizations: async () => { const created = { orgA: 'org-a', orgB: 'org-b' }; failAfter('organizations'); return created; },
    createProjects: async () => { const created = { a1: 'p-a1', a2: 'p-a2', b1: 'p-b1' }; failAfter('projects'); return created; },
    runMatrix: async () => failAfter('matrix'),
    browserInputs: () => ({ U03_B4_A_EMAIL: 'fictional@example.test', U03_B4_A_PASSWORD: 'fictional-password' }),
    cleanup: async () => { calls.push('cleanup'); return { ok: true, userIds: ['id-a'], organizationIds: ['org-a'], projectIds: ['p-a1'] }; },
  };
}

const passingPreflight = async () => ({
  admin: { marker: 'in-memory' },
  vercel: { deploymentId: PIN.deploymentId, sha: PIN.sha, host: PIN.host },
  initial: { authUsers: 0, organizations: 0, projects: 0, writerLocked: true, projectRef: PIN.supabaseRef },
});
const passingFinal = async () => ({
  inventoriesClear: true, outboxClear: true, capabilitiesSafe: true,
  state: { auth_users: 0, organizations: 0, projects: 0, organization_members: 0, project_members: 0, audit_events: 0, outbox_total: 0, pending_outbox: 0, writer_locked: true, environment: 'preview', project_ref: PIN.supabaseRef },
});

async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'u03-b4-orchestrator-'));
  try { return await fn(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('preflight failure performs zero writes and records BLOCKED_NO_WRITES', async () => withRoot(async root => {
  let fixtureCalls = 0, browserCalls = 0, finalCalls = 0;
  const result = await runHostedU03Campaign({
    root, sha, runId, env: secrets,
    preflightFn: async () => { throw new Error('PUBLIC_SIGNUP_NOT_CONFIRMED_CLOSED'); },
    fixtureFactory: () => { fixtureCalls++; throw new Error('unexpected fixture'); },
    browserFn: async () => { browserCalls++; },
    finalCheckFn: async () => { finalCalls++; return passingFinal(); },
  });
  assert.equal(result.status, 'BLOCKED_NO_WRITES');
  assert.equal(fixtureCalls + browserCalls + finalCalls, 0);
  const ledger = await readFile(result.ledgerPath, 'utf8');
  assert.match(ledger, /BLOCKED_NO_WRITES/);
  for (const secret of Object.values(secrets)) assert.equal(ledger.includes(secret), false);
}));

for (const stage of ['users', 'organizations', 'projects', 'matrix']) {
  test(`failure after ${stage} invokes fixture cleanup and preserves sanitized ledger`, async () => withRoot(async root => {
    const calls = [];
    const result = await runHostedU03Campaign({
      root, sha, runId, env: secrets, preflightFn: passingPreflight,
      fixtureFactory: () => fakeFixture(stage, calls), finalCheckFn: passingFinal,
      browserFn: async () => { calls.push('browser'); return { captures: [] }; },
    });
    assert.equal(result.status, 'FAIL_CLEANED');
    assert.equal(calls.includes('cleanup'), true);
    assert.equal(calls.includes('browser'), false);
    const ledger = await readFile(result.ledgerPath, 'utf8');
    assert.match(ledger, /fixture-cleanup.*PASS/);
    for (const secret of Object.values(secrets)) assert.equal(ledger.includes(secret), false);
  }));
}

test('B-4 failure still cleans fixtures; runId is shared with browser and ledger', async () => withRoot(async root => {
  const calls = [];
  let browserInput;
  const result = await runHostedU03Campaign({
    root, sha, runId, env: secrets, preflightFn: passingPreflight,
    fixtureFactory: options => { assert.equal(options.runId, runId); return fakeFixture(null, calls); },
    finalCheckFn: passingFinal,
    browserFn: async options => { browserInput = options; throw new Error('injected browser failure'); },
  });
  assert.equal(result.status, 'FAIL_CLEANED');
  assert.equal(calls.includes('cleanup'), true);
  assert.equal(browserInput.runId, runId);
  assert.equal(browserInput.env.VERCEL_OIDC_TOKEN, secrets.VERCEL_OIDC_TOKEN);
  const ledger = await readFile(result.ledgerPath, 'utf8');
  for (const secret of [...Object.values(secrets), 'fictional-password', 'fictional@example.test']) assert.equal(ledger.includes(secret), false);
}));

test('filtered child environment omits Preview keys, credentials and OIDC', () => {
  const filtered = chromiumEnvironment({ PATH: 'C:\\Windows', VERCEL_OIDC_TOKEN: secrets.VERCEL_OIDC_TOKEN, U03_PREVIEW_ADMIN_KEY: secrets.U03_PREVIEW_ADMIN_KEY, U03_B4_A_PASSWORD: 'fictional-password' });
  assert.deepEqual(filtered, { PATH: 'C:\\Windows' });
});
