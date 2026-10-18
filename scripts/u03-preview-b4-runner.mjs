import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, appendFile } from "node:fs/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
export const PIN = Object.freeze({
  projectId: "prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook",
  teamId: "team_hLhdb3M9MviTIysXD9whFF2c",
  deploymentId: "dpl_FBKLAT2rYQeHVEs735eNhPR6RnQt",
  sha: "ac5a5ff6d92f1ebd5304ad7fea9b91a8fa617138",
  branch: "codex/u02-preview-isolation-20261017",
  host: "plataforma-rubik-seo-7v2wmueoy-juanma-espinosas-projects.vercel.app",
  supabaseRef: "rhnnplewqsekrnaousyl",
});

const OIDC_HEADER = "x-vercel-trusted-oidc-idp-token";
const ORIGIN = `https://${PIN.host}`;

export class GateError extends Error {
  constructor(code) { super(code); this.name = "GateError"; this.code = code; }
}

function normalizedHost(value) {
  if (typeof value !== "string" || !value) return "";
  try { return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase(); }
  catch { return ""; }
}

export function deploymentMatches(actual, pin = PIN) {
  if (!actual || actual.id !== pin.deploymentId) return false;
  if (normalizedHost(actual.url) !== pin.host) return false;
  if ((actual.meta?.githubCommitSha ?? actual.gitSource?.sha) !== pin.sha) return false;
  if ((actual.meta?.githubCommitRef ?? actual.gitSource?.ref) !== pin.branch) return false;
  if ((actual.projectId ?? actual.project?.id) !== pin.projectId) return false;
  if ((actual.readyState ?? actual.state) !== "READY") return false;
  if (actual.target === "production") return false;
  return true;
}

export function scopedHeaders(url, inputHeaders, token, allowedOrigin = ORIGIN) {
  const headers = Object.fromEntries(Object.entries(inputHeaders ?? {}).filter(([key]) => key.toLowerCase() !== OIDC_HEADER));
  let origin = "";
  try { origin = new URL(url).origin; } catch { return headers; }
  if (origin === allowedOrigin && token) headers[OIDC_HEADER] = token;
  return headers;
}

export function isExternalRedirect(requestUrl, redirectedFromUrl, allowedOrigin = ORIGIN) {
  if (!redirectedFromUrl) return false;
  try { return new URL(requestUrl).origin !== new URL(redirectedFromUrl).origin && new URL(redirectedFromUrl).origin === allowedOrigin; }
  catch { return true; }
}

export async function installScopedRoutes(context, token, allowedOrigin = ORIGIN, onEvent = () => {}) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    let origin = "";
    try { origin = new URL(url).origin; } catch { await route.abort("blockedbyclient"); return; }
    const headers = await request.allHeaders();

    // Never let top-level navigation leave the approved deployment. The browser itself
    // follows HTTP 3xx without exposing a redirect request to Playwright's route callback.
    if (request.isNavigationRequest() && origin !== allowedOrigin) {
      onEvent("external-navigation-blocked");
      await route.abort("blockedbyclient");
      return;
    }

    if (origin !== allowedOrigin) {
      await route.continue({ headers: scopedHeaders(url, headers, "", allowedOrigin) });
      return;
    }

    let upstream;
    try {
      upstream = await route.fetch({ headers: scopedHeaders(url, headers, token, allowedOrigin), maxRedirects: 0 });
    } catch {
      onEvent("pinned-origin-request-failed");
      await route.fulfill({ status: 502, contentType: "text/plain", body: "Protected Preview request failed closed." });
      return;
    }
    const location = upstream.headers()["location"];
    if (upstream.status() >= 300 && upstream.status() < 400 && location) {
      let destination;
      try { destination = new URL(location, url); } catch { destination = null; }
      if (!destination || destination.origin !== allowedOrigin) {
        onEvent("external-redirect-blocked");
        await route.fulfill({ status: 502, contentType: "text/plain", body: "Cross-origin redirect blocked." });
        return;
      }
    }
    await route.fulfill({ response: upstream });
  });
}

export function sanitizeDiagnostic(value, secrets = []) {
  let out = String(value ?? "");
  for (const secret of secrets) if (secret) out = out.split(secret).join("[redacted]");
  return out.replace(/(?:eyJ[a-zA-Z0-9_-]{10,}\.){2}[a-zA-Z0-9_-]+/g, "[redacted-jwt]").slice(0, 240);
}

export function safePath(value) {
  return typeof value === "string" && /^\/proyectos\/[a-z0-9][a-z0-9-]{0,62}\/[a-z0-9][a-z0-9-]{0,62}$/.test(value);
}

export function assertInputs(env) {
  const required = ["U03_B4_A_EMAIL", "U03_B4_A_PASSWORD", "U03_B4_A1_PATH", "U03_B4_A2_PATH", "U03_B4_B_EMAIL", "U03_B4_B_PASSWORD", "U03_B4_B1_PATH"];
  if (required.some((key) => !env[key])) throw new GateError("AUTHORIZED_PREVIEW_ACCOUNTS_REQUIRED");
  if (![env.U03_B4_A1_PATH, env.U03_B4_A2_PATH, env.U03_B4_B1_PATH].every(safePath)) throw new GateError("PROJECT_PATH_INVALID");
  if (new Set([env.U03_B4_A1_PATH, env.U03_B4_A2_PATH, env.U03_B4_B1_PATH]).size !== 3) throw new GateError("PROJECT_PATHS_NOT_INDEPENDENT");
  const optional = [env.U03_B4_REVOKED_EMAIL, env.U03_B4_REVOKED_PASSWORD, env.U03_B4_REVOKED_PATH];
  if (optional.some(Boolean) && !optional.every(Boolean)) throw new GateError("REVOKED_ACCOUNT_INPUT_INCOMPLETE");
  if (env.U03_B4_REVOKED_PATH && !safePath(env.U03_B4_REVOKED_PATH)) throw new GateError("REVOKED_PROJECT_PATH_INVALID");
  return true;
}

export async function inspectPinnedDeployment() {
  let stdout;
  try {
    ({ stdout } = await execFileAsync(process.env.U03_VERCEL_CLI || "vercel", [
      "api", `/v13/deployments/${PIN.deploymentId}?teamId=${PIN.teamId}`,
    ], { windowsHide: true, maxBuffer: 1024 * 1024 }));
  } catch { throw new GateError("VERCEL_DEPLOYMENT_INSPECTION_FAILED"); }
  try {
    const result = JSON.parse(stdout);
    const deployment = result.deployment ?? result;
    if (!deploymentMatches(deployment)) throw new GateError("DEPLOYMENT_PIN_MISMATCH");
    return deployment;
  } catch (error) {
    if (error instanceof GateError) throw error;
    throw new GateError("VERCEL_DEPLOYMENT_METADATA_INVALID");
  }
}

export async function preflight({ token = process.env.VERCEL_OIDC_TOKEN, inspect = inspectPinnedDeployment, fetchImpl = fetch } = {}) {
  if (typeof token !== "string" || token.length < 20) throw new GateError("OIDC_TOKEN_MISSING");
  const deployment = await inspect();
  if (!deploymentMatches(deployment)) throw new GateError("DEPLOYMENT_PIN_MISMATCH");

  let anonymous;
  try {
    anonymous = await fetchImpl(`${ORIGIN}/api/salud`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
  } catch { throw new GateError("PROTECTION_PREFLIGHT_FAILED"); }
  const redirect = anonymous.headers?.get?.("location");
  let protectedRedirect = false;
  try {
    const destination = new URL(redirect);
    protectedRedirect = [302, 303, 307, 308].includes(anonymous.status) && destination.protocol === "https:" && (destination.hostname === "vercel.com" || destination.hostname.endsWith(".vercel.com"));
  } catch { /* no trusted auth redirect */ }
  if (!protectedRedirect) throw new GateError("DEPLOYMENT_PROTECTION_NOT_CONFIRMED");

  let authenticated;
  try {
    authenticated = await fetchImpl(`${ORIGIN}/api/salud`, {
      headers: scopedHeaders(`${ORIGIN}/api/salud`, {}, token),
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new GateError("OIDC_AUTHENTICATION_FAILED"); }
  if (authenticated.status !== 200) throw new GateError("OIDC_AUTHENTICATION_FAILED");
  let health;
  try { health = await authenticated.json(); } catch { throw new GateError("PREVIEW_IDENTITY_INVALID"); }
  if (health?.auth !== "preview-isolated" || health?.supabaseProjectRef !== PIN.supabaseRef) throw new GateError("PREVIEW_IDENTITY_INVALID");
  return Object.freeze({ deploymentId: PIN.deploymentId, sha: PIN.sha, host: PIN.host, supabaseRef: PIN.supabaseRef });
}

export function safeLedgerRow(runId, control, status, viewport = null) {
  return { utc: new Date().toISOString(), runId, deploymentId: PIN.deploymentId, sha: PIN.sha, control, status, viewport };
}

async function appendSafeLedger(runId, control, status, viewport = null) {
  const dir = "test-results/u03-b4";
  await mkdir(dir, { recursive: true });
  await appendFile(`${dir}/${runId}.jsonl`, `${JSON.stringify(safeLedgerRow(runId, control, status, viewport))}\n`, { mode: 0o600 });
}

function assertAuthCookie(cookies) {
  return cookies.some((cookie) => cookie.name.startsWith(`sb-${PIN.supabaseRef}-auth-token`) && cookie.domain.replace(/^\./, "") === PIN.host);
}

async function login(page, context, email, password) {
  const response = await page.goto(`${ORIGIN}/acceso`, { waitUntil: "domcontentloaded" });
  if (response?.status() !== 200) throw new GateError("LOGIN_PAGE_UNAVAILABLE");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  try { await page.waitForURL(`${ORIGIN}/panel`, { timeout: 20000 }); }
  catch { throw new GateError("LOGIN_REJECTED"); }
  const cookies = await context.cookies(ORIGIN);
  if (!assertAuthCookie(cookies)) throw new GateError("AUTH_COOKIE_MISSING");
}

async function visit(page, path, expectedStatus) {
  const response = await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
  if (response?.status() !== expectedStatus || new URL(page.url()).origin !== ORIGIN || new URL(page.url()).pathname !== path) {
    throw new GateError(expectedStatus === 200 ? "PROJECT_ACCESS_FAILED" : "CROSS_PROJECT_ACCESS_NOT_DENIED");
  }
}

async function logout(page, context, deniedPath) {
  await page.getByRole("button", { name: "Salir" }).click();
  try { await page.waitForURL(`${ORIGIN}/`, { timeout: 15000 }); }
  catch { throw new GateError("LOGOUT_FAILED"); }
  if (assertAuthCookie(await context.cookies(ORIGIN))) throw new GateError("AUTH_COOKIE_RETAINED_AFTER_LOGOUT");
  const response = await page.goto(`${ORIGIN}${deniedPath}`, { waitUntil: "domcontentloaded" });
  if (!response || new URL(page.url()).pathname !== "/acceso") throw new GateError("SESSION_REUSE_AFTER_LOGOUT");
}

async function runViewport(browser, token, env, viewport, runId) {
  const mobile = viewport === "mobile";
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    isMobile: mobile,
    hasTouch: mobile,
    locale: "es-ES",
    acceptDownloads: false,
    serviceWorkers: "block",
  });
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(20000);
  const securityEvents = [];
  await installScopedRoutes(context, token, ORIGIN, (event) => securityEvents.push(event));

  try {
    const page = await context.newPage();
    await login(page, context, env.U03_B4_A_EMAIL, env.U03_B4_A_PASSWORD);
    await appendSafeLedger(runId, "login-cookie-A", "PASS", viewport);
    await visit(page, "/panel", 200);
    const links = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")));
    if (![env.U03_B4_A1_PATH, env.U03_B4_A2_PATH].every((path) => links.includes(path))) throw new GateError("A_PROJECTS_NOT_LISTED");
    await visit(page, env.U03_B4_A1_PATH, 200);
    await visit(page, env.U03_B4_A2_PATH, 200);
    await visit(page, env.U03_B4_B1_PATH, 404);
    await appendSafeLedger(runId, "navigation-A1-A2-deny-B1", "PASS", viewport);
    await logout(page, context, env.U03_B4_A1_PATH);
    await appendSafeLedger(runId, "logout-cookie-revocation-A", "PASS", viewport);

    await login(page, context, env.U03_B4_B_EMAIL, env.U03_B4_B_PASSWORD);
    await appendSafeLedger(runId, "login-cookie-B", "PASS", viewport);
    await visit(page, env.U03_B4_B1_PATH, 200);
    await visit(page, env.U03_B4_A1_PATH, 404);
    await visit(page, env.U03_B4_A2_PATH, 404);
    await appendSafeLedger(runId, "navigation-B1-deny-A1-A2", "PASS", viewport);
    await logout(page, context, env.U03_B4_B1_PATH);
    await appendSafeLedger(runId, "logout-cookie-revocation-B", "PASS", viewport);

    if (env.U03_B4_REVOKED_EMAIL) {
      await login(page, context, env.U03_B4_REVOKED_EMAIL, env.U03_B4_REVOKED_PASSWORD);
      await visit(page, env.U03_B4_REVOKED_PATH, 404);
      await appendSafeLedger(runId, "pre-revoked-membership-denial", "PASS", viewport);
      await logout(page, context, env.U03_B4_REVOKED_PATH);
    } else {
      await appendSafeLedger(runId, "membership-revocation-after-withdrawal", "SKIP", viewport);
    }
    if (securityEvents.length) throw new GateError("EXTERNAL_NAVIGATION_OR_REQUEST_BLOCKED");
    await appendSafeLedger(runId, "oidc-host-scope-and-redirect-guard", "PASS", viewport);
  } catch (error) {
    await appendSafeLedger(runId, "browser-suite", "FAIL", viewport);
    if (error instanceof GateError) throw error;
    throw new GateError("BROWSER_AUTH_OR_NAVIGATION_FAILED");
  } finally {
    await context.close();
  }
}

export async function runB4({ env = process.env, inspect = inspectPinnedDeployment, fetchImpl = fetch, launch = () => chromium.launch({ headless: true }) } = {}) {
  const verified = await preflight({ token: env.VERCEL_OIDC_TOKEN, inspect, fetchImpl });
  assertInputs(env);
  const runId = randomUUID();
  let browser;
  try {
    browser = await launch();
    for (const viewport of ["desktop", "mobile"]) await runViewport(browser, env.VERCEL_OIDC_TOKEN, env, viewport, runId);
    await appendSafeLedger(runId, "b4-suite", "PASS");
    console.log(`U03 B-4 ${runId}: PASS · ${verified.deploymentId} · ${verified.sha} · ${verified.host}`);
    return { runId, verified };
  } catch (error) {
    await appendSafeLedger(runId, "b4-suite", "FAIL");
    const code = error instanceof GateError ? error.code : "B4_FAILED";
    console.error(`U03 B-4 ${runId}: FAIL · ${code}`);
    throw new GateError(code);
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  try {
    if (process.argv.includes("--preflight")) {
      const verified = await preflight();
      console.log(`U03 B-4 preflight PASS · ${verified.deploymentId} · ${verified.sha} · ${verified.host}`);
      return;
    }
    if (!process.argv.includes("--browser")) throw new GateError("MODE_REQUIRED");
    await runB4();
  } catch (error) {
    const code = error instanceof GateError ? error.code : "B4_PREFLIGHT_FAILED";
    console.error(`U03 B-4 BLOCKED · ${code}; navegador no abierto si falló el preflight.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
