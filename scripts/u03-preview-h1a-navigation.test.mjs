import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { chromium } from 'playwright';
import { installScopedRoutes, classifyBlockedExternalRequest } from './u03-preview-b4-runner.mjs';

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
