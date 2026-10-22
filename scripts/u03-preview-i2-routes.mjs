import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { PIN, chromiumEnvironment, installScopedRoutes, login, scopedHeaders } from './u03-preview-b4-runner.mjs';

const ORIGIN = `https://${PIN.host}`;

async function requestStatus(context, path, token, runId, extraHeaders = {}) {
  const url = `${ORIGIN}${path}`;
  const response = await context.request.get(url, {
    headers: scopedHeaders(url, extraHeaders, token, ORIGIN, runId),
    maxRedirects: 0,
    timeout: 30000,
  });
  if (new URL(response.url()).origin !== ORIGIN) throw new Error('I2_EXTERNAL_RESPONSE_REJECTED');
  return { status: response.status(), attachment: Boolean(response.headers()['content-disposition']) };
}

/** Real protected routes with genuine Preview Auth cookies; no export is requested as owner A. */
export async function runProtectedI2Routes({ fixtures, resultId, runId, env = process.env,
  capabilityFor, launch = () => chromium.launch({ headless: true, env: chromiumEnvironment() }),
  loginFn = login, installFn = installScopedRoutes, ledger }) {
  if (!fixtures || !resultId || !env.VERCEL_OIDC_TOKEN || typeof capabilityFor !== 'function' || typeof ledger !== 'function')
    throw new Error('I2_ROUTE_INPUT_REJECTED');
  const browserInputs = fixtures.browserInputs();
  const browser = await launch();
  const routes = [
    { actor: 'A', email: browserInputs.U03_B4_A_EMAIL, password: browserInputs.U03_B4_A_PASSWORD },
    { actor: 'B', email: browserInputs.U03_B4_B_EMAIL, password: browserInputs.U03_B4_B_PASSWORD },
  ];
  const contexts = [];
  try {
    for (const route of routes) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      await installFn(context, page, env.VERCEL_OIDC_TOKEN, ORIGIN, () => {}, () => {}, runId);
      await loginFn(page, context, route.email, route.password, { origin: ORIGIN, runId,
        viewport: `i2-${route.actor.toLowerCase()}`, ledger });
    }
    const [a, b] = contexts;
    const ownBase = `/proyectos/${fixtures.namespace}-a/a1`;
    const resultPath = `${ownBase}/auditoria-tecnica/resultados/${encodeURIComponent(resultId)}`;
    const positive = [
      await requestStatus(a, `${ownBase}/auditoria-tecnica`, env.VERCEL_OIDC_TOKEN, runId),
      await requestStatus(a, resultPath, env.VERCEL_OIDC_TOKEN, runId),
    ];
    if (positive.some(value => value.status !== 200 || value.attachment)) throw new Error('I2_OWNER_POSITIVE_REJECTED');
    await ledger('i2-owner-positive', 'PASS', { cases: positive.length });
    const expiresAt = Date.now() + 5 * 60_000;
    const exportHeaders = { 'x-rubik-u03-expires': String(expiresAt),
      'x-rubik-u03-capability': capabilityFor(expiresAt) };
    const negative = [
      await requestStatus(b, `${ownBase}/auditoria-tecnica`, env.VERCEL_OIDC_TOKEN, runId),
      await requestStatus(b, resultPath, env.VERCEL_OIDC_TOKEN, runId),
      await requestStatus(b, `${ownBase}/exportar`, env.VERCEL_OIDC_TOKEN, runId, exportHeaders),
      await requestStatus(b, `${ownBase}/auditoria-tecnica/resultados/${randomUUID()}`, env.VERCEL_OIDC_TOKEN, runId),
      await requestStatus(b, `/proyectos/${fixtures.namespace}-a/${randomUUID()}/auditoria-tecnica`, env.VERCEL_OIDC_TOKEN, runId),
    ];
    if (negative.some(value => value.status !== 404 || value.attachment)) throw new Error('I2_FOREIGN_ROUTE_DISCLOSURE');
    await ledger('i2-foreign-and-missing-routes', 'PASS', { cases: negative.length });
    return { passed: true, positiveCount: positive.length, negativeCount: negative.length };
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
