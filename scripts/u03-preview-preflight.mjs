import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EMPTY_TABLE_SELECT, emptyTableUrl } from './u03-preview-queries.mjs';

const ref = 'rhnnplewqsekrnaousyl';
const deployment = 'plataforma-rubik-seo-7v2wmueoy-juanma-espinosas-projects.vercel.app';
const sha = 'ac5a5ff6d92f1ebd5304ad7fea9b91a8fa617138';
const base = `https://${ref}.supabase.co`;
const adminKey = process.env.U03_PREVIEW_ADMIN_KEY;
const publicKey = process.env.U03_PREVIEW_PUBLIC_KEY;
const bypass = process.env.U03_VERCEL_BYPASS;
const runId = randomUUID();
const dir = join(process.cwd(), 'test-results', 'u03-hosted');
const file = join(dir, `${runId}.jsonl`);

if (!adminKey || !publicKey) throw new Error('Faltan claves de Preview.');
await mkdir(dir, { recursive: true });
const record = async (check, status, detail = {}) => {
  const row = { utc: new Date().toISOString(), runId, sha, ref, deployment, check, status, ...detail };
  await appendFile(file, `${JSON.stringify(row)}\n`, { mode: 0o600 });
  console.log(`${check}: ${status}`);
};
const request = async (url, headers) => {
  const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  let body = null;
  try { body = await response.json(); } catch { /* protected redirects can be HTML */ }
  return { status: response.status, body };
};

let failed = false;
try {
  const settings = await request(`${base}/auth/v1/settings`, { apikey: publicKey });
  const closed = settings.status === 200 && settings.body?.disable_signup === true;
  await record('auth-registration-closed', closed ? 'PASS' : 'BLOCKED', { http: settings.status });
  if (!closed) failed = true;

  const admin = await request(`${base}/auth/v1/admin/users?page=1&per_page=1`, {
    apikey: adminKey, Authorization: `Bearer ${adminKey}`,
  });
  const adminOk = admin.status === 200 && Array.isArray(admin.body?.users);
  await record('preview-admin-auth', adminOk ? 'PASS' : 'BLOCKED', { http: admin.status });
  if (!adminOk) failed = true;
  const noUsers = adminOk && admin.body.users.length === 0;
  await record('auth-users-empty', noUsers ? 'PASS' : 'BLOCKED');
  if (!noUsers) failed = true;
  for (const table of Object.keys(EMPTY_TABLE_SELECT)) {
    const rows = await request(emptyTableUrl(base, table), {
      apikey: adminKey, Authorization: `Bearer ${adminKey}`,
    });
    const empty = rows.status === 200 && Array.isArray(rows.body) && rows.body.length === 0;
    await record(`${table}-empty`, empty ? 'PASS' : 'BLOCKED', { http: rows.status });
    if (!empty) failed = true;
  }

  if (bypass) {
    const salud = await request(`https://${deployment}/api/salud`, {
      'x-vercel-protection-bypass': bypass,
    });
    const isolated = salud.status === 200 &&
      salud.body?.supabaseProjectRef === ref && salud.body?.auth === 'preview-isolated';
    await record('protected-preview-identity', isolated ? 'PASS' : 'BLOCKED', { http: salud.status });
    if (salud.status === 200 && !isolated) failed = true;
  } else {
    await record('protected-preview-identity', 'BLOCKED', { reason: 'bypass-unavailable' });
  }
} catch (error) {
  failed = true;
  await record('preflight-transport', 'BLOCKED', { kind: error?.name || 'Error' });
}

await record('fixtures-created', 'NONE');
console.log(`Ledger: ${file}`);
if (failed) process.exitCode = 1;
