import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./lib/app-ts-hooks.mjs', import.meta.url);
const { withPreviewWriterCapability, previewWindowMac } = await import('../src/lib/provenance/preview-writer-capability.ts');
const NOW = 1_800_000_000_000;
const runId = 'c14f4c11-570f-4e03-a3a1-33a702b85baa';
const secret = 'fictional-window-secret-only-for-unit-tests';
const env = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'codex/u03-final-gates-20261020',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), U03_PREVIEW_WRITER_WINDOW: 'armed-run-capability',
  U03_PREVIEW_WRITER_WINDOW_REF: 'rhnnplewqsekrnaousyl', U03_PREVIEW_WRITER_WINDOW_SHA: 'a'.repeat(40),
  U03_PREVIEW_WRITER_WINDOW_RUN_ID: runId, U03_PREVIEW_WRITER_WINDOW_SECRET: secret,
  VERCEL_DEPLOYMENT_ID: 'dpl_AbCdEf123', VERCEL_URL: 'preview-abc.vercel.app' };
const expiresAt = NOW + 60_000;
function request(overrides = {}) {
  const mac = previewWindowMac(secret, { runId, expiresAt, deploymentId: env.VERCEL_DEPLOYMENT_ID, host: env.VERCEL_URL, sha: env.VERCEL_GIT_COMMIT_SHA });
  const headers = new Headers({ 'x-rubik-u03-run-id': runId, 'x-rubik-u03-expires': String(expiresAt), 'x-rubik-u03-capability': mac });
  for (const [key, value] of Object.entries(overrides.headers ?? {})) headers.set(key, value);
  return new Request('https://preview-abc.vercel.app/api/u03/window-fixtures', { headers, ...overrides.request });
}

test('capability is deployment, host, commit, run, scope and expiry bound', async () => {
  const good = await withPreviewWriterCapability(request(), `u03-c14f4c11570f-a`, 'a1', async () => 'entered', env, NOW);
  assert.equal(good, 'entered');
  assert.equal(await withPreviewWriterCapability(request(), `u03-c14f4c11570f-b`, 'a1', async () => 'bad', env, NOW), null);
  assert.equal(await withPreviewWriterCapability(request(), `u03-c14f4c11570f-a`, 'b1', async () => 'bad', env, NOW), null);
  const alteredHost = { ...env, VERCEL_URL: 'other-abc.vercel.app' };
  assert.equal(await withPreviewWriterCapability(request(), `u03-c14f4c11570f-a`, 'a1', async () => 'bad', alteredHost, NOW), null);
  const otherDeployment = { ...env, VERCEL_DEPLOYMENT_ID: 'dpl_Other987' };
  assert.equal(await withPreviewWriterCapability(request(), `u03-c14f4c11570f-a`, 'a1', async () => 'bad', otherDeployment, NOW), null);
  const otherSha = { ...env, VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40) };
  assert.equal(await withPreviewWriterCapability(request(), `u03-c14f4c11570f-a`, 'a1', async () => 'bad', otherSha, NOW), null);
  assert.equal(await withPreviewWriterCapability(request({ headers: { 'x-rubik-u03-capability': '0'.repeat(64) } }),
    `u03-c14f4c11570f-a`, 'a1', async () => 'bad', env, NOW), null);
  assert.equal(await withPreviewWriterWriterCapabilityExpired(), null);
});

async function withPreviewWriterWriterCapabilityExpired() {
  const exp = NOW - 1;
  const headers = new Headers({ 'x-rubik-u03-run-id': runId, 'x-rubik-u03-expires': String(exp),
    'x-rubik-u03-capability': previewWindowMac(secret, { runId, expiresAt: exp, deploymentId: env.VERCEL_DEPLOYMENT_ID, host: env.VERCEL_URL, sha: env.VERCEL_GIT_COMMIT_SHA }) });
  return withPreviewWriterCapability(new Request('https://preview-abc.vercel.app/', { headers }), `u03-c14f4c11570f-a`, 'a1', async () => 'bad', env, NOW);
}

test('another branch and production cannot enter capability context', async () => {
  const wrongBranch = { ...env, VERCEL_GIT_COMMIT_REF: 'other-branch' };
  assert.equal(await withPreviewWriterCapability(request(), `u03-c14f4c11570f-a`, 'a1', async () => 'bad', wrongBranch, NOW), null);
  const production = { ...env, VERCEL_ENV: 'production' };
  assert.equal(await withPreviewWriterCapability(request(), `u03-c14f4c11570f-a`, 'a1', async () => 'bad', production, NOW), null);
});
