import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { PIN, GateError, chromiumEnvironment, installScopedRoutes, preflight } from './u03-preview-b4-runner.mjs';

const origin = `https://${PIN.host}`;
const previewApi = `https://${PIN.supabaseRef}.supabase.co`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function verifyS5Target({ env = process.env, inspect = preflight } = {}) {
  if (!env.VERCEL_OIDC_TOKEN || !env.U03_PREVIEW_PUBLIC_KEY) throw new GateError('S5_PREVIEW_CREDENTIALS_UNAVAILABLE');
  const pin = await inspect({ token: env.VERCEL_OIDC_TOKEN });
  if (pin.deploymentId !== PIN.deploymentId || pin.host !== PIN.host || pin.sha !== PIN.sha || pin.supabaseRef !== PIN.supabaseRef)
    throw new GateError('S5_PREVIEW_PIN_MISMATCH');
  const client = createClient(previewApi, env.U03_PREVIEW_PUBLIC_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const identity = await client.rpc('preview_environment_identity');
  if (identity.error || !Array.isArray(identity.data) || identity.data.length !== 1 ||
      identity.data[0]?.environment !== 'preview' || identity.data[0]?.project_ref !== PIN.supabaseRef)
    throw new GateError('S5_PREVIEW_DATABASE_IDENTITY_INVALID');
  return pin;
}

export function inspectForeignJwt(token, previewRef = PIN.supabaseRef) {
  if (typeof token !== 'string' || token.split('.').length !== 3) throw new GateError('S5_AUTH_TOKEN_INVALID');
  let claims;
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); }
  catch { throw new GateError('S5_AUTH_TOKEN_INVALID'); }
  const previewIssuer = `https://${previewRef}.supabase.co/auth/v1`;
  if (typeof claims.iss !== 'string' || !claims.iss || claims.iss === previewIssuer || !Number.isSafeInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000))
    throw new GateError('S5_FOREIGN_ISSUER_OR_EXPIRY_INVALID');
  return { issuer: claims.iss, exp: claims.exp };
}

function cookieValue(session) {
  const raw = JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token,
    expires_at: session.expires_at, expires_in: session.expires_in, token_type: session.token_type });
  return `base64-${Buffer.from(raw).toString('base64url')}`;
}

async function ledger(runId, caseId, status, detail = {}) {
  const row = { utc: new Date().toISOString(), runId, deploymentId: PIN.deploymentId, sha: PIN.sha,
    ref: PIN.supabaseRef, caseId, status, ...detail };
  await mkdir('test-results/u03-hosted', { recursive: true });
  await appendFile(join('test-results/u03-hosted', `${runId}.jsonl`), `${JSON.stringify(row)}\n`, { mode: 0o600 });
}

export async function runS5ForeignIssuer({ env = process.env, runId = randomUUID(),
  fetchImpl = fetch, launch = () => chromium.launch({ headless: true, env: chromiumEnvironment() }),
  inspect = verifyS5Target } = {}) {
  if (!uuid.test(runId) || !env.VERCEL_OIDC_TOKEN || !env.U03_PREVIEW_PUBLIC_KEY ||
      !env.U03_FOREIGN_ISSUER_URL || !env.U03_FOREIGN_ISSUER_ANON_KEY || !env.U03_FOREIGN_ISSUER_SERVICE_KEY)
    throw new GateError('S5_OPERATOR_INPUT_INVALID');
  let admin;
  let authUserId = null;
  let browser;
  let context;
  let passed = false;
  let failureCode = null;
  try {
    const pinned = await inspect({ env, token: env.VERCEL_OIDC_TOKEN });
    if (pinned.deploymentId !== PIN.deploymentId || pinned.host !== PIN.host || pinned.sha !== PIN.sha || pinned.supabaseRef !== PIN.supabaseRef)
      throw new GateError('S5_PREVIEW_PIN_MISMATCH');
    const foreignUrl = new URL(env.U03_FOREIGN_ISSUER_URL);
    if (foreignUrl.origin !== 'http://127.0.0.1:55421' || foreignUrl.username || foreignUrl.password || foreignUrl.search || foreignUrl.hash)
      throw new GateError('S5_FOREIGN_ISSUER_ENDPOINT_REJECTED');
    const localAnon = createClient(foreignUrl.origin, env.U03_FOREIGN_ISSUER_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    admin = createClient(foreignUrl.origin, env.U03_FOREIGN_ISSUER_SERVICE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

    const email = `u03-s5-${runId}@example.test`;
    const password = randomBytes(32).toString('base64url');
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { testRunId: runId, purpose: 'isolated-foreign-issuer' } });
    if (created.error || !created.data.user?.id) throw new GateError('S5_ISSUER_USER_CREATE_FAILED');
    authUserId = created.data.user.id;
    await ledger(runId, 'foreign-issuer-user', 'CREATED', { namespace: `u03-s5-${runId}`, ids: [authUserId] });
    const signedIn = await localAnon.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session?.access_token) throw new GateError('S5_AUTH_SIGNIN_FAILED');
    const session = signedIn.data.session;
    const timing = inspectForeignJwt(session.access_token);
    const expectedForeignIssuer = `${foreignUrl.origin}/auth/v1`;
    if (timing.issuer !== expectedForeignIssuer) throw new GateError('S5_FOREIGN_ISSUER_NOT_AUTHENTIC');
    await ledger(runId, 'foreign-issuer-token', 'PASS', { issuer: timing.issuer, exp: timing.exp });

    const api = await fetchImpl(`${previewApi}/rest/v1/projects?select=id&limit=1`, {
      headers: { apikey: env.U03_PREVIEW_PUBLIC_KEY, Authorization: `Bearer ${session.access_token}` },
      redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    const apiBody = await api.text();
    const apiRejected = (api.status === 401 || api.status === 403) && !apiBody.trimStart().startsWith('[');
    await ledger(runId, 's5-foreign-issuer-data-api', apiRejected ? 'PASS' : 'FAIL', { http: api.status });
    if (!apiRejected) throw new GateError('S5_DATA_API_ACCEPTED_FOREIGN_ISSUER');

    browser = await launch();
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const securityEvents = [];
    await installScopedRoutes(context, page, env.VERCEL_OIDC_TOKEN, origin,
      event => securityEvents.push(event), () => {}, runId);
    await context.addCookies([{ name: `sb-${PIN.supabaseRef}-auth-token`, value: cookieValue(session),
      domain: PIN.host, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
    const response = await page.goto(`${origin}/panel`, { waitUntil: 'domcontentloaded' });
    const pathname = new URL(page.url()).pathname;
    const routeRejected = pathname === '/acceso';
    await ledger(runId, 's5-foreign-issuer-protected-route', routeRejected && securityEvents.length === 0 ? 'PASS' : 'FAIL',
      { http: response?.status() ?? null, pathname });
    if (!routeRejected || securityEvents.length) throw new GateError('S5_PROTECTED_ROUTE_ACCEPTED_FOREIGN_ISSUER');
    passed = true;
  } catch (error) {
    failureCode = error instanceof GateError ? error.code : 'S5_SAFE_FAILURE';
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (authUserId && admin) {
      const deleted = await admin.auth.admin.deleteUser(authUserId).catch(() => ({ error: true }));
      const cleaned = !deleted.error;
      await ledger(runId, 'foreign-issuer-cleanup', cleaned ? 'PASS' : 'BLOCKED', { ids: [authUserId] }).catch(() => {});
      if (!cleaned) { passed = false; failureCode = 'S5_ISSUER_USER_CLEANUP_FAILED'; }
    }
  }
  if (failureCode || !passed) {
    const code = failureCode ?? 'S5_SAFE_FAILURE';
    await ledger(runId, 's5-foreign-issuer', 'BLOCKED', { code }).catch(() => {});
    throw new GateError(code);
  }
  await ledger(runId, 's5-foreign-issuer', 'PASS', { label: 'emisor ajeno aislado', deploymentId: PIN.deploymentId });
  return { passed: true, runId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runId = process.argv[process.argv.indexOf('--run-id') + 1];
  const task = process.argv.includes('--preflight-only') ? verifyS5Target() : runS5ForeignIssuer({ runId: runId || randomUUID() });
  task.then(() => process.stdout.write(process.argv.includes('--preflight-only') ? 'S5_PREVIEW_PREFLIGHT: PASS\n' : 'S5_FOREIGN_ISSUER: PASS\n')).catch(error => {
    const code = error instanceof GateError ? error.code : 'S5_SAFE_FAILURE';
    console.error(`S5_FOREIGN_ISSUER: BLOCKED code=${code}`);
    process.exit(1);
  });
}
