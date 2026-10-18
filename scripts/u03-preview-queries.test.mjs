import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_TABLE_SELECT, emptyTableUrl } from './u03-preview-queries.mjs';

test('preflight uses real key columns for composite-key tables', () => {
  assert.deepEqual(EMPTY_TABLE_SELECT, {
    organizations: 'id',
    projects: 'id',
    project_members: 'project_id',
    audit_events: 'project_id',
  });
  assert.match(emptyTableUrl('https://preview.invalid', 'project_members'), /project_members\?select=project_id&limit=1$/);
  assert.match(emptyTableUrl('https://preview.invalid', 'audit_events'), /audit_events\?select=project_id&limit=1$/);
});

test('preflight query builder rejects unlisted tables', () => {
  assert.throws(() => emptyTableUrl('https://preview.invalid', 'users'), /Tabla no permitida/);
});
