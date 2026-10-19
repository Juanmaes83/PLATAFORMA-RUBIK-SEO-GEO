import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createDataApiFixtureRun } from './u03-preview-data-api.mjs';
import { U03_PREVIEW_REF } from './u03-preview-data-api.mjs';

function controlledBackend() {
  const rows = { organizations: [], projects: [], project_members: [], audit_events: [] };
  const authUsers = new Map();
  const orgOwners = new Map();
  let currentId = null;

  const result = (data, error = null, status = error ? 403 : 200) => ({ data, error, status });
  function query(table, actorId, adminMode = false) {
    const filters = [];
    let operation = 'select', payload;
    const q = {
      select() { return q; },
      eq(key, value) { filters.push(row => row[key] === value); return q; },
      in(key, values) { filters.push(row => values.includes(row[key])); return q; },
      insert(value) { operation = 'insert'; payload = value; return q; },
      delete() { operation = 'delete'; return q; },
      then(resolve, reject) { return Promise.resolve().then(execute).then(resolve, reject); },
    };
    function visible(row) {
      if (adminMode) return true;
      if (!actorId) return false;
      if (table === 'organizations') return row.created_by === actorId;
      if (table === 'projects') return orgOwners.get(row.organization_id) === actorId;
      return false;
    }
    function execute() {
      const tableRows = rows[table];
      if (!tableRows) return result(null, { code: '42P01' }, 404);
      if (operation === 'insert') {
        if (adminMode || !actorId) return result(null, { code: '42501' }, 403);
        if (table === 'project_members' || table === 'audit_events') return result(null, { code: '42501' }, 403);
        const id = randomUUID();
        const row = { id, created_by: actorId, ...payload };
        tableRows.push(row);
        if (table === 'organizations') orgOwners.set(id, actorId);
        return result([row], null, 201);
      }
      const selected = tableRows.filter(row => (adminMode || visible(row)) && filters.every(filter => filter(row)));
      if (operation === 'delete') {
        if (!adminMode) return result(null, { code: '42501' }, 403);
        for (const row of selected) tableRows.splice(tableRows.indexOf(row), 1);
        return result(selected.map(({ id }) => ({ id })));
      }
      return result(selected.map(row => ({ ...row })));
    }
    return q;
  }

  const admin = {
    from: table => query(table, null, true),
    auth: { admin: {
      createUser: async ({ email }) => {
        const user = { id: randomUUID(), email };
        authUsers.set(user.id, user);
        return { data: { user }, error: null };
      },
      listUsers: async () => ({ data: { users: [...authUsers.values()] }, error: null }),
      deleteUser: async id => ({ error: authUsers.delete(id) ? null : { code: 'NOT_FOUND' } }),
    } },
  };
  function clientFactory() {
    let actorId = null;
    return {
      from: table => query(table, actorId),
      auth: {
        signInWithPassword: async ({ email }) => {
          const user = [...authUsers.values()].find(item => item.email === email);
          if (!user) return { error: { code: 'INVALID_CREDENTIALS' }, data: {} };
          actorId = user.id;
          currentId = actorId;
          return { error: null, data: { session: { access_token: `fictional-${actorId}` } } };
        },
        updateUser: async () => ({ error: null }),
        refreshSession: async () => ({ error: null }),
      },
      rpc: async (_name, { p_project_id }) => {
        const visibleProject = rows.projects.find(row => row.id === p_project_id && orgOwners.get(row.organization_id) === actorId);
        if (!visibleProject) return { data: null, error: { code: '42501' } };
        const dated = { count: 0, first: null, last: null };
        return { data: {
          auditEvents: dated, providerResults: dated, imports: dated, invitations: { open: 0, closed: 0 },
          projectMembers: 1, organizationMembers: 1, openseoJobs: 0, openseoConnections: 0,
          webmasterProperties: 0, googleProperties: 0, googleCaptures: 0, budgets: 0, spendEntries: 0,
          generatedAt: new Date().toISOString(),
        }, error: null };
      },
    };
  }
  return {
    rows, authUsers, admin, clientFactory,
    fetchImpl: async url => {
      assert.equal(new URL(url).hostname, `${U03_PREVIEW_REF}.supabase.co`);
      return new Response('', { status: 401 });
    },
    counts: () => ({ users: authUsers.size, organizations: rows.organizations.length, projects: rows.projects.length,
      memberships: rows.project_members.length, auditEvents: rows.audit_events.length }),
    get currentId() { return currentId; },
  };
}

test('full fixture lifecycle creates A1/A2 in A and B1 in B, runs matrix, then returns owned state to zero', async () => {
  const backend = controlledBackend();
  const ledgerRows = [];
  const fixtures = createDataApiFixtureRun({
    runId: 'lifecycle-cycle-test-001', sha: 'a'.repeat(40), admin: backend.admin,
    publicKey: 'fictional-public-key', clientFactory: backend.clientFactory, fetchImpl: backend.fetchImpl,
    ledger: async (caseId, status, detail = {}) => ledgerRows.push({ caseId, status, detail }),
  });

  await fixtures.createUsers();
  assert.deepEqual(backend.counts(), { users: 3, organizations: 0, projects: 0, memberships: 0, auditEvents: 0 });
  const organizations = await fixtures.createOrganizations();
  const projects = await fixtures.createProjects(organizations);
  const projectRows = backend.rows.projects;
  const b1 = projectRows.find(row => row.id === projects.b1);
  assert.ok(b1);
  assert.equal(b1.organization_id, organizations.orgB);
  assert.notEqual(b1.organization_id, organizations.orgA);
  assert.deepEqual(projectRows.filter(row => [projects.a1, projects.a2].includes(row.id)).map(row => row.organization_id), [organizations.orgA, organizations.orgA]);
  assert.deepEqual(fixtures.snapshot().projectIds.length, 3);

  const matrix = await fixtures.runMatrix({ ...organizations, ...projects });
  assert.deepEqual(matrix, { passed: true, cases: 12 });
  assert.equal(ledgerRows.filter(row => row.status === 'PASS' && row.caseId !== 'auth-login-ownerA' && row.caseId !== 'auth-login-ownerB' && row.caseId !== 'auth-login-outsider').length, 12);

  const cleanup = await fixtures.cleanup();
  assert.equal(cleanup.ok, true);
  assert.equal(await fixtures.verifyOwnedAbsent(), true);
  assert.deepEqual(backend.counts(), { users: 0, organizations: 0, projects: 0, memberships: 0, auditEvents: 0 });
  assert.equal(ledgerRows.filter(row => row.caseId.startsWith('cleanup-') && row.status === 'PASS').length, 9);
});
