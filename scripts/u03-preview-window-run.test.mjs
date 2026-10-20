import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createWindowLedger, pinIsExact, runPreviewWindowSequence, validateWindowRuntimeConfiguration, verifyProtectedWindowBatch } from './u03-preview-window-run.mjs';
import { createPreviewWindowAttestation } from '../src/lib/provenance/keyring.ts';

const RUN = 'c14f4c11-570f-4e03-a3a1-33a702b85baa';
const PIN = { deploymentId: 'dpl_Fictional123', host: 'preview-fixed.example', sha: 'a'.repeat(40), branch: 'codex/u03-final-gates-20261020' };
const ROLE_URL = new URL('postgresql://placeholder@aws-1-eu-west-3.pooler.supabase.com:5432/postgres');
ROLE_URL.username = 'rubik_preview_u03_writer.rhnnplewqsekrnaousyl';
ROLE_URL.password = 'FictionalRolePassword_123456789012345678901234';
ROLE_URL.searchParams.set('options', '-c role=rubik_audit_writer');
const ENV = { U03_PIN_DEPLOYMENT_ID: PIN.deploymentId, U03_PIN_DEPLOYMENT_HOST: PIN.host,
  U03_PIN_DEPLOYMENT_SHA: PIN.sha, U03_PIN_DEPLOYMENT_BRANCH: PIN.branch, U03_FUNCTIONAL_SHA: PIN.sha,
  U03_PREVIEW_WRITER_WINDOW: 'armed-run-capability', U03_PREVIEW_WRITER_WINDOW_REF: 'rhnnplewqsekrnaousyl',
  U03_PREVIEW_WRITER_WINDOW_SHA: PIN.sha, U03_PREVIEW_WRITER_WINDOW_RUN_ID: RUN,
  U03_PREVIEW_WRITER_WINDOW_SECRET: 'fictional-only-window-secret', RUBIK_AUDIT_DATABASE_URL: ROLE_URL.toString() };
const VERIFIED = { vercel: { deploymentId: PIN.deploymentId, host: PIN.host, sha: PIN.sha, supabaseRef: 'rhnnplewqsekrnaousyl' },
  initial: { projectRef: 'rhnnplewqsekrnaousyl', migrationCount: 27, writerLocked: true, outboxTotal: 0, pendingOutbox: 0 } };
const ROLE = { runId: RUN, pooler: { clientTlsVerified: true, sessionUser: 'rubik_preview_u03_writer',
  currentUser: 'rubik_audit_writer', denyPoliciesVerified: true } };
const CLEAN = { rolePresent: false, policies: 0, activeSessions: 0, inventoryZero: true, outboxTotal: 0, pendingOutbox: 0 };

async function execute(dir, failure = null) {
  const calls = [];
  const ledgerPath = join(dir, 'run.jsonl');
  const result = await runPreviewWindowSequence({ databasePassword: 'fictional password', runId: RUN, env: ENV, pin: PIN, ledgerPath,
    configFn: async () => ({ runId: RUN }),
    preflightFn: async () => { calls.push('preflight'); if (failure === 'preflight') throw new Error('private detail'); return VERIFIED; },
    installFn: async () => { calls.push('install'); if (failure === 'install') throw Object.assign(new Error('private detail'), { code: 'INJECTED_INSTALL_FAILURE' }); return ROLE; },
    runtimeFn: async () => { calls.push('runtime'); if (failure === 'runtime') throw new Error('private detail'); return { passed: true, status: 200 }; },
    campaignFn: async () => { calls.push('campaign'); if (failure === 'campaign') return { status: 'BLOCKED', cleanupResult: { ok: false } };
      return { status: 'PASS', cleanupResult: { ok: true }, finalCheck: { inventoriesClear: true, outboxClear: true } }; },
    containFn: async () => { calls.push('contain'); if (failure === 'contain') throw new Error('private admin detail'); return CLEAN; },
  });
  return { result, calls, ledger: await readFile(ledgerPath, 'utf8') };
}

test('deployment/branch/ref/SHA/run mismatches block before role installation', () => {
  assert.equal(pinIsExact(ENV, RUN, PIN), true);
  for (const key of ['U03_PIN_DEPLOYMENT_ID','U03_PIN_DEPLOYMENT_HOST','U03_PIN_DEPLOYMENT_SHA',
    'U03_PIN_DEPLOYMENT_BRANCH','U03_FUNCTIONAL_SHA','U03_PREVIEW_WRITER_WINDOW_RUN_ID']) {
    assert.equal(pinIsExact({ ...ENV, [key]: 'wrong' }, RUN, PIN), false, key);
  }
});

test('local configuration preflight validates TLS-pooler URL shape and signing keyring before password prompt', async () => {
  const writerUrl = new URL('postgresql://placeholder@aws-1-eu-west-3.pooler.supabase.com:5432/postgres');
  writerUrl.username = 'rubik_preview_u03_writer.rhnnplewqsekrnaousyl';
  writerUrl.password = 'FictionalRolePassword_123456789012345678901234';
  writerUrl.searchParams.set('options', '-c role=rubik_audit_writer');
  const env = { ...ENV, VERCEL_OIDC_TOKEN: 'fictional-oidc-token-long-enough', RUBIK_AUDIT_DATABASE_URL: writerUrl.toString(),
    PROVENANCE_SIGNING_KEYS: 'u03-preview-window:' + Buffer.alloc(32, 4).toString('base64'),
    PROVENANCE_ACTIVE_KEY_ID: 'u03-preview-window' };
  const result = await validateWindowRuntimeConfiguration({ env, runId: RUN, pin: PIN });
  assert.equal(result.ref, 'rhnnplewqsekrnaousyl');
  assert.equal(result.sha, PIN.sha);
  await assert.rejects(validateWindowRuntimeConfiguration({ env: { ...env, RUBIK_AUDIT_DATABASE_URL: writerUrl.toString().replace('aws-1-eu-west-3', 'elsewhere') }, runId: RUN, pin: PIN }), /TEMP_ROLE_CREDENTIAL_INVALID/);
});

test('attestation compares every secret field with the fixed protected deployment before password prompt', async () => {
  const writerUrl = new URL('postgresql://rubik_preview_u03_writer.rhnnplewqsekrnaousyl:FictionalRolePassword_123456789012345678901234@aws-1-eu-west-3.pooler.supabase.com:5432/postgres?options=-c%20role%3Drubik_audit_writer');
  const env = { ...ENV, VERCEL_OIDC_TOKEN:'fictional-oidc-token-long-enough', RUBIK_AUDIT_DATABASE_URL:writerUrl.toString(),
    PROVENANCE_SIGNING_KEYS:'u03-preview-window:' + Buffer.alloc(32,7).toString('base64'), PROVENANCE_ACTIVE_KEY_ID:'u03-preview-window' };
  const nonce = Buffer.alloc(32,9).toString('base64url');
  const serverEnv = { ...env, VERCEL_ENV:'preview', VERCEL_DEPLOYMENT_ID:PIN.deploymentId,
    VERCEL_URL:PIN.host, VERCEL_GIT_COMMIT_REF:PIN.branch, VERCEL_GIT_COMMIT_SHA:PIN.sha };
  const attestation = createPreviewWindowAttestation(serverEnv,PIN.host,{runId:RUN,nonce});
  const preflightFn = async () => ({deploymentId:PIN.deploymentId,host:PIN.host,sha:PIN.sha,supabaseRef:'rhnnplewqsekrnaousyl'});
  const fetchImpl = async (url,init) => { assert.equal(url,`https://${PIN.host}/api/u03/window-challenge`); assert.equal(init.redirect,'manual'); return {status:200,headers:{get:()=>null},json:async()=>attestation}; };
  const passed = await verifyProtectedWindowBatch({env,pin:PIN,nonce,preflightFn,fetchImpl});
  assert.equal(passed.runId,RUN);
  const wrongUrl = new URL(writerUrl); wrongUrl.password = 'AnotherFictionalPassword_12345678901234567890';
  await assert.rejects(verifyProtectedWindowBatch({env:{...env,RUBIK_AUDIT_DATABASE_URL:wrongUrl.toString()},pin:PIN,nonce,preflightFn,fetchImpl}),/WINDOW_BATCH_DEPLOYMENT_MISMATCH/);
});

test('successful operator orders all gates, campaign, then independent containment', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'u03-window-sequence-pass-'));
  try {
    const { result, calls, ledger } = await execute(dir);
    assert.equal(result.status, 'PASS');
    assert.deepEqual(calls, ['preflight','install','runtime','campaign','contain']);
    assert.match(ledger, /independent-containment-and-final-read.*PASS/);
    assert.doesNotMatch(ledger, /fictional password|fictional-only-window-secret|private detail/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('every prefixture boundary blocks campaign and contains an attempted role', async () => {
  for (const failure of ['preflight','install','runtime']) {
    const dir = await mkdtemp(join(tmpdir(), 'u03-window-sequence-block-'));
    try {
      const { result, calls } = await execute(dir, failure);
      assert.equal(result.status, 'BLOCKED', failure);
      assert.equal(calls.includes('campaign'), false, failure);
      assert.equal(calls.includes('contain'), failure !== 'preflight', failure);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test('campaign failure still contains and a failed independent admin connection remains blocked', async () => {
  for (const failure of ['campaign','contain']) {
    const dir = await mkdtemp(join(tmpdir(), 'u03-window-sequence-finally-'));
    try {
      const { result, calls, ledger } = await execute(dir, failure);
      assert.equal(result.status, 'BLOCKED');
      assert.equal(calls.at(-1), 'contain');
      if (failure === 'contain') assert.match(ledger, /ADMIN_CONTAINMENT_UNVERIFIED/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test('window ledger preserves owned UUIDs for reconciliation and only numeric cleanup counters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'u03-window-owned-ledger-'));
  try {
    const path = join(dir, 'owned.jsonl');
    const ledger = await createWindowLedger(path, { runId: RUN, functionalSha: PIN.sha,
      deploymentId: PIN.deploymentId, host: PIN.host, ref: 'rhnnplewqsekrnaousyl' });
    const id = '6739e760-420f-4ad3-b2d0-9d3aa674e802';
    await ledger('fixture-created', 'PASS', { id, userIds: [id], email: 'owner@fixture.invalid', password: 'fictional-password' });
    await ledger('cleanup', 'PASS', { resultRowsErased: 1, importsErased: 1, receiptsProcessed: 1, message: 'private free text' });
    const text = await readFile(path, 'utf8');
    assert.match(text, new RegExp(id));
    assert.match(text, /"receiptsProcessed":1/);
    assert.doesNotMatch(text, /owner@fixture.invalid|fictional-password|private free text/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
