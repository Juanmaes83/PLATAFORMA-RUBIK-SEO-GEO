// Protected, read-only browser probe. It creates no Auth or database fixtures.
import { chromium } from 'playwright';
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
  const snapshot = diagnostics.snapshot();
  const consoleErrors = Object.entries(snapshot.console).filter(([key]) => key.startsWith('error:'))
    .reduce((sum, [, count]) => sum + count, 0);
  const complete = !snapshot.routeEvents['diagnostic-cardinality-exceeded'];
  process.stdout.write(`${JSON.stringify({ mode:'H1A_READONLY_LOGIN_RESOURCES',
    deploymentId:PIN.deploymentId, sha:PIN.sha, ref:PIN.supabaseRef,
    result:arrived && complete && consoleErrors === 0 && pageErrors === 0 ? 'PASS' : 'BLOCKED',
    arrived, pageErrors, diagnostics:snapshot })}\n`);
  if (!arrived || !complete || consoleErrors || pageErrors) process.exitCode = 1;
  diagnostics.dispose();
  await context.close();
} catch {
  process.stdout.write(`${JSON.stringify({mode:'H1A_READONLY_LOGIN_RESOURCES',deploymentId:PIN.deploymentId,
    sha:PIN.sha,ref:PIN.supabaseRef,result:'BLOCKED',code:'READONLY_PROBE_FAILED'})}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
