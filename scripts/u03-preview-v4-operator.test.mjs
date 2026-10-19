import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validatePreviewAdminPoolerUrl, buildPreviewReceiptPoolerUrl } from './u03-preview-v4-operator.mjs';

const ref = 'rhnnplewqsekrnaousyl';
const secret = 'fictional-window-secret-for-tests-only';
const base = `postgresql://postgres.${ref}:${secret}@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`;

test('Preview operator accepts only the Session pooler IPv4 URL shape and exact project user', () => {
  const parsed = validatePreviewAdminPoolerUrl(base);
  assert.equal(parsed.url.hostname, 'aws-0-eu-west-3.pooler.supabase.com');
  assert.equal(parsed.url.port, '5432');
  for (const raw of [
    base.replace(ref, 'yvdgmklgwlshizzgefpv'),
    base.replace('aws-0-eu-west-3.pooler.supabase.com:5432', `db.${ref}.supabase.co:5432`),
    base.replace(':5432/', ':6543/'),
    `${base}?sslmode=disable`,
    base.replace(`postgres.${ref}:`, 'postgres:'),
    base.replace('aws-0-eu-west-3', 'pooler'),
  ]) assert.throws(() => validatePreviewAdminPoolerUrl(raw), /V4_ADMIN_DATABASE_URL_INVALID/);
});

test('Preview receipt URL stays on the exact session pooler/ref and carries no SSL override', () => {
  const receipt = new URL(buildPreviewReceiptPoolerUrl(base, 'fictional-generated-password-0123456789-ABCD'));
  assert.equal(receipt.hostname, 'aws-0-eu-west-3.pooler.supabase.com');
  assert.equal(receipt.port, '5432');
  assert.equal(decodeURIComponent(receipt.username), `rubik_preview_receipt_writer.${ref}`);
  assert.deepEqual([...receipt.searchParams.keys()], []);
});

test('single Windows operator masks the admin URL and guarantees a finally containment pass', async () => {
  const script = await readFile(new URL('./u03-preview-b4-owner.ps1', import.meta.url), 'utf8');
  assert.match(script, /Read-Host -Prompt[^\n]*Session pooler IPv4 URL[^\n]*-AsSecureString/);
  assert.match(script, /finally\s*\{[\s\S]*--contain --run-id \$operatorRunId/);
  assert.doesNotMatch(script, /psql\s+-X|u03-preview-v4-(?:role|activate|block|rollback)\.sql/);
});
