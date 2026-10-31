import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { chromium } from 'playwright';
import { installScopedRoutes } from './u03-preview-b4-runner.mjs';
import { evaluateAuthenticatedTrace } from './h1a-auth-login-probe.mjs';

// CDP request, frame and network identifiers stay in memory. Only this closed
// summary is printed; the real interceptor supplies the gate's trace.
async function runCase(action) {
  const server = createServer((request, response) => {
    if (request.url === '/auxiliary?_rsc=fictional') {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.write('first-chunk');
      return;
    }
    if (request.url === '/frame') {
      response.writeHead(200, { 'content-type': 'text/html' }).end(`<script src="/_next/static/chunks/fictional.js"></script>`);
      return;
    }
    if (request.url === '/_next/static/chunks/fictional.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' }).end(`
        window.controller = new AbortController();
        window.bodyRead = (async () => {
          const response = await fetch('/auxiliary?_rsc=fictional', {
            signal: controller.signal, headers: { 'Next-Router-Prefetch': '1' }
          });
          const reader = response.body.getReader();
          await reader.read();
          window.ready = true;
          await reader.read().catch(() => undefined);
        })();`);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' }).end('<iframe src="/frame"></iframe>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const trace = [];
    const session = await installScopedRoutes(context, page, null, origin, () => {}, () => {}, null,
      () => {}, row => trace.push({ ...row, tracePhase: 'SESSION' }), true);
    const events = [];
    let targetNetworkId;
    let targetFrameId;
    let tick = 0;
    const mark = (kind) => events.push({ tick: ++tick, kind });
    session.on('Network.requestWillBeSent', event => {
      if (new URL(event.request.url).pathname === '/auxiliary') {
        targetNetworkId = event.requestId;
        targetFrameId = event.frameId;
        mark('REQUEST');
      }
    });
    session.on('Fetch.requestPaused', event => {
      if (event.networkId === targetNetworkId) mark(event.responseStatusCode ? 'FETCH_RESPONSE' : 'FETCH_REQUEST');
    });
    session.on('Network.responseReceived', event => {
      if (event.requestId === targetNetworkId && event.response.status === 200) mark('RESPONSE_200');
    });
    session.on('Network.loadingFailed', event => {
      if (event.requestId === targetNetworkId) mark(event.canceled ? 'NETWORK_CANCELLED' : 'NETWORK_FAILED');
    });
    session.on('Network.loadingFinished', event => {
      if (event.requestId === targetNetworkId) mark('NETWORK_FINISHED');
    });
    session.on('Page.frameDetached', event => {
      if (event.frameId === targetFrameId) mark('FRAME_DETACHED');
    });
    page.on('close', () => mark('PAGE_CLOSED'));
    await page.goto(`${origin}/panel`);
    await page.waitForFunction(() => window.frames[0]?.ready === true);
    assert.ok(events.some(event => event.kind === 'RESPONSE_200'));
    mark('ACTION');
    if (action === 'abort') await page.frames()[1].evaluate(() => controller.abort());
    if (action === 'detach') await page.locator('iframe').evaluate(frame => frame.remove());
    if (action === 'close') await page.close();
    await new Promise(resolve => setTimeout(resolve, 350));
    const request = trace.find(row => row.stage === 'REQUEST' && row.resourceClass === 'other-xhr');
    assert.ok(request);
    assert.equal(trace.find(row => row.stage === 'RESPONSE' && row.ordinal === request.ordinal)?.httpStatus, 200);
    const outcome = trace.filter(row => row.ordinal === request.ordinal);
    const verdict = evaluateAuthenticatedTrace(outcome);
    assert.equal(verdict.ok, false);
    const kinds = events.map(event => event.kind);
    assert.ok(kinds.indexOf('REQUEST') < kinds.indexOf('RESPONSE_200'));
    assert.ok(kinds.indexOf('RESPONSE_200') < kinds.indexOf('ACTION'));
    assert.doesNotMatch(JSON.stringify(outcome), /auxiliary|fictional|127\.0\.0\.1|Next-Router-Prefetch|requestId|networkId|frameId/);
    return { action, order: kinds.join('>'), terminal: kinds.find(kind => kind.startsWith('NETWORK_')) ?? 'UNKNOWN',
      frame: kinds.includes('FRAME_DETACHED') ? 'FRAME_DETACHED' : 'UNKNOWN',
      page: kinds.includes('PAGE_CLOSED') ? 'PAGE_CLOSED' : 'UNKNOWN', gate: verdict.code };
  } finally {
    await browser?.close();
    server.closeAllConnections?.();
    server.close();
    await once(server, 'close');
  }
}

test('Chromium CDP cancellation signatures stay blocked after HTTP 200', { timeout: 120_000 }, async () => {
  for (const action of ['abort', 'detach', 'close']) {
    for (let repeat = 0; repeat < 8; repeat++) {
      const outcome = await runCase(action);
      assert.notEqual(outcome.terminal, 'NETWORK_FINISHED');
      if (action === 'abort') assert.equal(outcome.terminal, 'NETWORK_CANCELLED');
      if (action === 'detach') assert.equal(outcome.frame, 'FRAME_DETACHED');
      if (action === 'close') assert.equal(outcome.page, 'PAGE_CLOSED');
      process.stdout.write(`${JSON.stringify(outcome)}\n`);
    }
  }
});
