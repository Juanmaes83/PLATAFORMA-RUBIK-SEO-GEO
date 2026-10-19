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
  const ownEmails = new Set(ACTORS.map(actor => `${actor}-${namespace}@ejemplo.test`));
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

  return { runId, ref, namespace, createUsers, createOrganizations, createProjects, runMatrix, cleanup, verifyOwnedAbsent, browserInputs, snapshot };
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
