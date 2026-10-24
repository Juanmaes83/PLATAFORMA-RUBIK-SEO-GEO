import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, appendFile } from "node:fs/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { join, relative } from "node:path";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const PIN_DEFAULTS = {
  projectId: "prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook",
  teamId: "team_hLhdb3M9MviTIysXD9whFF2c",
  deploymentId: "dpl_Hmpevn3Vds4pFUzbiiFFB3vVGCKD",
  sha: "28fd3927f9acce8ba9b27b43d3afb86b12aa0a86",
  branch: "codex/h1a-integral-20261022",
  host: "plataforma-rubik-seo-3elivlu19-juanma-espinosas-projects.vercel.app",
  supabaseRef: "rhnnplewqsekrnaousyl",
};
// A campaign may pin a newly-created Preview deployment by its inspected immutable ID.
// The project, team and Supabase ref stay fixed; preflight still validates READY, branch and SHA.
export const PIN = Object.freeze({
  ...PIN_DEFAULTS,
  deploymentId: process.env.U03_PIN_DEPLOYMENT_ID || PIN_DEFAULTS.deploymentId,
  host: process.env.U03_PIN_DEPLOYMENT_HOST || PIN_DEFAULTS.host,
  sha: process.env.U03_PIN_DEPLOYMENT_SHA || PIN_DEFAULTS.sha,
  branch: process.env.U03_PIN_DEPLOYMENT_BRANCH || PIN_DEFAULTS.branch,
});

const OIDC_HEADER = "x-vercel-trusted-oidc-idp-token";
const U03_RUN_ID_HEADER = "x-rubik-u03-run-id";
const ORIGIN = `https://${PIN.host}`;
const CHILD_ENV_KEYS = ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "HOMEDRIVE", "HOMEPATH", "COMSPEC", "PATHEXT", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS", "OS"];
const NETWORK_ENV_KEYS = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy", "NODE_USE_ENV_PROXY", "NODE_USE_SYSTEM_CA", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR"];

export function chromiumEnvironment(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([name]) => CHILD_ENV_KEYS.includes(name)));
}

export function networkEnvironment(source = process.env) {
  const allowed = new Set([...CHILD_ENV_KEYS, ...NETWORK_ENV_KEYS]);
  return Object.fromEntries(Object.entries(source).filter(([name]) => allowed.has(name)));
}

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
  // GitHub-triggered and CLI deployments use different metadata names. Reject
  // conflicting claims instead of accepting the first populated field.
  const shas = [actual.meta?.githubCommitSha, actual.meta?.gitCommitSha, actual.gitSource?.sha].filter(value => value != null);
  const refs = [actual.meta?.githubCommitRef, actual.meta?.gitCommitRef, actual.gitSource?.ref].filter(value => value != null);
  if (!shas.length || shas.some(value => value !== pin.sha)) return false;
  if (!refs.length || refs.some(value => value !== pin.branch)) return false;
  if ((actual.projectId ?? actual.project?.id) !== pin.projectId) return false;
  if ((actual.readyState ?? actual.state) !== "READY") return false;
  if (actual.target === "production") return false;
  return true;
}

export function scopedHeaders(url, inputHeaders, token, allowedOrigin = ORIGIN, runId = null) {
  const headers = Object.fromEntries(Object.entries(inputHeaders ?? {}).filter(([key]) =>
    key.toLowerCase() !== OIDC_HEADER && key.toLowerCase() !== U03_RUN_ID_HEADER));
  let origin = "";
  try { origin = new URL(url).origin; } catch { return headers; }
  if (origin === allowedOrigin) {
    if (token) headers[OIDC_HEADER] = token;
    if (typeof runId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) headers[U03_RUN_ID_HEADER] = runId;
  }
  return headers;
}

export function isExternalRedirect(requestUrl, redirectedFromUrl, allowedOrigin = ORIGIN) {
  if (!redirectedFromUrl) return false;
  try { return new URL(requestUrl).origin !== new URL(redirectedFromUrl).origin && new URL(redirectedFromUrl).origin === allowedOrigin; }
  catch { return true; }
}

export function classifyBlockedExternalRequest({ resourceType, mainFrame = false, redirect = false } = {}) {
  if (resourceType !== "Document" || !mainFrame) {
    return redirect ? "BLOCKED_EXTERNAL_SUBRESOURCE_REDIRECT" : "BLOCKED_EXTERNAL_SUBRESOURCE";
  }
  return redirect ? "BLOCKED_EXTERNAL_MAIN_FRAME_REDIRECT" : "BLOCKED_EXTERNAL_MAIN_FRAME_NAVIGATION";
}

// Only fixed classes cross the evidence boundary. Never retain a path, query, or CDP error.
export function classifyDiagnosticResource(url, resourceType) {
  let route = 'other';
  try {
    const path = new URL(url).pathname;
    if (path.startsWith('/_next/static/')) route = 'next-static';
    else if (path === '/_next/image') route = 'next-image';
    else if (path === '/acceso') route = 'access';
    else if (path === '/panel') route = 'panel';
    else if (path.startsWith('/api/')) route = 'api';
    else if (path.startsWith('/proyectos/')) route = 'project';
    else if (path === '/') route = 'root';
  } catch { route = 'unknown'; }
  const rawType = String(resourceType ?? '').toLowerCase();
  const type = ({ document:'document', script:'script', stylesheet:'stylesheet', image:'image', fetch:'fetch', xhr:'xhr', font:'font' })[rawType] ?? 'other';
  return `${route}-${type}`;
}

// CDP messages stay inside this process. Only these fixed classes cross the ledger boundary.
export function classifyCdpInterceptionFailure(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (/Invalid InterceptionId|Invalid request(?:Id| id)|No resource with given identifier/i.test(message))
    return 'REQUEST_NOT_ACTIVE';
  if (/Session closed|Target closed|Session with given id not found/i.test(message))
    return 'CDP_SESSION_CLOSED';
  if (/invalid (?:request )?header|header.*invalid/i.test(message))
    return 'HEADER_REJECTED';
  return 'CDP_OPERATION_REJECTED';
}

export async function installScopedRoutes(context, page, token, allowedOrigin = ORIGIN, onEvent = () => {}, onRouteEvent = () => {}, runId = null, onNavigationDiagnostic = () => {}, onRequestTrace = (event) => { void event; }, blockExternalSubresources = false) {
  // Playwright routes are called once for a redirect chain. CDP Fetch pauses each
  // Chromium request, including the GET produced by an action's 303 response.
  const session = await context.newCDPSession(page);
  const requestOrigins = new Map();
  const traceOrdinals = new Map();
  const traceNetworkIds = new Map();
  const traceResponses = new Set();
  const traceRequests = new Map();
  const traceNetworkResponses = new Map();
  const traceNetworkInitiators = new Map();
  let nextTraceOrdinal = 0;
  const frameTree = await session.send("Page.getFrameTree");
  const mainFrameId = frameTree?.frameTree?.frame?.id ?? null;
  const blocked = (event, paused, redirect, status = null) => {
    // If CDP cannot identify the root frame, classify documents as main-frame
    // navigation and fail closed instead of silently treating them as assets.
    const mainFrame = !mainFrameId || paused.frameId === mainFrameId;
    const disposition = classifyBlockedExternalRequest({ resourceType: paused.resourceType, mainFrame, redirect });
    const diagnostic = {
      event, disposition,
      requestClass: paused.resourceType === "Document" ? (mainFrame ? "MAIN_DOCUMENT" : "FRAME_DOCUMENT") : "SUBRESOURCE",
      destinationClass: "EXTERNAL",
      responseClass: redirect ? "REDIRECT" : "DIRECT",
      httpStatus: Number.isInteger(status) && status >= 300 && status < 400 ? status : null,
    };
    onNavigationDiagnostic(diagnostic);
    if (disposition === "BLOCKED_EXTERNAL_MAIN_FRAME_REDIRECT" || disposition === "BLOCKED_EXTERNAL_MAIN_FRAME_NAVIGATION") {
      onEvent(event, diagnostic);
      onRouteEvent(event);
    } else {
      onRouteEvent(event);
      onRouteEvent(disposition.toLowerCase().replaceAll("_", "-"));
    }
  };
  // A request may finish or fail without a Fetch Response pause. Record a bounded,
  // closed terminal outcome; never infer a successful response from a missing pause.
  session.on('Network.loadingFailed', event => {
    const ordinal = traceNetworkIds.get(event.requestId);
    const request = traceRequests.get(ordinal);
    if (!request) return;
    try { onRequestTrace({ ...request, initiatorClass:traceNetworkInitiators.get(event.requestId) ?? 'UNKNOWN', stage:'TERMINAL', interceptionOperation:'NETWORK_LOADING_FAILED',
      responseClass:'UNKNOWN', result:'BLOCKED', disposition:'PINNED_REQUEST_BLOCKED',
      failureCategory:event.canceled === true ? 'NETWORK_CANCELLED' : 'NETWORK_FAILED' }); }
    catch { onRouteEvent('diagnostic-cardinality-exceeded'); onEvent('pinned-origin-request-failed'); }
  });
  session.on('Network.requestWillBeSent', event => {
    const kind=String(event.initiator?.type ?? '').toLowerCase();
    traceNetworkInitiators.set(event.requestId,
      ({parser:'PARSER',script:'SCRIPT',preload:'PRELOAD',other:'OTHER'})[kind] ?? 'UNKNOWN');
  });
  session.on('Network.responseReceived', event => {
    const ordinal = traceNetworkIds.get(event.requestId);
    const status = event.response?.status;
    if (traceRequests.has(ordinal) && Number.isInteger(status) && status >= 100 && status <= 599)
      traceNetworkResponses.set(ordinal,status);
  });
  session.on('Network.loadingFinished', event => {
    const ordinal = traceNetworkIds.get(event.requestId);
    const request = traceRequests.get(ordinal);
    if (!request) return;
    const status=traceNetworkResponses.get(ordinal);
    try { onRequestTrace({ ...request, initiatorClass:traceNetworkInitiators.get(event.requestId) ?? 'UNKNOWN', stage:'TERMINAL', interceptionOperation:'NETWORK_FINISHED',
      responseClass:Number.isInteger(status) ? status >= 300 && status < 400 ? 'REDIRECT' : 'DIRECT' : 'UNKNOWN',
      httpStatus:status, result:traceResponses.has(ordinal) && Number.isInteger(status) ? 'CONTINUED' : 'BLOCKED',
      disposition:traceResponses.has(ordinal) && Number.isInteger(status) ? 'ALLOWED' : 'PINNED_REQUEST_BLOCKED',
      failureCategory:traceResponses.has(ordinal) && Number.isInteger(status) ? null : 'RESPONSE_NOT_OBSERVED' }); }
    catch { onRouteEvent('diagnostic-cardinality-exceeded'); onEvent('pinned-origin-request-failed'); }
  });
  session.on("Fetch.requestPaused", (paused) => {
    const stage = paused.responseStatusCode || paused.responseErrorReason ? 'response' : 'request';
    const traceable = paused.resourceType === 'XHR' || paused.resourceType === 'Fetch';
    if (traceable && !traceOrdinals.has(paused.requestId)) traceOrdinals.set(paused.requestId, ++nextTraceOrdinal);
    if (traceable && paused.networkId) traceNetworkIds.set(paused.networkId,traceOrdinals.get(paused.requestId));
    const trace = (result, failureCategory = null) => {
      if (!traceable) return;
      try {
        onRequestTrace({ ordinal: traceOrdinals.get(paused.requestId), stage: stage.toUpperCase(),
          resourceClass: classifyDiagnosticResource(paused.request?.url, paused.resourceType),
          initiatorClass:traceNetworkInitiators.get(paused.networkId) ?? 'UNKNOWN',
          destinationClass, interceptionOperation: operation,
          responseClass: stage === 'request' ? 'UNKNOWN' :
            paused.responseStatusCode >= 300 && paused.responseStatusCode < 400 ? 'REDIRECT' : 'DIRECT',
          disposition: result === 'BLOCKED' ? 'PINNED_REQUEST_BLOCKED' : 'ALLOWED',
          result, failureCategory,
          httpStatus: Number.isInteger(paused.responseStatusCode) ? paused.responseStatusCode : null });
        if (stage === 'response' && result === 'CONTINUED') traceResponses.add(traceOrdinals.get(paused.requestId));
      } catch { onRouteEvent('diagnostic-cardinality-exceeded'); onEvent('pinned-origin-request-failed'); }
    };
    let operation = 'CLASSIFY_URL';
    let destinationClass = 'UNKNOWN';
    const requestClass = paused.resourceType === 'Document'
      ? (!mainFrameId || paused.frameId === mainFrameId ? 'MAIN_DOCUMENT' : 'FRAME_DOCUMENT') : 'SUBRESOURCE';
    void (async () => {
      const url = paused.request.url;
      const parsed = new URL(url);
      operation = 'CLASSIFY_ORIGIN';
      const origin = parsed.origin;
      destinationClass = origin === allowedOrigin ? 'PINNED_ORIGIN' : 'EXTERNAL';
      if (traceable && stage === 'request') traceRequests.set(traceOrdinals.get(paused.requestId),{
        ordinal:traceOrdinals.get(paused.requestId),resourceClass:classifyDiagnosticResource(url,paused.resourceType),
        destinationClass });
      if (paused.responseStatusCode || paused.responseErrorReason) {
        operation = 'CLASSIFY_REDIRECT';
        const location = paused.responseHeaders?.find(header => header.name.toLowerCase() === "location")?.value;
        if (paused.responseStatusCode >= 300 && paused.responseStatusCode < 400 && location) {
          let destination;
          try { destination = new URL(location, url); } catch { destination = null; }
          if (!destination || (origin === allowedOrigin && destination.origin !== allowedOrigin)) {
            blocked("external-redirect-blocked", paused, true, paused.responseStatusCode);
            operation = 'FAIL_REQUEST';
            await session.send("Fetch.failRequest", { requestId: paused.requestId, errorReason: "BlockedByClient" });
            trace('BLOCKED');
            return;
          }
        }
        operation = 'CONTINUE_RESPONSE';
        await session.send("Fetch.continueResponse", { requestId: paused.requestId });
        trace('CONTINUED');
        return;
      }
      const redirectedFromAllowed = requestOrigins.get(paused.redirectedRequestId) === allowedOrigin;
      requestOrigins.set(paused.requestId, origin);
      const navigation = paused.resourceType === "Document";
      if (origin !== allowedOrigin && (navigation || redirectedFromAllowed || blockExternalSubresources)) {
        const event = redirectedFromAllowed ? "external-redirect-blocked" : "external-navigation-blocked";
        blocked(event, paused, redirectedFromAllowed);
        operation = 'FAIL_REQUEST';
        await session.send("Fetch.failRequest", { requestId: paused.requestId, errorReason: "BlockedByClient" });
        trace('BLOCKED');
        return;
      }
      operation = 'CONSTRUCT_HEADERS';
      const inputHeaders = paused.request.headers ?? {};
      const loginPost = parsed.pathname === "/acceso" || parsed.pathname === "/api/auth/login";
      const authAction = origin === allowedOrigin && paused.request.method === "POST" &&
        (loginPost || Object.keys(inputHeaders).some(name => name.toLowerCase() === "next-action"));
      if (authAction) onRouteEvent("auth-action-post");
      else if (origin === allowedOrigin) onRouteEvent(navigation ? "pinned-navigation" : "pinned-request");
      const headers = scopedHeaders(url, inputHeaders, token, allowedOrigin, runId);
      operation = 'CONTINUE_REQUEST';
      await session.send("Fetch.continueRequest", {
        requestId: paused.requestId,
        headers: Object.entries(headers).map(([name, value]) => ({ name, value: String(value) })),
      });
      trace('CONTINUED');
    })().catch(async (error) => {
      trace('BLOCKED', classifyCdpInterceptionFailure(error));
      const resource = classifyDiagnosticResource(paused.request?.url, paused.resourceType);
      onRouteEvent(`cdp-failure-${stage}-${resource}`);
      const diagnostic = { event: "pinned-origin-request-failed", disposition: "PINNED_REQUEST_BLOCKED",
        requestClass, destinationClass, responseClass: stage === 'response'
          ? (paused.responseStatusCode >= 300 && paused.responseStatusCode < 400 ? 'REDIRECT' : 'DIRECT') : 'UNKNOWN',
        interceptionOperation: operation, failureCategory: classifyCdpInterceptionFailure(error),
        resourceClass: resource, httpStatus: Number.isInteger(paused.responseStatusCode) ? paused.responseStatusCode : null };
      onNavigationDiagnostic(diagnostic);
      onEvent("pinned-origin-request-failed", diagnostic);
      onRouteEvent("pinned-origin-request-failed");
      await session.send("Fetch.failRequest", { requestId: paused.requestId, errorReason: "BlockedByClient" }).catch(() => {
        onNavigationDiagnostic({ ...diagnostic, interceptionOperation: 'FAIL_REQUEST' });
      });
    });
  });
  page.on("response", (response) => {
    const request = response.request();
    try {
      const url = new URL(request.url());
      if (url.origin === allowedOrigin && request.method() === "POST" &&
        (url.pathname === "/acceso" || url.pathname === "/api/auth/login")) onRouteEvent(`auth-action-http-${response.status()}`);
    } catch { /* retain only the classified event */ }
  });
  await session.send('Network.enable');
  await session.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }, { urlPattern: "*", requestStage: "Response" }] });
  return session;
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
    const cli = process.env.U03_VERCEL_CLI || (process.platform === "win32" ? "vercel.cmd" : "vercel");
    ({ stdout } = await execFileAsync(cli, [
      "api", `/v13/deployments/${PIN.deploymentId}?teamId=${PIN.teamId}`,
    ], { windowsHide: true, maxBuffer: 1024 * 1024, shell: process.platform === "win32", env: networkEnvironment() }));
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

function diagnosticOrigin(value, allowedOrigin = ORIGIN) {
  try {
    const url = new URL(value);
    if (url.origin === allowedOrigin) return "preview";
    if (url.hostname === `${PIN.supabaseRef}.supabase.co`) return "preview-supabase";
    return url.protocol === "data:" || url.protocol === "blob:" ? "inline" : "external";
  } catch { return "unknown"; }
}

export function createPageDiagnostics(page, { allowedOrigin = ORIGIN } = {}) {
  let bucket = emptyDiagnosticBucket();
  let routeEvents = {};
  const addRouteEvent = event => {
    if (!ALLOWED_ROUTE_EVENT.test(event)) return;
    if (!(event in routeEvents) && Object.keys(routeEvents).length >= 99) event = 'diagnostic-cardinality-exceeded';
    routeEvents[event] = (routeEvents[event] ?? 0) + 1;
  };
  const consoleListener = message => {
    const rawType = message.type();
    const type = new Set(["error", "warning", "log", "info", "debug", "dir", "assert", "trace"]).has(rawType) ? rawType : "other";
    let origin = "unknown";
    try { origin = diagnosticOrigin(message.location()?.url ?? "", allowedOrigin); } catch { /* classify only */ }
    const key = `${type}:${origin}`;
    bucket.console[key] = (bucket.console[key] ?? 0) + 1;
    if (type === 'error') {
      let location = '';
      try { location = message.location()?.url ?? ''; } catch { /* unknown class */ }
      addRouteEvent(`console-error-${classifyDiagnosticResource(location, 'Other')}`);
    }
  };
  const responseListener = response => {
    const status = response.status();
    const request = response.request();
    let origin = "unknown";
    try { origin = diagnosticOrigin(response.url(), allowedOrigin); } catch { /* classify only */ }
    const key = `${status}:${origin}`;
    bucket.http[key] = (bucket.http[key] ?? 0) + 1;
    if (status >= 400) addRouteEvent(`http-${status}-${classifyDiagnosticResource(response.url(), request.resourceType())}`);
  };
  const failedListener = request => {
    let origin = "unknown";
    try { origin = diagnosticOrigin(request.url(), allowedOrigin); } catch { /* classify only */ }
    bucket.requestFailures[origin] = (bucket.requestFailures[origin] ?? 0) + 1;
    addRouteEvent(`request-failed-${classifyDiagnosticResource(request.url(), request.resourceType())}`);
  };
  page.on("console", consoleListener);
  page.on("response", responseListener);
  page.on("requestfailed", failedListener);
  return {
    addRouteEvent,
    // Read-only observation for attribution. It never resets counters; only take() consumes
    // a phase, and auditAndCapture calls take() exactly at the strict visual gate.
    snapshot() { return structuredClone({ ...bucket, routeEvents }); },
    take() {
      const result = { ...bucket, routeEvents };
      bucket = emptyDiagnosticBucket();
      routeEvents = {};
      return result;
    },
    dispose() {
      page.off("console", consoleListener);
      page.off("response", responseListener);
      page.off("requestfailed", failedListener);
    },
  };
}

function emptyDiagnosticBucket() { return { console: {}, http: {}, requestFailures: {} }; }

const DIAGNOSTIC_RESOURCE = '(?:next-static|next-image|access|panel|api|project|root|other|unknown)-(?:document|script|stylesheet|image|fetch|xhr|font|other)';
const ROUTE_EVENT_PATTERN = `(?:auth-action-post|auth-action-http-[1-5]\\d\\d|pinned-navigation|pinned-request|external-navigation-blocked|external-redirect-blocked|pinned-origin-request-failed|blocked-external-subresource|blocked-external-subresource-redirect|diagnostic-cardinality-exceeded|(?:console-error|request-failed|cdp-failure-(?:request|response))-${DIAGNOSTIC_RESOURCE}|http-[45]\\d\\d-${DIAGNOSTIC_RESOURCE})`;
export const ALLOWED_ROUTE_EVENT = new RegExp(`^${ROUTE_EVENT_PATTERN}$`);

const DIAGNOSTIC_ORIGIN_PATTERN = /^(?:preview|preview-supabase|external|inline|unknown)$/;
const DIAGNOSTIC_INTERVAL_BOUNDARIES = new Set([
  "before-login", "after-login", "before-navigation", "after-navigation", "before-measurement", "after-measurement",
]);
const DIAGNOSTIC_MAP_PATTERNS = Object.freeze({
  console: /^(?:error|warning|log|info|debug|dir|assert|trace|other):(?:preview|preview-supabase|external|inline|unknown)$/,
  http: /^[1-5]\d\d:(?:preview|preview-supabase|external|inline|unknown)$/,
  requestFailures: DIAGNOSTIC_ORIGIN_PATTERN,
  routeEvents: ALLOWED_ROUTE_EVENT,
});

function strictDiagnosticSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GateError("DIAGNOSTIC_SNAPSHOT_INVALID");
  const result = {};
  for (const [name, pattern] of Object.entries(DIAGNOSTIC_MAP_PATTERNS)) {
    const input = value[name];
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new GateError("DIAGNOSTIC_SNAPSHOT_INVALID");
    const safe = {};
    for (const [key, count] of Object.entries(input)) {
      if (!pattern.test(key) || !Number.isSafeInteger(count) || count < 0 || count > 1_000_000 || Object.keys(safe).length >= 100)
        throw new GateError("DIAGNOSTIC_SNAPSHOT_INVALID");
      safe[key] = count;
    }
    result[name] = safe;
  }
  return result;
}

function diagnosticDelta(before, after) {
  const delta = {};
  for (const name of Object.keys(DIAGNOSTIC_MAP_PATTERNS)) {
    delta[name] = {};
    const keys = new Set([...Object.keys(before[name]), ...Object.keys(after[name])]);
    for (const key of keys) {
      const prior = before[name][key] ?? 0;
      const current = after[name][key] ?? 0;
      if (current < prior) throw new GateError("DIAGNOSTIC_COUNTER_RESET");
      delta[name][key] = current - prior;
    }
  }
  return delta;
}

function sumDiagnosticDeltas(rows) {
  const sum = emptyDiagnosticBucket();
  sum.routeEvents = {};
  for (const row of rows) for (const name of Object.keys(DIAGNOSTIC_MAP_PATTERNS)) {
    for (const [key, count] of Object.entries(row.diagnosticsDelta[name])) sum[name][key] = (sum[name][key] ?? 0) + count;
  }
  return sum;
}

function sameDiagnosticCounts(left, right) {
  return Object.keys(DIAGNOSTIC_MAP_PATTERNS).every(name => {
    const keys = new Set([...Object.keys(left[name]), ...Object.keys(right[name])]);
    return [...keys].every(key => (left[name][key] ?? 0) === (right[name][key] ?? 0));
  });
}

/**
 * Keeps cumulative, non-consuming snapshots until the strict visual gate calls finishGate.
 * Each checkpoint records the interval since the previous checkpoint; finishGate compares
 * their sum with the exact counter returned by take() before it resets the baseline.
 */
export function createDiagnosticIntervalTracker(diagnostics) {
  if (!diagnostics || typeof diagnostics.snapshot !== "function" || typeof diagnostics.take !== "function")
    throw new GateError("DIAGNOSTIC_SNAPSHOT_INVALID");
  let previous;
  try { previous = strictDiagnosticSnapshot(diagnostics.snapshot()); }
  catch { throw new GateError("DIAGNOSTIC_SNAPSHOT_INVALID"); }
  let intervals = [];
  const checkpoint = boundary => {
    if (!DIAGNOSTIC_INTERVAL_BOUNDARIES.has(boundary)) throw new GateError("DIAGNOSTIC_STAGE_INVALID");
    let after;
    try { after = strictDiagnosticSnapshot(diagnostics.snapshot()); }
    catch { throw new GateError("DIAGNOSTIC_SNAPSHOT_INVALID"); }
    const row = { interval: boundary, diagnosticsBefore: previous, diagnosticsAfter: after,
      diagnosticsDelta: diagnosticDelta(previous, after) };
    intervals.push(row);
    previous = after;
    return row;
  };
  return {
    checkpoint,
    finishGate(requiredBoundaries = []) {
      let consumed;
      try {
        checkpoint("after-measurement");
        consumed = strictDiagnosticSnapshot(diagnostics.take());
      } catch {
        intervals = [];
        throw new GateError("DIAGNOSTIC_SNAPSHOT_INVALID");
      }
      const expected = [...requiredBoundaries];
      const observed = intervals.map(row => row.interval);
      const missing = expected.filter((boundary, index) => observed[index] !== boundary);
      const extra = observed.length !== expected.length;
      const total = sumDiagnosticDeltas(intervals);
      const result = { complete: missing.length === 0 && !extra && sameDiagnosticCounts(total, consumed),
        code: missing.length || extra ? "DIAGNOSTIC_STAGE_MISSING" : sameDiagnosticCounts(total, consumed) ? null : "DIAGNOSTIC_SUM_MISMATCH",
        intervals: intervals.slice(), diagnostics: consumed };
      intervals = [];
      try {
        previous = strictDiagnosticSnapshot(diagnostics.snapshot());
        const empty = strictDiagnosticSnapshot(emptyDiagnosticBucketWithRoutes());
        if (!sameDiagnosticCounts(previous, empty)) {
          result.complete = false;
          result.code = "DIAGNOSTIC_COUNTER_RESET";
        }
      } catch {
        result.complete = false;
        result.code = "DIAGNOSTIC_SNAPSHOT_INVALID";
        previous = emptyDiagnosticBucketWithRoutes();
      }
      return result;
    },
  };
}

function emptyDiagnosticBucketWithRoutes() { return { ...emptyDiagnosticBucket(), routeEvents: {} }; }

function totalConsoleErrors(diagnostics) {
  return Object.entries(diagnostics.console).filter(([key]) => key.startsWith("error:")).reduce((sum, [, count]) => sum + count, 0);
}

export function summarizeDiagnosticInterval(row) {
  if (!row || typeof row !== "object") throw new GateError("DIAGNOSTIC_SNAPSHOT_INVALID");
  let delta;
  try { delta = strictDiagnosticSnapshot(row.diagnosticsDelta); }
  catch { throw new GateError("DIAGNOSTIC_SNAPSHOT_INVALID"); }
  const consoleErrorCount = totalConsoleErrors(delta);
  if (delta.routeEvents['diagnostic-cardinality-exceeded'])
    return { consoleErrorCount, status: 'BLOCKED', code: 'DIAGNOSTIC_SNAPSHOT_INVALID' };
  return { consoleErrorCount, status: consoleErrorCount > 0 ? "BLOCKED" : "PASS",
    ...(consoleErrorCount > 0 ? { code: "H1A_PHASE_CONSOLE_ERRORS" } : {}) };
}

export async function saveSanitizedCapture(page, capturePath) {
  try {
    await page.evaluate(() => {
      document.querySelectorAll('input[type="password"], input[type="email"]').forEach(input => { input.value = ""; input.setAttribute("value", ""); });
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) walker.currentNode.textContent = walker.currentNode.textContent
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
        .replace(/(?:eyJ[a-zA-Z0-9_-]{10,}\.){2}[a-zA-Z0-9_-]+/g, "[redacted]");
    });
    await page.screenshot({ path: capturePath, fullPage: true, animations: "disabled" });
    return true;
  } catch { return false; }
}

async function appendSafeLedger(runId, control, status, viewport = null) {
  const dir = "test-results/u03-b4";
  await mkdir(dir, { recursive: true });
  await appendFile(`${dir}/${runId}.jsonl`, `${JSON.stringify(safeLedgerRow(runId, control, status, viewport))}\n`, { mode: 0o600 });
}

/**
 * @param {unknown} page
 * @param {{runId:string,viewport:string,screen:string,captureRoot:string,
 *   ledger:(caseId:string,status:string,detail:Record<string,unknown>)=>Promise<void>,
 *   diagnostics:{take:()=>Record<string,any>,snapshot:()=>Record<string,any>},
 *   diagnosticIntervals?:{checkpoint:(boundary:string)=>Record<string,any>,finishGate:(requiredBoundaries:string[])=>Record<string,any>},
 *   requiredDiagnosticBoundaries?:string[],pageErrors?:number|{count:number}}} options
 */
export async function auditAndCapture(page, { runId, viewport, screen, captureRoot, ledger, diagnostics, pageErrors = 0,
  diagnosticIntervals = null, requiredDiagnosticBoundaries = [] }) {
  if (diagnosticIntervals) {
    const boundary = diagnosticIntervals.checkpoint("before-measurement");
    const intervalSummary = summarizeDiagnosticInterval(boundary);
    await ledger("h1a-diagnostic-boundary", intervalSummary.status === "BLOCKED" ? "BLOCKED" : "ATTEMPTED", {
      diagnosticInterval: boundary.interval, diagnosticsAfter: boundary.diagnosticsAfter,
      diagnosticsBefore: boundary.diagnosticsBefore, diagnosticsDelta: boundary.diagnosticsDelta,
      ...(intervalSummary.code ? { code: intervalSummary.code } : {}),
    });
    if (intervalSummary.status === "BLOCKED") throw new GateError(intervalSummary.code);
  }
  await page.waitForTimeout(300);
  const dom = await page.evaluate(() => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body?.scrollWidth ?? 0,
      visibleErrors: [...document.querySelectorAll('[role="alert"], [data-error], [aria-invalid="true"]')].filter(visible).length,
    };
  });
  let intervalResult = null;
  let phaseDiagnostics;
  if (diagnosticIntervals) {
    intervalResult = diagnosticIntervals.finishGate(requiredDiagnosticBoundaries);
    phaseDiagnostics = intervalResult.diagnostics;
    const afterMeasurement = intervalResult.intervals.at(-1);
    await ledger("h1a-diagnostic-boundary", intervalResult.complete ? "PASS" : "BLOCKED", {
      diagnosticInterval: afterMeasurement?.interval ?? "after-measurement", diagnosticsAfter: afterMeasurement?.diagnosticsAfter ?? phaseDiagnostics,
      diagnosticsBefore: afterMeasurement?.diagnosticsBefore ?? emptyDiagnosticBucketWithRoutes(),
      diagnosticsDelta: afterMeasurement?.diagnosticsDelta ?? emptyDiagnosticBucketWithRoutes(),
      ...(intervalResult.code ? { code: intervalResult.code } : {}),
    });
  } else {
    phaseDiagnostics = diagnostics.take();
  }
  const consoleErrorCount = totalConsoleErrors(phaseDiagnostics);
  const phasePageErrors = typeof pageErrors === "object" ? pageErrors.count : pageErrors;
  if (typeof pageErrors === "object") pageErrors.count = 0;
  const horizontalOverflow = Math.max(dom.documentWidth, dom.bodyWidth) > dom.viewportWidth + 1;
  const visualPass = (!intervalResult || intervalResult.complete) && !horizontalOverflow && dom.visibleErrors === 0 && consoleErrorCount === 0 && phasePageErrors === 0;
  const capturePath = join(captureRoot, `${runId}-${viewport}-${screen}.png`);
  const captureSaved = await saveSanitizedCapture(page, capturePath);
  await ledger(`visual-${screen}`, visualPass && captureSaved ? "PASS" : "FAIL", {
    viewport, ...(captureSaved ? { path: relative(process.cwd(), capturePath) } : {}),
    viewportWidth: dom.viewportWidth, documentWidth: dom.documentWidth, bodyWidth: dom.bodyWidth,
    visibleErrorCount: dom.visibleErrors, consoleErrorCount, pageErrorCount: phasePageErrors,
    diagnostics: phaseDiagnostics, ...(intervalResult?.code ? { code: intervalResult.code } : {}),
  });
  if (!visualPass) throw new GateError(intervalResult?.code ?? "VISUAL_AUDIT_FAILED");
  if (!captureSaved) throw new GateError("CAPTURE_SANITIZATION_FAILED");
  await ledger(`capture-${screen}`, "SAVED", { viewport, path: relative(process.cwd(), capturePath) });
  return capturePath;
}

function assertAuthCookie(cookies, expectedHost = PIN.host) {
  return cookies.some((cookie) => cookie.name.startsWith(`sb-${PIN.supabaseRef}-auth-token`) && cookie.domain.replace(/^\./, "") === expectedHost);
}

const LOGIN_ERROR_CODES = new Set(["datos", "credenciales", "sin-confirmar"]);

async function recordLoginFailure({ page, context, origin, runId, viewport, captureRoot, ledger, routeEvents, actionStatuses, cookieCheck }) {
  const settledCookies = await context.cookies(origin);
  const sessionCookiePresent = cookieCheck(settledCookies);
  const settledUrl = (() => { try { return new URL(page.url()); } catch { return null; } })();
  const pathname = settledUrl?.origin === origin ? settledUrl.pathname : "off-origin";
  const rawError = settledUrl?.origin === origin ? settledUrl.searchParams.get("error") : null;
  const errorCode = rawError ? (LOGIN_ERROR_CODES.has(rawError) ? rawError : "unknown") : null;
  const routeSummary = [...new Set(routeEvents)].filter(event => /^(auth-action-post|auth-action-http-\d{3}|pinned-navigation|pinned-request|external-navigation-blocked|external-redirect-blocked|pinned-origin-request-failed)$/.test(event)).slice(-20);
  const actionHttpStatus = actionStatuses.at(-1) ?? routeSummary.map(event => /^auth-action-http-(\d{3})$/.exec(event)?.[1]).filter(Boolean).map(Number).at(-1) ?? null;
  const capturePath = join(captureRoot, `${runId}-${viewport}-login-failure.png`);
  const captureSaved = await saveSanitizedCapture(page, capturePath);
  await ledger("login-diagnostic", "FAIL", {
    viewport, pathname, errorCode, actionHttpStatus, sessionCookiePresent,
    routeEvents: routeSummary, ...(captureSaved ? { capturePath: relative(process.cwd(), capturePath) } : {}),
  });
  return { pathname, errorCode, actionHttpStatus, sessionCookiePresent, routeEvents: routeSummary };
}

export async function login(page, context, email, password, {
  origin = ORIGIN, runId = "u03-login", viewport = "desktop", captureRoot = join(process.cwd(), "test-results", "u03-b4", runId),
  ledger = async () => {}, routeEvents = [], timeoutMs = 20000, cookieCheck = (cookies) => assertAuthCookie(cookies),
} = {}) {
  const response = await page.goto(`${origin}/acceso`, { waitUntil: "domcontentloaded" });
  if (response?.status() !== 200) throw new GateError("LOGIN_PAGE_UNAVAILABLE");
  if (await page.locator("#email").count() === 0 || await page.locator("#password").count() === 0) {
    await recordLoginFailure({ page, context, origin, runId, viewport, captureRoot, ledger, routeEvents, actionStatuses: [], cookieCheck });
    throw new GateError("LOGIN_FORM_UNAVAILABLE");
  }
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  const actionStatuses = [];
  const observeActionRequest = (actionRequest) => {
    try {
      const actionUrl = new URL(actionRequest.url());
      if (actionRequest.method() === "POST" && actionUrl.origin === origin &&
        (actionUrl.pathname === "/acceso" || actionUrl.pathname === "/api/auth/login")) routeEvents.push("auth-action-post");
    } catch { /* do not retain malformed or off-origin request data */ }
  };
  const observeActionResponse = (actionResponse) => {
    const request = actionResponse.request();
    try {
      if (request.method() === "POST" && new URL(request.url()).origin === origin &&
        ["/acceso", "/api/auth/login"].includes(new URL(request.url()).pathname)) {
        actionStatuses.push(actionResponse.status());
        routeEvents.push(`auth-action-http-${actionResponse.status()}`);
      }
    } catch { /* do not retain malformed or off-origin request data */ }
  };
  page.on("request", observeActionRequest);
  page.on("response", observeActionResponse);
  await page.getByRole("button", { name: "Entrar" }).click();
  try {
    await page.waitForURL(url => url.origin === origin && url.pathname === "/panel", { timeout: timeoutMs });
  } catch {
    const cookies = await context.cookies(origin);
    const authCookiePresent = cookieCheck(cookies);
    let finalUrl;
    try { finalUrl = new URL(page.url()); } catch { finalUrl = null; }
    const routeSummary = [...new Set(routeEvents)].filter(event => /^(auth-action-post|auth-action-http-\d{3}|pinned-navigation|pinned-request|external-navigation-blocked|external-redirect-blocked|pinned-origin-request-failed)$/.test(event)).slice(-20);
    const actionHttpStatus = actionStatuses.at(-1) ?? routeSummary.map(event => /^auth-action-http-(\d{3})$/.exec(event)?.[1]).filter(Boolean).map(Number).at(-1) ?? null;
    // A Server Action can set the verified session cookie while a protected proxy
    // response prevents the browser from committing its redirect. Only recover when
    // the cookie is present, then require /panel itself to return successfully.
    if (authCookiePresent && finalUrl?.origin === origin) {
      const panel = await page.goto(`${origin}/panel`, { waitUntil: "domcontentloaded" }).catch(() => null);
      if (panel?.status() === 200 && new URL(page.url()).origin === origin && new URL(page.url()).pathname === "/panel") {
        await ledger("login-redirect-recovered", "PASS", {
          viewport, pathname: "/panel", actionHttpStatus, sessionCookiePresent: true, routeEvents: routeSummary,
        });
        page.off("request", observeActionRequest);
        page.off("response", observeActionResponse);
        return;
      }
    }

    await recordLoginFailure({ page, context, origin, runId, viewport, captureRoot, ledger, routeEvents, actionStatuses, cookieCheck });
    page.off("request", observeActionRequest);
    page.off("response", observeActionResponse);
    throw new GateError("LOGIN_REJECTED");
  }
  page.off("request", observeActionRequest);
  page.off("response", observeActionResponse);
  const cookies = await context.cookies(origin);
  if (!cookieCheck(cookies)) throw new GateError("AUTH_COOKIE_MISSING");
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

async function runViewport(browser, token, env, viewport, runId, { ledger, captureRoot, captures }) {
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
  const routeEvents = [];
  const pageErrors = { count: 0 };
  let diagnostics = null;
  let phase = "login";
  try {
    const page = await context.newPage();
    await installScopedRoutes(context, page, token, ORIGIN, (event) => securityEvents.push(event), event => {
      routeEvents.push(event);
      diagnostics?.addRouteEvent(event);
    });
    diagnostics = createPageDiagnostics(page);
    page.on("pageerror", () => { pageErrors.count++; });
    await login(page, context, env.U03_B4_A_EMAIL, env.U03_B4_A_PASSWORD, { runId, viewport, captureRoot, ledger, routeEvents });
    await ledger("browser-phase-diagnostics", "INFO", { viewport, phase, pathname: "/acceso", ...diagnostics.take(), pageErrorCount: pageErrors.count });
    pageErrors.count = 0;
    await ledger("login-cookie-A", "PASS", { viewport });
    phase = "/panel-A";
    await visit(page, "/panel", 200);
    captures.push(await auditAndCapture(page, { runId, viewport, screen: "a-panel", captureRoot, ledger, diagnostics, pageErrors }));
    const links = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")));
    if (![env.U03_B4_A1_PATH, env.U03_B4_A2_PATH].every((path) => links.includes(path))) throw new GateError("A_PROJECTS_NOT_LISTED");
    phase = "/A1";
    await visit(page, env.U03_B4_A1_PATH, 200);
    captures.push(await auditAndCapture(page, { runId, viewport, screen: "a1", captureRoot, ledger, diagnostics, pageErrors }));
    phase = "/A2";
    await visit(page, env.U03_B4_A2_PATH, 200);
    captures.push(await auditAndCapture(page, { runId, viewport, screen: "a2", captureRoot, ledger, diagnostics, pageErrors }));
    phase = "deny-B1";
    await visit(page, env.U03_B4_B1_PATH, 404);
    await ledger("navigation-A1-A2-deny-B1", "PASS", { viewport });
    phase = "logout-A";
    await logout(page, context, env.U03_B4_A1_PATH);
    await ledger("logout-cookie-revocation-A", "PASS", { viewport });

    phase = "login-B";
    await login(page, context, env.U03_B4_B_EMAIL, env.U03_B4_B_PASSWORD, { runId, viewport, captureRoot, ledger, routeEvents });
    await ledger("browser-phase-diagnostics", "INFO", { viewport, phase, pathname: "/acceso", ...diagnostics.take(), pageErrorCount: pageErrors.count });
    pageErrors.count = 0;
    await ledger("login-cookie-B", "PASS", { viewport });
    phase = "/panel-B";
    await visit(page, "/panel", 200);
    captures.push(await auditAndCapture(page, { runId, viewport, screen: "b-panel", captureRoot, ledger, diagnostics, pageErrors }));
    phase = "/B1";
    await visit(page, env.U03_B4_B1_PATH, 200);
    captures.push(await auditAndCapture(page, { runId, viewport, screen: "b1", captureRoot, ledger, diagnostics, pageErrors }));
    phase = "deny-A1-A2";
    await visit(page, env.U03_B4_A1_PATH, 404);
    await visit(page, env.U03_B4_A2_PATH, 404);
    await ledger("navigation-B1-deny-A1-A2", "PASS", { viewport });
    phase = "logout-B";
    await logout(page, context, env.U03_B4_B1_PATH);
    await ledger("logout-cookie-revocation-B", "PASS", { viewport });

    if (env.U03_B4_REVOKED_EMAIL) {
      phase = "login-revoked";
      await login(page, context, env.U03_B4_REVOKED_EMAIL, env.U03_B4_REVOKED_PASSWORD, { runId, viewport, captureRoot, ledger, routeEvents });
      await ledger("browser-phase-diagnostics", "INFO", { viewport, phase, pathname: "/acceso", ...diagnostics.take(), pageErrorCount: pageErrors.count });
      pageErrors.count = 0;
      await visit(page, env.U03_B4_REVOKED_PATH, 404);
      await ledger("pre-revoked-membership-denial", "PASS", { viewport });
      phase = "revoked-access";
      await logout(page, context, env.U03_B4_REVOKED_PATH);
    } else {
      await ledger("membership-revocation-after-withdrawal", "SKIP", { viewport });
    }
    if (securityEvents.length) throw new GateError("EXTERNAL_NAVIGATION_OR_REQUEST_BLOCKED");
    await ledger("oidc-host-scope-and-redirect-guard", "PASS", { viewport });
  } catch (error) {
    await ledger("browser-phase-diagnostics", "FAIL", { viewport, phase, ...(phase.startsWith("login") ? { pathname: "/acceso" } : {}), ...(diagnostics?.take() ?? emptyDiagnosticBucket()), pageErrorCount: pageErrors.count });
    await ledger("browser-suite", "FAIL", { viewport });
    if (error instanceof GateError) throw error;
    throw new GateError("BROWSER_AUTH_OR_NAVIGATION_FAILED");
  } finally {
    diagnostics?.dispose();
    await context.close();
  }
}

export async function runB4({ env = process.env, inspect = inspectPinnedDeployment, fetchImpl = fetch, preflightResult = null,
  runId = randomUUID(), ledger = (control, status, detail = {}) => appendSafeLedger(runId, control, status, detail.viewport ?? null),
  captureRoot = join(process.cwd(), "test-results", "u03-b4", runId), launch = () => chromium.launch({ headless: true, env: chromiumEnvironment() }) } = {}) {
  const verified = preflightResult ?? await preflight({ token: env.VERCEL_OIDC_TOKEN, inspect, fetchImpl });
  assertInputs(env);
  let browser;
  const captures = [];
  await mkdir(captureRoot, { recursive: true });
  try {
    browser = await launch();
    await ledger("chromium-version", "INFO", { version: browser.version() });
    for (const viewport of ["desktop", "mobile"]) await runViewport(browser, env.VERCEL_OIDC_TOKEN, env, viewport, runId, { ledger, captureRoot, captures });
    await ledger("visual-review", "PENDING_MANUAL_REVIEW", { captures: captures.map(path => relative(process.cwd(), path)) });
    await ledger("b4-suite", "PASS", { captures: captures.length });
    console.log(`U03 B-4 ${runId}: PASS · ${verified.deploymentId} · ${verified.sha} · ${verified.host}`);
    return { runId, verified, captures };
  } catch (error) {
    await ledger("b4-suite", "FAIL");
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
