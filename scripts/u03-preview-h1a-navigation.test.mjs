import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { chromium } from 'playwright';
import { installScopedRoutes, classifyBlockedExternalRequest, classifyDiagnosticResource, classifyCdpInterceptionFailure, createPageDiagnostics, summarizeDiagnosticInterval } from './u03-preview-b4-runner.mjs';

async function injectPausedRequest({ url, headers = {}, rejectHeaderOverride = false, rejectContinue = false,
  rejectResponse = false, rejectFail = false, resourceType = 'XHR', responseStatusCode = null, traceFailure = false }) {
  const session = new EventEmitter();
  const calls = [];
  let complete;
  const finished = new Promise(resolve => { complete = resolve; });
  session.send = async (method, params = {}) => {
    calls.push({ method, params });
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main-frame' } } };
    if (method === 'Fetch.continueRequest' && (rejectContinue || (rejectHeaderOverride && Object.hasOwn(params, 'headers'))))
      throw new Error('fictional CDP message containing a secret');
    if (method === 'Fetch.continueResponse' && rejectResponse)
      throw new Error('fictional CDP message containing a secret');
    if (method === 'Fetch.failRequest' && rejectFail) {
      queueMicrotask(complete);
      throw new Error('fictional CDP message containing a secret');
    }
    if (method === 'Fetch.continueRequest' || method === 'Fetch.continueResponse' || method === 'Fetch.failRequest') queueMicrotask(complete);
    return {};
  };
  const events = [];
  const diagnostics = [];
  const routes = [];
  await installScopedRoutes({ newCDPSession: async () => session }, { on() {} }, 'fictional-oidc', 'https://pinned.invalid',
    (event, detail) => events.push({ event, detail }), event => routes.push(event), null,
    detail => diagnostics.push(detail), () => { if (traceFailure) throw new Error('fictional trace secret'); });
  session.emit('Fetch.requestPaused', { requestId:'fictional-request', frameId:'main-frame',
    request:{ url, method:'GET', headers }, resourceType, ...(responseStatusCode ? { responseStatusCode } : {}) });
  await finished;
  await new Promise(resolve => setImmediate(resolve));
  return { calls, events, diagnostics, routes };
}

test('a trace callback failure fails the gate without leaking its message',async()=>{
  const result=await injectPausedRequest({url:'https://pinned.invalid/api/signal',traceFailure:true});
  assert.equal(result.events[0]?.event,'pinned-origin-request-failed');
  assert.ok(result.routes.includes('diagnostic-cardinality-exceeded'));
  assert.doesNotMatch(JSON.stringify(result.events),/fictional trace secret/);
});

test('injected request-stage XHR CDP failure records operation and stays fatal', async () => {
  const url = 'https://external.invalid/fake-resource?token=fictional-secret';
  const failure = await injectPausedRequest({ url, rejectHeaderOverride:true });
  assert.ok(failure.calls.find(call => call.method === 'Fetch.continueRequest')?.params?.headers);
  assert.equal(failure.events[0]?.event, 'pinned-origin-request-failed');
  assert.equal(failure.diagnostics[0]?.interceptionOperation, 'CONTINUE_REQUEST');
  assert.equal(failure.diagnostics[0]?.destinationClass, 'EXTERNAL');
  assert.equal(failure.diagnostics[0]?.requestClass, 'SUBRESOURCE');
  assert.equal(failure.diagnostics[0]?.failureCategory, 'CDP_OPERATION_REJECTED');
  assert.equal(failure.diagnostics[0]?.resourceClass, 'other-xhr');
  assert.doesNotMatch(JSON.stringify(failure.diagnostics), /fictional-secret|fictional CDP/);
});

test('CDP failure classes are closed and never retain protocol text', () => {
  for (const [message, expected] of [
    ['Invalid InterceptionId', 'REQUEST_NOT_ACTIVE'],
    ['Session closed', 'CDP_SESSION_CLOSED'],
    ['Invalid request header', 'HEADER_REJECTED'],
    ['fictional secret from CDP', 'CDP_OPERATION_REJECTED'],
  ]) {
    const category = classifyCdpInterceptionFailure(new Error(message));
    assert.equal(category, expected);
    assert.doesNotMatch(category, /secret|Intercept|Session closed/i);
  }
});

test('external scoped headers are stripped; failed blocking command is still a fatal diagnostic', async () => {
  const sensitive = await injectPausedRequest({ url:'https://external.invalid/fake-resource',
    headers:{ 'x-vercel-trusted-oidc-idp-token':'fictional-oidc', 'x-rubik-u03-run-id':'fictional-run' } });
  const forwarded = sensitive.calls.find(call => call.method === 'Fetch.continueRequest')?.params?.headers;
  assert.deepEqual(forwarded, []);
  const blocked = await injectPausedRequest({ url:'https://external.invalid/page', resourceType:'Document', rejectFail:true });
  assert.equal(blocked.events[0]?.event, 'external-navigation-blocked');
  assert.ok(blocked.diagnostics.some(item => item.interceptionOperation === 'FAIL_REQUEST'));
});

test('interception classifier distinguishes URL, header and response operations without CDP text', async () => {
  const malformed = await injectPausedRequest({ url:'not a URL?token=fictional-secret' });
  assert.equal(malformed.diagnostics[0]?.interceptionOperation, 'CLASSIFY_URL');
  const headers = new Proxy({}, { ownKeys() { throw new Error('fictional secret header'); } });
  const headerFailure = await injectPausedRequest({ url:'https://pinned.invalid/panel', headers });
  assert.equal(headerFailure.diagnostics[0]?.interceptionOperation, 'CONSTRUCT_HEADERS');
  const responseFailure = await injectPausedRequest({ url:'https://pinned.invalid/panel', responseStatusCode:204, rejectResponse:true });
  assert.equal(responseFailure.diagnostics[0]?.interceptionOperation, 'CONTINUE_RESPONSE');
  for (const result of [malformed, headerFailure, responseFailure]) {
    assert.equal(result.events[0]?.event, 'pinned-origin-request-failed');
    assert.doesNotMatch(JSON.stringify(result.diagnostics), /fictional.secret|token=/);
  }
});

test('real Chromium handles a 303 login followed by an external XHR 204 without an interception failure', async () => {
  const external = createServer((_request, response) => {
    response.writeHead(204, { 'access-control-allow-origin':'*' }).end();
  });
  external.listen(0, '127.0.0.1');
  await once(external, 'listening');
  const externalOrigin = `http://127.0.0.1:${external.address().port}`;
  const pinned = createServer((request, response) => {
    if (request.method === 'POST' && request.url === '/acceso')
      return response.writeHead(303, { location:'/panel' }).end();
    if (request.url === '/acceso')
      return response.writeHead(200, { 'content-type':'text/html' }).end('<form method="POST"><button>Entrar</button></form>');
    if (request.url === '/panel')
      return response.writeHead(200, { 'content-type':'text/html' }).end(`<main>Panel ficticio</main><script>
        const xhr = new XMLHttpRequest(); xhr.open('GET', '${externalOrigin}/signal');
        xhr.onload = xhr.onerror = () => { window.xhrSettled = true; }; xhr.send();
      </script>`);
    response.writeHead(404).end();
  });
  pinned.listen(0, '127.0.0.1');
  await once(pinned, 'listening');
  const origin = `http://127.0.0.1:${pinned.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless:true });
    const context = await browser.newContext({ serviceWorkers:'block' });
    const page = await context.newPage();
    const security = [];
    const diagnostics = [];
    await installScopedRoutes(context, page, 'fictional-oidc', origin,
      (event, detail) => security.push({ event, detail }), () => {}, null, detail => diagnostics.push(detail));
    await page.goto(`${origin}/acceso`);
    await page.getByRole('button', { name:'Entrar' }).click();
    await page.waitForFunction(() => window.xhrSettled === true);
    assert.equal(new URL(page.url()).pathname, '/panel');
    assert.equal(security.length, 0);
    assert.equal(diagnostics.some(row => row.disposition === 'PINNED_REQUEST_BLOCKED'), false);
  } finally {
    await browser?.close();
    pinned.close(); external.close();
    await Promise.all([once(pinned, 'close'), once(external, 'close')]);
  }
});

test('auth probe mode blocks direct external XHR before network egress', async () => {
  let externalRequests=0;
  const external=createServer((_request,response)=>{ externalRequests++;response.writeHead(204).end(); });
  external.listen(0,'127.0.0.1'); await once(external,'listening');
  const externalOrigin=`http://127.0.0.1:${external.address().port}`;
  const pinned=createServer((_request,response)=>response.writeHead(200,{'content-type':'text/html'}).end(
    `<script>const xhr=new XMLHttpRequest();xhr.open('GET','${externalOrigin}/signal');xhr.send();</script>`));
  pinned.listen(0,'127.0.0.1'); await once(pinned,'listening');
  const origin=`http://127.0.0.1:${pinned.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    const trace=[];
    await installScopedRoutes(context,page,null,origin,()=>{},()=>{},null,()=>{},row=>trace.push(row),true);
    await page.goto(origin,{waitUntil:'networkidle'});
    assert.equal(externalRequests,0);
    assert.equal(trace.find(row=>row.destinationClass==='EXTERNAL')?.result,'BLOCKED');
  } finally {
    await browser?.close(); pinned.close(); external.close();
    await Promise.all([once(pinned,'close'),once(external,'close')]);
  }
});

test('real Chromium continues three pinned XHR subresources after a 303 login', async () => {
  const server = createServer((request, response) => {
    if (request.method === 'POST' && request.url === '/acceso') return response.writeHead(303, { location:'/panel' }).end();
    if (request.url === '/acceso') return response.writeHead(200, { 'content-type':'text/html' })
      .end('<form method="POST"><button>Entrar</button></form>');
    if (request.url === '/panel') return response.writeHead(200, { 'content-type':'text/html' })
      .end(`<main>Panel</main><script>
        window.xhrSettled = 0;
        for (let i = 0; i < 3; i++) {
          const xhr = new XMLHttpRequest(); xhr.open('GET', '/signal-' + i);
          xhr.onload = xhr.onerror = () => { window.xhrSettled++; }; xhr.send();
        }
      </script>`);
    if (/^\/signal-[0-2]$/.test(request.url ?? '')) return response.writeHead(204).end();
    response.writeHead(404).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless:true });
    const context = await browser.newContext({ serviceWorkers:'block' });
    const page = await context.newPage();
    const diagnostics = [];
    const traces = [];
    await installScopedRoutes(context, page, 'fictional-oidc', origin,
      () => {}, () => {}, null, detail => diagnostics.push(detail), detail => traces.push(detail));
    await page.goto(`${origin}/acceso`);
    await page.getByRole('button', { name:'Entrar' }).click();
    await page.waitForFunction(() => window.xhrSettled === 3);
    assert.equal(new URL(page.url()).pathname, '/panel');
    assert.equal(diagnostics.some(row => row.disposition === 'PINNED_REQUEST_BLOCKED'), false);
    const requests = traces.filter(row => row.stage === 'REQUEST');
    const responses = traces.filter(row => row.stage === 'RESPONSE');
    assert.equal(requests.length, 3);
    assert.equal(responses.length, 3);
    assert.deepEqual(requests.map(row => row.ordinal), responses.map(row => row.ordinal));
    assert.ok(traces.every(row => row.destinationClass === 'PINNED_ORIGIN' && row.result === 'CONTINUED'));
    assert.doesNotMatch(JSON.stringify(traces), /\/signal-|fictional-oidc/);
  } finally {
    await browser?.close();
    server.close();
    await once(server, 'close');
  }
});

test('diagnostic cardinality overflow blocks instead of silently dropping a route class', () => {
  const diagnostics = createPageDiagnostics({ on() {}, off() {} });
  for (let status = 400; status < 500; status++) diagnostics.addRouteEvent(`http-${status}-next-static-script`);
  const snapshot = diagnostics.snapshot();
  assert.ok(snapshot.routeEvents['diagnostic-cardinality-exceeded'] > 0);
  const summary = summarizeDiagnosticInterval({ diagnosticsDelta:snapshot });
  assert.equal(summary.status, 'BLOCKED');
  assert.equal(summary.code, 'DIAGNOSTIC_SNAPSHOT_INVALID');
});

test('login resource failures retain bounded route and type categories without free paths', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/acceso') return response.writeHead(200, { 'content-type':'text/html' })
      .end('<script src="/_next/static/secret-file.js?token=fictional-secret"></script>');
    response.writeHead(404, { 'content-type':'text/plain' }).end('fictional secret body');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless:true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const diagnostics = createPageDiagnostics(page, { allowedOrigin:origin });
    await installScopedRoutes(context, page, null, origin, () => {}, event => diagnostics.addRouteEvent(event));
    await page.goto(`${origin}/acceso`, { waitUntil:'networkidle' });
    const snapshot = diagnostics.snapshot();
    assert.equal(snapshot.http['404:preview'], 1);
    assert.equal(snapshot.routeEvents['http-404-next-static-script'], 1);
    assert.equal(snapshot.console['error:preview'], 1);
    assert.equal(snapshot.routeEvents['request-failed-next-static-script'], snapshot.requestFailures.preview);
    const serialized = JSON.stringify(snapshot);
    assert.equal(serialized.includes('secret-file'), false);
    assert.equal(serialized.includes('fictional-secret'), false);
    assert.equal(serialized.includes('fictional secret body'), false);
    diagnostics.dispose();
  } finally {
    await browser?.close();
    server.close();
    await once(server, 'close');
  }
});

test('diagnostic resource classifier uses only fixed classes', () => {
  assert.equal(classifyDiagnosticResource('https://preview.invalid/_next/static/SECRET.js?token=secret', 'Script'), 'next-static-script');
  assert.equal(classifyDiagnosticResource('https://preview.invalid/acceso?secret=one', 'Document'), 'access-document');
  assert.equal(classifyDiagnosticResource('not a URL containing a secret', 'Untrusted'), 'unknown-other');
});

test('external subresource redirects stay blocked but are not mislabeled as top-level navigation failures', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/page') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><body><main>Local protected view</main><img src="/asset-redirect" /></body></html>');
      return;
    }
    if (request.url === '/asset-redirect') {
      response.writeHead(302, { location: 'https://external.invalid/synthetic-image' });
      response.end();
      return;
    }
    if (request.url === '/external-navigation') {
      response.writeHead(302, { location: 'https://external.invalid/synthetic-page' });
      response.end();
      return;
    }
    response.writeHead(404).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const securityEvents = [];
    const routeEvents = [];
    const diagnostics = [];
    await installScopedRoutes(context, page, null, origin,
      (event, detail) => securityEvents.push({ event, detail }), event => routeEvents.push(event), null,
      detail => diagnostics.push(detail));

    const view = await page.goto(`${origin}/page`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);
    assert.equal(view.status(), 200);
    assert.equal(new URL(page.url()).origin, origin);
    const blockedAsset = diagnostics.find(item => item.disposition === 'BLOCKED_EXTERNAL_SUBRESOURCE_REDIRECT');
    assert.ok(blockedAsset, 'the redirect is observed and blocked');
    assert.equal(blockedAsset.requestClass, 'SUBRESOURCE');
    assert.equal(blockedAsset.destinationClass, 'EXTERNAL');
    assert.equal(blockedAsset.httpStatus, 302);
    assert.equal(securityEvents.length, 0, 'a blocked image redirect does not fail the page-navigation contract');
    assert.ok(routeEvents.includes('blocked-external-subresource-redirect'));

    await page.goto(`${origin}/external-navigation`, { waitUntil: 'domcontentloaded' }).catch(() => null);
    await page.waitForTimeout(50);
    const blockedNavigation = diagnostics.find(item => item.disposition === 'BLOCKED_EXTERNAL_MAIN_FRAME_REDIRECT');
    assert.ok(blockedNavigation, 'the top-level redirect remains blocked');
    assert.equal(blockedNavigation.requestClass, 'MAIN_DOCUMENT');
    assert.equal(blockedNavigation.httpStatus, 302);
    assert.equal(securityEvents.at(-1)?.event, 'external-redirect-blocked');
  } finally {
    if (browser) await browser.close();
    server.close();
    await once(server, 'close');
  }
});

test('external direct document navigation remains a fatal gate and classification is fail closed', () => {
  assert.equal(classifyBlockedExternalRequest({ resourceType: 'Document', mainFrame: true }), 'BLOCKED_EXTERNAL_MAIN_FRAME_NAVIGATION');
  assert.equal(classifyBlockedExternalRequest({ resourceType: 'Document', mainFrame: true, redirect: true }), 'BLOCKED_EXTERNAL_MAIN_FRAME_REDIRECT');
  assert.equal(classifyBlockedExternalRequest({ resourceType: 'Image', mainFrame: true, redirect: true }), 'BLOCKED_EXTERNAL_SUBRESOURCE_REDIRECT');
  assert.equal(classifyBlockedExternalRequest({ resourceType: 'Document', mainFrame: false }), 'BLOCKED_EXTERNAL_SUBRESOURCE');
  assert.equal(classifyBlockedExternalRequest({ resourceType: 'Document', mainFrame: false, redirect: true }), 'BLOCKED_EXTERNAL_SUBRESOURCE_REDIRECT');
});
