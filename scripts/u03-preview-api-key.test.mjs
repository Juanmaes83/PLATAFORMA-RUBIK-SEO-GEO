import test from 'node:test';
import assert from 'node:assert/strict';
import { apiKeyHeaders, createPreviewAdminClient } from './u03-preview-api-key.mjs';

test('manual REST probes send a secret key only as apikey', () => {
  const headers = apiKeyHeaders('sb_secret_test_only');
  assert.deepEqual(headers, { apikey: 'sb_secret_test_only' });
  assert.equal(Object.keys(headers).some(name => name.toLowerCase() === 'authorization'), false);
});

test('manual REST probes preserve legacy JWT compatibility', () => {
  assert.deepEqual(apiKeyHeaders('eyJ.legacy.test'), {
    apikey: 'eyJ.legacy.test',
    Authorization: 'Bearer eyJ.legacy.test',
  });
});

test('Auth Admin client strips only the secret key Bearer fallback', async () => {
  const seen = [];
  const fetchMock = async (_input, init) => {
    seen.push(new Headers(init.headers));
    return Response.json({ users: [], aud: 'authenticated' });
  };
  const client = createPreviewAdminClient('https://preview.invalid', 'sb_secret_test_only', fetchMock);
  const result = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
  assert.equal(result.error, null);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].get('apikey'), 'sb_secret_test_only');
  assert.equal(seen[0].get('authorization'), null);
});

test('Auth Admin client preserves Bearer for legacy JWT keys', async () => {
  const seen = [];
  const fetchMock = async (_input, init) => {
    seen.push(new Headers(init.headers));
    return Response.json({ users: [], aud: 'authenticated' });
  };
  const client = createPreviewAdminClient('https://preview.invalid', 'eyJ.legacy.test', fetchMock);
  const result = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
  assert.equal(result.error, null);
  assert.equal(seen[0].get('apikey'), 'eyJ.legacy.test');
  assert.equal(seen[0].get('authorization'), 'Bearer eyJ.legacy.test');
});
