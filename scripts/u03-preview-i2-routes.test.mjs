import assert from 'node:assert/strict';
import test from 'node:test';
import { runProtectedI2Routes } from './u03-preview-i2-routes.mjs';

const RUN = 'c14f4c11-570f-4e03-a3a1-33a702b85baa';
const RESULT = '94e1bcf1-f329-46e2-a312-79741809c8ae';

function scenario({ leak = false, missingCapability = false } = {}) {
  const events = [];
  let actor = 0;
  const launch = async () => ({
    newContext: async () => {
      const mine = actor++ === 0 ? 'A' : 'B';
      return { newPage: async () => ({}), close: async () => {}, request: { get: async (url, options) => {
        const path = new URL(url).pathname;
        const isExport = path.endsWith('/exportar');
        if (isExport && !options.headers['x-rubik-u03-capability']) throw Error('missing capability');
        events.push({ mine, path, status: mine === 'A' ? 200 : leak && isExport ? 200 : 404,
          hmacPresent: Boolean(options.headers['x-rubik-u03-capability']) });
        const status = mine === 'A' ? 200 : leak && isExport ? 200 : 404;
        return { status: () => status, url: () => url, headers: () => status === 200 && isExport ?
          { 'content-disposition': 'attachment' } : {} };
      } } };
    }, close: async () => {},
  });
  const run = () => runProtectedI2Routes({
    fixtures: { namespace: 'u03-c14f4c11570f', browserInputs: () => ({ U03_B4_A_EMAIL: 'a@example.invalid',
      U03_B4_A_PASSWORD: 'fictional-a', U03_B4_B_EMAIL: 'b@example.invalid', U03_B4_B_PASSWORD: 'fictional-b' }) },
    resultId: RESULT, runId: RUN, env: { VERCEL_OIDC_TOKEN: 'fictional-oidc' },
    capabilityFor: () => missingCapability ? '' : 'fictional-capability', launch,
    loginFn: async () => {}, installFn: async () => {}, ledger: async () => {},
  });
  return { run, events };
}

test('I-2 checks own existing routes and denies foreign routes including a capability-authorized export request', async () => {
  const { run, events } = scenario();
  const result = await run();
  assert.deepEqual(result, { passed: true, positiveCount: 2, negativeCount: 5 });
  assert.equal(events.length, 7);
  assert.equal(events.find(event => event.path.endsWith('/exportar')).hmacPresent, true);
});

test('I-2 cannot pass when foreign export returns a document or capability is missing', async () => {
  await assert.rejects(scenario({ leak: true }).run(), /I2_FOREIGN_ROUTE_DISCLOSURE/);
  await assert.rejects(scenario({ missingCapability: true }).run(), /missing capability/);
});
