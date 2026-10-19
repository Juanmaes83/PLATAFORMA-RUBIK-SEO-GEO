import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createDataApiFixtureRun } from './u03-preview-data-api.mjs';
import { U03_PREVIEW_REF } from './u03-preview-data-api.mjs';

function controlledBackend() {
  const rows = { organizations: [], projects: [], project_members: [], audit_events: [], provider_results: [], imports: [] };
  const authUsers = new Map();
  const orgOwners = new Map();
  const invitations = [];
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
      update(value) { operation = 'update'; payload = value; return q; },
      delete() { operation = 'delete'; return q; },
      then(resolve, reject) { return Promise.resolve().then(execute).then(resolve, reject); },
    };
    function visible(row) {
      if (adminMode) return true;
      if (!actorId) return false;
      if (table === 'organizations') return row.created_by === actorId;
      if (table === 'projects') return orgOwners.get(row.organization_id) === actorId ||
        rows.project_members.some(member => member.project_id === row.id && member.user_id === actorId);
      if (table === 'project_members') return orgOwners.get(row.organization_id) === actorId || row.user_id === actorId;
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
        if (table === 'projects') rows.project_members.push({ id: randomUUID(), project_id: id,
          organization_id: row.organization_id, user_id: actorId, role: 'owner' });
        return result([row], null, 201);
      }
      const selected = tableRows.filter(row => (adminMode || visible(row)) && filters.every(filter => filter(row)));
      if (operation === 'update') {
        const editable = selected.filter(row => table === 'projects' && orgOwners.get(row.organization_id) === actorId);
        for (const row of editable) Object.assign(row, payload);
        return result(editable.map(({ id }) => ({ id })));
      }
      if (operation === 'delete') {
        if (!adminMode) return result(null, { code: '42501' }, 403);
        for (const row of selected) {
          tableRows.splice(tableRows.indexOf(row), 1);
          if (table === 'projects') {
            for (const member of rows.project_members.filter(member => member.project_id === row.id)) rows.project_members.splice(rows.project_members.indexOf(member), 1);
            for (const invitation of invitations.filter(invitation => invitation.projectId === row.id)) invitations.splice(invitations.indexOf(invitation), 1);
          }
        }
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
    let session = null;
    return {
      from: table => query(table, actorId),
      auth: {
        signInWithPassword: async ({ email }) => {
          const user = [...authUsers.values()].find(item => item.email === email);
          if (!user) return { error: { code: 'INVALID_CREDENTIALS' }, data: {} };
          actorId = user.id;
          currentId = actorId;
          session = { access_token: `fictional-${actorId}`, expires_at: Math.floor(Date.now() / 1000) + 3600 };
          return { error: null, data: { session } };
        },
        getSession: async () => ({ error: null, data: { session } }),
        getUser: async () => ({ error: null, data: { user: authUsers.get(actorId) } }),
        updateUser: async () => ({ error: null }),
        refreshSession: async () => ({ error: null }),
      },
      rpc: async (name, { p_project_id, p_command, p_payload, p_token }) => {
        if (name === 'project_invitations') {
          const project = rows.projects.find(row => row.id === p_project_id);
          if (!project || orgOwners.get(project.organization_id) !== actorId) return { data: null, error: { code: '42501' } };
          if (p_command === 'create') {
            const invitation = { invitationId: randomUUID(), projectId: p_project_id, email: p_payload.email,
              role: p_payload.role, token: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '') };
            invitations.push(invitation);
            return { data: { token: invitation.token, invitationId: invitation.invitationId }, error: null };
          }
          if (p_command === 'revoke') {
            const invitation = invitations.find(item => item.invitationId === p_payload.invitationId && item.projectId === p_project_id && !item.accepted);
            if (!invitation) return { data: null, error: { code: '22023' } };
            invitation.revoked = true;
            return { data: { invitationId: invitation.invitationId }, error: null };
          }
          return { data: [], error: null };
        }
        if (name === 'accept_project_invitation') {
          const invitation = invitations.find(item => item.token === p_token && item.email === authUsers.get(actorId)?.email && !item.revoked && !item.accepted);
          if (!invitation) return { data: null, error: { code: 'P0002' } };
          const project = rows.projects.find(row => row.id === invitation.projectId);
          rows.project_members.push({ id: randomUUID(), project_id: project.id, organization_id: project.organization_id, user_id: actorId, role: invitation.role });
          invitation.accepted = true;
          return { data: { role: invitation.role }, error: null };
        }
        if (name === 'project_people' && p_command === 'remove') {
          const project = rows.projects.find(row => row.id === p_project_id);
          if (!project || orgOwners.get(project.organization_id) !== actorId) return { data: null, error: { code: '42501' } };
          const membership = rows.project_members.find(row => row.project_id === p_project_id && row.user_id === p_payload.userId);
          if (!membership) return { data: null, error: { code: 'P0002' } };
          rows.project_members.splice(rows.project_members.indexOf(membership), 1);
          return { data: { removed: true, leftOrganization: true, auditReceiptId: randomUUID() }, error: null };
        }
        const visibleProject = rows.projects.find(row => row.id === p_project_id && orgOwners.get(row.organization_id) === actorId);
        if (!visibleProject) return { data: null, error: { code: '42501' } };
        if (name === 'provider_budget') return { data: { used: 0, spend: null, available: null }, error: null };
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
    rows, authUsers, invitations, admin, clientFactory,
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

test('directed V-4 uses an accepted viewer invitation, keeps the JWT valid, denies the next request, and cleans by IDs', async () => {
  const backend = controlledBackend();
  const ledgerRows = [];
  const fixtures = createDataApiFixtureRun({
    runId: 'revocation-cycle-test-001', sha: 'a'.repeat(40), admin: backend.admin,
    publicKey: 'fictional-public-key', clientFactory: backend.clientFactory,
    ledger: async (caseId, status, detail = {}) => ledgerRows.push({ caseId, status, detail }),
  });
  try {
    const { a1 } = await fixtures.createRevocationFixtures();
    assert.ok(a1);
    assert.deepEqual(backend.counts(), { users: 2, organizations: 1, projects: 1, memberships: 1, auditEvents: 0 });
    assert.match((await fixtures.runMembershipRevocation({ a1 })).receiptId, /^[0-9a-f-]{36}$/);
    assert.equal(backend.invitations.length, 1);
    assert.equal(backend.rows.project_members.length, 1);
    assert.equal(ledgerRows.find(row => row.caseId === 'membership-grant-before-withdrawal')?.status, 'PASS');
    assert.equal(ledgerRows.find(row => row.caseId === 'membership-revocation-after-withdrawal')?.status, 'PASS');
    const serialized = JSON.stringify(ledgerRows);
    assert.equal(serialized.includes('@ejemplo.test'), false);
    assert.equal(serialized.includes('fictional-'), false);
    assert.equal(serialized.includes('a'.repeat(64)), false);
  } finally {
    assert.equal((await fixtures.cleanup()).ok, true);
  }
  assert.deepEqual(backend.counts(), { users: 0, organizations: 0, projects: 0, memberships: 0, auditEvents: 0 });
  assert.equal(backend.invitations.length, 0);
});

test('directed V-1/V-2/V-3 and five roles remain scoped; cleanup removes invitations and identities', async () => {
  const backend = controlledBackend();
  const ledgerRows = [];
  const fixtures = createDataApiFixtureRun({
    runId: 'roles-cycle-test-001', sha: 'b'.repeat(40), admin: backend.admin,
    publicKey: 'fictional-public-key', clientFactory: backend.clientFactory,
    ledger: async (caseId, status, detail = {}) => ledgerRows.push({ caseId, status, detail }),
  });
  try {
    await fixtures.createUsers();
    const organizations = await fixtures.createOrganizations();
    const projects = await fixtures.createProjects(organizations);
    assert.deepEqual(await fixtures.runRolesInvitations(projects), { passed: true, cases: 10 });
    assert.equal(ledgerRows.filter(row => row.caseId.startsWith('role-') && row.status === 'PASS').length, 5);
    assert.equal(ledgerRows.filter(row => row.caseId.startsWith('v2-') && row.status === 'PASS').length, 3);
    assert.equal(backend.authUsers.size, 8);
    assert.equal(backend.rows.project_members.length, 8);
    assert.equal(JSON.stringify(ledgerRows).includes(backend.invitations[0].token), false);
  } finally {
    assert.equal((await fixtures.cleanup()).ok, true);
  }
  assert.equal(backend.authUsers.size, 0);
  assert.equal(backend.invitations.length, 0);
  assert.equal(backend.rows.projects.length, 0);
  assert.equal(backend.rows.project_members.length, 0);
});

test('I-5/I-8 and P-2 use both authentic owners, foreign IDs and no provider writes', async () => {
  const backend = controlledBackend();
  const ledgerRows = [];
  const fixtures = createDataApiFixtureRun({
    runId: 'cross-cycle-test-001', sha: 'c'.repeat(40), admin: backend.admin,
    publicKey: 'fictional-public-key', clientFactory: backend.clientFactory,
    ledger: async (caseId, status) => ledgerRows.push({ caseId, status }),
  });
  try {
    await fixtures.createUsers();
    const orgs = await fixtures.createOrganizations();
    const projects = await fixtures.createProjects(orgs);
    assert.deepEqual(await fixtures.runCrossSurface({ ...orgs, ...projects }), { passed: true, cases: 14 });
    assert.equal(ledgerRows.filter(row => row.caseId.startsWith('i5-') && row.status === 'PASS').length, 6);
    assert.equal(ledgerRows.filter(row => row.caseId.startsWith('i8-') && row.status === 'PASS').length, 6);
    assert.equal(ledgerRows.filter(row => row.caseId.startsWith('p2-') && row.status === 'PASS').length, 2);
  } finally { assert.equal((await fixtures.cleanup()).ok, true); }
  assert.deepEqual(backend.counts(), { users: 0, organizations: 0, projects: 0, memberships: 0, auditEvents: 0 });
});
