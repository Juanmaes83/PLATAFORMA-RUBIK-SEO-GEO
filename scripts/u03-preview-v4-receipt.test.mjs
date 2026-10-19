import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { openPreviewReceiptProcessor, validateReceiptConfig } from './u03-preview-v4-receipt.mjs';

const ref = 'rhnnplewqsekrnaousyl';
const projectId = '22222222-2222-4222-8222-222222222222';
const receiptId = '11111111-1111-4111-8111-111111111111';
const organizationId = '33333333-3333-4333-8333-333333333333';
const secret = 'fictional-database-password-do-not-log';
const env = () => ({ U03_PREVIEW_REF: ref,
  U03_PREVIEW_RECEIPT_DATABASE_URL: `postgresql://rubik_preview_receipt_writer:${secret}@db.${ref}.supabase.co:5432/postgres`,
  U03_PREVIEW_RECEIPT_KEY_ID: 'u03-v4-test', U03_PREVIEW_RECEIPT_SIGNING_KEY: randomBytes(32).toString('base64') });

test('V-4 config rejects Production, another ref, absent credential, SSL overrides and a broad role', () => {
  const source = env();
  assert.equal(validateReceiptConfig(source).keyId, 'u03-v4-test');
  for (const changed of [
    { U03_PREVIEW_REF: 'yvdgmklgwlshizzgefpv' },
    { U03_PREVIEW_REF: 'another-ref' },
    { U03_PREVIEW_RECEIPT_DATABASE_URL: undefined },
    { U03_PREVIEW_RECEIPT_DATABASE_URL: source.U03_PREVIEW_RECEIPT_DATABASE_URL.replace(ref, 'yvdgmklgwlshizzgefpv') },
    { U03_PREVIEW_RECEIPT_DATABASE_URL: source.U03_PREVIEW_RECEIPT_DATABASE_URL.replace('rubik_preview_receipt_writer:', 'postgres:') },
    { U03_PREVIEW_RECEIPT_DATABASE_URL: `${source.U03_PREVIEW_RECEIPT_DATABASE_URL}?sslmode=disable` },
    { U03_PREVIEW_RECEIPT_SIGNING_KEY: '' },
  ]) assert.throws(() => validateReceiptConfig({ ...source, ...changed }), /^Error: V4_/);
  const pooler = source.U03_PREVIEW_RECEIPT_DATABASE_URL.replace(
    `rubik_preview_receipt_writer:${secret}@db.${ref}.supabase.co`,
    `rubik_preview_receipt_writer.${ref}:${secret}@aws-0-eu-west-1.pooler.supabase.com`);
  assert.equal(validateReceiptConfig({ ...source, U03_PREVIEW_RECEIPT_DATABASE_URL: pooler }).keyId, 'u03-v4-test');
});

function fakePool({ ready = true } = {}) {
  const state = { receipt: 'pending', signed: 0, closed: false, queries: [] };
  class PoolClass {
    async query(sql, args) {
      state.queries.push({ sql, args });
      if (sql.includes('as role_ok')) return { rows: ready ? [{ role_ok: true, identity_ok: true, capability_ok: true, narrow_ok: true }] : [] };
      if (sql.includes('join public.audit_events')) return { rows: [{ state: state.receipt, event_seq: 1 }] };
      if (sql.includes('where o.id = $1::uuid and o.project_id')) return { rows: args[1] === projectId ? [{ id: receiptId, project_id: projectId,
        organization_id: organizationId, actual_organization_id: organizationId, tenant_slug: 'u03-v4',
        project_slug: 'a1', action: 'member.withdraw', state: state.receipt }] : [] };
      if (sql.includes('where project_id = $1::uuid and state')) return { rows: state.receipt === 'pending' ? [{ id: receiptId, action: 'member.withdraw' }] : [] };
      if (sql.includes('select * from public.audit_events')) return { rows: [{ seq: 1 }] };
      throw new Error('UNEXPECTED_SQL');
    }
    async end() { state.closed = true; }
  }
  return { state, PoolClass };
}

test('V-4 receipt preflight rejects absent or wrong SQL capability before a fixture can be made', async () => {
  const { state, PoolClass } = fakePool({ ready: false });
  await assert.rejects(openPreviewReceiptProcessor({ env: env(), PoolClass }), /V4_RECEIPT_PREFLIGHT_FAILED/);
  assert.equal(state.closed, true);
});

test('V-4 receipt processes a pending ID, retries idempotently, and never exposes credentials', async () => {
  const { state, PoolClass } = fakePool();
  const processor = await openPreviewReceiptProcessor({ env: env(), PoolClass,
    processFn: async id => { assert.equal(id, receiptId); if (state.receipt === 'pending') { state.receipt = 'completed'; state.signed++; } return { ok: true, seq: 1 }; },
    verifyTrailFn: rows => ({ valid: rows.length === 1 }),
  });
  try {
    assert.deepEqual(await processor.pendingForProject(projectId), [receiptId]);
    assert.deepEqual(await processor.process(receiptId, projectId), { seq: 1, retried: false });
    assert.deepEqual(await processor.process(receiptId, projectId), { seq: 1, retried: true });
    assert.equal(state.signed, 1);
    assert.deepEqual(await processor.pendingForProject(projectId), []);
    await assert.rejects(processor.process(receiptId, '44444444-4444-4444-8444-444444444444'), /V4_RECEIPT_SCOPE_INVALID/);
  } finally { await processor.close(); }
  assert.equal(state.closed, true);
  assert.equal(JSON.stringify(state.queries).includes(secret), false);
});

test('V-4 receipt refuses an invalid signature and leaves cleanup blocked', async () => {
  const { state, PoolClass } = fakePool();
  const processor = await openPreviewReceiptProcessor({ env: env(), PoolClass,
    processFn: async () => { state.receipt = 'completed'; return { ok: true, seq: 1 }; },
    verifyTrailFn: () => ({ valid: false }),
  });
  try { await assert.rejects(processor.process(receiptId, projectId), /V4_RECEIPT_VERIFICATION_FAILED/); }
  finally { await processor.close(); }
});
