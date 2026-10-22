import { mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { chromium } from 'playwright';
import { PIN, GateError, chromiumEnvironment, installScopedRoutes, login, createPageDiagnostics, saveSanitizedCapture } from './u03-preview-b4-runner.mjs';

const origin = `https://${PIN.host}`;

export function sameOriginActionResponseReceived(status) {
  return Number.isInteger(status) && status >= 200 && status <= 599;
}

export function googleGuardResult({ status, pathname, error, disabledTextVisible }) {
  return (status === 200 || status === 303) && pathname.endsWith('/google') &&
    error === 'DISABLED' && disabledTextVisible === true;
}

/** Calls the product's owner-authorized Server Actions with both providers disabled in Preview. */
export async function runProviderEgressOnly({ env, account, path, ledger, runId, captureRoot,
  launch = () => chromium.launch({ headless: true, env: chromiumEnvironment() }) } = {}) {
  if (!account?.email || !account?.password || !account?.api || !/^\/proyectos\/u03-[a-z0-9]+-a\/a1$/.test(path ?? '') ||
      !env?.VERCEL_OIDC_TOKEN || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId ?? '')) {
    throw new GateError('PROVIDER_EGRESS_FIXTURE_INVALID');
  }

  await mkdir(captureRoot, { recursive: true });
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES', serviceWorkers: 'block' });
  const page = await context.newPage();
  const diagnostics = createPageDiagnostics(page);
  const securityEvents = [];
  const routeEvents = [];
  let openSeoActionHttp = null;
  let googleActionHttp = null;
  let phase = 'login';
  try {
    await installScopedRoutes(context, page, env.VERCEL_OIDC_TOKEN, origin,
      event => securityEvents.push(event), event => { routeEvents.push(event); diagnostics.addRouteEvent(event); }, runId);
    page.on('response', response => {
      const request = response.request();
      try {
        if (request.method() !== 'POST' || new URL(request.url()).origin !== origin) return;
        if (phase === 'openseo') openSeoActionHttp = response.status();
        if (phase === 'google') googleActionHttp = response.status();
      } catch { /* retain only an HTTP status for a same-origin action */ }
    });
    await login(page, context, account.email, account.password, { origin, runId, ledger, routeEvents });
    await ledger('provider-egress-owner-login', 'PASS', { pathname: '/panel' });
    const auditPath = `${path}/auditoria-tecnica`;
    const pageResponse = await page.goto(`${origin}${auditPath}`, { waitUntil: 'domcontentloaded' });
    if (pageResponse?.status() !== 200 || new URL(page.url()).pathname !== auditPath) throw new GateError('PROVIDER_EGRESS_OWNER_PAGE_UNAVAILABLE');

    const probe = page.locator('[aria-labelledby="provider-egress-probe"]');
    if (await probe.count() !== 1) throw new GateError('PROVIDER_EGRESS_PROBE_NOT_RENDERED');
    phase = 'openseo';
    await probe.getByRole('button', { name: 'Comprobar guarda OpenSEO' }).click();
    const openSeoStatus = probe.locator('[role="status"]').nth(0);
    await openSeoStatus.waitFor({ state: 'visible' });
    // Next.js can issue a same-origin Server Action POST without the CDP route classifier
    // identifying its `next-action` header. A same-origin POST response received after the
    // click is the stronger evidence that this action completed; login is already over.
    const openSeoRequestReceived = sameOriginActionResponseReceived(openSeoActionHttp);
    const openSeoObserved = openSeoRequestReceived && (await openSeoStatus.innerText()).includes('bloqueado antes del transporte') && openSeoActionHttp === 200;
    await ledger('provider-egress-openseo', openSeoObserved ? 'PASS' : 'FAIL', { category: 'CAPABILITY', result: openSeoObserved ? 'BLOCKED' : 'UNEXPECTED', http: openSeoActionHttp, count: openSeoRequestReceived ? 1 : 0 });
    if (!openSeoObserved) throw new GateError('OPENSEO_GUARD_RESULT_UNEXPECTED');

    phase = 'google';
    const googlePath = `${path}/google`;
    await Promise.all([
      page.waitForURL(url => url.origin === origin && url.pathname === googlePath && url.searchParams.get('error') === 'DISABLED', { timeout: 15000 }),
      probe.getByRole('button', { name: 'Comprobar guarda Google' }).click(),
    ]);
    const googleRequestReceived = sameOriginActionResponseReceived(googleActionHttp);
    const googleUrl = new URL(page.url());
    const googleObserved = googleRequestReceived && googleGuardResult({
      status: googleActionHttp,
      pathname: googleUrl.pathname,
      error: googleUrl.searchParams.get('error'),
      disabledTextVisible: (await page.locator('body').innerText()).includes('Lecturas de Google desactivadas'),
    });
    await ledger('provider-egress-google', googleObserved ? 'PASS' : 'FAIL', { category: 'CAPABILITY', result: googleObserved ? 'BLOCKED' : 'UNEXPECTED', http: googleActionHttp, count: googleRequestReceived ? 1 : 0 });
    if (!googleObserved) throw new GateError('GOOGLE_GUARD_RESULT_UNEXPECTED');

    phase = 'capture';
    const capture = join(captureRoot, `${runId}-desktop-provider-egress.png`);
    if (!await saveSanitizedCapture(page, capture)) throw new GateError('PROVIDER_EGRESS_CAPTURE_SANITIZATION_FAILED');
    await ledger('provider-egress-capture', 'SAVED', { path: relative(process.cwd(), capture), viewport: 'desktop' });
    if (securityEvents.length) throw new GateError('PROVIDER_EGRESS_EXTERNAL_BROWSER_REQUEST');

    phase = 'logout';
    await page.getByRole('button', { name: 'Salir' }).click();
    await page.waitForURL(url => url.origin === origin && url.pathname === '/', { timeout: 15000 });
    await ledger('provider-egress-logout', 'PASS', { pathname: '/' });
    return { passed: true, captures: [capture], routeEvents };
  } catch (error) {
    if (error instanceof GateError) throw error;
    throw new GateError(`PROVIDER_EGRESS_${phase.toUpperCase()}_FAILED`);
  } finally {
    diagnostics.dispose();
    await context.close().catch(() => {});
    await browser.close();
  }
}
