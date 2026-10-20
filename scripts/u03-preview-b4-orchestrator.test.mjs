import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromiumEnvironment, networkEnvironment, PIN } from './u03-preview-b4-runner.mjs';
import { PREFLIGHT_RESULT_FIELDS, PREFLIGHT_SQL, PRIOR_DATA_API_RUN_ID, parseCliJson, readPreviewAuthSettings, runHostedU03Campaign, runPreviewReadOnlySql, runReadOnlyPreflight, safeLedgerDetail, verifyFinalPreviewState, verifyInitialPreviewState, verifyReadOnlyPreviewState } from './u03-preview-b4-orchestrator.mjs';
import { V4_SECURITY_DEFINER_ALLOWLIST } from './u03-preview-v4-receipt.mjs';

const runId = 'u03-orchestrator-test-run';
const sha = 'a'.repeat(40);

test('ledger retains only categorized browser diagnostics and discards unsafe strings', () => {
  const safe = safeLedgerDetail({
    phase: 'login', pathname: '/acceso',
    diagnostics: {
      console: { 'error:preview': 7, 'warning:external': 2, 'error:https://evil.test/?token=leak': 99 },
      http: { '403:preview': 1, '500:external': 3, '200:https://host.test/?key=leak': 9 },
      requestFailures: { external: 4, 'evil.test?token=leak': 5 },
      routeEvents: { 'pinned-origin-request-failed': 1, 'auth-action-http-403': 1, 'https://evil.test/?token=leak': 6 },
      freeText: 'secret-value',
    },
    consoleText: 'secret-value',
  });
  assert.deepEqual(safe, {
    phase: 'login', pathname: '/acceso',
    diagnostics: {
      console: { 'error:preview': 7, 'warning:external': 2 },
      http: { '403:preview': 1, '500:external': 3 },
      requestFailures: { external: 4 },
      routeEvents: { 'pinned-origin-request-failed': 1, 'auth-action-http-403': 1 },
    },
  });
  assert.equal(JSON.stringify(safe).includes('leak'), false);
  assert.equal(JSON.stringify(safe).includes('secret-value'), false);
});

const secrets = {
  U03_PREVIEW_ADMIN_KEY: ['sb_secret_', 'fictional-admin-key-do-not-log'].join(''),
  U03_PREVIEW_PUBLIC_KEY: ['sb_publishable_', 'fictional-public-key-do-not-log'].join(''),
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
  state: { auth_users: 0, organizations: 0, projects: 0, organization_members: 0, project_members: 0, invitations: 0, audit_events: 0, provider_results: 0, imports: 0, audit_idempotency: 0, outbox_total: 0, pending_outbox: 0, openseo_project_jobs: 0, openseo_project_connections: 0, webmaster_properties: 0, provider_budgets: 0, provider_spend: 0, openseo_google_properties: 0, google_captures: 0, writer_locked: true, window_writer_present: false, window_policy_residue: 0, writer_sessions: 0, admin_can_manage_roles: true, admin_can_terminate_sessions: true, environment: 'preview', project_ref: PIN.supabaseRef },
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

for (const fails of [false, true]) {
  test(`roles/invitations campaign ${fails ? 'fails safely' : 'passes'} without rerunning Data API or Chromium`, async () => withRoot(async root => {
    const calls = [];
    const result = await runHostedU03Campaign({
      root, sha, runId, env: secrets, mode: 'roles-invitations', preflightFn: passingPreflight,
      fixtureFactory: () => ({ namespace: 'u03-roles-test',
        createUsers: async () => calls.push('users'),
        createOrganizations: async () => { calls.push('organizations'); return { orgA: 'org-a', orgB: 'org-b' }; },
        createProjects: async () => { calls.push('projects'); return { a1: 'a1', a2: 'a2', b1: 'b1' }; },
        runRolesInvitations: async () => { calls.push('roles'); if (fails) throw new Error('ROLE_CASE_FAILED_V3'); return { passed: true, cases: 10 }; },
        cleanup: async () => { calls.push('cleanup'); return { ok: true, userIds: [], organizationIds: [], projectIds: [] }; },
      }), finalCheckFn: passingFinal,
      browserFn: async () => { throw new Error('BROWSER_MUST_NOT_RUN'); },
    });
    assert.equal(result.status, fails ? 'FAIL_CLEANED' : 'PASS');
    assert.deepEqual(calls, ['users', 'organizations', 'projects', 'roles', 'cleanup']);
    const ledger = await readFile(result.ledgerPath, 'utf8');
    assert.match(ledger, /"caseId":"data-api-matrix","status":"SKIP_PRIOR_EVIDENCE"/);
    assert.match(ledger, /"caseId":"browser-b4","status":"SKIP_PRIOR_EVIDENCE"/);
    assert.match(ledger, /"caseId":"outbox-final","status":"PASS"/);
    for (const secret of Object.values(secrets)) assert.equal(ledger.includes(secret), false);
  }));
}

for (const fails of [false, true]) {
  test(`cross-surface campaign ${fails ? 'fails and cleans' : 'passes'} without prior matrices or Chromium`, async () => withRoot(async root => {
    const calls = [];
    const result = await runHostedU03Campaign({
      root, sha, runId, env: secrets, mode: 'cross-surface', preflightFn: passingPreflight,
      fixtureFactory: () => ({ namespace: 'u03-cross-test',
        createUsers: async () => calls.push('users'),
        createOrganizations: async () => { calls.push('organizations'); return { orgA: 'org-a', orgB: 'org-b' }; },
        createProjects: async () => { calls.push('projects'); return { a1: 'a1', a2: 'a2', b1: 'b1' }; },
        runCrossSurface: async () => { calls.push('cross'); if (fails) throw new Error('CROSS_CASE_FAILED_I8'); return { passed: true, cases: 14 }; },
        cleanup: async () => { calls.push('cleanup'); return { ok: true, userIds: [], organizationIds: [], projectIds: [] }; },
      }), finalCheckFn: passingFinal,
      browserFn: async () => { throw new Error('BROWSER_MUST_NOT_RUN'); },
    });
    assert.equal(result.status, fails ? 'FAIL_CLEANED' : 'PASS');
    assert.deepEqual(calls, ['users', 'organizations', 'projects', 'cross', 'cleanup']);
    const ledger = await readFile(result.ledgerPath, 'utf8');
    assert.match(ledger, /"caseId":"data-api-matrix","status":"SKIP_PRIOR_EVIDENCE"/);
    assert.match(ledger, /"caseId":"browser-b4","status":"SKIP_PRIOR_EVIDENCE"/);
    assert.match(ledger, /"caseId":"outbox-final","status":"PASS"/);
    for (const secret of Object.values(secrets)) assert.equal(ledger.includes(secret), false);
  }));
}

for (const fails of [false, true]) {
  test(`session and provider campaign ${fails ? 'fails and cleans' : 'records review and cleans'} with one project`, async () => withRoot(async root => {
    const calls = [];
    const result = await runHostedU03Campaign({
      root, sha, runId, env: secrets, mode: 'session-providers', preflightFn: passingPreflight,
      fixtureFactory: () => ({ namespace: 'u03-test',
        createSessionFixtures: async () => { calls.push('fixture'); return {
          account: { email: 'fixture@example.test', password: 'secret', api: {} }, path: '/proyectos/u03-test-a/a1',
        }; },
        cleanup: async () => { calls.push('cleanup'); return { ok: true, userIds: [], organizationIds: [], projectIds: [] }; },
      }),
      sessionProvidersFn: async ({ path, env }) => {
        calls.push('browser');
        assert.equal(path, '/proyectos/u03-test-a/a1');
        assert.equal(env.VERCEL_OIDC_TOKEN, secrets.VERCEL_OIDC_TOKEN);
        if (fails) throw new Error('S2_DIRECTED_FAILURE');
        return { passed: true, captures: ['desktop.png', 'mobile.png'] };
      },
      finalCheckFn: passingFinal,
    });
    assert.equal(result.status, fails ? 'FAIL_CLEANED' : 'AWAITING_VISUAL_REVIEW');
    assert.deepEqual(calls, ['fixture', 'browser', 'cleanup']);
    const ledger = await readFile(result.ledgerPath, 'utf8');
    assert.match(ledger, /"caseId":"outbox-final","status":"PASS"/);
    for (const secret of Object.values(secrets)) assert.equal(ledger.includes(secret), false);
    assert.equal(ledger.includes('fixture@example.test'), false);
  }));
}

test('server provider-egress campaign runs only the two guarded actions and cleans one owner fixture', async () => withRoot(async root => {
  const calls = [];
  const result = await runHostedU03Campaign({
    root, sha, runId, env: secrets, mode: 'provider-egress', preflightFn: passingPreflight,
    fixtureFactory: () => ({ namespace: 'u03-egress-test',
      createSessionFixtures: async () => { calls.push('fixture'); return { account: { email: 'fixture@example.test', password: 'secret', api: {} }, path: '/proyectos/u03-egress-test-a/a1' }; },
      runMatrix: async () => { throw new Error('DATA_API_MUST_NOT_RUN'); },
      cleanup: async () => { calls.push('cleanup'); return { ok: true, userIds: [], organizationIds: [], projectIds: [] }; },
    }),
    providerEgressFn: async ({ path, env, runId: actualRunId }) => {
      calls.push('actions');
      assert.equal(path, '/proyectos/u03-egress-test-a/a1');
      assert.equal(actualRunId, runId);
      assert.equal(env.VERCEL_OIDC_TOKEN, secrets.VERCEL_OIDC_TOKEN);
      return { passed: true, captures: ['desktop.png'] };
    },
    browserFn: async () => { throw new Error('B4_MUST_NOT_RUN'); }, finalCheckFn: passingFinal,
  });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(calls, ['fixture', 'actions', 'cleanup']);
  const rows = (await readFile(result.ledgerPath, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.find(row => row.caseId === 'data-api-matrix')?.status, 'SKIP_PRIOR_EVIDENCE');
  assert.equal(rows.find(row => row.caseId === 'browser-b4')?.status, 'SKIP_PRIOR_EVIDENCE');
  assert.equal(rows.find(row => row.caseId === 'fixture-cleanup')?.status, 'PASS');
  assert.equal(rows.find(row => row.caseId === 'final-inventory')?.status, 'PASS');
  assert.equal(rows.find(row => row.caseId === 'outbox-final')?.status, 'PASS');
  for (const secret of Object.values(secrets)) assert.equal(JSON.stringify(rows).includes(secret), false);
  assert.equal(JSON.stringify(rows).includes('fixture@example.test'), false);
}));

test('Playwright-only campaign reuses fixtures and cleanup, records prior Data API evidence, and verifies zero inventory/outbox', async () => withRoot(async root => {
  const calls = [];
  const result = await runHostedU03Campaign({
    root, sha, runId, mode: 'playwright-only', env: secrets, preflightFn: passingPreflight,
    fixtureFactory: () => fakeFixture('matrix', calls), finalCheckFn: passingFinal,
    browserFn: async ({ runId: browserRunId, env, captureRoot }) => {
      calls.push('browser');
      assert.equal(browserRunId, runId);
      assert.equal(env.VERCEL_OIDC_TOKEN, secrets.VERCEL_OIDC_TOKEN);
      assert.ok(captureRoot.endsWith(runId));
      return { captures: ['desktop-local.png', 'mobile-local.png'] };
    },
  });
  assert.equal(result.status, 'AWAITING_VISUAL_REVIEW');
  assert.equal(result.mode, 'playwright-only');
  assert.deepEqual(calls, ['users', 'organizations', 'projects', 'browser', 'cleanup']);
  const ledger = (await readFile(result.ledgerPath, 'utf8')).trim().split('\n').map(JSON.parse);
  const matrix = ledger.filter(row => row.caseId === 'data-api-matrix');
  assert.equal(matrix.length, 1);
  assert.deepEqual({ status: matrix[0].status, cases: matrix[0].cases, reason: matrix[0].reason, evidenceRunId: matrix[0].evidenceRunId },
    { status: 'SKIP_PRIOR_EVIDENCE', cases: 12, reason: 'PRIOR_RUN_PASS', evidenceRunId: PRIOR_DATA_API_RUN_ID });
  assert.equal(ledger.some(row => row.caseId === 'data-api-matrix' && row.status === 'PASS'), false);
  assert.equal(ledger.find(row => row.caseId === 'fixture-cleanup')?.status, 'PASS');
  assert.equal(ledger.find(row => row.caseId === 'final-inventory')?.status, 'PASS');
  assert.equal(ledger.find(row => row.caseId === 'outbox-final')?.status, 'PASS');
  assert.equal(ledger.find(row => row.caseId === 'browser-b4')?.captures, 2);
  for (const secret of Object.values(secrets)) assert.equal(JSON.stringify(ledger).includes(secret), false);
}));

test('Playwright-only browser failure still cleans fixtures and checks the final outbox', async () => withRoot(async root => {
  const calls = [];
  const result = await runHostedU03Campaign({
    root, sha, runId, mode: 'playwright-only', env: secrets, preflightFn: passingPreflight,
    fixtureFactory: () => fakeFixture('matrix', calls),
    browserFn: async () => { calls.push('browser'); throw new Error('synthetic browser failure'); },
    finalCheckFn: passingFinal,
  });
  assert.equal(result.status, 'FAIL_CLEANED');
  assert.deepEqual(calls, ['users', 'organizations', 'projects', 'browser', 'cleanup']);
  const ledger = await readFile(result.ledgerPath, 'utf8');
  assert.match(ledger, /"caseId":"data-api-matrix","status":"SKIP_PRIOR_EVIDENCE"/);
  assert.match(ledger, /"caseId":"fixture-cleanup","status":"PASS"/);
  assert.match(ledger, /"caseId":"outbox-final","status":"PASS"/);
  for (const secret of Object.values(secrets)) assert.equal(ledger.includes(secret), false);
}));

test('Playwright-only cannot complete when final outbox is nonzero', async () => withRoot(async root => {
  const calls = [];
  const result = await runHostedU03Campaign({
    root, sha, runId, mode: 'playwright-only', env: secrets, preflightFn: passingPreflight,
    fixtureFactory: () => fakeFixture('matrix', calls),
    browserFn: async () => { calls.push('browser'); return { captures: [] }; },
    finalCheckFn: async () => {
      const final = await passingFinal();
      return { ...final, outboxClear: false, state: { ...final.state, outbox_total: 1, pending_outbox: 1 } };
    },
  });
  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(calls, ['users', 'organizations', 'projects', 'browser', 'cleanup']);
  const ledger = await readFile(result.ledgerPath, 'utf8');
  assert.match(ledger, /"caseId":"outbox-final","status":"FAIL"/);
  assert.match(ledger, /"caseId":"campaign-global","status":"BLOCKED"/);
}));

test('directed withdrawal blocks before fixtures without a scoped receipt credential', async () => withRoot(async root => {
  let fixtureCalls = 0;
  const result = await runHostedU03Campaign({
    root, sha, runId, mode: 'membership-revocation', env: secrets, preflightFn: passingPreflight,
    receiptProcessorFn: async () => { throw new Error('V4_CREDENTIAL_MISSING'); },
    fixtureFactory: () => { fixtureCalls++; throw new Error('fixture must remain uncreated'); }, finalCheckFn: passingFinal,
    browserFn: async () => { throw new Error('browser must remain skipped'); },
  });
  assert.equal(result.status, 'BLOCKED_NO_WRITES');
  assert.equal(fixtureCalls, 0);
  const ledger = (await readFile(result.ledgerPath, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(ledger.find(row => row.caseId === 'campaign-error')?.code, 'V4_CREDENTIAL_MISSING');
  assert.equal(ledger.some(row => row.caseId.startsWith('fixture-')), false);
  assert.equal(ledger.find(row => row.caseId === 'final-inventory')?.invitations, 0);
  assert.equal(ledger.find(row => row.caseId === 'outbox-final')?.status, 'PASS');
  for (const secret of Object.values(secrets)) assert.equal(JSON.stringify(ledger).includes(secret), false);
}));

test('directed V-4 signs one receipt and verifies final zero without rerunning matrix or browser', async () => withRoot(async root => {
  const calls = [];
  const receiptId = '11111111-1111-4111-8111-111111111111';
  const projectId = '22222222-2222-4222-8222-222222222222';
  const result = await runHostedU03Campaign({
    root, sha, runId, mode: 'membership-revocation', env: secrets, preflightFn: passingPreflight,
    receiptProcessorFn: async () => ({
      process: async (receipt, project) => { assert.deepEqual([receipt, project], [receiptId, projectId]); calls.push('sign'); },
      pendingForProject: async project => { assert.equal(project, projectId); calls.push('reconcile'); return []; },
      close: async () => calls.push('close'),
    }),
    fixtureFactory: () => ({ namespace: 'u03-v4-test',
      createRevocationFixtures: async () => { calls.push('fixtures'); return { a1: projectId }; },
      runMembershipRevocation: async () => { calls.push('withdraw'); return { passed: true, receiptId }; },
      snapshot: () => ({ projectIds: [projectId] }),
      cleanup: async () => { calls.push('cleanup'); return { ok: true, projectIds: [projectId] }; },
    }),
    browserFn: async () => { throw new Error('B4 must be skipped'); }, finalCheckFn: passingFinal,
  });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(calls, ['fixtures', 'withdraw', 'sign', 'reconcile', 'cleanup', 'close']);
  const ledger = await readFile(result.ledgerPath, 'utf8');
  assert.match(ledger, /"caseId":"withdrawal-receipt","status":"PASS"/);
  assert.match(ledger, /"caseId":"data-api-matrix","status":"SKIP_PRIOR_EVIDENCE"/);
  assert.match(ledger, /"caseId":"browser-b4","status":"SKIP_PRIOR_EVIDENCE"/);
  assert.doesNotMatch(ledger, /"caseId":"data-api-matrix","status":"PASS"|"caseId":"browser-b4","status":"PASS"/);
  for (const secret of Object.values(secrets)) assert.equal(ledger.includes(secret), false);
}));

test('directed V-4 reconciles a lost withdrawal reply before cleanup', async () => withRoot(async root => {
  const calls = [];
  const projectId = '22222222-2222-4222-8222-222222222222';
  const receiptId = '11111111-1111-4111-8111-111111111111';
  const result = await runHostedU03Campaign({
    root, sha, runId, mode: 'membership-revocation', env: secrets, preflightFn: passingPreflight,
    receiptProcessorFn: async () => ({
      pendingForProject: async () => { calls.push('find-receipt'); return [receiptId]; },
      process: async () => { calls.push('sign'); }, close: async () => calls.push('close'),
    }),
    fixtureFactory: () => ({ namespace: 'u03-v4-test',
      createRevocationFixtures: async () => ({ a1: projectId }),
      runMembershipRevocation: async () => { throw new Error('REVOCATION_ACCESS_NOT_DENIED'); },
      snapshot: () => ({ projectIds: [projectId] }),
      cleanup: async () => { calls.push('cleanup'); return { ok: true, projectIds: [projectId] }; },
    }), finalCheckFn: passingFinal,
  });
  assert.equal(result.status, 'FAIL_CLEANED');
  assert.deepEqual(calls, ['find-receipt', 'sign', 'cleanup', 'close']);
  const ledger = await readFile(result.ledgerPath, 'utf8');
  assert.match(ledger, /"caseId":"withdrawal-receipt-reconcile","status":"PASS"/);
  assert.match(ledger, /"caseId":"data-api-matrix","status":"SKIP_PRIOR_EVIDENCE"/);
  assert.match(ledger, /"caseId":"browser-b4","status":"SKIP_PRIOR_EVIDENCE"/);
}));

test('filtered child environment omits Preview keys, credentials and OIDC', () => {
  const filtered = chromiumEnvironment({ PATH: 'C:\\Windows', VERCEL_OIDC_TOKEN: secrets.VERCEL_OIDC_TOKEN, U03_PREVIEW_ADMIN_KEY: secrets.U03_PREVIEW_ADMIN_KEY, U03_B4_A_PASSWORD: 'fictional-password' });
  assert.deepEqual(filtered, { PATH: 'C:\\Windows' });
});

test('network child environment retains authorized proxy routing without passing credentials to Chromium', () => {
  const fakeProxy = 'http://proxy-user:proxy-password@127.0.0.1:8899';
  const source = { PATH: 'C:\\Windows', HTTPS_PROXY: fakeProxy, NO_PROXY: 'localhost', NODE_USE_ENV_PROXY: '1', NODE_USE_SYSTEM_CA: '1', VERCEL_OIDC_TOKEN: secrets.VERCEL_OIDC_TOKEN, U03_PREVIEW_ADMIN_KEY: secrets.U03_PREVIEW_ADMIN_KEY };
  const network = networkEnvironment(source);
  assert.equal(network.HTTPS_PROXY, fakeProxy);
  assert.equal(network.NO_PROXY, 'localhost');
  assert.equal(network.NODE_USE_ENV_PROXY, '1');
  assert.equal(network.NODE_USE_SYSTEM_CA, '1');
  assert.equal(network.VERCEL_OIDC_TOKEN, undefined);
  assert.equal(network.U03_PREVIEW_ADMIN_KEY, undefined);
  assert.equal(chromiumEnvironment(source).HTTPS_PROXY, undefined);
  assert.equal(JSON.stringify({ networkKeys: Object.keys(network), browserKeys: Object.keys(chromiumEnvironment(source)) }).includes('proxy-password'), false);
});

test('Auth settings failures are classified without retaining response or transport text', async () => {
  const fakeKey = secrets.U03_PREVIEW_PUBLIC_KEY;
  const failure = async error => {
    await assert.rejects(readPreviewAuthSettings({ apiKey: fakeKey, fetchImpl: async () => { throw error; } }), safeCode => {
      assert.match(safeCode.message, /^AUTH_SETTINGS_(DNS|TLS|TIMEOUT|HTTP)$/);
      assert.equal(safeCode.message.includes(fakeKey), false);
      assert.equal(safeCode.message.includes('proxy-user'), false);
      return true;
    });
  };
  await failure(Object.assign(new TypeError('private proxy URL and credentials'), { cause: { code: 'ENOTFOUND' } }));
  await failure(Object.assign(new TypeError('private TLS detail'), { cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID' } }));
  await failure(Object.assign(new TypeError('private timeout detail'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }));
  await failure(Object.assign(new TypeError('private transport detail'), { cause: { code: 'ECONNRESET' } }));

  for (const status of [401, 403]) {
    await assert.rejects(readPreviewAuthSettings({ apiKey: fakeKey, fetchImpl: async () => new Response('private body', { status }) }), error => {
      assert.equal(error.message, 'AUTH_SETTINGS_HTTP');
      assert.equal(error.httpStatus, status);
      return true;
    });
  }
  await assert.rejects(readPreviewAuthSettings({ apiKey: fakeKey, fetchImpl: async () => new Response('private not-json', { status: 200, headers: { 'content-type': 'application/json' } }) }), error => error.message === 'AUTH_SETTINGS_JSON');
});

test('Auth settings accepts HTTP 200 and keeps only status plus parsed settings', async () => {
  let calls = 0;
  const result = await readPreviewAuthSettings({ apiKey: secrets.U03_PREVIEW_PUBLIC_KEY, fetchImpl: async (_url, init) => {
    calls++;
    assert.equal(init.headers.apikey, secrets.U03_PREVIEW_PUBLIC_KEY);
    return new Response(JSON.stringify({ disable_signup: true }), { status: 200 });
  } });
  assert.deepEqual(result, { settings: { disable_signup: true }, httpStatus: 200 });
  assert.equal(calls, 1);
});

test('incompatible key formats are rejected before deployment or Auth requests', async () => {
  let deploymentCalls = 0, fetchCalls = 0;
  await assert.rejects(verifyInitialPreviewState({
    env: { ...secrets, U03_PREVIEW_ADMIN_KEY: secrets.U03_PREVIEW_PUBLIC_KEY },
    preflightFn: async () => { deploymentCalls++; return {}; },
    fetchImpl: async () => { fetchCalls++; return new Response('{}', { status: 200 }); },
  }), error => error.message === 'SUPABASE_KEY_FORMAT_REJECTED' &&
    error.adminKeyFormat === 'sb_publishable_' && error.publicKeyFormat === 'sb_publishable_');
  assert.deepEqual([deploymentCalls, fetchCalls], [0, 0]);
});

test('credential preflight rejects another project identity and invalid Admin key before writes', async () => {
  const noWritePreflight = async () => ({ deploymentId: PIN.deploymentId, sha: PIN.sha, host: PIN.host });
  let wrongIdentityAdminCalls = 0, wrongIdentitySqlCalls = 0;
  await assert.rejects(verifyInitialPreviewState({
    env: secrets,
    preflightFn: noWritePreflight,
    fetchImpl: async () => new Response(JSON.stringify({ disable_signup: true }), { status: 200 }),
    publicClient: { rpc: async () => ({ data: [{ environment: 'preview', project_ref: 'another-preview-ref' }], error: null }) },
    admin: { auth: { admin: { listUsers: async () => { wrongIdentityAdminCalls++; return { data: { users: [] }, error: null }; } } } },
    sql: async () => { wrongIdentitySqlCalls++; throw new Error('unexpected SQL'); },
  }), error => error.message === 'PREVIEW_IDENTITY_INVALID');
  assert.deepEqual([wrongIdentityAdminCalls, wrongIdentitySqlCalls], [0, 0]);

  let correctIdentityCalls = 0, invalidAdminSqlCalls = 0;
  await assert.rejects(verifyInitialPreviewState({
    env: secrets,
    preflightFn: noWritePreflight,
    fetchImpl: async () => new Response(JSON.stringify({ disable_signup: true }), { status: 200 }),
    publicClient: { rpc: async () => { correctIdentityCalls++; return { data: [{ environment: 'preview', project_ref: PIN.supabaseRef }], error: null }; } },
    admin: { auth: { admin: { listUsers: async () => ({ data: null, error: new Error('invalid synthetic key') }) } } },
    sql: async () => { invalidAdminSqlCalls++; throw new Error('unexpected SQL'); },
  }), error => error.message === 'PREVIEW_ADMIN_KEY_INVALID');
  assert.deepEqual([correctIdentityCalls, invalidAdminSqlCalls], [1, 0]);
});

for (const [label, responseFor, http] of [
  ['401', async () => new Response('private body', { status: 401 }), 401],
  ['403', async () => new Response('private body', { status: 403 }), 403],
  ['transport', async () => { throw Object.assign(new TypeError('private transport credentials'), { cause: { code: 'ECONNRESET' } }); }, null],
]) {
  test(`Auth settings ${label} failure records safe diagnosis and creates no fixtures`, async () => withRoot(async root => {
    let fixtureCalls = 0, authCalls = 0;
    const result = await runHostedU03Campaign({
      root, sha, runId, env: secrets,
      preflightFn: ({ env }) => verifyInitialPreviewState({
        env, preflightFn: async () => ({ deploymentId: PIN.deploymentId }),
        fetchImpl: async () => { authCalls++; return responseFor(); },
      }),
      fixtureFactory: () => { fixtureCalls++; throw new Error('fixture must not be created'); },
    });
    assert.equal(result.status, 'BLOCKED_NO_WRITES');
    assert.equal(authCalls, 1);
    assert.equal(fixtureCalls, 0);
    const ledger = await readFile(result.ledgerPath, 'utf8');
    const errorRow = JSON.parse(ledger.split('\n').find(line => line.includes('"caseId":"campaign-error"')));
    assert.equal(errorRow.http, http);
    assert.equal(errorRow.adminKeyFormat, 'sb_secret_');
    assert.equal(errorRow.publicKeyFormat, 'sb_publishable_');
    for (const key of Object.values(secrets)) assert.equal(ledger.includes(key), false);
    assert.equal(ledger.includes('private body'), false);
    assert.equal(ledger.includes('private transport credentials'), false);
  }));
}

test('HTTP 200 and key-format categories reach the ledger after a successful preflight', async () => withRoot(async root => {
  const events = [];
  const fixture = {
    namespace: 'u03-local-only', createUsers: async () => {},
    createOrganizations: async () => ({ orgA: 'org-a', orgB: 'org-b' }),
    createProjects: async () => ({ a1: 'a1', a2: 'a2', b1: 'b1' }),
    runMatrix: async () => {}, browserInputs: () => ({}), cleanup: async () => ({ ok: true }),
  };
  const result = await runHostedU03Campaign({
    root, sha, runId, env: secrets,
    ledger: async (caseId, status, detail = {}) => events.push({ caseId, status, ...detail }),
    preflightFn: async () => {
      const verified = await passingPreflight();
      return { ...verified, initial: { ...verified.initial, authSettingsHttpStatus: 200 } };
    },
    fixtureFactory: () => fixture,
    browserFn: async () => ({ captures: [] }), finalCheckFn: passingFinal,
  });
  assert.equal(result.status, 'AWAITING_VISUAL_REVIEW');
  assert.deepEqual(events.find(event => event.caseId === 'key-format'), {
    caseId: 'key-format', status: 'CLASSIFIED', adminKeyFormat: 'sb_secret_', publicKeyFormat: 'sb_publishable_',
  });
  assert.equal(events.find(event => event.caseId === 'preflight').http, 200);
}));

test('Supabase CLI parser accepts observed envelope and row-array shapes, ignoring startup text', () => {
  const row = { environment: 'preview', project_ref: PIN.supabaseRef };
  assert.deepEqual(parseCliJson(`Initialising login role...\n${JSON.stringify({ boundary: 'marker', rows: [row], warning: 'untrusted data' })}`), row);
  assert.deepEqual(parseCliJson(`INFO: CLI initialized\n${JSON.stringify([row])}`), row);
  assert.throws(() => parseCliJson('private CLI output without JSON'), error => error.message === 'SUPABASE_SQL_JSON');
  assert.throws(() => parseCliJson(JSON.stringify({ rows: [] })), error => error.message === 'SUPABASE_SQL_JSON');
});

test('read-only SQL uses pinned ref, --output json and --file, then removes its temporary SQL file', async () => withRoot(async root => {
  const tempRoot = join(root, 'temp');
  await mkdir(tempRoot);
  const expectedSql = 'select 1 as safe_read_only';
  const row = { environment: 'preview', project_ref: PIN.supabaseRef };
  const value = await runPreviewReadOnlySql(expectedSql, {
    cli: 'fictional-npx.cmd', tempRoot,
    exec: async (cli, args, options) => {
      assert.equal(cli, 'fictional-npx.cmd');
      assert.equal(args[args.indexOf('--project-ref') + 1], PIN.supabaseRef);
      assert.equal(args[args.indexOf('--output') + 1], 'json');
      assert.equal(args[args.indexOf('--file') + 1].endsWith('query.sql'), true);
      assert.equal(await readFile(args[args.indexOf('--file') + 1], 'utf8'), expectedSql);
      assert.equal(options.env.U03_PREVIEW_ADMIN_KEY, undefined);
      assert.equal(options.env.U03_PREVIEW_PUBLIC_KEY, undefined);
      return { stdout: `Initialising login role...\n${JSON.stringify([row])}` };
    },
  });
  assert.deepEqual(value, row);
  assert.deepEqual(await readdir(tempRoot), []);
  await assert.rejects(runPreviewReadOnlySql('update public.projects set name = name', { cli: 'fictional-npx.cmd' }), error => error.message === 'SUPABASE_READ_ONLY_SQL_REJECTED');
  await assert.rejects(runPreviewReadOnlySql('select 1', { cli: 'fictional-npx.cmd', ref: 'not-preview' }), error => error.message === 'SUPABASE_PROJECT_REF_REJECTED');
}));

test('no-key read-only preflight verifies identity, 27 migrations, empty counts and final inventory', async () => {
  const state = {
    auth_users: 0, organizations: 0, projects: 0, organization_members: 0, project_members: 0,
    invitations: 0, audit_events: 0, provider_results: 0, imports: 0, audit_idempotency: 0, outbox_total: 0, pending_outbox: 0, openseo_project_jobs: 0, openseo_project_connections: 0, webmaster_properties: 0, provider_budgets: 0, provider_spend: 0, openseo_google_properties: 0, google_captures: 0, writer_locked: true, window_writer_present: false, window_policy_residue: 0, writer_sessions: 0, admin_can_manage_roles: true, admin_can_terminate_sessions: true, receipt_writer_present: false, receipt_writer_executable_functions: [], receipt_writer_security_definers: [],
    environment: 'preview', project_ref: PIN.supabaseRef,
    migrations: [
      '20260928120000', '20260928150000', '20261007120000', '20261007150000', '20261009071705',
      '20261009120000', '20261009150000', '20261009170000', '20261009180000', '20261010090000',
      '20261010150000', '20261010160000', '20261012090000', '20261012100000', '20261012110000',
      '20261012120000', '20261012130000', '20261015115750', '20261015145025', '20261015170000',
      '20261015171000', '20261015172000', '20261015180000', '20261015183000', '20261015190000',
      '20261015201500', '20261015210000',
    ],
  };
  let sqlCalls = 0;
  const sql = async (_query, { ref }) => { assert.equal(ref, PIN.supabaseRef); sqlCalls++; return state; };
  const result = await runReadOnlyPreflight({ token: 'fictional-oidc-in-memory', inspect: async () => ({ ok: true }), sql, preflightFn: async ({ token }) => { assert.equal(token, 'fictional-oidc-in-memory'); return { deploymentId: PIN.deploymentId }; } });
  assert.equal(result.initial.projectRef, PIN.supabaseRef);
  assert.equal(result.initial.migrationCount, 27);
  assert.equal(result.initial.latestMigration, '20261015210000');
  assert.equal(sqlCalls, 1);
  assert.equal((await verifyReadOnlyPreviewState({ sql })).migrationCount, 27);
  const final = await verifyFinalPreviewState({ sql });
  assert.equal(final.inventoriesClear && final.outboxClear && final.capabilitiesSafe, true);
});

test('preflight SQL selects every required inventory count and missing result columns have a schema error', async () => {
  for (const field of ['provider_results', 'imports', 'audit_idempotency']) {
    assert.match(PREFLIGHT_SQL, new RegExp(`count\\(\\*\\)::int from (?:public|private)\\.${field}\\) as ${field}`));
  }
  const state = {
    auth_users: 0, organizations: 0, projects: 0, organization_members: 0, project_members: 0,
    invitations: 0, audit_events: 0, provider_results: 0, imports: 0, audit_idempotency: 0,
    outbox_total: 0, pending_outbox: 0, openseo_project_jobs: 0, openseo_project_connections: 0,
    webmaster_properties: 0, provider_budgets: 0, provider_spend: 0, openseo_google_properties: 0,
    google_captures: 0, writer_locked: true, window_writer_present: false, window_policy_residue: 0,
    writer_sessions: 0, admin_can_manage_roles: true, admin_can_terminate_sessions: true,
    receipt_writer_present: false, receipt_writer_executable_functions: [], receipt_writer_security_definers: [],
    environment: 'preview', project_ref: PIN.supabaseRef,
    migrations: ['20260928120000', '20260928150000', '20261007120000', '20261007150000', '20261009071705',
      '20261009120000', '20261009150000', '20261009170000', '20261009180000', '20261010090000',
      '20261010150000', '20261010160000', '20261012090000', '20261012100000', '20261012110000',
      '20261012120000', '20261012130000', '20261015115750', '20261015145025', '20261015170000',
      '20261015171000', '20261015172000', '20261015180000', '20261015183000', '20261015190000',
      '20261015201500', '20261015210000'],
  };
  assert.deepEqual(PREFLIGHT_RESULT_FIELDS.filter(field => !Object.hasOwn(state, field)), []);
  delete state.provider_results;
  await assert.rejects(verifyReadOnlyPreviewState({ sql: async () => state }),
    error => error.message === 'PREVIEW_READ_ONLY_RESULT_SCHEMA_INCOMPLETE');
  state.provider_results = 1;
  await assert.rejects(verifyReadOnlyPreviewState({ sql: async () => state }),
    error => error.message === 'PREVIEW_INITIAL_INVENTORY_NOT_EMPTY');
});

test('final inventory gate counts populated result/import/idempotency surfaces and requires window rollback', async () => {
  const state = { auth_users: 0, organizations: 0, projects: 0, organization_members: 0, project_members: 0,
    invitations: 0, audit_events: 0, provider_results: 0, imports: 0, audit_idempotency: 0,
    outbox_total: 0, pending_outbox: 0, openseo_project_jobs: 0, openseo_project_connections: 0,
    webmaster_properties: 0, provider_budgets: 0, provider_spend: 0, openseo_google_properties: 0,
    google_captures: 0, window_writer_present: false, window_policy_residue: 0, writer_sessions: 0,
    writer_locked: true, environment: 'preview', project_ref: PIN.supabaseRef };
  const sql = async () => state;
  assert.equal((await verifyFinalPreviewState({ sql })).inventoriesClear, true);
  state.provider_results = 1;
  assert.equal((await verifyFinalPreviewState({ sql })).inventoriesClear, false);
  state.provider_results = 0;
  state.imports = 1;
  assert.equal((await verifyFinalPreviewState({ sql })).inventoriesClear, false);
  state.imports = 0;
  delete state.audit_idempotency;
  assert.equal((await verifyFinalPreviewState({ sql })).inventoriesClear, false);
  state.audit_idempotency = 0;
  state.window_writer_present = true;
  state.window_policy_residue = 4;
  assert.equal((await verifyFinalPreviewState({ sql, allowTemporaryWindowCapability: true })).capabilitiesSafe, true);
  assert.equal((await verifyFinalPreviewState({ sql })).capabilitiesSafe, false);
});

test('read-only campaign preflight fails on an extra executable receipt-writer SECURITY DEFINER', async () => {
  const unsafe = async () => ({
    auth_users: 0, organizations: 0, projects: 0, organization_members: 0, project_members: 0,
    invitations: 0, audit_events: 0, provider_results: 0, imports: 0, audit_idempotency: 0, outbox_total: 0, pending_outbox: 0, openseo_project_jobs: 0, openseo_project_connections: 0, webmaster_properties: 0, provider_budgets: 0, provider_spend: 0, openseo_google_properties: 0, google_captures: 0, writer_locked: true, window_writer_present: false, window_policy_residue: 0, writer_sessions: 0, admin_can_manage_roles: true, admin_can_terminate_sessions: true, receipt_writer_present: true, receipt_writer_executable_functions: [...V4_SECURITY_DEFINER_ALLOWLIST, 'public.unapproved_definer()'],
    environment: 'preview', project_ref: PIN.supabaseRef,
    migrations: ['20260928120000', '20260928150000', '20261007120000', '20261007150000', '20261009071705',
      '20261009120000', '20261009150000', '20261009170000', '20261009180000', '20261010090000',
      '20261010150000', '20261010160000', '20261012090000', '20261012100000', '20261012110000',
      '20261012120000', '20261012130000', '20261015115750', '20261015145025', '20261015170000',
      '20261015171000', '20261015172000', '20261015180000', '20261015183000', '20261015190000',
      '20261015201500', '20261015210000'],
    receipt_writer_present: true,
    receipt_writer_executable_functions: [...V4_SECURITY_DEFINER_ALLOWLIST, 'public.unapproved_definer()'],
    receipt_writer_security_definers: [...V4_SECURITY_DEFINER_ALLOWLIST, 'public.unapproved_definer()'],
  });
  await assert.rejects(verifyReadOnlyPreviewState({ sql: unsafe }), /PREVIEW_RECEIPT_SECURITY_DEFINER_UNSAFE/);
});

test('initial preflight completes with the mapped read-only state and reports migration metadata', async () => {
  const migrationVersions = [
    '20260928120000', '20260928150000', '20261007120000', '20261007150000', '20261009071705',
    '20261009120000', '20261009150000', '20261009170000', '20261009180000', '20261010090000',
    '20261010150000', '20261010160000', '20261012090000', '20261012100000', '20261012110000',
    '20261012120000', '20261012130000', '20261015115750', '20261015145025', '20261015170000',
    '20261015171000', '20261015172000', '20261015180000', '20261015183000', '20261015190000',
    '20261015201500', '20261015210000',
  ];
  let settingsRead = 0, identityRead = 0, usersRead = 0, sqlRead = 0;
  const result = await verifyInitialPreviewState({
    env: { ...secrets, VERCEL_OIDC_TOKEN: secrets.VERCEL_OIDC_TOKEN },
    preflightFn: async ({ token }) => { assert.equal(token, secrets.VERCEL_OIDC_TOKEN); return { deploymentId: PIN.deploymentId }; },
    fetchImpl: async () => { settingsRead++; return new Response(JSON.stringify({ disable_signup: true }), { status: 200 }); },
    publicClient: { rpc: async () => { identityRead++; return { data: [{ environment: 'preview', project_ref: PIN.supabaseRef }], error: null }; } },
    admin: { auth: { admin: { listUsers: async () => { usersRead++; return { data: { users: [] }, error: null }; } } } },
    sql: async (_query, { ref }) => {
      sqlRead++;
      assert.equal(ref, PIN.supabaseRef);
      return {
        auth_users: 0, organizations: 0, projects: 0, organization_members: 0, project_members: 0,
        invitations: 0, audit_events: 0, provider_results: 0, imports: 0, audit_idempotency: 0, outbox_total: 0, pending_outbox: 0, openseo_project_jobs: 0, openseo_project_connections: 0, webmaster_properties: 0, provider_budgets: 0, provider_spend: 0, openseo_google_properties: 0, google_captures: 0, writer_locked: true, window_writer_present: false, window_policy_residue: 0, writer_sessions: 0, admin_can_manage_roles: true, admin_can_terminate_sessions: true, receipt_writer_present: false, receipt_writer_executable_functions: [], receipt_writer_security_definers: [],
        environment: 'preview', project_ref: PIN.supabaseRef, migrations: migrationVersions,
      };
    },
  });
  assert.deepEqual(result.initial, {
    authUsers: 0, organizations: 0, projects: 0, organizationMembers: 0, projectMembers: 0, invitations: 0,
    auditEvents: 0, providerResults: 0, imports: 0, auditIdempotency: 0, outboxTotal: 0, pendingOutbox: 0, migrationCount: 27,
    latestMigration: '20261015210000', writerLocked: true, environment: 'preview', projectRef: PIN.supabaseRef,
    authSettingsHttpStatus: 200,
  });
  assert.deepEqual([settingsRead, identityRead, usersRead, sqlRead], [1, 1, 1, 1]);
});

test('directed window campaign proves runtime before fixtures and never repeats prior matrix or B-4', async () => {
  const events = [];
  const runId = 'c14f4c11-570f-4e03-a3a1-33a702b85baa';
  const env = { U03_PREVIEW_ADMIN_KEY: 'sb_secret_fictional', U03_PREVIEW_PUBLIC_KEY: 'sb_publishable_fictional',
    U03_PREVIEW_WRITER_WINDOW: 'armed-run-capability', U03_PREVIEW_WRITER_WINDOW_RUN_ID: runId };
  const fixtures = { namespace: `u03-${runId.replaceAll('-','').slice(0,12)}`,
    createUsers: async () => events.push('users'), createOrganizations: async () => { events.push('organizations'); return {}; },
    createProjects: async () => { events.push('projects'); return { a1: 'fictional-project-id' }; },
    actorBearer: async () => ({ accessToken: 'fictional-token' }),
    cleanup: async () => ({ ok: true }), snapshot: () => ({ projectIds: [] }) };
  const verified = { vercel: { deploymentId: PIN.deploymentId, sha: PIN.sha, host: PIN.host },
    initial: { projectRef: PIN.supabaseRef, authSettingsHttpStatus: 200 } };
  const result = await runHostedU03Campaign({ env, sha: PIN.sha, runId, mode: 'window-i2-i5',
    preflightFn: async () => verified, fixtureFactory: () => { events.push('fixture-factory'); return fixtures; },
    runtimePreflightFn: async () => { events.push('runtime'); return { passed: true, status: 200 }; },
    windowSurfacesFn: async () => { events.push('surfaces'); return { passed: true }; },
    windowCleanupFn: async () => { events.push('window-cleanup'); return true; },
    finalCheckFn: async ({ allowTemporaryWindowCapability }) => { events.push(`final:${allowTemporaryWindowCapability}`);
      return { inventoriesClear: true, outboxClear: true, capabilitiesSafe: true, state: { writer_locked: true,
        environment: 'preview', project_ref: PIN.supabaseRef, auth_users: 0, organizations: 0, projects: 0,
        organization_members: 0, project_members: 0, invitations: 0, audit_events: 0, outbox_total: 0, pending_outbox: 0 } }; },
    ledger: async () => {}, root: process.cwd() });
  assert.equal(result.status, 'PASS');
  assert.ok(events.indexOf('runtime') < events.indexOf('fixture-factory'));
  assert.deepEqual(events.slice(-3), ['surfaces','window-cleanup','final:true']);
  assert.equal(events.includes('matrix'), false);
  assert.equal(events.includes('browser'), false);
});

test('directed window never deletes projects when product receipt reconciliation fails', async () => {
  const events = [];
  const runId = 'c14f4c11-570f-4e03-a3a1-33a702b85baa';
  const env = { U03_PREVIEW_ADMIN_KEY: 'sb_secret_fictional', U03_PREVIEW_PUBLIC_KEY: 'sb_publishable_fictional',
    U03_PREVIEW_WRITER_WINDOW: 'armed-run-capability', U03_PREVIEW_WRITER_WINDOW_RUN_ID: runId };
  const fixtures = { namespace: `u03-${runId.replaceAll('-','').slice(0,12)}`,
    createUsers: async () => {}, createOrganizations: async () => ({}), createProjects: async () => ({}),
    cleanup: async () => { events.push('fixture-cleanup'); return { ok: true }; }, snapshot: () => ({ projectIds: [] }) };
  const verified = { vercel: { deploymentId: PIN.deploymentId, sha: PIN.sha, host: PIN.host },
    initial: { projectRef: PIN.supabaseRef, authSettingsHttpStatus: 200 } };
  const result = await runHostedU03Campaign({ env, sha: PIN.sha, runId, mode: 'window-i2-i5',
    preflightFn: async () => verified, fixtureFactory: () => fixtures,
    runtimePreflightFn: async () => ({ passed: true, status: 200 }), windowSurfacesFn: async () => ({ passed: true }),
    windowCleanupFn: async () => { events.push('receipt-cleanup'); throw new Error('WINDOW_RECEIPT_RECONCILIATION_FAILED'); },
    finalCheckFn: async () => ({ inventoriesClear: false, outboxClear: false, capabilitiesSafe: true, state: {} }),
    ledger: async () => {}, root: process.cwd() });
  assert.equal(result.status, 'FAIL_CLEANUP_PARTIAL');
  assert.deepEqual(events, ['receipt-cleanup']);
  assert.equal(result.cleanupResult?.ok, false);
});

test('owner wrapper runs no-key preflight before DPAPI load; V-4 uses one hidden admin URL and automatic containment', async () => {
  const script = await readFile(new URL('./u03-preview-b4-owner.ps1', import.meta.url), 'utf8');
  const operator = await readFile(new URL('./u03-preview-v4-operator.mjs', import.meta.url), 'utf8');
  const preflight = script.indexOf('& node $runner --readonly-preflight');
  const credentialLoad = script.lastIndexOf('$previewCredentials = Get-B4PreviewCredentials');
  const credentialPreflight = script.indexOf('& node $runner --credential-preflight-only');
  const credentialSave = script.indexOf('Save-B4PreviewCredentials');
  const campaignPath = script.slice(credentialLoad, script.lastIndexOf('} finally'));
  assert.ok(preflight >= 0 && preflight < credentialLoad);
  assert.doesNotMatch(campaignPath, /Read-B4ClipboardSecret/);
  assert.match(campaignPath, /if \(\$MembershipRevocationOnly\) \{[\s\S]*Read-Host -Prompt[^\n]*-AsSecureString/);
  assert.ok(preflight < credentialPreflight && credentialPreflight < credentialSave);
  assert.match(script, /if \(\$ProvisionPreviewKeys -or \$ReplacePreviewKeys\)[\s\S]*--credential-preflight-only[\s\S]*Save-B4PreviewCredentials/);
  assert.match(script, /\[switch\]\$ProvisionPreviewKeys[\s\S]*\[switch\]\$CheckPreviewKeys[\s\S]*\[switch\]\$ReplacePreviewKeys[\s\S]*\[switch\]\$DeletePreviewKeys/);
  assert.match(script, /\[switch\]\$PlaywrightOnly/);
  assert.match(script, /\[switch\]\$MembershipRevocationOnly/);
  assert.match(script, /if \(\$CrossSurfaceOnly -and \$branch -ne 'codex\/u03-cross-surface-20261019'\) \{ Stop-B4 'WRONG_MODE_BRANCH' \}/);
  assert.ok(script.indexOf("Stop-B4 'WRONG_MODE_BRANCH'") < preflight);
  assert.match(campaignPath, /& node \$v4Operator --run --run-id \$operatorRunId/);
  assert.match(script, /finally\s*\{[\s\S]*& node \$v4Operator --contain --run-id \$operatorRunId/);
  assert.match(operator, /blockAndRollbackPreviewReceiptRole\(pool, runId\)/);
  assert.match(operator, /rejectUnauthorized: true, ca/);
  assert.match(operator, /\$\{RECEIPT_ROLE\}\.\$\{PREVIEW_REF\}/);
  assert.match(script, /-ExpectedPrefix 'sb_secret_'[\s\S]*-ExpectedPrefix 'sb_publishable_'/);
  assert.doesNotMatch(script, /Read-B4Secret/);
  const generalEnvironmentKeep = script.match(/\$keep = @\(([^\r\n]+)\)/)?.[1] ?? '';
  assert.doesNotMatch(generalEnvironmentKeep, /U03_PREVIEW_ADMIN_KEY|U03_PREVIEW_PUBLIC_KEY/);
  assert.match(script, /if \(\$Mode -in @\('sequence','attest','local'\)\)[\s\S]*'U03_PREVIEW_ADMIN_KEY','U03_PREVIEW_PUBLIC_KEY'/);
  assert.match(script, /finally\s*\{[\s\S]*Get-ChildItem Env:[\s\S]*U03_\*/);
  assert.match(script, /finally\s*\{[\s\S]*previewCredentials\.AdminKey = \$null[\s\S]*previewCredentials\.PublicKey = \$null/);
});

test('H1-A owner mode checks branch vars, deployment and local signing config before one password prompt and finally containment', async () => {
  const script = await readFile(new URL('./u03-preview-b4-owner.ps1', import.meta.url), 'utf8');
  const modeStart = script.indexOf('if ($WindowRolePreflightOnly -or $WindowRoleReadOnlyDiagnosticOnly -or $WindowI2I5H1A -or $WindowBatchAttestationOnly)');
  const localConfig = script.indexOf("Invoke-U03WindowRoleChild -Mode 'local'", modeStart);
  const attestation = script.indexOf("Invoke-U03WindowRoleChild -Mode 'attest'", localConfig);
  const passwordPrompt = script.indexOf('Read-Host -Prompt', localConfig);
  const sequenceLaunch = script.indexOf("$childMode = if ($WindowI2I5H1A) { 'sequence' }", passwordPrompt);
  const finallyBlock = script.slice(script.indexOf('} finally {', sequenceLaunch));
  assert.ok(modeStart >= 0 && localConfig > modeStart && attestation > localConfig && passwordPrompt > attestation && sequenceLaunch > passwordPrompt);
  assert.match(script, /if \(\$WindowI2I5H1A -and \$branch -ne 'codex\/u03-final-gates-20261020'\)/);
  assert.match(script, /WINDOW_BATCH_IDENTITY_MISMATCH/);
  assert.match(script, /\$psi\.Arguments = '--conditions=react-server/);
  assert.match(script, /\$Mode -eq 'local'[\s\S]*--local-preflight-only/);
  assert.match(finallyBlock, /\$WindowI2I5H1A[\s\S]*Invoke-U03WindowRoleChild -Mode 'contain'/);
  assert.match(script, /'RUBIK_AUDIT_DATABASE_URL','PROVENANCE_SIGNING_KEYS','PROVENANCE_ACTIVE_KEY_ID'/);
  assert.match(script, /if \(-not \$WindowRolePreflightOnly -and -not \$WindowRoleReadOnlyDiagnosticOnly -and -not \$WindowI2I5H1A/);
});
