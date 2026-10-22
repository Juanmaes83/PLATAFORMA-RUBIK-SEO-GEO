// Protected, read-only browser probe. It creates no Auth or database fixtures.
import { chromium } from 'playwright';
import { randomBytes, randomUUID } from 'node:crypto';
import { PIN, preflight, installScopedRoutes, createPageDiagnostics, scopedHeaders } from './u03-preview-b4-runner.mjs';

const origin = `https://${PIN.host}`;
const token = process.env.VERCEL_OIDC_TOKEN;
let browser;
try {
  await preflight({ token });
  browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ serviceWorkers:'block' });
  const page = await context.newPage();
  const diagnostics = createPageDiagnostics(page, { allowedOrigin:origin });
  const staticByPhase = { initial:{ok:new Set(),missing:new Set()}, rejectedAction:{ok:new Set(),missing:new Set()} };
  let phase = 'initial';
  let firstMissingStatic = null;
  const pinCategories = { initial:{}, rejectedAction:{} };
  page.on('response', response => {
    try {
      const url = new URL(response.url());
      if (url.origin !== origin || !url.pathname.startsWith('/_next/static/')) return;
      const pin = url.searchParams.get('dpl');
      const category = !pin ? 'ABSENT' : pin === PIN.deploymentId ? 'CURRENT' : 'OTHER';
      pinCategories[phase][category] = (pinCategories[phase][category] ?? 0) + 1;
      if (response.status() === 200) staticByPhase[phase].ok.add(url.pathname);
      if (response.status() === 404) {
        staticByPhase[phase].missing.add(url.pathname);
        if (!firstMissingStatic) firstMissingStatic = response.url();
      }
    } catch { /* no free-form diagnostic */ }
  });
  let pageErrors = 0;
  page.on('pageerror', () => { pageErrors++; });
  await installScopedRoutes(context, page, token, origin, () => {}, event => diagnostics.addRouteEvent(event));
  const response = await page.goto(`${origin}/acceso`, { waitUntil:'networkidle', timeout:30000 });
  const arrived = response?.status() === 200 && new URL(page.url()).origin === origin &&
    new URL(page.url()).pathname === '/acceso';
  const initial = diagnostics.snapshot();
  phase = 'rejectedAction';
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
  let independentStaticStatus = null;
  let independentStaticResponseClass = null;
  let queryPinnedStaticStatus = null;
  let headerPinnedStaticStatus = null;
  if (firstMissingStatic && new URL(firstMissingStatic).origin === origin) {
    try {
      const check = await fetch(firstMissingStatic, { headers:scopedHeaders(firstMissingStatic, {}, token, origin),
        redirect:'manual', cache:'no-store', signal:AbortSignal.timeout(15000) });
      independentStaticStatus = check.status;
      const type = check.headers.get('content-type') ?? '';
      const platformCode = check.headers.get('x-vercel-error') ?? '';
      independentStaticResponseClass = {
        content: type.includes('text/html') ? 'HTML' : type.includes('javascript') ? 'SCRIPT' :
          type.includes('text/css') ? 'STYLE' : 'OTHER',
        platform: ['DEPLOYMENT_NOT_FOUND','NOT_FOUND','FORBIDDEN'].includes(platformCode) ? platformCode :
          platformCode ? 'OTHER_CODE' : 'NO_CODE',
        nextRoute: check.headers.has('x-matched-path') ? 'PRESENT' : 'ABSENT',
      };
      await check.body?.cancel();
    } catch { independentStaticStatus = 'TRANSPORT_FAILED'; }
    try {
      const pinned = new URL(firstMissingStatic);
      pinned.searchParams.set('dpl', PIN.deploymentId);
      const check = await fetch(pinned, { headers:scopedHeaders(pinned.href, {}, token, origin),
        redirect:'manual', cache:'no-store', signal:AbortSignal.timeout(15000) });
      queryPinnedStaticStatus = check.status;
      await check.body?.cancel();
    } catch { queryPinnedStaticStatus = 'TRANSPORT_FAILED'; }
    try {
      const check = await fetch(firstMissingStatic, { headers:{...scopedHeaders(firstMissingStatic, {}, token, origin),
        'x-deployment-id':PIN.deploymentId}, redirect:'manual', cache:'no-store', signal:AbortSignal.timeout(15000) });
      headerPinnedStaticStatus = check.status;
      await check.body?.cancel();
    } catch { headerPinnedStaticStatus = 'TRANSPORT_FAILED'; }
  }
  const initialOk = staticByPhase.initial.ok;
  const laterMissing = staticByPhase.rejectedAction.missing;
  process.stdout.write(`${JSON.stringify({ mode:'H1A_READONLY_LOGIN_RESOURCES',
    deploymentId:PIN.deploymentId, sha:PIN.sha, ref:PIN.supabaseRef,
    result:arrived && rejectedWithoutSession && complete && consoleErrors === 0 && pageErrors === 0 ? 'PASS' : 'BLOCKED',
    arrived, rejectedWithoutSession, pageErrors, intervals:{ initial, rejectedAction:delta },
    staticComparison:{ initialOk:initialOk.size, laterMissing:laterMissing.size,
      laterMissingPreviouslyOk:[...laterMissing].filter(path => initialOk.has(path)).length,
      independentStaticStatus, independentStaticResponseClass,
      queryPinnedStaticStatus, headerPinnedStaticStatus, pinCategories } })}\n`);
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
