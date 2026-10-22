// Protected, read-only browser probe. It creates no Auth or database fixtures.
import { chromium } from 'playwright';
import { randomBytes, randomUUID } from 'node:crypto';
import { PIN, preflight, installScopedRoutes, createPageDiagnostics } from './u03-preview-b4-runner.mjs';

const origin = `https://${PIN.host}`;
const token = process.env.VERCEL_OIDC_TOKEN;
let browser;
try {
  await preflight({ token });
  browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ serviceWorkers:'block' });
  const page = await context.newPage();
  const diagnostics = createPageDiagnostics(page, { allowedOrigin:origin });
  let pageErrors = 0;
  page.on('pageerror', () => { pageErrors++; });
  await installScopedRoutes(context, page, token, origin, () => {}, event => diagnostics.addRouteEvent(event));
  const response = await page.goto(`${origin}/acceso`, { waitUntil:'networkidle', timeout:30000 });
  const arrived = response?.status() === 200 && new URL(page.url()).origin === origin &&
    new URL(page.url()).pathname === '/acceso';
  const initial = diagnostics.snapshot();
  await page.locator('#email').fill(`h1a-negative-${randomUUID()}@example.test`);
  await page.locator('#password').fill(randomBytes(32).toString('hex'));
  await page.getByRole('button', { name:'Entrar' }).click();
  await page.waitForURL(url => url.origin === origin && url.pathname === '/acceso' &&
    ['datos','credenciales'].includes(url.searchParams.get('error')), { timeout:20000 });
  const afterRejectedAction = diagnostics.snapshot();
  const rejectedWithoutSession = !(await context.cookies(origin)).some(cookie => cookie.name.startsWith(`sb-${PIN.supabaseRef}-auth-token`));
  const delta = {};
  for (const name of ['console','http','requestFailures','routeEvents']) {
    delta[name] = {};
    for (const [key, value] of Object.entries(afterRejectedAction[name])) {
      const count = value - (initial[name][key] ?? 0);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('READONLY_PROBE_COUNTER_INVALID');
      if (count) delta[name][key] = count;
    }
  }
  const consoleErrors = Object.entries(afterRejectedAction.console).filter(([key]) => key.startsWith('error:'))
    .reduce((sum, [, count]) => sum + count, 0);
  const complete = !afterRejectedAction.routeEvents['diagnostic-cardinality-exceeded'];
  process.stdout.write(`${JSON.stringify({ mode:'H1A_READONLY_LOGIN_RESOURCES',
    deploymentId:PIN.deploymentId, sha:PIN.sha, ref:PIN.supabaseRef,
    result:arrived && rejectedWithoutSession && complete && consoleErrors === 0 && pageErrors === 0 ? 'PASS' : 'BLOCKED',
    arrived, rejectedWithoutSession, pageErrors, intervals:{ initial, rejectedAction:delta } })}\n`);
  if (!arrived || !rejectedWithoutSession || !complete || consoleErrors || pageErrors) process.exitCode = 1;
  diagnostics.dispose();
  await context.close();
} catch {
  process.stdout.write(`${JSON.stringify({mode:'H1A_READONLY_LOGIN_RESOURCES',deploymentId:PIN.deploymentId,
    sha:PIN.sha,ref:PIN.supabaseRef,result:'BLOCKED',code:'READONLY_PROBE_FAILED'})}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
