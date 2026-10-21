import { randomBytes, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { preflight } from './u03-preview-b4-runner.mjs';
import { verifyPreviewWindowAttestationProof, previewWindowAttestationContext } from '../src/lib/provenance/keyring.ts';
import { assertPreviewKeyFormats, runHostedU03Campaign, verifyInitialPreviewState, verifyProtectedWindowRuntime } from './u03-preview-b4-orchestrator.mjs';
import { PIN } from './u03-preview-b4-runner.mjs';
import { installAndProbeRunScopedRole, runIndependentContainment, previewWindowRolePassword, PREVIEW_REF } from './u03-window-role-preflight.mjs';

const SAFE = /^[A-Z][A-Z0-9_]{1,79}$/;
const SAFE_SQLSTATES = new Set(['42501','28P01','28000','57P01','0A000','42704','42710']);
const RUN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEDGER_ID_KEYS = new Set(['id','userIds','organizationIds','projectIds','resultIds','importIds','auditEventIds','receiptIds']);

const REQUIRED_CAMPAIGN_LEDGER = new Map([
  ['deployment-preflight', 'PASS'],
  ['security-definer-allowlist', 'PASS'],
  ['writer-rls', 'PASS'],
  ['install-and-probe-new-role', 'PASS'],
  ['deployment-runtime-pooler-proof', 'PASS'],
  ['fixture-user-ownera', 'CREATED'], ['auth-login-ownera', 'PASS'],
  ['fixture-user-ownerb', 'CREATED'], ['auth-login-ownerb', 'PASS'],
  ['fixture-organizations', 'CREATED'], ['fixture-projects', 'CREATED'],
  ['window-fixture-audit', 'PASS'], ['window-fixture-result', 'PASS'], ['window-fixture-import', 'PASS'],
  ['i5-populated-audit-events', 'PASS'], ['i5-populated-provider-results', 'PASS'], ['i5-populated-imports', 'PASS'],
  ['i5-populated-signed-rows', 'PASS'], ['i2-protected-routes', 'PASS'], ['window-i2-i5-populated-surfaces', 'PASS'],
  ['window-cleanup-a1', 'PASS'], ['window-cleanup-a2', 'PASS'], ['window-cleanup-b1', 'PASS'],
  ['fixture-cleanup', 'PASS'], ['final-inventory', 'PASS'], ['outbox-final', 'PASS'], ['capabilities-final', 'PASS'],
  ['directed-i2-i5-campaign', 'PASS'], ['independent-containment-and-final-read', 'PASS'],
  ['i2-final-result', 'PASS'], ['i5-final-result', 'PASS'], ['u03-sql-final-result', 'PASS'],
  ['h1a-global-result', 'NOT_RUN'], ['sequence-complete', 'PASS'],
]);

export function normalizeWindowCaseId(caseId) {
  if (typeof caseId !== 'string') throw new Error('WINDOW_LEDGER_FIELD_REJECTED');
  const normalized = caseId.toLowerCase().replaceAll('_', '-');
  if (!/^[a-z0-9-]{1,80}$/.test(normalized)) throw new Error('WINDOW_LEDGER_FIELD_REJECTED');
  return normalized;
}

const FINAL_LEDGER_CASES = new Set(['i2-final-result','i5-final-result','u03-sql-final-result','h1a-global-result','sequence-complete']);

export async function verifyWindowLedgerComplete(path, { runId, pin = PIN, includeFinal = true } = {}) {
  try {
    const text = await readFile(path, 'utf8');
    const lines = text.trim().split(/\r?\n/);
    if (!lines.length || !lines[0]) return false;
    const rows = lines.map(line => JSON.parse(line));
    if (rows.some(row => row.runId !== runId || row.functionalSha !== pin.sha ||
      row.deploymentId !== pin.deploymentId || row.host !== pin.host || row.ref !== PREVIEW_REF ||
      typeof row.caseId !== 'string' || row.caseId !== normalizeWindowCaseId(row.caseId))) return false;
    const latest = new Map(rows.map(row => [row.caseId, row.status]));
    return [...REQUIRED_CAMPAIGN_LEDGER].every(([caseId, status]) =>
      (!includeFinal && FINAL_LEDGER_CASES.has(caseId)) || latest.get(caseId) === status);
  } catch { return false; }
}

export function preflightSequencePreviewKeys({ env = process.env } = {}) {
  const adminKey = env.U03_PREVIEW_ADMIN_KEY;
  const publicKey = env.U03_PREVIEW_PUBLIC_KEY;
  if (typeof adminKey !== 'string' || !adminKey || typeof publicKey !== 'string' || !publicKey)
    throw new Error('SEQUENCE_PREVIEW_KEYS_REQUIRED');
  try { assertPreviewKeyFormats(adminKey, publicKey); }
  catch { throw new Error('SEQUENCE_PREVIEW_KEYS_FORMAT_INVALID'); }
  return true;
}

export async function createWindowLedger(path, metadata, append = appendFile) {
  await mkdir(dirname(path), { recursive: true });
  await append(path, '', { flag: 'wx', mode: 0o600 });
  return async (caseId, status, detail = {}) => {
    const normalizedCaseId = normalizeWindowCaseId(caseId);
    if (typeof status !== 'string' || !/^[A-Z_]{2,32}$/.test(status)) throw new Error('WINDOW_LEDGER_FIELD_REJECTED');
    const safe = {};
    for (const [key, value] of Object.entries(detail)) {
      if (key === 'sqlstate' && SAFE_SQLSTATES.has(value)) { safe.sqlstate = value; continue; }
      if (!['code','category','httpStatus','cases','count','restoreCount','resultRowsErased','importsErased','receiptsProcessed',
        'inventoryZero','outboxTotal','pendingOutbox','rolePresent','roleLocked','activeSessions'].includes(key)) continue;
      if (typeof value === 'string' && SAFE.test(value) || typeof value === 'number' || typeof value === 'boolean' || value === null) safe[key] = value;
    }
    for (const [key, value] of Object.entries(detail)) {
      if (!LEDGER_ID_KEYS.has(key)) continue;
      if (key === 'id' && typeof value === 'string' && UUID.test(value)) safe.id = value.toLowerCase();
      else if (Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === 'string' && UUID.test(item)))
        safe[key] = value.map(item => item.toLowerCase());
    }
    await append(path, `${JSON.stringify({ utc: new Date().toISOString(), ...metadata, caseId: normalizedCaseId, status, ...safe })}\n`, { mode: 0o600 });
  };
}

export function pinIsExact(env, runId, pin = PIN) {
  return RUN.test(runId) && pin.deploymentId.startsWith('dpl_') &&
    env.U03_PIN_DEPLOYMENT_ID === pin.deploymentId && env.U03_PIN_DEPLOYMENT_HOST === pin.host &&
    env.U03_PIN_DEPLOYMENT_SHA === pin.sha && env.U03_PIN_DEPLOYMENT_BRANCH === pin.branch &&
    pin.branch === 'codex/u03-final-gates-20261020' && /^[0-9a-f]{40}$/i.test(pin.sha) &&
    env.U03_FUNCTIONAL_SHA === pin.sha && env.U03_PREVIEW_WRITER_WINDOW === 'armed-run-capability' &&
    env.U03_PREVIEW_WRITER_WINDOW_REF === PREVIEW_REF && env.U03_PREVIEW_WRITER_WINDOW_SHA === pin.sha &&
    env.U03_PREVIEW_WRITER_WINDOW_RUN_ID === runId && !!env.U03_PREVIEW_WRITER_WINDOW_SECRET;
}

export async function validateWindowRuntimeConfiguration({ env = process.env, runId = env.U03_PREVIEW_WRITER_WINDOW_RUN_ID, pin = PIN } = {}) {
  if (!pinIsExact(env, runId, pin) || typeof env.VERCEL_OIDC_TOKEN !== 'string' || env.VERCEL_OIDC_TOKEN.length < 20)
    throw new Error('WINDOW_DEPLOYMENT_PIN_REJECTED');
  previewWindowRolePassword(env);
  const { loadKeyring } = await import('../src/lib/provenance/keyring.ts');
  const loaded = loadKeyring(env);
  if (!loaded.ok) throw new Error('WINDOW_SIGNING_KEYRING_INVALID');
  return { runId, deploymentId: pin.deploymentId, host: pin.host, sha: pin.sha, ref: PREVIEW_REF };
}

/** Verify exact protected deployment and byte-equality proofs before prompting for a DB password. */
export async function verifyProtectedWindowBatch({ env = process.env, pin = PIN, fetchImpl = fetch,
  preflightFn = preflight, nonce = randomBytes(32).toString('base64url') } = {}) {
  const runId = env.U03_PREVIEW_WRITER_WINDOW_RUN_ID;
  await validateWindowRuntimeConfiguration({ env, runId, pin });
  const deployment = await preflightFn({ token: env.VERCEL_OIDC_TOKEN, fetchImpl });
  if (deployment.deploymentId !== pin.deploymentId || deployment.host !== pin.host || deployment.sha !== pin.sha || deployment.supabaseRef !== PREVIEW_REF)
    throw new Error('WINDOW_DEPLOYMENT_PROTECTION_REJECTED');
  const origin = `https://${pin.host}`;
  let response;
  try {
    response = await fetchImpl(`${origin}/api/u03/window-challenge`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-vercel-trusted-oidc-idp-token': env.VERCEL_OIDC_TOKEN },
      body: JSON.stringify({ runId, nonce }), redirect: 'manual', signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error('WINDOW_CHALLENGE_TRANSPORT_FAILED'); }
  if (response.status !== 200 || response.headers?.get?.('location')) {
    if ((response.status >= 300 && response.status < 400) || response.headers?.get?.('location'))
      throw new Error('WINDOW_CHALLENGE_PROTECTION_REDIRECT');
    if (response.status === 401 || response.status === 403) throw new Error('WINDOW_CHALLENGE_PROTECTION_DENIED');
    if (response.status === 404) throw new Error('WINDOW_CHALLENGE_ROUTE_OR_WINDOW_NOT_READY');
    if (response.status >= 500) throw new Error('WINDOW_CHALLENGE_SERVER_ERROR');
    throw new Error('WINDOW_CHALLENGE_HTTP_REJECTED');
  }
  let proof;
  try { proof = await response.json(); } catch { throw new Error('WINDOW_CHALLENGE_RESPONSE_INVALID'); }
  const context = previewWindowAttestationContext({ runId, nonce }, pin.deploymentId, pin.host, pin.sha);
  const sameIdentity = proof?.ok === true && proof.runId === runId && proof.nonce === nonce &&
    proof.deploymentId === pin.deploymentId && proof.host === pin.host && proof.sha === pin.sha &&
    proof.ref === PREVIEW_REF && proof.branch === pin.branch && proof.databaseIdentity?.host === 'aws-1-eu-west-3.pooler.supabase.com' &&
    proof.databaseIdentity?.port === 5432 && proof.databaseIdentity?.role === 'rubik_preview_u03_writer' && proof.databaseIdentity?.ref === PREVIEW_REF;
  const matches = sameIdentity && verifyPreviewWindowAttestationProof(env.U03_PREVIEW_WRITER_WINDOW_SECRET, context, proof.proofs?.window) &&
    verifyPreviewWindowAttestationProof(env.RUBIK_AUDIT_DATABASE_URL, context, proof.proofs?.databaseUrl) &&
    verifyPreviewWindowAttestationProof(env.PROVENANCE_SIGNING_KEYS, context, proof.proofs?.signingKeys) &&
    verifyPreviewWindowAttestationProof(env.PROVENANCE_ACTIVE_KEY_ID, context, proof.proofs?.activeKeyId);
  if (!matches) throw new Error('WINDOW_BATCH_DEPLOYMENT_MISMATCH');
  return { deploymentId: pin.deploymentId, host: pin.host, sha: pin.sha, ref: PREVIEW_REF, runId };
}

/** One fail-closed owner sequence. No fixtures begin before deployment, read-only, role and runtime proofs pass. */
export async function runPreviewWindowSequence({ databasePassword, runId = randomUUID(), env = process.env,
  preflightFn = verifyInitialPreviewState, configFn = validateWindowRuntimeConfiguration,
  installFn = installAndProbeRunScopedRole, pin = PIN,
  runtimeFn = verifyProtectedWindowRuntime, campaignFn = runHostedU03Campaign,
  containFn = runIndependentContainment, ledgerPath = join(process.cwd(), 'test-results', 'u03-hosted-window', `${runId}.jsonl`),
  ledgerFactory = createWindowLedger } = {}) {
  if (typeof databasePassword !== 'string' || !databasePassword || !RUN.test(runId)) throw new Error('WINDOW_SEQUENCE_INPUT_REJECTED');
  const metadata = { runId, functionalSha: pin.sha, deploymentId: pin.deploymentId, host: pin.host, ref: PREVIEW_REF };
  const ledger = await ledgerFactory(ledgerPath, metadata);
  let verified = null;
  let installAttempted = false;
  let campaign = null;
  let containment = null;
  let failure = null;
  let dbPassword = databasePassword;
  let rolePassword = '';
  try {
    await ledger('deployment-preflight', 'ATTEMPTED');
    await configFn({ env, runId, pin });
    verified = await preflightFn({ env });
    if (verified?.vercel?.deploymentId !== pin.deploymentId || verified?.vercel?.host !== pin.host ||
        verified?.vercel?.sha !== pin.sha || verified?.vercel?.supabaseRef !== PREVIEW_REF ||
        verified?.initial?.projectRef !== PREVIEW_REF || verified?.initial?.migrationCount !== 27 ||
        verified?.initial?.writerLocked !== true || verified?.initial?.outboxTotal !== 0 ||
        verified?.initial?.pendingOutbox !== 0) throw new Error('WINDOW_READONLY_PREFLIGHT_REJECTED');
    await ledger('deployment-preflight', 'PASS', { httpStatus: 200 });

    rolePassword = previewWindowRolePassword(env);
    installAttempted = true;
    await ledger('install-and-probe-new-role', 'ATTEMPTED');
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const roleProof = await installFn({ databasePassword: dbPassword, rolePassword, runId, expiresAt,
      ledger: async (phase, result, category, code, sqlstate) => ledger(phase.replaceAll('_','-'), result,
        { category, ...(code ? { code } : {}), ...(sqlstate ? { sqlstate } : {}) }) });
    if (roleProof?.runId !== runId || roleProof?.pooler?.clientTlsVerified !== true ||
        roleProof?.pooler?.sessionUser !== 'rubik_preview_u03_writer' || roleProof?.pooler?.currentUser !== 'rubik_preview_u03_writer' ||
        roleProof?.pooler?.denyPoliciesVerified !== true) throw new Error('WINDOW_ROLE_POOLER_PROOF_REJECTED');
    roleProof.rolePassword = '';
    await ledger('install-and-probe-new-role', 'PASS');

    await ledger('deployment-runtime-pooler-proof', 'ATTEMPTED');
    const runtime = await runtimeFn({ runId, env });
    if (runtime?.passed !== true || runtime.status !== 200) throw new Error('WINDOW_RUNTIME_PREFLIGHT_REJECTED');
    await ledger('deployment-runtime-pooler-proof', 'PASS', { httpStatus: runtime.status });

    await ledger('directed-i2-i5-campaign', 'ATTEMPTED');
    campaign = await campaignFn({ env, sha: pin.sha, runId, ledger, mode: 'window-i2-i5',
      preflightFn: async () => verified });
    if (campaign?.status !== 'PASS' || campaign?.cleanupResult?.ok !== true ||
        campaign?.finalCheck?.inventoriesClear !== true || campaign?.finalCheck?.outboxClear !== true)
      throw new Error('DIRECTED_CAMPAIGN_OR_CLEANUP_BLOCKED');
    await ledger('directed-i2-i5-campaign', 'PASS', { cases: 2 });
  } catch (error) {
    failure = SAFE.test(error?.message ?? '') ? error.message : 'WINDOW_SEQUENCE_FAILED';
    try { await ledger('sequence-failure', 'BLOCKED', { code: failure }); } catch { /* containment takes priority */ }
  } finally {
    dbPassword = '';
    if (installAttempted) {
      try {
        containment = await containFn({ databasePassword, rolePassword, runId });
        const clean = containment?.rolePresent === false && containment?.policies === 0 && containment?.activeSessions === 0 &&
          containment?.inventoryZero === true && containment?.outboxTotal === 0 && containment?.pendingOutbox === 0;
        await ledger('independent-containment-and-final-read', clean ? 'PASS' : 'BLOCKED', {
          rolePresent: containment?.rolePresent ?? null, activeSessions: containment?.activeSessions ?? null,
          inventoryZero: containment?.inventoryZero === true, outboxTotal: containment?.outboxTotal ?? null,
          pendingOutbox: containment?.pendingOutbox ?? null,
        });
        if (!clean) failure ??= 'FINAL_CONTAINMENT_NOT_CLEAN';
      } catch {
        containment = null;
        failure ??= 'INDEPENDENT_ADMIN_CONTAINMENT_UNVERIFIED';
        try { await ledger('independent-containment-and-final-read', 'BLOCKED', { code: 'ADMIN_CONTAINMENT_UNVERIFIED' }); } catch { /* ledger failure cannot skip return */ }
      }
    }
    databasePassword = '';
    rolePassword = '';
  }
  try {
    if (!failure && !await verifyWindowLedgerComplete(ledgerPath, { runId, pin, includeFinal: false }))
      failure = 'WINDOW_LEDGER_INCOMPLETE';
    await ledger('i2-final-result', failure ? 'BLOCKED' : 'PASS',
      failure ? { code: failure } : { cases: 1 });
    await ledger('i5-final-result', failure ? 'BLOCKED' : 'PASS',
      failure ? { code: failure } : { cases: 1 });
    await ledger('u03-sql-final-result', failure ? 'BLOCKED' : 'PASS',
      failure ? { code: failure } : { cases: 2 });
    await ledger('h1a-global-result', 'NOT_RUN');
    if (!failure) {
      await ledger('sequence-complete', 'PASS');
      if (!await verifyWindowLedgerComplete(ledgerPath, { runId, pin })) failure = 'WINDOW_LEDGER_INCOMPLETE';
    }
  } catch { failure ??= 'WINDOW_RESULT_LEDGER_UNVERIFIED'; }
  return { status: failure ? 'BLOCKED' : 'PASS', runId, failure, campaign, containment, ledgerPath };
}

async function main() {
  if (process.argv.includes('--preview-key-preflight-only')) {
    try {
      preflightSequencePreviewKeys();
      process.stdout.write('U03_PREVIEW_KEYS_CHILD_PREFLIGHT PASS keys=present-format-valid\n');
    } catch (error) {
      const code = ['SEQUENCE_PREVIEW_KEYS_REQUIRED','SEQUENCE_PREVIEW_KEYS_FORMAT_INVALID'].includes(error?.message)
        ? error.message : 'SEQUENCE_PREVIEW_KEYS_PREFLIGHT_FAILED';
      process.stderr.write(`U03_PREVIEW_KEYS_CHILD_PREFLIGHT BLOCKED code=${code}; no database password was requested\n`);
      process.exitCode = 1;
    }
    return;
  }
  if (process.argv.includes('--attest-window-batch-only')) {
    try {
      const result = await verifyProtectedWindowBatch();
      process.stdout.write(`U03_WINDOW_BATCH_ATTESTATION PASS runId=${result.runId} deploymentId=${result.deploymentId} sha=${result.sha}\n`);
    } catch (error) {
      const code = SAFE.test(error?.message ?? '') ? error.message : 'WINDOW_BATCH_ATTESTATION_FAILED';
      process.stderr.write(`U03_WINDOW_BATCH_ATTESTATION BLOCKED code=${code}; no database password was requested\n`);
      process.exitCode = 1;
    }
    return;
  }
  if (process.argv.includes('--local-preflight-only')) {
    try {
      const result = await validateWindowRuntimeConfiguration();
      process.stdout.write(`U03_PREVIEW_WINDOW_LOCAL_PREFLIGHT PASS runId=${result.runId} deploymentId=${result.deploymentId} sha=${result.sha}\n`);
    } catch { process.stderr.write('U03_PREVIEW_WINDOW_LOCAL_PREFLIGHT BLOCKED; no database operation was attempted\n'); process.exitCode = 1; }
    return;
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { process.stderr.write('WINDOW_SEQUENCE_INPUT_REJECTED\n'); process.exitCode = 2; return; }
  try {
    const result = await runPreviewWindowSequence({ databasePassword: input?.databasePassword, runId: input?.runId });
    process.stdout.write(`U03_PREVIEW_WINDOW_SEQUENCE ${result.status} runId=${result.runId} ledger=${result.ledgerPath.replaceAll('\\','/')}\n`);
    if (result.status !== 'PASS') process.exitCode = 1;
  } catch { process.stderr.write('WINDOW_SEQUENCE_BLOCKED; inspect sanitized ledger and preserve owned IDs\n'); process.exitCode = 1; }
  finally { if (input) input.databasePassword = ''; for (const chunk of chunks) chunk.fill(0); chunks.length = 0; }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
