import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
import {
  PIN, deploymentMatches, scopedHeaders, isExternalRedirect,
  sanitizeDiagnostic, safePath, preflight, runB4, installScopedRoutes, createPageDiagnostics, auditAndCapture,
  safeLedgerRow, login,
} from "./u03-preview-b4-runner.mjs";

const validDeployment = () => ({
  id: PIN.deploymentId,
  url: PIN.host,
  meta: { githubCommitSha: PIN.sha, githubCommitRef: PIN.branch },
  project: { id: PIN.projectId },
  readyState: "READY",
  target: null,
});

const response = (status, body = {}, location = null) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", ...(location ? { location } : {}) },
});

const goodFetch = async (url, init = {}) => {
  assert.equal(new URL(url).origin, `https://${PIN.host}`);
  if (init.headers?.["x-vercel-trusted-oidc-idp-token"]) {
    assert.equal(init.headers["x-vercel-trusted-oidc-idp-token"], "fictional-oidc-token-not-real");
    return response(200, { auth: "preview-isolated", supabaseProjectRef: PIN.supabaseRef });
  }
  return response(302, {}, "https://vercel.com/sso-api");
};

test("deployment pin requires exact deployment, host, SHA, project, branch and READY state", () => {
  assert.equal(deploymentMatches(validDeployment()), true);
  const cliDeployment = { ...validDeployment(), meta: { gitCommitSha: PIN.sha, gitCommitRef: PIN.branch } };
  assert.equal(deploymentMatches(cliDeployment), true);
  assert.equal(deploymentMatches({ ...cliDeployment, meta: { ...cliDeployment.meta, githubCommitSha: '0'.repeat(40) } }), false);
  assert.equal(deploymentMatches({ ...cliDeployment, meta: { ...cliDeployment.meta, githubCommitRef: 'other-branch' } }), false);
  assert.equal(deploymentMatches({ ...validDeployment(), meta: { githubCommitSha: "0".repeat(40), githubCommitRef: PIN.branch } }), false);
  assert.equal(deploymentMatches({ ...validDeployment(), url: `evil-${PIN.host}` }), false);
  assert.equal(deploymentMatches({ ...validDeployment(), url: "plataforma-rubik-seo-geo.vercel.app" }), false);
  assert.equal(deploymentMatches({ ...validDeployment(), id: "dpl_alias" }), false);
  assert.equal(deploymentMatches({ ...validDeployment(), target: "production" }), false);
});

test("similar hosts, aliases and other origins never receive the OIDC header", () => {
  const token = "fictional-oidc-token-not-real";
  const runId = "524c744e-2563-42b5-8d53-b33b03748d94";
  const allowed = `https://${PIN.host}`;
  for (const url of [
    `https://x${PIN.host}`,
    `https://${PIN.host}.evil.example`,
    "https://plataforma-rubik-seo-geo.vercel.app",
    "https://funding-os.vercel.app",
    "https://rhnnplewqsekrnaousyl.supabase.co",
  ]) {
    const headers = scopedHeaders(url, { ["X-Vercel-Trusted-OIDC-IdP-Token"]: "inherited", "x-rubik-u03-run-id": runId }, token, allowed, runId);
    assert.equal(Object.keys(headers).some((name) => name.toLowerCase() === "x-vercel-trusted-oidc-idp-token"), false, url);
    assert.equal(Object.keys(headers).some((name) => name.toLowerCase() === "x-rubik-u03-run-id"), false, url);
  }
  const pinnedHeaders = scopedHeaders(`${allowed}/api/salud`, {}, token, allowed, runId);
  assert.equal(pinnedHeaders["x-vercel-trusted-oidc-idp-token"], token);
  assert.equal(pinnedHeaders["x-rubik-u03-run-id"], runId);
  assert.equal("x-rubik-u03-run-id" in scopedHeaders(`${allowed}/api/salud`, {}, token, allowed, "invalid"), false);
});

test("external redirects from the pinned host are rejected", () => {
  assert.equal(isExternalRedirect("https://evil.example/login", `https://${PIN.host}/acceso`), true);
  assert.equal(isExternalRedirect("https://evil.example/login", "https://other.example/"), false);
  assert.equal(isExternalRedirect(`https://${PIN.host}/panel`, `https://${PIN.host}/acceso`), false);
});

test("invalid inputs reject non-project paths and non-independent A1/A2/B1", () => {
  assert.equal(safePath("/proyectos/agencia-a/proyecto-1"), true);
  assert.equal(safePath("https://evil.example/proyectos/a/b"), false);
  assert.equal(safePath("/proyectos/a/b?next=https://evil.example"), false);
  assert.equal(safePath("/proyectos/a/b/../c"), false);
});

test("missing OIDC token stops before inspection, network or browser", async () => {
  let inspected = 0;
  let fetched = 0;
  await assert.rejects(preflight({ token: "", inspect: async () => { inspected++; }, fetchImpl: async () => { fetched++; } }), (error) => error.code === "OIDC_TOKEN_MISSING");
  assert.equal(inspected, 0);
  assert.equal(fetched, 0);
});

test("wrong SHA aborts before any browser launch", async () => {
  let launched = 0;
  await assert.rejects(runB4({
    env: { VERCEL_OIDC_TOKEN: "fictional-oidc-token-not-real" },
    inspect: async () => ({ ...validDeployment(), meta: { githubCommitSha: "f".repeat(40), githubCommitRef: PIN.branch } }),
    fetchImpl: goodFetch,
    launch: async () => { launched++; throw new Error("must not launch"); },
  }), (error) => error.code === "DEPLOYMENT_PIN_MISMATCH");
  assert.equal(launched, 0);
});

test("invalid OIDC response fails closed before browser launch", async () => {
  let launches = 0;
  const badFetch = async (url, init = {}) => init.headers?.["x-vercel-trusted-oidc-idp-token"]
    ? response(403, { error: "not logged" })
    : response(302, {}, "https://vercel.com/sso-api");
  await assert.rejects(runB4({
    env: { VERCEL_OIDC_TOKEN: "fictional-oidc-token-not-real" },
    inspect: async () => validDeployment(),
    fetchImpl: badFetch,
    launch: async () => { launches++; throw new Error("must not launch"); },
  }), (error) => error.code === "OIDC_AUTHENTICATION_FAILED");
  assert.equal(launches, 0);
});

test("health preflight requires the isolated ref and sends the token only to the pinned origin", async () => {
  const seen = [];
  const checked = await preflight({ token: "fictional-oidc-token-not-real", inspect: async () => validDeployment(), fetchImpl: async (url, init = {}) => {
    seen.push({ origin: new URL(url).origin, header: init.headers?.["x-vercel-trusted-oidc-idp-token"] ?? null });
    return goodFetch(url, init);
  } });
  assert.equal(checked.supabaseRef, PIN.supabaseRef);
  assert.deepEqual(seen, [
    { origin: `https://${PIN.host}`, header: null },
    { origin: `https://${PIN.host}`, header: "fictional-oidc-token-not-real" },
  ]);
});

test("token is redacted from errors and persisted diagnostics", () => {
  const token = "fictional-oidc-token-not-real";
  const error = sanitizeDiagnostic(`request failed ${token}`, [token]);
  const ledger = JSON.stringify(safeLedgerRow("run-test", "preflight", "FAIL"));
  assert.equal(error.includes(token), false);
  assert.equal(ledger.includes(token), false);
  assert.equal(JSON.stringify({ trace: null, screenshot: null, capture: null, error }).includes(token), false);
});

test("visual diagnostics are scoped per phase, categorized, sanitized, and captured before failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "u03-visual-diagnostic-"));
  const server = createServer((_req, res) => res.writeHead(500, { "content-type": "text/plain" }).end("never retain body"));
  const port = await new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
  const origin = `http://127.0.0.1:${port}`;
  const events = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const diagnostics = createPageDiagnostics(page, { allowedOrigin: origin });
    await page.goto(origin);
    await page.evaluate(() => console.error("SECRET_TEXT https://example.test/path?token=hidden"));
    await page.waitForTimeout(25);
    const beforeTake = diagnostics.snapshot();
    assert.equal(beforeTake.console["error:preview"], 1);
    assert.equal(diagnostics.snapshot().console["error:preview"], 1, "snapshot must not consume the counter");
    const loginPhase = diagnostics.take();
    assert.equal(loginPhase.console["error:preview"], 1);
    assert.ok(Object.values(loginPhase.console).reduce((sum, count) => sum + count, 0) >= 1);
    assert.equal(JSON.stringify(loginPhase).includes("SECRET_TEXT"), false);
    assert.equal(JSON.stringify(loginPhase).includes("token=hidden"), false);

    await page.evaluate(() => { const script = document.createElement("script"); script.src = "/missing.js?credential=hidden"; document.head.append(script); });
    await page.waitForTimeout(50);
    await assert.rejects(auditAndCapture(page, {
      runId: "simulated-visual-failure", viewport: "desktop", screen: "a-panel", captureRoot: root,
      diagnostics, pageErrors: 0,
      ledger: async (caseId, status, detail) => events.push({ caseId, status, ...detail }),
    }), error => error.code === "VISUAL_AUDIT_FAILED");
    const visual = events.find(event => event.caseId === "visual-a-panel");
    assert.equal(visual.status, "FAIL");
    assert.equal(visual.diagnostics.http[`500:preview`], 1);
    assert.equal(JSON.stringify(visual).includes("missing.js"), false);
    assert.equal(JSON.stringify(visual).includes("credential=hidden"), false);
    assert.equal(JSON.stringify(visual).includes("never retain body"), false);
    assert.equal((await readFile(join(root, "simulated-visual-failure-desktop-a-panel.png"))).length > 0, true);
    assert.equal(events.some(event => event.caseId === "capture-a-panel"), false);
    diagnostics.dispose();
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("login diagnoses a form rejection locally without persisting credentials, cookies, or tokens", async () => {
  const root = await mkdtemp(join(tmpdir(), "u03-login-diagnostic-"));
  const behavior = "reject";
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/acceso") {
      if (behavior === "reject") {
        res.writeHead(200, { "content-type": "text/plain", "x-action-redirect": "/acceso?error=credenciales" }).end();
        return;
      }
      res.writeHead(200, { "content-type": "text/plain", "x-action-redirect": "/panel", "set-cookie": `sb-${PIN.supabaseRef}-auth-token=fake-session; Path=/; HttpOnly; SameSite=Lax` }).end();
      return;
    }
    if (req.url.startsWith("/acceso")) {
      res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><form><label for="email">Correo</label><input id="email" type="email"><label for="password">Contraseña</label><input id="password" type="password"><button>Entrar</button></form><script>document.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();await fetch('/acceso',{method:'POST'});if(location.search==='')location.assign('/acceso?error=credenciales')})</script>`);
      return;
    }
    if (req.url === "/panel") { res.writeHead(200, { "content-type": "text/html" }).end("<main>panel</main>"); return; }
    res.writeHead(404).end();
  });
  const port = await new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
  const origin = `http://127.0.0.1:${port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    context.setDefaultTimeout(2000);
    context.setDefaultNavigationTimeout(2000);
    const routeEvents = [];
    const events = [];
    const page = await context.newPage();
    const fakeEmail = "fictional-owner@example.test", fakePassword = "fictional-password-not-for-ledger";
    await assert.rejects(login(page, context, fakeEmail, fakePassword, {
      origin, runId: "diagnostic-local-only", viewport: "desktop", captureRoot: root, routeEvents,
      timeoutMs: 50, cookieCheck: cookies => cookies.some(cookie => cookie.name.startsWith(`sb-${PIN.supabaseRef}-auth-token`)),
      ledger: async (caseId, status, detail) => events.push({ caseId, status, ...detail }),
    }), error => error.code === "LOGIN_REJECTED");
    const diagnostic = events.find(event => event.caseId === "login-diagnostic");
    assert.ok(diagnostic);
    assert.equal(diagnostic.pathname, "/acceso");
    assert.equal(diagnostic.errorCode, "credenciales");
    assert.equal(diagnostic.actionHttpStatus, 200);
    assert.equal(diagnostic.sessionCookiePresent, false);
    assert.ok(diagnostic.routeEvents.includes("auth-action-post"));
    assert.ok(diagnostic.routeEvents.includes("auth-action-http-200"));
    assert.equal((await readFile(join(root, "diagnostic-local-only-desktop-login-failure.png"))).length > 0, true);
    assert.equal(await page.locator("#email").inputValue(), "");
    assert.equal(await page.locator("#password").inputValue(), "");
    const serialized = JSON.stringify(events);
    for (const value of [fakeEmail, fakePassword, "fake-session", "fictional-oidc-token-not-real"]) assert.equal(serialized.includes(value), false);
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("login recovers only when a session cookie proves the action succeeded but navigation did not", async () => {
  const root = await mkdtemp(join(tmpdir(), "u03-login-redirect-recovery-"));
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/acceso") {
      res.writeHead(200, { "content-type": "text/plain", "x-action-redirect": "/panel", "set-cookie": `sb-${PIN.supabaseRef}-auth-token=fake-session; Path=/; HttpOnly; SameSite=Lax` }).end();
    } else if (req.url.startsWith("/acceso")) {
      res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><form><label for="email">Correo</label><input id="email" type="email"><label for="password">Contraseña</label><input id="password" type="password"><button>Entrar</button></form><script>document.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();await fetch('/acceso',{method:'POST'})})</script>`);
    } else if (req.url === "/panel") res.writeHead(200, { "content-type": "text/html" }).end("<main>panel</main>");
    else res.writeHead(404).end();
  });
  const port = await new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
  const origin = `http://127.0.0.1:${port}`;
  let browser;
  const events = [];
  const routeEvents = [];
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    context.setDefaultTimeout(2000);
    context.setDefaultNavigationTimeout(2000);
    const page = await context.newPage();
    await installScopedRoutes(context, page, "", origin, () => {}, event => routeEvents.push(event));
    await login(page, context, "fictional-owner@example.test", "fictional-password", {
      origin, captureRoot: root, timeoutMs: 50, routeEvents,
      cookieCheck: cookies => cookies.some(cookie => cookie.name.startsWith(`sb-${PIN.supabaseRef}-auth-token`)),
      ledger: async (caseId, status, detail) => events.push({ caseId, status, ...detail }),
    });
    assert.equal(new URL(page.url()).pathname, "/panel");
    assert.equal(events.find(event => event.caseId === "login-redirect-recovered")?.sessionCookiePresent, true);
    assert.equal(events.find(event => event.caseId === "login-redirect-recovered")?.actionHttpStatus, 200);
    assert.ok(events.find(event => event.caseId === "login-redirect-recovered")?.routeEvents.includes("auth-action-http-200"));
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("login records a local capture when the Preview auth mode exposes no sign-in form", async () => {
  const root = await mkdtemp(join(tmpdir(), "u03-login-closed-mode-"));
  const server = createServer((_req, res) => res.writeHead(200, { "content-type": "text/html" }).end("<main>Inicio de sesión no disponible</main>"));
  const port = await new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
  const origin = `http://127.0.0.1:${port}`;
  const events = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    context.setDefaultTimeout(2000);
    const page = await context.newPage();
    await assert.rejects(login(page, context, "", "", {
      origin, runId: "closed-mode-local", captureRoot: root, ledger: async (caseId, status, detail) => events.push({ caseId, status, ...detail }),
    }), error => error.code === "LOGIN_FORM_UNAVAILABLE");
    const diagnostic = events.find(event => event.caseId === "login-diagnostic");
    assert.equal(diagnostic.pathname, "/acceso");
    assert.equal(diagnostic.errorCode, null);
    assert.equal(diagnostic.actionHttpStatus, null);
    assert.equal(diagnostic.sessionCookiePresent, false);
    assert.equal((await readFile(join(root, "closed-mode-local-desktop-login-failure.png"))).length > 0, true);
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("successful visual capture redacts rendered credentials before writing the screenshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "u03-safe-capture-"));
  const email = "fixture-owner@example.test";
  const jwt = `eyJ${"a".repeat(12)}.eyJ${"b".repeat(12)}.${"c".repeat(12)}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent(`<main>${email} ${jwt}<input type="email" value="${email}"><input type="password" value="fictional-secret"></main>`);
    const diagnostics = createPageDiagnostics(page);
    const events = [];
    const path = await auditAndCapture(page, {
      runId: "safe-local", viewport: "desktop", screen: "panel", captureRoot: root, diagnostics,
      ledger: async (caseId, status, detail) => events.push({ caseId, status, ...detail }),
    });
    assert.ok((await readFile(path)).length > 0);
    const rendered = await page.locator("main").innerText();
    assert.equal(rendered.includes(email), false);
    assert.equal(rendered.includes(jwt), false);
    assert.deepEqual(await page.locator("input").evaluateAll(inputs => inputs.map(input => [input.value, input.getAttribute("value")])), [["", ""], ["", ""]]);
    assert.equal(events.find(event => event.caseId === "capture-panel")?.status, "SAVED");
    assert.equal(JSON.stringify(events).includes(email), false);
    assert.equal(JSON.stringify(events).includes(jwt), false);
    diagnostics.dispose();
    await context.close();
  } finally {
    if (browser) await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("failed capture sanitization writes no screenshot or capture record", async () => {
  const root = await mkdtemp(join(tmpdir(), "u03-safe-capture-failure-"));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setContent("<main>fictional-owner@example.test</main>");
    const diagnostics = createPageDiagnostics(page);
    const evaluate = page.evaluate.bind(page);
    let evaluations = 0;
    page.evaluate = (...args) => ++evaluations === 2 ? Promise.reject(new Error("synthetic sanitization failure")) : evaluate(...args);
    let screenshots = 0;
    page.screenshot = async () => { screenshots++; };
    const events = [];
    await assert.rejects(auditAndCapture(page, {
      runId: "unsafe-local", viewport: "mobile", screen: "panel", captureRoot: root, diagnostics,
      ledger: async (caseId, status, detail) => events.push({ caseId, status, ...detail }),
    }), error => error.code === "CAPTURE_SANITIZATION_FAILED");
    assert.equal(screenshots, 0);
    assert.equal(events.find(event => event.caseId === "visual-panel")?.status, "FAIL");
    assert.equal(events.some(event => event.caseId === "capture-panel"), false);
    diagnostics.dispose();
    await context.close();
  } finally {
    if (browser) await browser.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Chromium sends scoped OIDC on the GET after a login POST 303 and blocks an external 303", async () => {
  const token = "fictional-oidc-token-not-real";
  const requests = [];
  const externalRequests = [];
  const external = createServer((req, res) => {
    externalRequests.push({ path: req.url, hasToken: Boolean(req.headers["x-vercel-trusted-oidc-idp-token"]) });
    res.writeHead(200, { "content-type": "text/html" }).end("external page");
  });
  const externalPort = await new Promise(resolve => external.listen(0, "127.0.0.1", () => resolve(external.address().port)));
  const externalOrigin = `http://127.0.0.1:${externalPort}`;
  const allowed = createServer((req, res) => {
    requests.push({ path: req.url, method: req.method, hasToken: req.headers["x-vercel-trusted-oidc-idp-token"] === token, hasSession: Boolean(req.headers.cookie?.includes("fake-session")) });
    if (req.url === "/acceso" && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/html" }).end('<form method="post" action="/acceso"><input id="email" name="email"><input id="password" name="password" type="password"><button>Entrar</button></form>');
    } else if (req.url === "/acceso" && req.method === "POST") {
      res.writeHead(303, { location: "/panel", "set-cookie": `sb-${PIN.supabaseRef}-auth-token=fake-session; Path=/; HttpOnly; SameSite=Lax` }).end();
    } else if (req.url === "/panel" && req.headers["x-vercel-trusted-oidc-idp-token"] === token && req.headers.cookie?.includes("fake-session")) {
      res.writeHead(200, { "content-type": "text/html" }).end("<main>panel</main>");
    } else if ((req.url === "/leave" || req.url === "/api-leave") && req.method === "POST") {
      res.writeHead(303, { location: `${externalOrigin}/login` }).end();
    } else if (req.url === "/external-form") {
      res.writeHead(200, { "content-type": "text/html" }).end('<form method="post" action="/leave"><button>Leave</button></form>');
    } else {
      res.writeHead(302, { location: `${externalOrigin}/login` }).end();
    }
  });
  const allowedPort = await new Promise(resolve => allowed.listen(0, "127.0.0.1", () => resolve(allowed.address().port)));
  const origin = `http://127.0.0.1:${allowedPort}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const securityEvents = [];
    const routeEvents = [];
    await installScopedRoutes(context, page, token, origin, event => securityEvents.push(event), event => routeEvents.push(event));
    await login(page, context, "fictional-owner@example.test", "fictional-password", {
      origin, timeoutMs: 3000, routeEvents,
      cookieCheck: cookies => cookies.some(cookie => cookie.name.startsWith(`sb-${PIN.supabaseRef}-auth-token`)),
    });
    assert.equal(new URL(page.url()).pathname, "/panel");
    assert.equal(requests.find(req => req.path === "/acceso" && req.method === "POST")?.hasToken, true);
    assert.deepEqual(requests.find(req => req.path === "/panel" && req.method === "GET"), { path: "/panel", method: "GET", hasToken: true, hasSession: true });
    assert.equal(routeEvents.includes("auth-action-http-303"), true);
    assert.equal(securityEvents.length, 0);

    const beforeClientAction = requests.length;
    const clientAction = await page.evaluate(async () => {
      const response = await fetch("/acceso", { method: "POST" });
      return { status: response.status, redirected: response.redirected };
    });
    assert.deepEqual(clientAction, { status: 200, redirected: true });
    assert.equal(requests.slice(beforeClientAction).find(req => req.path === "/panel" && req.method === "GET")?.hasToken, true);

    await page.evaluate(() => fetch("/api-leave", { method: "POST" }).catch(() => null));
    assert.equal(requests.find(req => req.path === "/api-leave" && req.method === "POST")?.hasToken, true);
    assert.deepEqual(externalRequests, []);
    assert.equal(routeEvents.includes("blocked-external-subresource-redirect"), true, JSON.stringify(routeEvents));
    assert.equal(securityEvents.length, 0, "a blocked fetch redirect is not a document navigation");

    await page.goto(`${origin}/external-form`);
    await page.getByRole("button", { name: "Leave" }).click().catch(() => {});
    await page.waitForTimeout(100);
    assert.equal(requests.find(req => req.path === "/leave" && req.method === "POST")?.hasToken, true);
    assert.equal(securityEvents.includes("external-redirect-blocked"), true);
    assert.deepEqual(externalRequests, []);
    await context.close();
  } finally {
    if (browser) await browser.close();
    allowed.closeAllConnections?.();
    external.closeAllConnections?.();
    await new Promise(resolve => allowed.close(resolve));
    await new Promise(resolve => external.close(resolve));
  }
});

test("pinned Playwright Chromium strips OIDC off-origin and blocks external navigation redirects", async (t) => {
  let allowedOrigin = "";
  let externalOrigin = "";
  let externalReceivedToken = false;
  let externalRedirectWasReached = false;
  const externalRequests = [];
  let allowedReceivedToken = false;
  let allowedRedirectRequests = 0;
  const external = createServer((req, res) => {
    externalRequests.push({ path: req.url, token: Boolean(req.headers["x-vercel-trusted-oidc-idp-token"]) });
    if (req.headers["x-vercel-trusted-oidc-idp-token"]) externalReceivedToken = true;
    if (req.url === "/capture") {
      res.writeHead(204).end();
    } else {
      externalRedirectWasReached = true;
      res.writeHead(200).end("external page");
    }
  });
  const externalPort = await new Promise((resolve) => external.listen(0, "127.0.0.1", () => resolve(external.address().port)));
  externalOrigin = `http://127.0.0.1:${externalPort}`;
  const allowed = createServer((req, res) => {
    if (req.url === "/redirect") allowedReceivedToken = Boolean(req.headers["x-vercel-trusted-oidc-idp-token"]);
    if (req.url === "/redirect") { allowedRedirectRequests++; res.writeHead(302, { location: `${externalOrigin}/page` }).end(); return; }
    res.writeHead(200, { "content-type": "text/html" }).end(`<script>fetch('${externalOrigin}/capture').catch(()=>{});</script><a href="/redirect">leave</a>`);
  });
  const allowedPort = await new Promise((resolve) => allowed.listen(0, "127.0.0.1", () => resolve(allowed.address().port)));
  allowedOrigin = `http://127.0.0.1:${allowedPort}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const securityEvents = [];
    const page = await context.newPage();
    await installScopedRoutes(context, page, "fictional-oidc-token-not-real", allowedOrigin, (event) => securityEvents.push(event));
    let captureCount = 0;
    let traceCount = 0;
    page.screenshot = async () => { captureCount++; throw new Error("capture disabled"); };
    context.tracing.start = async () => { traceCount++; throw new Error("trace disabled"); };
    await page.goto(`${allowedOrigin}/`);
    await t.test("cross-origin subrequest has no OIDC header", async () => {
      await page.waitForTimeout(100);
      assert.equal(externalReceivedToken, false);
    });
    await t.test("navigation redirect is blocked before reaching external host", async () => {
      let redirectedResponse;
      try { redirectedResponse = await page.goto(`${allowedOrigin}/redirect`); } catch { /* browser-side block is expected */ }
      assert.equal(allowedRedirectRequests, 1);
      assert.equal(allowedReceivedToken, true);
      assert.equal(redirectedResponse == null || redirectedResponse.status() >= 400, true);
      assert.equal(securityEvents.includes("external-redirect-blocked"), true);
      assert.equal(externalRedirectWasReached, false, JSON.stringify(externalRequests));
      assert.equal(externalReceivedToken, false, JSON.stringify(externalRequests));
    });
    await t.test("no trace, capture, or screenshot is recorded", async () => {
      assert.equal(traceCount, 0);
      assert.equal(captureCount, 0);
    });
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => allowed.close(resolve));
    await new Promise((resolve) => external.close(resolve));
  }
});
