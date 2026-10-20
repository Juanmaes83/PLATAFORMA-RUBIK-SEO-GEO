import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import test from 'node:test';
import { PREFLIGHT_RESULT_FIELDS, PREFLIGHT_SQL } from './u03-preview-b4-orchestrator.mjs';

const markerUrl = new URL('../test-results/u03-window-local-stack/.u03-owned-stack.json', import.meta.url);

test('actual preflight SQL returns all inventory columns against the isolated 27-migration N1 stack', async () => {
  const marker = JSON.parse(await readFile(markerUrl, 'utf8'));
  assert.equal(marker.project, 'rubik-u03-window-20261020');
  assert.equal(marker.migrations, 27);
  assert.equal(marker.lastMigration, '20261015210000');
  const client = new Client({ host: '127.0.0.1', port: 63422, user: 'postgres', password: 'postgres', database: 'postgres',
    connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    const sentinel = await client.query(`select to_regclass('private.environment_identity') as relation`);
    assert.equal(sentinel.rows[0].relation, null, 'fresh 27-migration stack must not contain the separately installed hosted sentinel');
    await client.query(`create table private.environment_identity(environment text not null, project_ref text not null)`);
    await client.query(`insert into private.environment_identity values ('local-test', 'rubik-u03-window-20261020')`);
    const { rows } = await client.query(PREFLIGHT_SQL);
    assert.equal(rows.length, 1);
    const state = rows[0];
    assert.deepEqual(PREFLIGHT_RESULT_FIELDS.filter(field => !Object.hasOwn(state, field)), []);
    for (const field of ['auth_users', 'organizations', 'projects', 'organization_members', 'project_members',
      'invitations', 'audit_events', 'provider_results', 'imports', 'audit_idempotency', 'outbox_total',
      'pending_outbox', 'openseo_project_jobs', 'openseo_project_connections', 'webmaster_properties',
      'provider_budgets', 'provider_spend', 'openseo_google_properties', 'google_captures', 'window_policy_residue',
      'writer_sessions']) assert.equal(state[field], 0, `${field} must be zero in the fresh local stack`);
    assert.equal(state.migrations.length, 27);
    assert.equal(state.migrations.at(-1), '20261015210000');
    for (const field of ['writer_locked', 'window_writer_present', 'admin_can_manage_roles',
      'admin_can_terminate_sessions', 'receipt_writer_present']) assert.equal(typeof state[field], 'boolean');
  } finally {
    await client.query(`drop table if exists private.environment_identity`);
    await client.end();
  }
});
