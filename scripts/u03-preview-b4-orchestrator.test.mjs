import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromiumEnvironment, networkEnvironment, PIN } from './u03-preview-b4-runner.mjs';
import { parseCliJson, readPreviewAuthSettings, runHostedU03Campaign, runPreviewReadOnlySql, runReadOnlyPreflight, verifyFinalPreviewState, verifyReadOnlyPreviewState } from './u03-preview-b4-orchestrator.mjs';

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
  const fakeKey = 'fictional-publishable-key-never-log';
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

  await assert.rejects(readPreviewAuthSettings({ apiKey: fakeKey, fetchImpl: async () => new Response('private body', { status: 401 }) }), error => error.message === 'AUTH_SETTINGS_HTTP');
  await assert.rejects(readPreviewAuthSettings({ apiKey: fakeKey, fetchImpl: async () => new Response('private not-json', { status: 200, headers: { 'content-type': 'application/json' } }) }), error => error.message === 'AUTH_SETTINGS_JSON');
});

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
    audit_events: 0, outbox_total: 0, pending_outbox: 0, writer_locked: true,
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

test('owner wrapper performs no-key preflight before prompting and always cleans environment in finally', async () => {
  const script = await readFile(new URL('./u03-preview-b4-owner.ps1', import.meta.url), 'utf8');
  assert.ok(script.indexOf('--readonly-preflight') < script.indexOf("Read-B4Secret 'Supabase Preview Admin/Auth key"));
  assert.ok(script.indexOf('--readonly-preflight') < script.indexOf("Read-B4Secret 'Supabase Preview publishable key"));
  assert.ok(script.indexOf('if ($ReadOnlyPreflightOnly) { return }') < script.indexOf("Read-B4Secret 'Supabase Preview Admin/Auth key"));
  assert.match(script, /finally\s*\{[\s\S]*Get-ChildItem Env:[\s\S]*U03_\*/);
});
