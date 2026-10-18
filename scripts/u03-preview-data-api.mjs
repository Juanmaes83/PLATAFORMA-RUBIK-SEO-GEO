import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ownerInventoryAccepted } from './u03-preview-inventory-check.mjs';

const ref = 'rhnnplewqsekrnaousyl';
const sha = 'ac5a5ff6d92f1ebd5304ad7fea9b91a8fa617138';
const url = `https://${ref}.supabase.co`;
const adminKey = process.env.U03_PREVIEW_ADMIN_KEY;
const publicKey = process.env.U03_PREVIEW_PUBLIC_KEY;
if (!adminKey || !publicKey) throw new Error('Faltan claves de Preview.');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, adminKey, options);
const client = () => createClient(url, publicKey, options);
const runId = randomUUID();
const namespace = `u03-${runId.slice(0, 12)}`;
const ledgerDir = join(process.cwd(), 'test-results', 'u03-hosted');
const ledgerPath = join(ledgerDir, `${runId}.jsonl`);
await mkdir(ledgerDir, { recursive: true });
const ledger = async (caseId, status, detail = {}) => {
  await appendFile(ledgerPath, `${JSON.stringify({ utc: new Date().toISOString(), runId, sha, ref, caseId, status, ...detail })}\n`, { mode: 0o600 });
  console.log(`${caseId}: ${status}`);
};
const assert = async (caseId, condition) => {
  await ledger(caseId, condition ? 'PASS' : 'FAIL');
  if (!condition) throw new Error(`U03 ${caseId} falló`);
};
const users = [];
const orgs = [];
const projects = [];
const accounts = {};
const actors = ['ownerA', 'ownerB', 'outsider'];
const ownEmails = new Set(actors.map(actor => `${actor}-${namespace}@ejemplo.test`));
let failed = false;

async function findOwnAuthUsers() {
  const found = [];
  for (let page = 1; page <= 20; page++) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (listed.error || !Array.isArray(listed.data?.users)) throw new Error('Inventario Auth indisponible');
    const pageUsers = listed.data.users;
    found.push(...pageUsers.filter(user => ownEmails.has(user.email)).map(user => user.id));
    if (pageUsers.length < 100) return found;
  }
  throw new Error('Inventario Auth excede el límite seguro');
}

async function createUser(actor) {
  const email = `${actor}-${namespace}@ejemplo.test`;
  const password = randomBytes(32).toString('base64url');
  await ledger(`fixture-user-${actor}`, 'PLANNED', { namespace, actor });
  let created;
  try { created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); }
  catch { await ledger(`fixture-user-${actor}`, 'AMBIGUOUS'); throw new Error(`Alta Auth ambigua: ${actor}`); }
  if (created.error || !created.data.user?.id) {
    await ledger(`fixture-user-${actor}`, 'AMBIGUOUS');
    throw new Error(`Alta Auth ambigua: ${actor}`);
  }
  users.push(created.data.user.id);
  await ledger(`fixture-user-${actor}`, 'CREATED', { id: created.data.user.id });
  const signed = client();
  const login = await signed.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session?.access_token) throw new Error(`Login Auth falló: ${actor}`);
  accounts[actor] = { api: signed, id: created.data.user.id };
  await ledger(`auth-login-${actor}`, 'PASS');
}

async function createOrganization(actor, slug) {
  const id = randomUUID();
  await ledger(`fixture-org-${actor}`, 'PLANNED', { id });
  orgs.push(id);
  const inserted = await accounts[actor].api.from('organizations').insert({ id, slug, name: `U03 ${actor}` }).select('id').single();
  if (inserted.error || inserted.data?.id !== id) throw new Error(`Alta organización ambigua: ${actor}`);
  await ledger(`fixture-org-${actor}`, 'CREATED', { id });
  return id;
}

async function createProject(actor, orgId, slug) {
  const id = randomUUID();
  await ledger(`fixture-project-${slug}`, 'PLANNED', { id, organizationId: orgId });
  projects.push(id);
  const inserted = await accounts[actor].api.from('projects').insert({ id, organization_id: orgId, slug, name: `U03 ${slug}` }).select('id').single();
  if (inserted.error || inserted.data?.id !== id) throw new Error(`Alta proyecto ambigua: ${slug}`);
  await ledger(`fixture-project-${slug}`, 'CREATED', { id });
  return id;
}

try {
  const identity = await client().rpc('preview_environment_identity');
  await assert('preview-sentinel-public-rpc', !identity.error &&
    Array.isArray(identity.data) && identity.data.length === 1 &&
    identity.data[0]?.environment === 'preview' && identity.data[0]?.project_ref === ref);

  for (const actor of actors) await createUser(actor);
  const orgA = await createOrganization('ownerA', `${namespace}-a`);
  const orgB = await createOrganization('ownerB', `${namespace}-b`);
  const a1 = await createProject('ownerA', orgA, 'a1');
  const a2 = await createProject('ownerA', orgA, 'a2');
  const b1 = await createProject('ownerB', orgB, 'b1');
  const a = accounts.ownerA.api, b = accounts.ownerB.api, outsider = accounts.outsider.api;

  const aRows = await a.from('projects').select('id');
  const bRows = await b.from('projects').select('id');
  const outRows = await outsider.from('projects').select('id');
  await assert('rls-owner-positive-a1-a2', !aRows.error && aRows.data?.length === 2 && [a1, a2].every(id => aRows.data.some(row => row.id === id)));
  await assert('rls-owner-positive-b1', !bRows.error && bRows.data?.length === 1 && bRows.data[0].id === b1);
  await assert('rls-outsider-empty', !outRows.error && outRows.data?.length === 0);
  const anonRows = await client().from('projects').select('id');
  await assert('rls-anonymous-empty', anonRows.error?.code === '42501' || (!anonRows.error && anonRows.data?.length === 0));
  const cross = await b.from('projects').select('id').eq('id', a1);
  await assert('rls-cross-project-id', !cross.error && cross.data?.length === 0);
  const crossOrg = await b.from('organizations').select('id').eq('id', orgA);
  await assert('rls-cross-organization-id', !crossOrg.error && crossOrg.data?.length === 0);

  const forged = await outsider.auth.updateUser({ data: { role: 'owner', organization_id: orgA, project_id: a1 } });
  if (forged.error) throw new Error('No se pudo cambiar metadata ficticia');
  const refresh = await outsider.auth.refreshSession();
  const forgedRows = await outsider.from('projects').select('id');
  await assert('rls-forged-user-metadata', !refresh.error && !forgedRows.error && forgedRows.data?.length === 0);
  const membership = await a.from('project_members').insert({ project_id: a1, organization_id: orgA, user_id: accounts.outsider.id, role: 'owner' });
  await assert('rls-direct-membership-insert-denied', membership.error?.code === '42501');
  const audit = await a.from('audit_events').insert({ project_id: a1, organization_id: orgA });
  await assert('rls-direct-audit-insert-denied', audit.error?.code === '42501');
  const foreignRpc = await b.rpc('project_data_inventory', { p_project_id: a1 });
  const ownRpc = await a.rpc('project_data_inventory', { p_project_id: a1 });
  await assert('rpc-cross-tenant-denied', foreignRpc.error?.code === '42501');
  await assert('rpc-owner-authorized', ownerInventoryAccepted(ownRpc, a1, aRows.data));

  const bearer = await fetch(`${url}/rest/v1/projects?select=id`, {
    headers: { apikey: publicKey, Authorization: 'Bearer invalid-u03-token' },
    signal: AbortSignal.timeout(15000),
  });
  await assert('invalid-bearer-rejected', bearer.status === 401);
} catch (error) {
  failed = true;
  await ledger('matrix-run', 'FAIL', { kind: error?.name || 'Error', reason: String(error?.message || '').slice(0, 120) });
} finally {
  try {
    for (const id of await findOwnAuthUsers()) {
      if (!users.includes(id)) {
        users.push(id);
        await ledger('fixture-user-recovered', 'RECOVERED', { id });
      }
    }
    await ledger('auth-id-reconciliation', 'PASS');
  } catch { failed = true; await ledger('auth-id-reconciliation', 'FAIL'); }
  for (const id of projects.reverse()) {
    try {
      const deleted = await admin.from('projects').delete().eq('id', id).select('id');
      const ok = !deleted.error && deleted.data?.length <= 1 && deleted.data.every(row => row.id === id);
      await ledger('cleanup-project', ok ? 'PASS' : 'FAIL', { id, removed: deleted.data?.length ?? null });
      if (!ok) failed = true;
    } catch { failed = true; await ledger('cleanup-project', 'FAIL', { id }); }
  }
  for (const id of orgs.reverse()) {
    try {
      const deleted = await admin.from('organizations').delete().eq('id', id).select('id');
      const ok = !deleted.error && deleted.data?.length <= 1 && deleted.data.every(row => row.id === id);
      await ledger('cleanup-organization', ok ? 'PASS' : 'FAIL', { id, removed: deleted.data?.length ?? null });
      if (!ok) failed = true;
    } catch { failed = true; await ledger('cleanup-organization', 'FAIL', { id }); }
  }
  for (const id of users.reverse()) {
    try {
      const deleted = await admin.auth.admin.deleteUser(id);
      const ok = !deleted.error;
      await ledger('cleanup-user', ok ? 'PASS' : 'FAIL', { id });
      if (!ok) failed = true;
    } catch { failed = true; await ledger('cleanup-user', 'FAIL', { id }); }
  }
  try {
    const projectRows = projects.length ? await admin.from('projects').select('id').in('id', projects) : { data: [], error: null };
    const orgRows = orgs.length ? await admin.from('organizations').select('id').in('id', orgs) : { data: [], error: null };
    const authRows = await findOwnAuthUsers();
    const clear = !projectRows.error && !orgRows.error && projectRows.data?.length === 0 && orgRows.data?.length === 0 && authRows.length === 0;
    await ledger('cleanup-ids-verified', clear ? 'PASS' : 'FAIL');
    if (!clear) failed = true;
  } catch { failed = true; await ledger('cleanup-ids-verified', 'FAIL'); }
  await ledger('pending-receipts', 'REQUIRES_SQL_VERIFICATION', { projectIds: projects });
  await ledger('matrix-global', failed ? 'BLOCKED' : 'PARTIAL_PASS', { cases: 'Auth/Data API subset; Playwright and writer cases pending' });
  console.log(`Ledger: ${ledgerPath}`);
  if (failed) process.exitCode = 1;
}
