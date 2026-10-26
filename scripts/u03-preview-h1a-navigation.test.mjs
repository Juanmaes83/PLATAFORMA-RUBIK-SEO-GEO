import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { chromium } from 'playwright';
import { installScopedRoutes, classifyBlockedExternalRequest, classifyDiagnosticResource, classifyCdpInterceptionFailure, createPageDiagnostics, summarizeDiagnosticInterval } from './u03-preview-b4-runner.mjs';
import { evaluateAuthenticatedTrace, waitForAuthenticatedTraceClosure } from './h1a-auth-login-probe.mjs';

async function injectPausedRequest({ url, headers = {}, rejectHeaderOverride = false, rejectContinue = false,
  rejectResponse = false, rejectFail = false, resourceType = 'XHR', responseStatusCode = null, traceFailure = false,
  networkOutcome = null }) {
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
  const trace = [];
  await installScopedRoutes({ newCDPSession: async () => session }, { on() {} }, 'fictional-oidc', 'https://pinned.invalid',
    (event, detail) => events.push({ event, detail }), event => routes.push(event), null,
    detail => diagnostics.push(detail), row => { if (traceFailure) throw new Error('fictional trace secret'); trace.push(row); });
  session.emit('Fetch.requestPaused', { requestId:'fictional-request', networkId:'fictional-network', frameId:'main-frame',
    request:{ url, method:'GET', headers }, resourceType, ...(responseStatusCode ? { responseStatusCode } : {}) });
  await finished;
  await new Promise(resolve => setImmediate(resolve));
  if (networkOutcome==='cancelled') session.emit('Network.loadingFailed',{requestId:'fictional-network',canceled:true,errorText:'fictional secret'});
  if (networkOutcome==='finished') {
    session.emit('Network.responseReceived',{requestId:'fictional-network',response:{status:204,url:'https://pinned.invalid/private?token=fictional'}});
    session.emit('Network.loadingFinished',{requestId:'fictional-network'});
  }
  return { calls, events, diagnostics, routes, trace };
}

test('network terminal diagnostics distinguish cancellation from a response not paused by Fetch',async()=>{
  const cancelled=await injectPausedRequest({url:'https://pinned.invalid/private?token=fictional',networkOutcome:'cancelled'});
  const finished=await injectPausedRequest({url:'https://pinned.invalid/private?token=fictional',networkOutcome:'finished'});
  assert.equal(cancelled.trace.at(-1)?.failureCategory,'NETWORK_CANCELLED');
  assert.equal(finished.trace.at(-1)?.failureCategory,'RESPONSE_NOT_OBSERVED');
  assert.equal(finished.trace.at(-1)?.httpStatus,204);
  assert.doesNotMatch(JSON.stringify([cancelled.trace,finished.trace]),/fictional secret|\/private|token=/);
});

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
    const terminals = traces.filter(row => row.stage === 'TERMINAL');
    assert.equal(requests.length, 3);
    assert.equal(responses.length, 3);
    assert.equal(terminals.length, 3);
    assert.ok(requests.every(row => row.rscClass === 'NONE' && row.prefetchClass === 'NO_HINT' && row.domLinkClass === 'UNKNOWN'));
    assert.ok(requests.every(row => ['NEXT_STATIC_SCRIPT','PINNED_SCRIPT','EXTERNAL_SCRIPT','UNKNOWN'].includes(row.scriptSourceClass)));
    assert.ok(terminals.every(row => row.interceptionOperation === 'NETWORK_FINISHED'));
    assert.ok(terminals.every(row => ['SCRIPT','UNKNOWN'].includes(row.initiatorClass)));
    assert.deepEqual(requests.map(row => row.ordinal).sort((a,b)=>a-b), responses.map(row => row.ordinal).sort((a,b)=>a-b));
    assert.deepEqual(evaluateAuthenticatedTrace(traces),{ok:true,count:3});
    assert.ok(traces.every(row => row.destinationClass === 'PINNED_ORIGIN' && row.result === 'CONTINUED'));
    assert.doesNotMatch(JSON.stringify(traces), /\/signal-|fictional-oidc/);
  } finally {
    await browser?.close();
    server.close();
    await once(server, 'close');
  }
});

test('real Chromium rejects continueRequest after the same paused request was invalidated', async () => {
  const server=createServer((request,response)=>{
    if(request.url==='/race') return response.writeHead(200).end('fictional');
    response.writeHead(200,{'content-type':'text/html'}).end('<main>fictional</main>');
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    const trace=[],diagnostics=[];
    const session=await installScopedRoutes(context,page,null,origin,()=>{},()=>{},null,
      row=>diagnostics.push(row),row=>trace.push(row),true);
    await page.goto(origin);
    const send=session.send.bind(session);
    let invalidated=false;
    session.send=async(method,params)=>{
      if(method==='Fetch.continueRequest' && !invalidated) {
        invalidated=true;
        await send('Fetch.failRequest',{requestId:params.requestId,errorReason:'Aborted'});
      }
      return send(method,params);
    };
    await page.evaluate(()=>fetch('/race').catch(()=>undefined));
    for(let i=0;i<50 && !trace.some(row=>row.result==='BLOCKED');i++)
      await new Promise(resolve=>setTimeout(resolve,10));
    const blocked=trace.find(row=>row.stage==='REQUEST' && row.result==='BLOCKED');
    assert.equal(invalidated,true);
    assert.equal(blocked?.interceptionOperation,'CONTINUE_REQUEST');
    assert.equal(blocked?.failureCategory,'REQUEST_NOT_ACTIVE');
    assert.ok(['NETWORK_CANCELLED_BEFORE_CONTINUE','UNOBSERVED'].includes(blocked?.inactiveContextClass));
    assert.deepEqual(evaluateAuthenticatedTrace(trace,['pinned-origin-request-failed']),
      {ok:false,code:'XHR_INTERCEPTION_BLOCKED',ordinal:blocked.ordinal,failureCategory:'REQUEST_NOT_ACTIVE'});
    assert.doesNotMatch(JSON.stringify([trace,diagnostics]),/\/race|fictional|Invalid InterceptionId/);
  } finally {
    await browser?.close(); server.closeAllConnections?.(); server.close(); await once(server,'close');
  }
});

test('real Chromium keeps a navigation race blocked when a paused XHR loses its request', async () => {
  const server=createServer((request,response)=>{
    if(request.url==='/slow') return;
    response.writeHead(200,{'content-type':'text/html'}).end('<main>fictional</main>');
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    const trace=[];
    const session=await installScopedRoutes(context,page,null,origin,()=>{},()=>{},null,()=>{},row=>trace.push(row),true);
    await page.goto(origin);
    const send=session.send.bind(session);
    let heldResolve,release;
    const held=new Promise(resolve=>{heldResolve=resolve;});
    const gate=new Promise(resolve=>{release=resolve;});
    session.send=async(method,params)=>{
      if(method==='Fetch.continueRequest' && !heldResolve.used) {
        heldResolve.used=true; heldResolve(); await gate;
      }
      return send(method,params);
    };
    await page.evaluate(()=>{window.pending=fetch('/slow').catch(()=>undefined);});
    await held;
    await page.goto(`${origin}/next`);
    release();
    for(let i=0;i<50 && !trace.some(row=>row.result==='BLOCKED');i++)
      await new Promise(resolve=>setTimeout(resolve,10));
    const blocked=trace.find(row=>row.stage==='REQUEST' && row.result==='BLOCKED');
    assert.equal(blocked?.interceptionOperation,'CONTINUE_REQUEST');
    assert.equal(blocked?.failureCategory,'REQUEST_NOT_ACTIVE');
    assert.equal(blocked?.inactiveContextClass,'FRAME_NAVIGATED_BEFORE_CONTINUE');
    assert.equal(evaluateAuthenticatedTrace(trace).code,'XHR_INTERCEPTION_BLOCKED');
    assert.doesNotMatch(JSON.stringify(trace),/\/slow|fictional/);
  } finally {
    await browser?.close(); server.closeAllConnections?.(); server.close(); await once(server,'close');
  }
});

test('real Chromium keeps an aborted paused XHR blocked at continueRequest', async () => {
  const server=createServer((request,response)=>{
    if(request.url==='/slow') return;
    response.writeHead(200,{'content-type':'text/html'}).end('<main>fictional</main>');
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    const trace=[];
    const session=await installScopedRoutes(context,page,null,origin,()=>{},()=>{},null,()=>{},row=>trace.push(row),true);
    await page.goto(origin);
    const send=session.send.bind(session);
    let heldResolve,release;
    const held=new Promise(resolve=>{heldResolve=resolve;});
    const gate=new Promise(resolve=>{release=resolve;});
    session.send=async(method,params)=>{
      if(method==='Fetch.continueRequest' && !heldResolve.used) {
        heldResolve.used=true; heldResolve(); await gate;
      }
      return send(method,params);
    };
    await page.evaluate(()=>{
      window.controller=new AbortController();
      window.pending=fetch('/slow',{signal:window.controller.signal}).catch(()=>undefined);
    });
    await held;
    await page.evaluate(()=>window.controller.abort());
    release();
    for(let i=0;i<50 && !trace.some(row=>row.result==='BLOCKED');i++)
      await new Promise(resolve=>setTimeout(resolve,10));
    const blocked=trace.find(row=>row.stage==='REQUEST' && row.result==='BLOCKED');
    assert.equal(blocked?.interceptionOperation,'CONTINUE_REQUEST');
    assert.equal(blocked?.failureCategory,'REQUEST_NOT_ACTIVE');
    assert.ok(['NETWORK_CANCELLED_BEFORE_CONTINUE','UNOBSERVED'].includes(blocked?.inactiveContextClass));
    assert.ok(['XHR_INTERCEPTION_BLOCKED','XHR_TERMINAL_UNVERIFIED'].includes(evaluateAuthenticatedTrace(trace).code));
    assert.doesNotMatch(JSON.stringify(trace),/\/slow|fictional/);
  } finally {
    await browser?.close(); server.closeAllConnections?.(); server.close(); await once(server,'close');
  }
});

test('real Chromium records a cancelled pinned XHR as a closed terminal failure', async () => {
  const server=createServer((request,response)=>{
    if(request.url==='/slow') { setTimeout(()=>{ if(!response.destroyed) response.writeHead(200).end('fictional'); },1200); return; }
    response.writeHead(200,{'content-type':'text/html'}).end('<main>fictional</main>');
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    const trace=[];
    await installScopedRoutes(context,page,null,origin,()=>{},()=>{},null,()=>{},row=>trace.push(row),true);
    await page.goto(origin);
    await page.evaluate(()=>{ window.syntheticXhr=new XMLHttpRequest(); window.syntheticXhr.open('GET','/slow'); window.syntheticXhr.send(); });
    await page.waitForFunction(()=>window.syntheticXhr.readyState===1);
    await page.waitForTimeout(50);
    await page.evaluate(()=>window.syntheticXhr.abort());
    await page.waitForFunction(()=>window.syntheticXhr.readyState===0);
    await page.waitForTimeout(100);
    const request=trace.find(row=>row.stage==='REQUEST' && row.resourceClass==='other-xhr');
    const terminal=trace.find(row=>row.stage==='TERMINAL' && row.ordinal===request?.ordinal);
    assert.ok(request);
    assert.equal(terminal?.interceptionOperation,'NETWORK_LOADING_FAILED');
    assert.equal(terminal?.failureCategory,'NETWORK_CANCELLED');
    assert.ok(['SCRIPT','UNKNOWN'].includes(terminal?.initiatorClass));
    assert.doesNotMatch(JSON.stringify(trace),/\/slow|fictional/);
  } finally {
    await browser?.close(); server.closeAllConnections?.(); server.close(); await once(server,'close');
  }
});

test('a cancelled auxiliary fetch after HTTP 200 does not undo login evidence and still blocks the XHR gate', async () => {
  const server=createServer((request,response)=>{
    if(request.url==='/api/auth/login' && request.method==='POST') {
      response.writeHead(303,{'set-cookie':'fictional-session=present; Path=/','location':'/panel'}).end(); return;
    }
    if(request.url==='/acceso?auxiliary=1') {
      response.writeHead(200,{'content-type':'text/plain'});
      response.write('fictional-first-part');
      return;
    }
    if(request.url==='/acceso') {
      response.writeHead(200,{'content-type':'text/html'}).end('<form method="post" action="/api/auth/login"><button>Entrar</button></form>'); return;
    }
    if(request.url==='/panel') {
      response.writeHead(200,{'content-type':'text/html'}).end('<main>Sin proyectos</main>'); return;
    }
    response.writeHead(404).end();
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    const trace=[];
    await installScopedRoutes(context,page,null,origin,()=>{},()=>{},null,()=>{},row=>trace.push(row),true);
    await page.goto(`${origin}/acceso`);
    const loginResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/login');
    await page.getByRole('button',{name:'Entrar'}).click();
    assert.equal((await loginResponse).status(),303);
    await page.waitForURL(`${origin}/panel`);
    assert.equal(await page.getByText('Sin proyectos').count(),1);
    assert.equal((await context.cookies(origin)).some(cookie=>cookie.name==='fictional-session'),true);
    await page.evaluate(async()=>{
      const controller=new AbortController();
      const response=await fetch('/acceso?auxiliary=1',{signal:controller.signal});
      const reader=response.body.getReader();
      await reader.read();
      controller.abort();
      await reader.read().catch(()=>undefined);
    });
    for(let attempt=0;attempt<50 && !trace.some(row=>row.stage==='TERMINAL');attempt++)
      await new Promise(resolve=>setTimeout(resolve,10));
    const request=trace.find(row=>row.stage==='REQUEST' && row.resourceClass==='access-xhr');
    const response=trace.find(row=>row.stage==='RESPONSE' && row.ordinal===request?.ordinal);
    const terminal=trace.find(row=>row.stage==='TERMINAL' && row.ordinal===request?.ordinal);
    assert.ok(request);
    assert.equal(response?.httpStatus,200);
    assert.equal(terminal?.failureCategory,'NETWORK_CANCELLED');
    assert.equal(evaluateAuthenticatedTrace(trace).code,'XHR_TERMINAL_UNVERIFIED');
    assert.doesNotMatch(JSON.stringify(trace),/auxiliary=|fictional-session|first-part/);
  } finally {
    await browser?.close(); server.closeAllConnections?.(); server.close(); await once(server,'close');
  }
});

test('real Chromium cannot pass an active XHR before its response and network completion', async () => {
  let releaseResponse;
  const server=createServer((request,response)=>{
    if(request.url==='/stream') {
      releaseResponse=()=>response.writeHead(200,{'content-type':'text/plain'}).end('fictional part');
      return;
    }
    response.writeHead(200,{'content-type':'text/html'}).end('<main>fictional</main>');
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    const trace=[];
    await installScopedRoutes(context,page,null,origin,()=>{},()=>{},null,()=>{},row=>trace.push(row),true);
    await page.goto(origin);
    await page.evaluate(()=>{ window.syntheticXhr=new XMLHttpRequest(); window.syntheticXhr.open('GET','/stream'); window.syntheticXhr.send(); });
    for(let attempt=0;attempt<30 && !trace.some(row=>row.stage==='REQUEST');attempt++)
      await new Promise(resolve=>setTimeout(resolve,10));
    assert.ok(trace.some(row=>row.stage==='REQUEST'));
    assert.equal(evaluateAuthenticatedTrace(trace).code,'XHR_INCOMPLETE');
    assert.equal(typeof releaseResponse,'function');
    const closure=waitForAuthenticatedTraceClosure(trace,{timeoutMs:1500,quietMs:50});
    releaseResponse();
    await page.waitForFunction(()=>window.syntheticXhr.readyState===4);
    await closure;
    assert.deepEqual(evaluateAuthenticatedTrace(trace),{ok:true,count:1});
    assert.doesNotMatch(JSON.stringify(trace),/\/stream|fictional/);
  } finally {
    await browser?.close(); server.closeAllConnections?.(); server.close(); await once(server,'close');
  }
});

test('real Chromium correlates a same-origin XHR redirect to a completed body', async () => {
  const server=createServer((request,response)=>{
    if(request.url==='/start') return response.writeHead(307,{location:'/done'}).end();
    if(request.url==='/done') return response.writeHead(200,{'content-type':'text/plain'}).end('fictional');
    response.writeHead(200,{'content-type':'text/html'}).end('<main>fictional</main>');
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    const trace=[];
    await installScopedRoutes(context,page,null,origin,()=>{},()=>{},null,()=>{},row=>trace.push(row),true);
    await page.goto(origin);
    await page.evaluate(async()=>{ window.redirectResult=await fetch('/start').then(response=>response.text()); });
    assert.equal(await page.evaluate(()=>window.redirectResult),'fictional');
    await page.waitForTimeout(100);
    assert.deepEqual(evaluateAuthenticatedTrace(trace),{ok:true,count:2});
    assert.deepEqual(trace.filter(row=>row.interceptionOperation==='REDIRECT_FOLLOWED').map(row=>
      [row.ordinal,row.redirectToOrdinal,row.httpStatus]),[[1,2,307]]);
    assert.doesNotMatch(JSON.stringify(trace),/\/start|\/done|fictional/);
  } finally {
    await browser?.close(); server.closeAllConnections?.(); server.close(); await once(server,'close');
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
