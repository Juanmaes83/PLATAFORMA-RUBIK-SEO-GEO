import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerInventoryAccepted } from './u03-preview-inventory-check.mjs';

const a1 = '00000000-0000-4000-8000-0000000000a1';
const inventory = {
  auditEvents: { count: 0, first: null, last: null },
  providerResults: { count: 0, first: null, last: null },
  imports: { count: 0, first: null, last: null },
  invitations: { open: 0, closed: 0 },
  projectMembers: 1, organizationMembers: 1, openseoJobs: 0, openseoConnections: 0,
  webmasterProperties: 0, googleProperties: 0, googleCaptures: 0, budgets: 0, spendEntries: 0,
  generatedAt: '2026-10-18T00:00:00Z',
};

test('own A1 inventory accepts the complete successful RPC response', () => {
  assert.equal(ownerInventoryAccepted({ data: inventory, error: null }, a1, [{ id: a1 }]), true);
});

test('an RPC error other than 42501 never becomes PASS', () => {
  for (const code of ['PGRST202', 'XX000', 'P0001', '401']) {
    assert.equal(ownerInventoryAccepted({ data: inventory, error: { code } }, a1, [{ id: a1 }]), false, code);
  }
});

test('missing inventory or unverified A1 ownership never becomes PASS', () => {
  assert.equal(ownerInventoryAccepted({ data: null, error: null }, a1, [{ id: a1 }]), false);
  assert.equal(ownerInventoryAccepted({ data: inventory, error: null }, a1, []), false);
  assert.equal(ownerInventoryAccepted({ data: { ...inventory, projectMembers: 0 }, error: null }, a1, [{ id: a1 }]), false);
});
