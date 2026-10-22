import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ownerInventoryAccepted } from './u03-preview-inventory-check.mjs';
import { createPreviewAdminClient } from './u03-preview-api-key.mjs';
import { cleanupTrackedIds, createScopedFixture, reconcileByScope, sanitizeDiagnostic } from './u03-preview-fixtures.mjs';

export const U03_PREVIEW_REF = 'rhnnplewqsekrnaousyl';
const ACTORS = Object.freeze(['ownerA', 'ownerB', 'outsider']);
const ROLE_ACTORS = Object.freeze([
  ['manager', 'account-manager', 'a1'], ['analyst', 'analyst', 'a1'],
  ['viewer', 'viewer', 'a1'], ['approver', 'client-approver', 'a1'],
  ['a2viewer', 'viewer', 'a2'],
]);

/** Shared fixture lifecycle used by the standalone Data API runner and B-4 campaign. */
export function createDataApiFixtureRun({ runId, sha, admin, publicKey, ledger, ref = U03_PREVIEW_REF, clientFactory = createClient, fetchImpl = fetch }) {
  if (!runId || !sha || !admin || !publicKey || typeof ledger !== 'function') throw new Error('FIXTURE_RUN_CONFIGURATION_INVALID');
  const url = `https://${ref}.supabase.co`;
  const namespace = `u03-${runId.replaceAll('-', '').slice(0, 12).toLowerCase()}`;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const client = () => clientFactory(url, publicKey, options);
  const users = [];
  const organizations = [];
  const projects = [];
  const plannedOrganizations = [];
  const plannedProjects = [];
  const accounts = {};
  const ownEmails = new Set([...ACTORS, ...ROLE_ACTORS.map(([actor]) => actor)]
    .map(actor => `${actor}-${namespace}@ejemplo.test`));
  let cleanupAttempted = false;
  let cleanupOk = true;

  async function findOwnAuthUsers() {
    const found = [];
    for (let page = 1; page <= 20; page++) {
      const listed = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (listed.error || !Array.isArray(listed.data?.users)) throw new Error('AUTH_INVENTORY_UNAVAILABLE');
      const pageUsers = listed.data.users;
      found.push(...pageUsers.filter(user => ownEmails.has(user.email)).map(user => user.id));
      if (pageUsers.length < 100) return [...new Set(found)];
    }
    throw new Error('AUTH_INVENTORY_LIMIT_EXCEEDED');
  }

  async function createUser(actor) {
    const email = `${actor}-${namespace}@ejemplo.test`;
    const password = randomBytes(32).toString('base64url');
    await ledger(`fixture-user-${actor}`, 'PLANNED', { namespace, actor });
    let created;
    try { created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); }
    catch {
      await ledger(`fixture-user-${actor}`, 'AMBIGUOUS', { actor });
      throw new Error(`AUTH_CREATE_AMBIGUOUS_${actor}`);
    }
    if (created.error || !created.data.user?.id) {
      await ledger(`fixture-user-${actor}`, 'AMBIGUOUS', { actor, code: created.error?.code ?? null });
      throw new Error(`AUTH_CREATE_AMBIGUOUS_${actor}`);
    }
    users.push(created.data.user.id);
    await ledger(`fixture-user-${actor}`, 'CREATED', { id: created.data.user.id, actor });
    const signed = client();
    const login = await signed.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session?.access_token) throw new Error(`AUTH_LOGIN_FAILED_${actor}`);
    accounts[actor] = { api: signed, id: created.data.user.id, email, password };
    await ledger(`auth-login-${actor}`, 'PASS');
  }

  async function createOrganization(actor, slug) {
    plannedOrganizations.push(slug);
    return createScopedFixture({
      caseId: `fixture-org-${actor}`, scope: slug, ledger,
      // N1 grants INSERT only on slug/name; the database generates id and created_by.
      insert: () => accounts[actor].api.from('organizations').insert({ slug, name: `U03 ${actor}` }),
      lookup: () => admin.from('organizations').select('id').eq('slug', slug),
      track: id => { if (!organizations.includes(id)) organizations.push(id); },
    });
  }

  async function createProject(actor, orgId, slug) {
    plannedProjects.push({ orgId, slug });
    return createScopedFixture({
      caseId: `fixture-project-${slug}`, scope: `${namespace}/${slug}`, ledger,
      // N1 column grants exclude projects.id.
      insert: () => accounts[actor].api.from('projects').insert({ organization_id: orgId, slug, name: `U03 ${slug}` }),
      lookup: () => admin.from('projects').select('id').eq('organization_id', orgId).eq('slug', slug),
      track: id => { if (!projects.includes(id)) projects.push(id); },
    });
  }

  async function createUsers() {
    for (const actor of ACTORS) await createUser(actor);
  }

  async function createOrganizations() {
    if (!accounts.ownerA || !accounts.ownerB) throw new Error('AUTH_FIXTURES_REQUIRED');
    const orgA = await createOrganization('ownerA', `${namespace}-a`);
    const orgB = await createOrganization('ownerB', `${namespace}-b`);
    return { orgA, orgB };
  }

  async function createProjects({ orgA, orgB }) {
    if (!orgA || !orgB || orgA === orgB) throw new Error('ORGANIZATION_FIXTURES_INVALID');
    const a1 = await createProject('ownerA', orgA, 'a1');
    const a2 = await createProject('ownerA', orgA, 'a2');
    const b1 = await createProject('ownerB', orgB, 'b1');
    return { a1, a2, b1 };
  }

  async function createRevocationFixtures() {
    await createUser('ownerA');
    await createUser('outsider');
    const orgA = await createOrganization('ownerA', `${namespace}-a`);
    const a1 = await createProject('ownerA', orgA, 'a1');
    return { orgA, a1 };
  }

  async function createSessionFixtures() {
    await createUser('ownerA');
    const orgA = await createOrganization('ownerA', `${namespace}-a`);
    const a1 = await createProject('ownerA', orgA, 'a1');
    return { orgA, a1, account: accounts.ownerA, path: `/proyectos/${namespace}-a/a1` };
  }

  async function runMembershipRevocation({ a1 }) {
    if (!a1 || !accounts.ownerA || !accounts.outsider) throw new Error('REVOCATION_FIXTURES_INVALID');
    const owner = accounts.ownerA.api;
    const member = accounts.outsider.api;
    const priorSession = await member.auth.getSession();
    const accessToken = priorSession.data?.session?.access_token;
    if (priorSession.error || !accessToken) throw new Error('REVOCATION_JWT_UNAVAILABLE');

    // The invitation token stays in memory. The accepted membership is created through
    // the same consent RPC as the product, never by a privileged table INSERT.
    const invited = await owner.rpc('project_invitations', {
      p_project_id: a1, p_command: 'create', p_payload: { email: accounts.outsider.email, role: 'viewer' },
    });
    if (invited.error || !/^[0-9a-f]{64}$/.test(invited.data?.token ?? '')) throw new Error('REVOCATION_INVITATION_FAILED');
    const accepted = await member.rpc('accept_project_invitation', { p_token: invited.data.token });
    const before = await member.from('projects').select('id').eq('id', a1);
    const granted = !accepted.error && accepted.data?.role === 'viewer' && !before.error &&
      before.data?.length === 1 && before.data[0]?.id === a1;
    await ledger('membership-grant-before-withdrawal', granted ? 'PASS' : 'FAIL');
    if (!granted) throw new Error('REVOCATION_GRANT_NOT_CONFIRMED');

    const removed = await owner.rpc('project_people', {
      p_project_id: a1, p_command: 'remove', p_payload: { userId: accounts.outsider.id },
    });
    const currentSession = await member.auth.getSession();
    const currentUser = await member.auth.getUser();
    const after = await member.from('projects').select('id').eq('id', a1);
    const ownerMembership = await owner.from('project_members').select('user_id')
      .eq('project_id', a1).eq('user_id', accounts.outsider.id);
    const validJwt = !currentSession.error && currentSession.data?.session?.access_token === accessToken &&
      currentSession.data.session.expires_at > Date.now() / 1000 &&
      !currentUser.error && currentUser.data?.user?.id === accounts.outsider.id;
    const receiptId = removed.data?.auditReceiptId;
    const denied = !removed.error && removed.data?.removed === true && removed.data?.leftOrganization === true &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receiptId ?? '') &&
      validJwt && !after.error && after.data?.length === 0 &&
      !ownerMembership.error && ownerMembership.data?.length === 0;
    await ledger('membership-revocation-after-withdrawal', denied ? 'PASS' : 'FAIL', { actor: 'outsider' });
    if (!denied) throw new Error('REVOCATION_ACCESS_NOT_DENIED');
    return { passed: true, cases: 1, receiptId };
  }

  async function runMatrix({ orgA, a1, a2, b1 }) {
    const assert = async (caseId, condition) => {
      await ledger(caseId, condition ? 'PASS' : 'FAIL');
      if (!condition) throw new Error(`DATA_API_CASE_FAILED_${caseId}`);
    };
    const a = accounts.ownerA.api, b = accounts.ownerB.api, outsider = accounts.outsider.api;
    const aRows = await a.from('projects').select('id');
    const bRows = await b.from('projects').select('id');
    const outRows = await outsider.from('projects').select('id');
    await assert('rls-owner-positive-a1-a2', !aRows.error && aRows.data?.length === 2 && [a1, a2].every(id => aRows.data.some(row => row.id === id)));
    await assert('rls-owner-positive-b1', !bRows.error && bRows.data?.length === 1 && bRows.data[0].id === b1);
    await assert('rls-outsider-empty', !outRows.error && outRows.data?.length === 0);
    const anonymous = await client().from('projects').select('id');
    await assert('rls-anonymous-empty', anonymous.error?.code === '42501' || (!anonymous.error && anonymous.data?.length === 0));
    const crossProject = await b.from('projects').select('id').eq('id', a1);
    await assert('rls-cross-project-id', !crossProject.error && crossProject.data?.length === 0);
    const crossOrganization = await b.from('organizations').select('id').eq('id', orgA);
    await assert('rls-cross-organization-id', !crossOrganization.error && crossOrganization.data?.length === 0);

    const forged = await outsider.auth.updateUser({ data: { role: 'owner', organization_id: orgA, project_id: a1 } });
    if (forged.error) throw new Error('FORGED_METADATA_SETUP_FAILED');
    const refreshed = await outsider.auth.refreshSession();
    const forgedRows = await outsider.from('projects').select('id');
    await assert('rls-forged-user-metadata', !refreshed.error && !forgedRows.error && forgedRows.data?.length === 0);
    const membership = await a.from('project_members').insert({ project_id: a1, organization_id: orgA, user_id: accounts.outsider.id, role: 'owner' });
    await assert('rls-direct-membership-insert-denied', membership.error?.code === '42501');
    const audit = await a.from('audit_events').insert({ project_id: a1, organization_id: orgA });
    await assert('rls-direct-audit-insert-denied', audit.error?.code === '42501');
    const foreignRpc = await b.rpc('project_data_inventory', { p_project_id: a1 });
    const ownRpc = await a.rpc('project_data_inventory', { p_project_id: a1 });
    await assert('rpc-cross-tenant-denied', foreignRpc.error?.code === '42501');
    await assert('rpc-owner-authorized', ownerInventoryAccepted(ownRpc, a1, aRows.data));
    const bearer = await fetchImpl(`${url}/rest/v1/projects?select=id`, {
      headers: { apikey: publicKey, Authorization: 'Bearer invalid-u03-token' },
      signal: AbortSignal.timeout(15000),
    });
    await assert('invalid-bearer-rejected', bearer.status === 401);
    return { passed: true, cases: 12 };
  }

  /** Directed U03 V-1/V-2/V-3 and role isolation. No withdrawal or audit receipt is created. */
  async function runRolesInvitations({ a1, a2, b1 }) {
    if (![a1, a2, b1].every(Boolean) || !accounts.ownerA || !accounts.ownerB) throw new Error('ROLE_FIXTURES_INVALID');
    const assert = async (caseId, condition) => {
      await ledger(caseId, condition ? 'PASS' : 'FAIL');
      if (!condition) throw new Error(`ROLE_CASE_FAILED_${caseId}`);
    };
    for (const [actor] of ROLE_ACTORS) await createUser(actor);
    let cases = 0;
    for (const [actor, role, scope] of ROLE_ACTORS) {
      const projectId = scope === 'a1' ? a1 : a2;
      const invited = await accounts.ownerA.api.rpc('project_invitations', {
        p_project_id: projectId, p_command: 'create', p_payload: { email: accounts[actor].email, role },
      });
      // The token exists only in memory; neither ledger nor errors contain it.
      if (invited.error || !/^[0-9a-f]{64}$/.test(invited.data?.token ?? '')) throw new Error('ROLE_INVITATION_CREATE_FAILED');
      const accepted = await accounts[actor].api.rpc('accept_project_invitation', { p_token: invited.data.token });
      const visible = await accounts[actor].api.from('projects').select('id');
      const membership = await accounts[actor].api.from('project_members').select('project_id,role').eq('project_id', projectId);
      await assert(`role-${actor}-scoped`, !accepted.error && accepted.data?.role === role && !visible.error &&
        visible.data?.length === 1 && visible.data[0]?.id === projectId && !membership.error &&
        membership.data?.length === 1 && membership.data[0]?.project_id === projectId && membership.data[0]?.role === role);
      cases++;
    }

    const viewer = accounts.viewer.api;
    const denied = await viewer.from('projects').update({ name: 'U03 unexpected write' }).eq('id', a1).select('id');
    const unchanged = await accounts.ownerA.api.from('projects').select('name').eq('id', a1);
    await assert('v1-viewer-read-only', (denied.error?.code === '42501' || (!denied.error && denied.data?.length === 0)) &&
      !unchanged.error && unchanged.data?.length === 1 && unchanged.data[0].name === 'U03 a1');
    cases++;

    for (const command of ['list', 'create', 'revoke']) {
      const attempt = await viewer.rpc('project_invitations', {
        p_project_id: a1, p_command: command, p_payload: { email: accounts.outsider.email, role: 'viewer', invitationId: randomUUID() },
      });
      await assert(`v2-viewer-${command}-denied`, attempt.error?.code === '42501');
      cases++;
    }

    const revokedInvite = await accounts.ownerB.api.rpc('project_invitations', {
      p_project_id: b1, p_command: 'create', p_payload: { email: accounts.outsider.email, role: 'viewer' },
    });
    if (revokedInvite.error || !/^[0-9a-f]{64}$/.test(revokedInvite.data?.token ?? '') ||
      !/^[0-9a-f-]{36}$/i.test(revokedInvite.data?.invitationId ?? '')) throw new Error('V3_INVITATION_CREATE_FAILED');
    const revoked = await accounts.ownerB.api.rpc('project_invitations', {
      p_project_id: b1, p_command: 'revoke', p_payload: { invitationId: revokedInvite.data.invitationId },
    });
    const reuse = await accounts.outsider.api.rpc('accept_project_invitation', { p_token: revokedInvite.data.token });
    const outsiderProjects = await accounts.outsider.api.from('projects').select('id');
    await assert('v3-revoked-token-denied', !revoked.error && reuse.error?.code === 'P0002' &&
      !outsiderProjects.error && outsiderProjects.data?.length === 0);
    cases++;
    return { passed: true, cases };
  }

  /** I-5/I-8 and P-2: read-only cross-tenant checks with real owner JWTs. */
  async function runCrossSurface({ orgA, orgB, a1, a2, b1 }) {
    if (![orgA, orgB, a1, a2, b1].every(Boolean) || !accounts.ownerA || !accounts.ownerB) throw new Error('CROSS_FIXTURES_INVALID');
    const a = accounts.ownerA.api, b = accounts.ownerB.api;
    const check = async (caseId, condition) => {
      await ledger(caseId, condition ? 'PASS' : 'FAIL');
      if (!condition) throw new Error(`CROSS_CASE_FAILED_${caseId}`);
    };
    let cases = 0;
    const tables = [
      ['organizations', 'id', orgB, 'id', orgA],
      ['projects', 'id', b1, 'id', a1],
      ['project_members', 'project_id', b1, 'project_id', a1],
      ['audit_events', 'project_id', b1, 'project_id', a1],
      ['provider_results', 'project_id', b1, 'project_id', a1],
      ['imports', 'project_id', b1, 'project_id', a1],
    ];
    for (const [table, ownColumn, ownId, foreignColumn, foreignId] of tables) {
      const visible = await b.from(table).select(ownColumn);
      const foreign = await b.from(table).select(foreignColumn).eq(foreignColumn, foreignId);
      // The empty audit/provider/import tables prove non-disclosure only. No signed data is fabricated.
      const ownExpected = ['organizations', 'projects', 'project_members'].includes(table) ? 1 : 0;
      await check(`i5-${table}-scope`, !visible.error && visible.data?.length === ownExpected &&
        (ownExpected === 0 || visible.data[0]?.[ownColumn] === ownId) && !foreign.error && foreign.data?.length === 0);
      cases++;
    }
    for (const [actor, foreignProject] of [[a, b1], [b, a1]]) {
      const side = actor === a ? 'a' : 'b';
      const attempts = [
        ['invitations', 'project_invitations', { p_project_id: foreignProject, p_command: 'list', p_payload: {} }],
        ['people', 'project_people', { p_project_id: foreignProject, p_command: 'list', p_payload: {} }],
        ['budget', 'provider_budget', { p_project_id: foreignProject, p_provider: 'openseo', p_command: 'get', p_payload: {} }],
      ];
      for (const [surface, rpc, args] of attempts) {
        const result = await actor.rpc(rpc, args);
        await check(`i8-${side}-${surface}-denied`, result.error?.code === '42501');
        cases++;
      }
    }
    for (const [side, actor, projectId] of [['a', a, a1], ['b', b, b1]]) {
      const inventory = await actor.rpc('project_data_inventory', { p_project_id: projectId });
      const budget = await actor.rpc('provider_budget', { p_project_id: projectId, p_provider: 'openseo', p_command: 'get', p_payload: {} });
      await check(`p2-${side}-no-budget-or-spend`, !inventory.error && inventory.data?.budgets === 0 &&
        inventory.data?.spendEntries === 0 && !budget.error && budget.data?.used === 0 && budget.data?.spend === null);
      cases++;
    }
    return { passed: true, cases };
  }

  async function reconcileCreatedScopes() {
    for (const slug of plannedOrganizations) {
      await reconcileByScope(() => admin.from('organizations').select('id').eq('slug', slug),
        id => { if (!organizations.includes(id)) organizations.push(id); }, ledger, 'reconcile-organization');
    }
    for (const { orgId, slug } of plannedProjects) {
      await reconcileByScope(() => admin.from('projects').select('id').eq('organization_id', orgId).eq('slug', slug),
        id => { if (!projects.includes(id)) projects.push(id); }, ledger, 'reconcile-project');
    }
  }

  async function cleanup() {
    if (cleanupAttempted) return { ok: cleanupOk, ...snapshot() };
    cleanupAttempted = true;
    try {
      for (const id of await findOwnAuthUsers()) {
        if (!users.includes(id)) {
          users.push(id);
          await ledger('fixture-user-reconcile', 'RECOVERED', { id });
        }
      }
      await ledger('auth-id-reconciliation', 'PASS');
    } catch {
      cleanupOk = false;
      try { await ledger('auth-id-reconciliation', 'FAIL'); } catch { /* continue cleanup */ }
    }
    try { await reconcileCreatedScopes(); }
    catch {
      cleanupOk = false;
      try { await ledger('fixture-scope-reconciliation', 'FAIL'); } catch { /* continue cleanup */ }
    }
    try {
      if (!await cleanupTrackedIds(projects, id => admin.from('projects').delete().eq('id', id).select('id'), ledger, 'cleanup-project')) cleanupOk = false;
    } catch { cleanupOk = false; }
    try {
      if (!await cleanupTrackedIds(organizations, id => admin.from('organizations').delete().eq('id', id).select('id'), ledger, 'cleanup-organization')) cleanupOk = false;
    } catch { cleanupOk = false; }
    for (const id of [...new Set(users)].reverse()) {
      try {
        const deleted = await admin.auth.admin.deleteUser(id);
        const ok = !deleted.error;
        await ledger('cleanup-user', ok ? 'PASS' : 'FAIL', { id });
        if (!ok) cleanupOk = false;
      } catch {
        cleanupOk = false;
        try { await ledger('cleanup-user', 'FAIL', { id }); } catch { /* continue cleanup */ }
      }
    }
    const verified = await verifyOwnedAbsent();
    if (!verified) cleanupOk = false;
    try { await ledger('cleanup-ids-verified', verified ? 'PASS' : 'FAIL'); } catch { cleanupOk = false; }
    return { ok: cleanupOk, ...snapshot() };
  }

  async function verifyOwnedAbsent() {
    try {
      const projectIds = projects.length ? await admin.from('projects').select('id').in('id', projects) : { data: [], error: null };
      const organizationIds = organizations.length ? await admin.from('organizations').select('id').in('id', organizations) : { data: [], error: null };
      const authIds = await findOwnAuthUsers();
      const organizationScopes = await Promise.all(plannedOrganizations.map(slug => admin.from('organizations').select('id').eq('slug', slug)));
      const projectScopes = await Promise.all(plannedProjects.map(({ orgId, slug }) => admin.from('projects').select('id').eq('organization_id', orgId).eq('slug', slug)));
      return !projectIds.error && !organizationIds.error && projectIds.data?.length === 0 && organizationIds.data?.length === 0 && authIds.length === 0 &&
        [...organizationScopes, ...projectScopes].every(result => !result.error && result.data?.length === 0);
    } catch { return false; }
  }

  function browserInputs() {
    if (!accounts.ownerA || !accounts.ownerB) throw new Error('BROWSER_ACCOUNTS_NOT_READY');
    return {
      U03_B4_A_EMAIL: accounts.ownerA.email,
      U03_B4_A_PASSWORD: accounts.ownerA.password,
      U03_B4_A1_PATH: `/proyectos/${namespace}-a/a1`,
      U03_B4_A2_PATH: `/proyectos/${namespace}-a/a2`,
      U03_B4_B_EMAIL: accounts.ownerB.email,
      U03_B4_B_PASSWORD: accounts.ownerB.password,
      U03_B4_B1_PATH: `/proyectos/${namespace}-b/b1`,
    };
  }

  function snapshot() {
    return { namespace, userIds: [...new Set(users)], organizationIds: [...new Set(organizations)], projectIds: [...new Set(projects)] };
  }

  function actorAccess(actor) {
    const account = accounts[actor];
    if (!account) throw new Error('AUTH_FIXTURES_REQUIRED');
    return { id: account.id, api: account.api, email: account.email };
  }

  async function actorBearer(actor) {
    const account = accounts[actor];
    if (!account) throw new Error('AUTH_FIXTURES_REQUIRED');
    const { data, error } = await account.api.auth.getSession();
    if (error || !data.session?.access_token || data.session.expires_at <= Date.now() / 1000)
      throw new Error('AUTH_FIXTURE_SESSION_UNAVAILABLE');
    return { id: account.id, accessToken: data.session.access_token };
  }

  async function verifyPopulatedCrossSurface({ a1, b1, auditSeqA, auditSeqB, resultIdA, resultIdB, importIdA, importIdB }) {
    if (![a1, b1, auditSeqA, auditSeqB, resultIdA, resultIdB, importIdA, importIdB].every(Boolean) ||
        !accounts.ownerA || !accounts.ownerB || !accounts.outsider)
      throw new Error('POPULATED_CROSS_FIXTURES_INVALID');
    const clients = { ownerA: accounts.ownerA.api, ownerB: accounts.ownerB.api, outsider: accounts.outsider.api };
    const checks = [];
    const safeStates = new Set(['42501','28P01','28000','57P01','0A000','42704','42710']);
    const executeStage = async ({ caseId, table, stage, actor, expectedCount, id, query, key }) => {
      const receiptState = table === 'imports' ? 'RESOLVED' : 'NOT_REQUIRED';
      const base = { actor, stage, expectedCount, receiptState };
      try { await ledger(caseId, 'ATTEMPTED', base); }
      catch { throw new Error('I5_LEDGER_WRITE_FAILED'); }

      let result;
      let queryException = false;
      try { result = await query(); } catch { queryException = true; }
      const error = result?.error;
      const rows = result?.data;
      const observedCount = Array.isArray(rows) ? rows.length : null;
      const valueMatch = expectedCount !== 1 || Array.isArray(rows) && rows.length === 1 &&
        String(rows[0]?.[key]) === String(id);
      let code;
      let category;
      let sqlstate;
      if (queryException) { code = 'DATA_API_EXCEPTION'; category = 'QUERY_FAILED'; }
      else if (error) {
        sqlstate = typeof error.code === 'string' && safeStates.has(error.code) ? error.code : undefined;
        code = sqlstate === '42501' ? 'SQL_PRIVILEGE_DENIED' : 'DATA_API_QUERY_FAILED';
        category = 'QUERY_FAILED';
      } else if (!Array.isArray(rows)) { code = 'DATA_API_RESULT_INCOMPLETE'; category = 'DIAGNOSTIC_INCOMPLETE'; }
      else if (observedCount !== expectedCount) { code = 'ROW_COUNT_MISMATCH'; category = 'ASSERTION_MISMATCH'; }
      else if (!valueMatch) { code = 'ROW_KEY_MISMATCH'; category = 'ASSERTION_MISMATCH'; }
      const passed = !queryException && !error && Array.isArray(rows) && observedCount === expectedCount && valueMatch;
      const detail = { ...base, category: passed ? 'EXPECTED_VISIBILITY' : category,
        ...(passed ? {} : { code }), observedCount, ...(expectedCount === 1 ? { valueMatch } : {}),
        ...(sqlstate ? { sqlstate } : {}) };
      let ledgerFailed = false;
      try { await ledger(caseId, passed ? 'PASS' : 'BLOCKED', detail); } catch { ledgerFailed = true; }
      if (!passed) throw new Error(code ?? 'I5_ASSERTION_FAILED');
      if (ledgerFailed) throw new Error('I5_LEDGER_WRITE_FAILED');
    };
    const surfaces = [
      { table: 'audit_events', key: 'seq', idA: auditSeqA, idB: auditSeqB },
      { table: 'provider_results', key: 'id', idA: resultIdA, idB: resultIdB },
      { table: 'imports', key: 'id', idA: importIdA, idB: importIdB },
    ];
    const owners = [
      { actor: 'ownerA', projectId: a1, idKey: 'idA' },
      { actor: 'ownerB', projectId: b1, idKey: 'idB' },
    ];
    for (const surface of surfaces) {
      const caseId = `i5-populated-${surface.table}`;
      const query = (actor, projectId, value) => surface.table === 'audit_events'
        ? clients[actor].from(surface.table).select('seq').eq('project_id', projectId).eq('seq', value)
        : clients[actor].from(surface.table).select('id').eq('project_id', projectId).eq('id', value);
      for (const owner of owners) {
        const ownId = surface[owner.idKey];
        await executeStage({ caseId, table: surface.table, stage: 'OWN_READ', actor: owner.actor,
          expectedCount: 1, id: ownId, key: surface.key, query: () => query(owner.actor, owner.projectId, ownId) });
      }
      for (const owner of owners) {
        const other = owners.find(candidate => candidate.actor !== owner.actor);
        const foreignId = surface[other.idKey];
        await executeStage({ caseId, table: surface.table, stage: 'CROSS_READ', actor: owner.actor,
          expectedCount: 0, id: foreignId, key: surface.key, query: () => query(owner.actor, other.projectId, foreignId) });
      }
      for (const owner of owners) {
        const foreignId = surface[owner.idKey];
        await executeStage({ caseId, table: surface.table, stage: 'OUTSIDER_READ', actor: 'outsider',
          expectedCount: 0, id: foreignId, key: surface.key, query: () => query('outsider', owner.projectId, foreignId) });
      }
      for (const owner of owners) {
        // audit_events.seq is a positive int4 in N1; MAX_SAFE_INTEGER overflows Postgres int4.
        const missingId = surface.table === 'audit_events' ? 0 : randomUUID();
        await executeStage({ caseId, table: surface.table, stage: 'MISSING_READ', actor: owner.actor,
          expectedCount: 0, id: missingId, key: surface.key, query: () => query(owner.actor, owner.projectId, missingId) });
      }
      try { await ledger(caseId, 'PASS', { actor: 'ownerA', stage: 'OWN_READ', category: 'CHECKS_COMPLETE',
        count: 8, receiptState: surface.table === 'imports' ? 'RESOLVED' : 'NOT_REQUIRED' }); }
      catch { throw new Error('I5_LEDGER_WRITE_FAILED'); }
      checks.push(surface.table);
    }
    return { passed: true, checks };
  }

  return { runId, ref, namespace, createUsers, createOrganizations, createProjects, createRevocationFixtures, createSessionFixtures,
    runMatrix, runMembershipRevocation, runRolesInvitations, runCrossSurface, verifyPopulatedCrossSurface,
    actorAccess, actorBearer, cleanup, verifyOwnedAbsent, browserInputs, snapshot };
}

async function main() {
  const ref = U03_PREVIEW_REF;
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const adminKey = process.env.U03_PREVIEW_ADMIN_KEY;
  const publicKey = process.env.U03_PREVIEW_PUBLIC_KEY;
  if (!adminKey || !publicKey) throw new Error('PREVIEW_KEYS_REQUIRED');
  const runId = randomUUID();
  const file = join(process.cwd(), 'test-results', 'u03-hosted', `${runId}.jsonl`);
  await mkdir(join(process.cwd(), 'test-results', 'u03-hosted'), { recursive: true });
  await appendFile(file, '', { flag: 'wx', mode: 0o600 });
  const ledger = async (caseId, status, detail = {}) => {
    await appendFile(file, `${JSON.stringify({ utc: new Date().toISOString(), runId, sha, ref, caseId, status, ...detail })}\n`, { mode: 0o600 });
    console.log(`${caseId}: ${status}`);
  };
  const admin = createPreviewAdminClient(`https://${ref}.supabase.co`, adminKey);
  const fixtures = createDataApiFixtureRun({ runId, sha, admin, publicKey, ledger, ref });
  let failed = false;
  try {
    const identity = await createClient(`https://${ref}.supabase.co`, publicKey, { auth: { persistSession: false, autoRefreshToken: false } }).rpc('preview_environment_identity');
    if (identity.error || !Array.isArray(identity.data) || identity.data.length !== 1 || identity.data[0]?.environment !== 'preview' || identity.data[0]?.project_ref !== ref) throw new Error('PREVIEW_IDENTITY_INVALID');
    await ledger('preview-sentinel-public-rpc', 'PASS');
    await fixtures.createUsers();
    const organizations = await fixtures.createOrganizations();
    const projects = await fixtures.createProjects(organizations);
    await fixtures.runMatrix({ ...organizations, ...projects });
    await ledger('matrix-run', 'PASS', { cases: 12 });
  } catch (error) {
    failed = true;
    await ledger('matrix-run', 'FAIL', { kind: error?.name || 'Error', reason: sanitizeDiagnostic(error?.message) });
  } finally {
    const cleanup = await fixtures.cleanup();
    await ledger('pending-receipts', 'REQUIRES_SQL_VERIFICATION', { projectIds: cleanup.projectIds });
    await ledger('matrix-global', failed || !cleanup.ok ? 'BLOCKED' : 'PARTIAL_PASS', { cases: 'Auth/Data API subset; Playwright and writer cases pending' });
    console.log(`Run: ${runId}`);
    console.log(`Ledger: ${file}`);
    if (failed || !cleanup.ok) process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
