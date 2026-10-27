import { expect, test } from '@playwright/test';
import { TEST_PASSPHRASE, TENANT, PROJECT, USERS } from './support';

type TraceRow = { ordinal?: number; stage?: string; resourceClass?: string; initiatorClass?: string;
  scriptSourceClass?: string; rscClass?: string; prefetchClass?: string; domLinkClass?: string;
  result?: string; failureCategory?: string | null; httpStatus?: number | null; tracePhase?: string };
type AuditWindow = Window & { __audit: { intercepted: number; headersSeen: number; bodyCancelled: number };
  __releasePrefetch?: () => void };
type CdpSession = { on: (event: string, callback: (payload: unknown) => void) => void;
  send: (method: string) => Promise<unknown> };
type InterceptorModule = { installScopedRoutes: (
  context: unknown, page: unknown, token: string | null, origin: string,
  onEvent: (...args: unknown[]) => void, onRoute: (...args: unknown[]) => void,
  runId: string | null, onDiagnostic: (...args: unknown[]) => void,
  onTrace: (row: TraceRow) => void, blockExternal: boolean,
) => Promise<CdpSession> };
type RequestEvent = { requestId: string; request: { url: string; headers: Record<string, string> } };
type ResponseEvent = { requestId: string; response: { status: number } };
type TerminalEvent = { requestId: string; canceled?: boolean };

for (const variant of ['normal', 'hover', 'cancel-prefetch', 'navigate-pending', 'no-interceptor'] as const) {
  for (const repeat of [1, 2]) test(`production login and views: ${variant} ${repeat}`, async ({ page, context }, info) => {
    // The Playwright TS loader rewrites static ESM imports to CJS. Keep the
    // repository's .mjs interceptor under Node's native ESM loader.
    const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
    const { installScopedRoutes } = await nativeImport(new URL('../scripts/u03-preview-b4-runner.mjs',
      `file:///${process.cwd().replaceAll('\\', '/')}/e2e/`).href) as InterceptorModule;
    const origin = new URL(info.project.use.baseURL!).origin;
    const trace: TraceRow[] = [];
    let phase = 'LOGIN';
    let consoleErrors = 0;
    let pageErrors = 0;
    const project = `/proyectos/${TENANT}/${PROJECT}`;
    if (variant === 'cancel-prefetch' || variant === 'navigate-pending') {
      await page.addInitScript(({ target, mode }) => {
        const nativeFetch = window.fetch.bind(window);
        Object.defineProperty(window, '__audit', { value: { intercepted: 0, headersSeen: 0, bodyCancelled: 0 }, configurable: false });
        window.fetch = async (...args) => {
          const input = args[0];
          const options = args[1];
          const headers = new Headers(options?.headers ?? (input instanceof Request ? input.headers : undefined));
          const url = new URL(input instanceof Request ? input.url : String(input), location.href);
          if (url.pathname !== target || !headers.has('Next-Router-Prefetch')) return nativeFetch(...args);
          (window as unknown as AuditWindow).__audit.intercepted++;
          const response = await nativeFetch(...args);
          if (response.status !== 200) return response;
          (window as unknown as AuditWindow).__audit.headersSeen++;
          if (mode === 'cancel-prefetch') {
            await response.body?.cancel();
            (window as unknown as AuditWindow).__audit.bodyCancelled++;
          } else {
            await new Promise<void>(resolve => { (window as unknown as AuditWindow).__releasePrefetch = resolve; });
          }
          return response;
        };
      }, { target: project, mode: variant });
    }
    page.on('console', message => { if (message.type() === 'error') consoleErrors++; });
    page.on('pageerror', () => pageErrors++);
    const native = { requests: 0, responses200: 0, finished: 0, cancelled: 0, failed: 0 };
    const targetRequests = new Map<string, { prefetch: boolean; terminal: string }>();
    if (variant === 'no-interceptor') await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) return route.abort();
      return route.continue();
    });
    const session = variant === 'no-interceptor' ? await context.newCDPSession(page)
      : await installScopedRoutes(context, page, null, origin, () => {}, () => {}, null, () => {},
        row => trace.push({ ...row, tracePhase: phase }), true);
    const observed = new Set<string>();
    session.on('Network.requestWillBeSent', payload => {
      const event = payload as RequestEvent;
      if (new URL(event.request.url).pathname === project) {
        const headers = new Headers(event.request.headers);
        targetRequests.set(event.requestId, { prefetch: headers.has('Next-Router-Prefetch'), terminal: 'UNKNOWN' });
      }
      if (new URL(event.request.url).searchParams.has('_rsc')) {
        observed.add(event.requestId);
        native.requests++;
      }
    });
    session.on('Network.responseReceived', payload => {
      const event = payload as ResponseEvent;
      if (observed.has(event.requestId) && event.response.status === 200) native.responses200++;
    });
    session.on('Network.loadingFinished', payload => {
      const event = payload as TerminalEvent;
      const target = targetRequests.get(event.requestId);
      if (target) target.terminal = 'FINISHED';
      if (observed.has(event.requestId)) native.finished++;
    });
    session.on('Network.loadingFailed', payload => {
      const event = payload as TerminalEvent;
      const target = targetRequests.get(event.requestId);
      if (target) target.terminal = event.canceled ? 'CANCELLED' : 'FAILED';
      if (observed.has(event.requestId)) {
        if (event.canceled) native.cancelled++;
        else native.failed++;
      }
    });
    if (variant === 'no-interceptor') await session.send('Network.enable');
    await page.goto('/acceso');
    await page.getByLabel('Correo').fill(USERS.owner);
    await page.getByLabel('Contraseña').fill(TEST_PASSPHRASE);
    const loginPost = page.waitForResponse(response => response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/auth/login');
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect((await loginPost).status()).toBe(303);
    await expect(page).toHaveURL(/\/panel$/);
    await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
    expect((await context.cookies(origin)).some(cookie => cookie.name.startsWith('sb-'))).toBe(true);
    phase = 'PANEL';
    const projectLink = page.locator(`a[href="${project}"]`).first();
    await expect(projectLink).toBeVisible();
    if (variant === 'hover') await projectLink.hover();
    await page.waitForTimeout(400);
    const injection = variant === 'cancel-prefetch' || variant === 'navigate-pending'
      ? await page.evaluate(() => ({ ...(window as unknown as AuditWindow).__audit })) : null;
    if (variant === 'cancel-prefetch') expect(injection?.bodyCancelled).toBeGreaterThan(0);
    if (variant === 'navigate-pending') {
      expect(injection?.headersSeen).toBeGreaterThan(0);
      await page.goto(project);
    } else await projectLink.click();
    await expect(page).toHaveURL(new RegExp(`${project}$`));
    phase = 'VIEWS';
    await page.goto(`${project}/medicion`);
    await expect(page.getByRole('heading', { name: /Medici[oó]n/ }).first()).toBeVisible();
    await page.goto(`${project}/informe`);
    await expect(page.getByRole('heading', { name: 'Informe del proyecto' })).toBeVisible();
    const counts = { requests: 0, responses: 0, finished: 0, cancelled: 0, incomplete: 0 };
    const ordinals = new Map<number, Set<string>>();
    for (const row of trace) {
      if (typeof row.ordinal !== 'number') continue;
      const stages = ordinals.get(row.ordinal) ?? new Set<string>();
      stages.add(row.stage === 'TERMINAL' && row.failureCategory === 'NETWORK_CANCELLED' ? 'CANCELLED' : row.stage ?? 'UNKNOWN');
      ordinals.set(row.ordinal, stages);
      if (row.stage === 'REQUEST') counts.requests++;
      if (row.stage === 'RESPONSE') counts.responses++;
      if (row.stage === 'TERMINAL' && row.result === 'CONTINUED') counts.finished++;
      if (row.failureCategory === 'NETWORK_CANCELLED') counts.cancelled++;
    }
    counts.incomplete = [...ordinals.values()].filter(stages => stages.has('REQUEST') && !stages.has('TERMINAL') && !stages.has('CANCELLED')).length;
    const phaseCounts = Object.fromEntries(['LOGIN', 'PANEL', 'VIEWS'].map(name => [name, {
      requests: trace.filter(row => row.tracePhase === name && row.stage === 'REQUEST').length,
      cancelled: trace.filter(row => row.tracePhase === name && row.failureCategory === 'NETWORK_CANCELLED').length,
    }]));
    expect(consoleErrors).toBe(0);
    expect(pageErrors).toBe(0);
    const safe = { viewport: info.project.name, variant, repeat, login: 'HTTP_303_SESSION', views: 'PANEL_MEASUREMENT_REPORT',
      ...counts, nextRsc: trace.filter(row => row.stage === 'REQUEST' && row.rscClass === 'RSC').length,
      prefetchHint: trace.filter(row => row.stage === 'REQUEST' && row.prefetchClass === 'PREFETCH_HINT').length,
      phaseCounts, native, intervention: injection?.headersSeen ?? 0,
      cancelledBeforeReturn: injection?.bodyCancelled ?? 0,
      targetPrefetches: [...targetRequests.values()].filter(value => value.prefetch).length,
      targetPrefetchCancelled: [...targetRequests.values()].filter(value => value.prefetch && value.terminal === 'CANCELLED').length,
      targetDirectRequests: [...targetRequests.values()].filter(value => !value.prefetch).length };
    process.stdout.write(`H1A_LOCAL_PROD_XHR ${JSON.stringify(safe)}\n`);
    expect(JSON.stringify(trace)).not.toMatch(/127\.0\.0\.1|https?:|_rsc=|cookie|requestId|networkId|frameId/);
  });
}

test('production owner project views remain denied to a different tenant', async ({ page, context }, info) => {
  const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
  const { installScopedRoutes } = await nativeImport(new URL('../scripts/u03-preview-b4-runner.mjs',
    `file:///${process.cwd().replaceAll('\\', '/')}/e2e/`).href) as InterceptorModule;
  await installScopedRoutes(context, page, null, new URL(info.project.use.baseURL!).origin,
    () => {}, () => {}, null, () => {}, () => {}, true);
  await page.goto('/acceso');
  await page.getByLabel('Correo').fill(USERS.outsider);
  await page.getByLabel('Contraseña').fill(TEST_PASSPHRASE);
  const post = page.waitForResponse(response => response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/auth/login');
  await page.getByRole('button', { name: 'Entrar' }).click();
  expect((await post).status()).toBe(303);
  await expect(page).toHaveURL(/\/panel$/);
  const project = `/proyectos/${TENANT}/${PROJECT}`;
  expect((await page.goto(`${project}/medicion`))?.status()).toBe(404);
  expect((await page.goto(`${project}/informe`))?.status()).toBe(404);
  process.stdout.write(`H1A_LOCAL_PROD_PERMISSION {"viewport":"${info.project.name}","login":"HTTP_303_SESSION","crossTenantViews":"DENIED_404"}\n`);
});
