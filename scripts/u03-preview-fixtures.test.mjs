import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupTrackedIds, createScopedFixture, sanitizeDiagnostic } from './u03-preview-fixtures.mjs';

const id = '123e4567-e89b-42d3-a456-426614174000';
const secret = ['sb', 'secret', 'SuperPrivateValue123456'].join('_');
const email = 'owner-a@ejemplo.test';
const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature';
const sensitive = `bad ${id} ${email} ${secret} ${jwt} Authorization: Bearer ${secret}`;
const setup = overrides => {
  const rows = [], tracked = [];
  return {
    rows, tracked,
    args: {
      caseId: 'fixture-org-ownerA', scope: 'u03-run-a',
      ledger: async (caseId, status, detail = {}) => { rows.push({ caseId, status, ...detail }); },
      track: value => { if (!tracked.includes(value)) tracked.push(value); },
      lookup: async () => ({ data: [], error: null }),
      ...overrides,
    },
  };
};

test('definitive PostgREST rejection is diagnosed, never called ambiguous', async () => {
  const state = setup({ insert: async () => ({ data: null, status: 403, error: { code: '42501', message: sensitive } }) });
  await assert.rejects(createScopedFixture(state.args), /rechazada/);
  const row = state.rows.find(row => row.status === 'REJECTED');
  assert.deepEqual({ category: row.category, code: row.code, http: row.http }, { category: 'postgrest', code: '42501', http: 403 });
  assert.equal(state.rows.some(row => row.status === 'AMBIGUOUS'), false);
  assert.deepEqual(state.tracked, []);
  assertNoSensitiveDiagnostic(row);
});

test('transport exception without response is ambiguous and reconciles its own ID', async () => {
  const state = setup({
    insert: async () => { throw new Error(sensitive); },
    lookup: async () => ({ data: [{ id }], error: null }),
  });
  await assert.rejects(createScopedFixture(state.args), /sin respuesta verificable/);
  assert.equal(state.rows.find(row => row.status === 'AMBIGUOUS').category, 'transport');
  assert.deepEqual(state.tracked, [id]);
  assertNoSensitiveDiagnostic(state.rows.find(row => row.status === 'AMBIGUOUS'));
});

test('success with the database ID and matching scope is confirmed', async () => {
  const state = setup({
    insert: async () => ({ data: [{ id }], status: 201, error: null }),
    lookup: async () => ({ data: [{ id }], error: null }),
  });
  assert.equal(await createScopedFixture(state.args), id);
  assert.deepEqual(state.tracked, [id]);
  assert.equal(state.rows.at(-1).status, 'CREATED');
});

test('success without a returned ID is confirmed through its exact scoped row', async () => {
  const state = setup({
    insert: async () => ({ data: null, status: 201, error: null }),
    lookup: async () => ({ data: [{ id }], error: null }),
  });
  assert.equal(await createScopedFixture(state.args), id);
  assert.deepEqual(state.tracked, [id]);
  assert.equal(state.rows.at(-1).status, 'CREATED');
});

test('success without a returned ID and no scoped row remains uncertain', async () => {
  const state = setup({ insert: async () => ({ data: null, status: 201, error: null }) });
  await assert.rejects(createScopedFixture(state.args), /sin ID verificable/);
  assert.deepEqual(state.tracked, []);
  assert.equal(state.rows.find(row => row.status === 'AMBIGUOUS').category, 'unexpected-response');
});

test('success with a mismatched returned ID stays uncertain and tracks both IDs for cleanup', async () => {
  const other = '123e4567-e89b-42d3-a456-426614174001';
  const state = setup({
    insert: async () => ({ data: [{ id }], status: 201, error: null }),
    lookup: async () => ({ data: [{ id: other }], error: null }),
  });
  await assert.rejects(createScopedFixture(state.args), /discrepancia de ID/);
  assert.deepEqual(state.tracked, [id, other]);
});

test('uncertain creation deletes only the recovered UUID and verifies its absence', async () => {
  let present = true;
  const removed = [];
  const state = setup({
    insert: async () => { throw new Error('network unavailable'); },
    lookup: async () => ({ data: present ? [{ id }] : [], error: null }),
  });
  await assert.rejects(createScopedFixture(state.args));
  const clean = await cleanupTrackedIds(state.tracked, async value => {
    removed.push(value);
    present = false;
    return { data: [{ id: value }], error: null };
  }, state.args.ledger, 'cleanup-organization');
  assert.equal(clean, true);
  assert.deepEqual(removed, [id]);
  assert.deepEqual((await state.args.lookup()).data, []);
  assert.equal(state.rows.some(row => row.status === 'FAIL'), false);
});

function assertNoSensitiveDiagnostic(row) {
  const text = JSON.stringify({ category: row.category, code: row.code, http: row.http, message: row.message });
  for (const forbidden of [id, email, secret, jwt, 'Bearer']) assert.equal(text.includes(forbidden), false, forbidden);
  assert.equal(sanitizeDiagnostic(sensitive).length <= 160, true);
}
