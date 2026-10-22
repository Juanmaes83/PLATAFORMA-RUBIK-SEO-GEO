import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const SEQUENCE_PHASES = Object.freeze([
  'deployment-preflight', 'admin-readonly-preflight', 'install-role-nologin',
  'independent-containment-probe', 'activate-temporary-role', 'session-pooler-set-role',
  'run-scope-policy-proof', 'create-fixtures', 'signed-audit-result-import',
  'populated-i2-i5-checks', 'resolve-receipts', 'preview-http-export',
  'offline-export-verification', 'restore-local-twice', 'logout-fixtures',
  'final-nologin-terminate', 'final-receipt-check', 'cleanup-own-ids',
  'independent-final-inventory', 'conditional-role-policy-rollback',
]);

const FIXTURE_PHASES = new Set(['create-fixtures', 'signed-audit-result-import', 'populated-i2-i5-checks',
  'resolve-receipts', 'preview-http-export', 'offline-export-verification', 'restore-local-twice', 'logout-fixtures']);
const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,79}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_KEYS = new Set(['id','userIds','organizationIds','projectIds','resultIds','importIds','auditEventIds','receiptIds']);

function safeCode(error) {
  const code = typeof error?.code === 'string' ? error.code : typeof error?.message === 'string' ? error.message : '';
  return SAFE_CODE.test(code) ? code : 'SEQUENCE_PHASE_FAILED';
}

/** Deterministic fail-closed order shared by the Windows owner and local fault-injection tests. */
export async function runDirectedPreviewSequence({ runId = randomUUID(), phase, ledger, contain, finalRead, fixtureState = () => false }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId) ||
      typeof phase !== 'function' || typeof ledger !== 'function' || typeof contain !== 'function' || typeof finalRead !== 'function')
    throw new Error('SEQUENCE_INPUT_REJECTED');
  let failedPhase = null;
  let failure = null;
  let containment = null;
  let final = null;
  let fixtureStarted = false;
  for (const name of SEQUENCE_PHASES) {
    if (FIXTURE_PHASES.has(name) && !fixtureStarted && !fixtureState()) {
      // Mark before invoking the fixture boundary so a lost response always enters ID reconciliation.
      if (name === 'create-fixtures') fixtureStarted = true;
    }
    try {
      await ledger(name, 'ATTEMPTED', { runId });
      const result = await phase(name, { runId, fixtureStarted });
      await ledger(name, 'PASS', { runId, ...(result?.ledger ?? {}) });
    } catch (error) {
      failedPhase = name;
      failure = safeCode(error);
      try { await ledger(name, 'BLOCKED', { runId, code: failure }); } catch { /* ledger failure cannot skip containment */ }
      break;
    }
  }
  try {
    containment = await contain({ runId, failedPhase, fixtureStarted });
    await ledger('finally-independent-containment', containment?.contained ? 'PASS' : 'BLOCKED', { runId,
      rolePresent: containment?.rolePresent ?? null, roleLocked: containment?.roleLocked ?? null,
      activeSessions: containment?.activeSessions ?? null });
  } catch {
    containment = { contained: false };
    try { await ledger('finally-independent-containment', 'BLOCKED', { runId, code: 'ADMIN_CONTAINMENT_UNVERIFIED' }); } catch { /* preserve original failure */ }
  }
  try {
    final = await finalRead({ runId, fixtureStarted, containment });
    const clean = final?.inventoryZero === true && final?.outboxTotal === 0 && final?.pendingOutbox === 0 &&
      (final?.roleAbsent === true || (final?.rolePresent === true && final?.roleLocked === true && final?.activeSessions === 0));
    await ledger('independent-final-state', clean ? 'PASS' : 'BLOCKED', { runId,
      inventoryZero: final?.inventoryZero === true, outboxTotal: final?.outboxTotal ?? null,
      pendingOutbox: final?.pendingOutbox ?? null, roleAbsent: final?.roleAbsent === true,
      roleLocked: final?.roleLocked ?? null, activeSessions: final?.activeSessions ?? null });
    if (!clean) failure ??= 'FINAL_STATE_NOT_CLEAN';
  } catch {
    final = null;
    failure ??= 'FINAL_STATE_UNVERIFIED';
    try { await ledger('independent-final-state', 'BLOCKED', { runId, code: 'FINAL_STATE_UNVERIFIED' }); } catch { /* final status stays blocked */ }
  }
  if (!containment?.contained) failure = 'ADMIN_CONTAINMENT_UNVERIFIED';
  return { status: failure ? 'BLOCKED' : 'PASS', runId, failedPhase, failure, fixtureStarted, containment, final };
}

export async function createJsonlLedger(path, { runId, sha, ref = 'rhnnplewqsekrnaousyl', deploymentId, host }) {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, '', { flag: 'wx', mode: 0o600 });
  return async (phase, status, detail = {}) => {
    const safe = {};
    for (const [key, value] of Object.entries(detail)) {
      if (!['runId', 'code', 'category', 'result', 'count', 'cases', 'httpStatus', 'deploymentId', 'host',
        'inventoryZero', 'outboxTotal', 'pendingOutbox', 'rolePresent', 'roleLocked', 'activeSessions', 'restoreCount',
        ...ID_KEYS].includes(key)) continue;
      if (key === 'id' && typeof value === 'string' && UUID.test(value)) { safe.id = value.toLowerCase(); continue; }
      if (ID_KEYS.has(key) && Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === 'string' && UUID.test(item))) {
        safe[key] = value.map(item => item.toLowerCase());
        continue;
      }
      if (ID_KEYS.has(key)) continue;
      if (typeof value === 'string' && SAFE_CODE.test(value) || typeof value === 'number' || typeof value === 'boolean' || value === null) safe[key] = value;
    }
    await appendFile(path, `${JSON.stringify({ utc: new Date().toISOString(), runId, sha, ref, deploymentId, host, phase, status, ...safe })}\n`, { mode: 0o600 });
  };
}
