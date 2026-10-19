import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validatePreviewAdminPoolerUrl, buildPreviewReceiptPoolerUrl } from './u03-preview-v4-operator.mjs';

const ref = 'rhnnplewqsekrnaousyl';
const secret = 'fictional-window-secret-for-tests-only';
const poolerHost = 'aws-1-eu-west-3.pooler.supabase.com';
const base = `postgresql://postgres.${ref}:${secret}@${poolerHost}:5432/postgres`;

test('Preview operator accepts only the Session pooler IPv4 URL shape and exact project user', () => {
  const parsed = validatePreviewAdminPoolerUrl(base);
  assert.equal(parsed.url.hostname, poolerHost);
  assert.equal(parsed.url.port, '5432');
  for (const raw of [
    base.replace(ref, 'yvdgmklgwlshizzgefpv'),
    base.replace(`${poolerHost}:5432`, `db.${ref}.supabase.co:5432`),
    base.replace(poolerHost, 'aws-2-eu-west-3.pooler.supabase.com'),
    base.replace(':5432/', ':6543/'),
    `${base}?sslmode=disable`,
    base.replace(`postgres.${ref}:`, 'postgres:'),
    base.replace('aws-1-eu-west-3', 'pooler'),
  ]) assert.throws(() => validatePreviewAdminPoolerUrl(raw), /V4_ADMIN_DATABASE_URL_INVALID/);
});

test('Preview receipt URL stays on the exact session pooler/ref and carries no SSL override', () => {
  const receipt = new URL(buildPreviewReceiptPoolerUrl(base, 'fictional-generated-password-0123456789-ABCD'));
  assert.equal(receipt.hostname, poolerHost);
  assert.equal(receipt.port, '5432');
  assert.equal(decodeURIComponent(receipt.username), `rubik_preview_receipt_writer.${ref}`);
  assert.deepEqual([...receipt.searchParams.keys()], []);
});

test('single Windows operator prompts only for a secure password and guarantees finally containment', async () => {
  const script = await readFile(new URL('./u03-preview-b4-owner.ps1', import.meta.url), 'utf8');
  assert.match(script, /Read-Host -Prompt[^\n]*Database password[^\n]*-AsSecureString/);
  assert.match(script, /New-U03PreviewAdminPoolerUrl -DatabasePassword \$secureDatabasePassword/);
  assert.match(script, /finally\s*\{[\s\S]*--contain --run-id \$operatorRunId/);
  assert.doesNotMatch(script, /psql\s+-X|u03-preview-v4-(?:role|activate|block|rollback)\.sql/);
  assert.doesNotMatch(script, /Read-Host[^\n]*(?:URL|connection string)/i);
});

test('Windows builder encodes reserved password characters, rejects a wrong endpoint, and emits no secret or URL', async t => {
  if (process.platform !== 'win32') { t.skip('Windows PowerShell integration test'); return; }
  const modulePath = new URL('./u03-preview-v4-pooler.psm1', import.meta.url).pathname
    .replace(/^\//, '').replaceAll('/', '\\');
  const script = `
$ErrorActionPreference = 'Stop'
Import-Module '${modulePath}' -Force
$password = 'fictional:/?#% +&=[]''quote!()*'
$secure = ConvertTo-SecureString $password -AsPlainText -Force
$url = New-U03PreviewAdminPoolerUrl -DatabasePassword $secure
$userinfo = $url.Substring('postgresql://'.Length).Split('@')[0]
$encoded = $userinfo.Substring($userinfo.IndexOf(':') + 1)
if ([Uri]::UnescapeDataString($encoded) -cne $password) { throw 'PASSWORD_ROUNDTRIP_FAILED' }
if (-not $encoded.Contains('%21%28%29%2A')) { throw 'RFC3986_RESERVED_CHARACTERS_NOT_ESCAPED' }
if (-not $url.Contains('@aws-1-eu-west-3.pooler.supabase.com:5432/postgres')) { throw 'PINNED_URL_FAILED' }
try {
  Assert-U03PreviewPoolerTarget -HostName 'aws-2-eu-west-3.pooler.supabase.com' -Port 5432 -UserName 'postgres' -ProjectRef '${ref}' -Database 'postgres'
  throw 'WRONG_TARGET_ACCEPTED'
} catch {
  if ($_.Exception.Message -cne 'V4_SESSION_POOLER_TARGET_REJECTED') { throw }
}
$password = $null; $url = $null; $secure.Dispose()
Write-Output 'PASSWORD_ENCODING_PASS; WRONG_TARGET_REJECTED'
`;
  const folder = await mkdtemp(join(tmpdir(), 'u03-v4-pooler-test-'));
  const scriptPath = join(folder, 'test-pooler.ps1');
  try {
    await writeFile(scriptPath, script, { encoding: 'utf8', mode: 0o600 });
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', scriptPath],
      { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, 'PowerShell helper should complete: ' + result.stderr);
    assert.match(result.stdout, /PASSWORD_ENCODING_PASS; WRONG_TARGET_REJECTED/);
    assert.doesNotMatch(result.stdout + result.stderr, /fictional:|postgresql:\/\/|aws-1-eu-west-3/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
