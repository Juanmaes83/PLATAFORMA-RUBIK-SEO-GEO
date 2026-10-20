import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runHostedU03Campaign, verifyInitialPreviewState, verifyProtectedWindowRuntime } from './u03-preview-b4-orchestrator.mjs';
import { PIN } from './u03-preview-b4-runner.mjs';
import { installAndProbeRunScopedRole, runIndependentContainment, previewWindowRolePassword, PREVIEW_REF } from './u03-window-role-preflight.mjs';

const SAFE = /^[A-Z][A-Z0-9_]{1,79}$/;
const RUN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEDGER_ID_KEYS = new Set(['id','userIds','organizationIds','projectIds','resultIds','importIds','auditEventIds','receiptIds']);

export async function createWindowLedger(path, metadata, append = appendFile) {
  await mkdir(dirname(path), { recursive: true });
  await append(path, '', { flag: 'wx', mode: 0o600 });
  return async (caseId, status, detail = {}) => {
    if (!/^[a-z0-9-]{1,80}$/.test(caseId) || !/^[A-Z_]{2,32}$/.test(status)) throw new Error('WINDOW_LEDGER_FIELD_REJECTED');
    const safe = {};
    for (const [key, value] of Object.entries(detail)) {
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
    await append(path, `${JSON.stringify({ utc: new Date().toISOString(), ...metadata, caseId, status, ...safe })}\n`, { mode: 0o600 });
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

/** One fail-closed owner sequence. No fixtures begin before deployment, read-only, role and runtime proofs pass. */
export async function runPreviewWindowSequence({ databasePassword, runId = randomUUID(), env = process.env,
  preflightFn = verifyInitialPreviewState, configFn = validateWindowRuntimeConfiguration,
  installFn = installAndProbeRunScopedRole, pin = PIN,
  runtimeFn = verifyProtectedWindowRuntime, campaignFn = runHostedU03Campaign,
  containFn = runIndependentContainment, ledgerPath = join(process.cwd(), 'test-results', 'u03-hosted-window', `${runId}.jsonl`) } = {}) {
  if (typeof databasePassword !== 'string' || !databasePassword || !RUN.test(runId)) throw new Error('WINDOW_SEQUENCE_INPUT_REJECTED');
  const metadata = { runId, functionalSha: pin.sha, deploymentId: pin.deploymentId, host: pin.host, ref: PREVIEW_REF };
  const ledger = await createWindowLedger(ledgerPath, metadata);
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
      ledger: async (phase, result, category) => ledger(phase.replaceAll('_','-'), result, { category }) });
    if (roleProof?.runId !== runId || roleProof?.pooler?.clientTlsVerified !== true ||
        roleProof?.pooler?.sessionUser !== 'rubik_preview_u03_writer' || roleProof?.pooler?.currentUser !== 'rubik_audit_writer' ||
        roleProof?.pooler?.denyPoliciesVerified !== true) throw new Error('WINDOW_ROLE_POOLER_PROOF_REJECTED');
    roleProof.rolePassword = '';
    await ledger('install-and-probe-new-role', 'PASS');

    await ledger('deployment-runtime-pooler-proof', 'ATTEMPTED');
    const runtime = await runtimeFn({ runId, env });
    if (runtime?.passed !== true || runtime.status !== 200) throw new Error('WINDOW_RUNTIME_PREFLIGHT_REJECTED');
    await ledger('deployment-runtime-pooler-proof', 'PASS', { httpStatus: runtime.status });

    await ledger('directed-i2-i5-h1a-campaign', 'ATTEMPTED');
    campaign = await campaignFn({ env, sha: pin.sha, runId, ledger, mode: 'window-i2-i5',
      preflightFn: async () => verified });
    if (campaign?.status !== 'PASS' || campaign?.cleanupResult?.ok !== true ||
        campaign?.finalCheck?.inventoriesClear !== true || campaign?.finalCheck?.outboxClear !== true)
      throw new Error('DIRECTED_CAMPAIGN_OR_CLEANUP_BLOCKED');
    await ledger('directed-i2-i5-h1a-campaign', 'PASS', { cases: 3, restoreCount: 2 });
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
  return { status: failure ? 'BLOCKED' : 'PASS', runId, failure, campaign, containment, ledgerPath };
}

async function main() {
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
