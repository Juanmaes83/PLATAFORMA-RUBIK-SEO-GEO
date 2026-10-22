import { mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { chromium } from 'playwright';
import { PIN, GateError, chromiumEnvironment, installScopedRoutes, login, auditAndCapture, createPageDiagnostics, saveSanitizedCapture } from './u03-preview-b4-runner.mjs';

const origin = `https://${PIN.host}`;
const authCookiePrefix = `sb-${PIN.supabaseRef}-auth-token`;

export function jwtTiming(token) {
  if (typeof token !== 'string' || token.split('.').length !== 3) throw new GateError('SESSION_JWT_UNAVAILABLE');
  let claims;
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); }
  catch { throw new GateError('SESSION_JWT_UNAVAILABLE'); }
  if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) || claims.exp <= claims.iat ||
      claims.iss !== `https://${PIN.supabaseRef}.supabase.co/auth/v1`) throw new GateError('SESSION_JWT_ISSUER_OR_TIMING_INVALID');
  return { iat: claims.iat, exp: claims.exp };
}

export function sessionFromCookies(cookies) {
  const chunks = cookies.filter(cookie => cookie.domain.replace(/^\./, '') === PIN.host &&
    (cookie.name === authCookiePrefix || new RegExp(`^${authCookiePrefix}\\.\\d+$`).test(cookie.name)));
  const whole = chunks.find(cookie => cookie.name === authCookiePrefix);
  const numbered = chunks.filter(cookie => cookie.name !== authCookiePrefix)
    .sort((a, b) => Number(a.name.slice(authCookiePrefix.length + 1)) - Number(b.name.slice(authCookiePrefix.length + 1)));
  if (!whole && (!numbered.length || numbered.some((chunk, index) => chunk.name !== `${authCookiePrefix}.${index}`)))
    throw new GateError('SESSION_COOKIE_UNAVAILABLE');
  const raw = whole?.value ?? numbered.map(cookie => cookie.value).join('');
  let data;
  try {
    const json = raw.startsWith('base64-') ? Buffer.from(raw.slice(7), 'base64url').toString('utf8') : raw;
    data = JSON.parse(json);
  } catch { throw new GateError('SESSION_COOKIE_FORMAT_UNRECOGNIZED'); }
  const token = Array.isArray(data) ? data[0] : data?.access_token;
  if (typeof token !== 'string') throw new GateError('SESSION_COOKIE_FORMAT_UNRECOGNIZED');
  return { token, ...jwtTiming(token), cookies: chunks };
}

export function tamperSessionCookies(cookies) {
  if (!cookies.length) throw new GateError('SESSION_COOKIE_UNAVAILABLE');
  // Change an actual encoded byte, rather than trailing base64 padding bits.
  // The copy is used in a separate browser context; the genuine cookie stays intact.
  return cookies.map((cookie, index) => {
    if (index !== 0) return { ...cookie };
    const position = cookie.value.startsWith('base64-') ? 7 : 0;
    if (cookie.value.length <= position) throw new GateError('SESSION_COOKIE_UNAVAILABLE');
    const original = cookie.value[position];
    return { ...cookie, value: cookie.value.slice(0, position) + (original === 'A' ? 'B' : 'A') + cookie.value.slice(position + 1) };
  });
}

export async function waitForExpiry(exp, { now = () => Date.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), ledger = async () => {} } = {}) {
  const remaining = exp * 1000 + 45_000 - now();
  if (remaining < -60_000 || remaining > 2 * 60 * 60 * 1000) throw new GateError('SESSION_EXPIRY_OUT_OF_RANGE');
  // PostgREST allows 30 seconds of clock skew; wait beyond that margin.
  const target = exp * 1000 + 45_000;
  while (now() < target) {
    const pause = Math.min(30_000, target - now());
    await sleep(pause);
    await ledger('session-expiry-wait', 'INFO', { count: Math.max(0, Math.ceil((target - now()) / 1000)) });
  }
}

async function guardedPage(browser, token, width, runId) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const page = await context.newPage();
  const securityEvents = [];
  const diagnostics = createPageDiagnostics(page);
  const pageErrors = { count: 0 };
  page.on('pageerror', () => { pageErrors.count++; });
  const session = await installScopedRoutes(context, page, token, origin, event => securityEvents.push(event), event => diagnostics.addRouteEvent(event), runId);
  page.on('request', request => {
    try {
      if (new URL(request.url()).origin !== origin && ['fetch', 'xhr'].includes(request.resourceType()))
        securityEvents.push('external-browser-fetch');
    } catch { securityEvents.push('unclassifiable-browser-fetch'); }
  });
  return { context, page, session, diagnostics, pageErrors, securityEvents };
}

export async function finishLoginPhase({ diagnostics, pageErrors, ledger, viewport }) {
  const phaseDiagnostics = diagnostics.take();
  await ledger('browser-phase-diagnostics', 'INFO', {
    viewport, phase: 'login', pathname: '/acceso', diagnostics: phaseDiagnostics,
    pageErrorCount: pageErrors.count,
  });
  pageErrors.count = 0;
}

async function visitP1({ page, diagnostics, pageErrors, ledger, runId, captureRoot, viewport, path, screen, expected }) {
  const response = await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
  const text = await page.locator('body').innerText();
  const okay = response?.status() === 200 && new URL(page.url()).origin === origin && expected.test(text);
  await ledger(`p1-${screen}-state`, okay ? 'PASS' : 'FAIL', { viewport, http: response?.status() ?? null });
  if (!okay) throw new GateError('PROVIDER_DISABLED_STATE_UNCONFIRMED');
  const capture = await auditAndCapture(page, { runId, viewport, screen, captureRoot, ledger, diagnostics, pageErrors });
  return capture;
}

export async function runSessionProviders({ env, account, path, ledger, runId, captureRoot,
  launch = () => chromium.launch({ headless: true, env: chromiumEnvironment() }),
  fetchImpl = fetch, wait = waitForExpiry } = {}) {
  if (!account?.email || !account?.password || !account?.api || !/^\/proyectos\/u03-[a-z0-9]+-a\/a1$/.test(path) ||
      !env?.VERCEL_OIDC_TOKEN) throw new GateError('SESSION_PROVIDER_FIXTURE_INVALID');
  await mkdir(captureRoot, { recursive: true });
  const browser = await launch();
  const captures = [];
  let desktop;
  try {
    await ledger('chromium-version', 'INFO', { version: browser.version() });
    for (const [viewport, width] of [['desktop', 1280], ['mobile', 390]]) {
      const current = await guardedPage(browser, env.VERCEL_OIDC_TOKEN, width, runId);
      if (viewport === 'desktop') desktop = current;
      try {
        await login(current.page, current.context, account.email, account.password,
          { origin, runId, viewport, captureRoot, ledger });
        await finishLoginPhase({ ...current, ledger, viewport });
        const audit = await visitP1({ ...current, ledger, runId, captureRoot, viewport,
          path: `${path}/auditoria-tecnica`, screen: 'openseo-disabled', expected: /No conectada|OpenSEO no está configurado|no tiene una conexión de OpenSEO activa/i });
        captures.push(audit);
        const google = await visitP1({ ...current, ledger, runId, captureRoot, viewport,
          path: `${path}/google`, screen: 'google-disabled', expected: /Lecturas de Google desactivadas/i });
        captures.push(google);
        if (current.securityEvents.length) throw new GateError('EXTERNAL_NAVIGATION_OR_REQUEST_BLOCKED');
        await ledger('p1-browser-egress', 'PASS', { viewport, count: 0 });
      } finally {
        if (viewport === 'mobile') { current.diagnostics.dispose(); await current.context.close(); }
      }
    }

    // Both the browser session and Data API token are genuine Preview Auth sessions.
    // Never persist or log the raw cookies, JWT, or their response bodies.
    const before = sessionFromCookies(await desktop.context.cookies(origin));
    const signed = await account.api.auth.getSession();
    const apiToken = signed.data?.session?.access_token;
    if (signed.error || !apiToken) throw new GateError('S4_AUTH_SESSION_UNAVAILABLE');
    const apiTiming = jwtTiming(apiToken);
    await ledger('session-token-timing', 'INFO', { count: before.exp - before.iat });

    // Tamper only an isolated copy. A valid cookie from another browser context
    // is still valid and is not evidence for S-3.
    const corrupted = tamperSessionCookies(before.cookies);
    const tampered = await guardedPage(browser, env.VERCEL_OIDC_TOKEN, 1280, runId);
    try {
      await tampered.context.addCookies(corrupted);
      const denial = await tampered.page.goto(`${origin}/panel`, { waitUntil: 'domcontentloaded' });
      const denied = new URL(tampered.page.url()).pathname === '/acceso';
      const capturePath = join(captureRoot, `${runId}-desktop-s3-tampered.png`);
      const saved = await saveSanitizedCapture(tampered.page, capturePath);
      await ledger('s3-tampered-cookie', denied && saved ? 'PASS' : 'FAIL', {
        pathname: denied ? '/acceso' : '/panel', http: denial?.status() ?? null,
        ...(saved ? { path: relative(process.cwd(), capturePath) } : {}),
      });
      if (saved) captures.push(capturePath);
      if (!denied) throw new GateError('S3_TAMPERED_COOKIE_ACCEPTED');
      if (!saved) throw new GateError('CAPTURE_SANITIZATION_FAILED');
    } finally { tampered.diagnostics.dispose(); await tampered.context.close(); }

    await wait(Math.max(before.exp, apiTiming.exp), { ledger });
    const expired = await fetchImpl(`https://${PIN.supabaseRef}.supabase.co/rest/v1/projects?select=id`, {
      headers: { apikey: env.U03_PREVIEW_PUBLIC_KEY, Authorization: `Bearer ${apiToken}` },
      redirect: 'manual', signal: AbortSignal.timeout(15000),
    });
    await ledger('s4-authentic-expired-jwt', expired.status === 401 ? 'PASS' : 'FAIL', { http: expired.status });
    if (expired.status !== 401) throw new GateError('S4_EXPIRED_JWT_NOT_REJECTED');
    const refreshedPage = await desktop.page.goto(`${origin}/panel`, { waitUntil: 'domcontentloaded' });
    const after = sessionFromCookies(await desktop.context.cookies(origin));
    const renewed = refreshedPage?.status() === 200 && new URL(desktop.page.url()).pathname === '/panel' &&
      after.token !== before.token && after.exp > before.exp && after.exp * 1000 > Date.now();
    await ledger('s2-real-cookie-refresh', renewed ? 'PASS' : 'FAIL', { http: refreshedPage?.status() ?? null });
    if (!renewed) throw new GateError('S2_SESSION_NOT_RENEWED');
    if (desktop.securityEvents.length) throw new GateError('EXTERNAL_NAVIGATION_OR_REQUEST_BLOCKED');
    await ledger('session-providers', 'PASS', { captures: captures.length });
    return { passed: true, captures, visualReview: 'PENDING_MANUAL_REVIEW' };
  } finally {
    desktop?.diagnostics.dispose();
    await browser.close();
  }
}
