import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { diagnosePreviewAdminConnection, runPreviewV4Operator, validatePreviewAdminPoolerUrl,
  buildPreviewReceiptPoolerUrl, verifyPreviewAdminPasswordTransport } from './u03-preview-v4-operator.mjs';

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

test('connection comparison accepts the exact reserved-character password bytes and rejects mismatches without disclosure', () => {
  const password = `fictional:/?#% +&=[]'quote!()*`;
  const raw = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${poolerHost}:5432/postgres`;
  const pass = verifyPreviewAdminPasswordTransport(raw, password);
  assert.deepEqual([pass.status, pass.category, pass.code], ['PASS', 'TRANSPORT', 'URL_PASSWORD_BYTES_MATCH']);
  const mismatch = verifyPreviewAdminPasswordTransport(raw, `${password}x`);
  assert.deepEqual([mismatch.status, mismatch.category, mismatch.code], ['FAIL', 'CONFIGURATION', 'URL_PASSWORD_BYTES_MISMATCH']);
  const missing = verifyPreviewAdminPasswordTransport(raw, undefined);
  assert.deepEqual([missing.status, missing.category, missing.code], ['FAIL', 'CONFIGURATION', 'PASSWORD_COMPARISON_INPUT_MISSING']);
  for (const result of [pass, mismatch, missing])
    assert.doesNotMatch(JSON.stringify(result), /fictional|postgresql:|pooler\.supabase/);
});

test('single Windows operator prompts only for a secure password and guarantees finally containment', async () => {
  const script = await readFile(new URL('./u03-preview-b4-owner.ps1', import.meta.url), 'utf8');
  assert.match(script, /Read-Host -Prompt[^\n]*Database password[^\n]*-AsSecureString/);
  assert.match(script, /New-U03PreviewAdminPoolerUrlFromPlaintext -PasswordText \$plainPassword/);
  assert.match(script, /\[switch\]\$V4ConnectionDiagnosticOnly/);
  assert.match(script, /& node \$v4Operator --diagnose-connection/);
  assert.match(script, /PGSSLMODE = 'verify-full'/);
  assert.match(script, /PGPASSWORD = \$plainPassword/);
  assert.match(script, /U03_PREVIEW_ADMIN_PASSWORD_EXPECTED = \$plainPassword/);
  assert.match(script, /Invoke-U03PreviewAdminConnectionComparison/);
  assert.match(script, /caseId -eq 'receipt-role-install'[\s\S]*ATTEMPTED/);
  assert.match(script, /finally\s*\{[\s\S]*--contain --run-id \$operatorRunId/);
  assert.doesNotMatch(script, /u03-preview-v4-(?:role|activate|block|rollback)\.sql/);
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
    $urlFromSameInput = New-U03PreviewAdminPoolerUrlFromPlaintext -PasswordText $password
    if ($urlFromSameInput -cne $url) { throw 'URL_BUILDER_BYTE_PATH_MISMATCH' }
try {
  Assert-U03PreviewPoolerTarget -HostName 'aws-2-eu-west-3.pooler.supabase.com' -Port 5432 -UserName 'postgres' -ProjectRef '${ref}' -Database 'postgres'
  throw 'WRONG_TARGET_ACCEPTED'
} catch {
  if ($_.Exception.Message -cne 'V4_SESSION_POOLER_TARGET_REJECTED') { throw }
}
$classified = @(
  (ConvertFrom-U03PsqlDiagnostic -ErrorText 'could not translate host sentinel-password' -ExitCode 2 -OutputText ''),
  (ConvertFrom-U03PsqlDiagnostic -ErrorText 'connection timed out sentinel-url' -ExitCode 2 -OutputText ''),
  (ConvertFrom-U03PsqlDiagnostic -ErrorText 'certificate verify failed sentinel-password' -ExitCode 2 -OutputText ''),
  (ConvertFrom-U03PsqlDiagnostic -ErrorText 'password authentication failed sentinel-url' -ExitCode 2 -OutputText ''),
  (ConvertFrom-U03PsqlDiagnostic -ErrorText 'permission denied sentinel-password' -ExitCode 2 -OutputText ''),
  (ConvertFrom-U03PsqlDiagnostic -ErrorText '' -ExitCode 0 -OutputText 'postgres|postgres|postgres')
)
if (($classified | Where-Object Status -eq 'FAIL').Count -ne 5 -or $classified[5].Status -ne 'PASS') { throw 'PSQL_SAFE_CLASSIFIER_FAILED' }
if (($classified | ForEach-Object Category) -join ',' -cne 'DNS,TCP,TLS,AUTHENTICATION,PERMISSION,DATABASE') { throw 'PSQL_CLASSIFIER_CATEGORY_MISMATCH' }
if ((ConvertTo-Json -InputObject $classified -Compress) -match 'sentinel') { throw 'PSQL_CLASSIFIER_LEAKED_INPUT' }
$password = $null; $url = $null; $secure.Dispose()
Write-Output 'PASSWORD_ENCODING_PASS; WRONG_TARGET_REJECTED; PSQL_SAFE_CLASSIFIER_PASS'
`;
  const folder = await mkdtemp(join(tmpdir(), 'u03-v4-pooler-test-'));
  const scriptPath = join(folder, 'test-pooler.ps1');
  try {
    await writeFile(scriptPath, script, { encoding: 'utf8', mode: 0o600 });
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', scriptPath],
      { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, 'PowerShell helper should complete: ' + result.stderr);
    assert.match(result.stdout, /PASSWORD_ENCODING_PASS; WRONG_TARGET_REJECTED; PSQL_SAFE_CLASSIFIER_PASS/);
    assert.doesNotMatch(result.stdout + result.stderr, /fictional:|postgresql:\/\/|aws-1-eu-west-3/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

function simulatedPoolClass({ connectError, queryError, adminRow } = {}) {
  return class SimulatedPool {
    async connect() {
      if (connectError) throw connectError;
      let queryCount = 0;
      return {
        async query() {
          queryCount++;
          if (queryError && queryCount > 1) throw queryError;
          if (queryCount === 1) return { rows: [adminRow ?? {
            database_ok: true, session_identity_ok: true, may_create_role: true,
            exact_identity: true, closed_identity: true,
          }] };
          return { rows: [{ receipt_writer_present: false }] };
        },
        release() {},
      };
    }
    async end() {}
  };
}

test('admin connection diagnostic classifies DNS, TCP, TLS, authentication, permission and capabilities without raw errors', async () => {
  const password = 'fictional-diagnostic-password';
  const url = `postgresql://postgres.${ref}:${password}@${poolerHost}:5432/postgres`;
  const network = { tcpProbeFn: async () => {}, lookupFn: async () => [{ family: 4, address: '192.0.2.7' }], ca: 'fictional-ca' };
  const dns = await diagnosePreviewAdminConnection(url, { ...network,
    lookupFn: async () => { throw Object.assign(new Error(`${password} ${url}`), { code: 'ENOTFOUND' }); } });
  assert.deepEqual([dns.category, dns.code], ['DNS', 'DNS_RESOLUTION_FAILED']);

  const tcp = await diagnosePreviewAdminConnection(url, { ...network,
    tcpProbeFn: async () => { throw Object.assign(new Error(`${password} ${url}`), { code: 'ETIMEDOUT' }); } });
  assert.deepEqual([tcp.category, tcp.code], ['TCP', 'TCP_CONNECTION_TIMEOUT']);

  const tls = await diagnosePreviewAdminConnection(url, { ...network,
    PoolClass: simulatedPoolClass({ connectError: Object.assign(new Error(`${password} ${url}`), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' }) }) });
  assert.deepEqual([tls.category, tls.code], ['TLS', 'TLS_CERTIFICATE_OR_HANDSHAKE_REJECTED']);

  const auth = await diagnosePreviewAdminConnection(url, { ...network,
    PoolClass: simulatedPoolClass({ connectError: Object.assign(new Error(`${password} ${url}`), { code: '28P01' }) }) });
  assert.deepEqual([auth.category, auth.code], ['AUTHENTICATION', 'DATABASE_AUTHENTICATION_REJECTED']);

  const permission = await diagnosePreviewAdminConnection(url, { ...network,
    PoolClass: simulatedPoolClass({ queryError: Object.assign(new Error(`${password} ${url}`), { code: '42501' }) }) });
  assert.deepEqual([permission.category, permission.code], ['PERMISSION', 'SQL_PERMISSION_DENIED']);

  const capability = await diagnosePreviewAdminConnection(url, { ...network,
    PoolClass: simulatedPoolClass({ adminRow: { database_ok: true, session_identity_ok: true,
      may_create_role: false, exact_identity: true, closed_identity: true } }) });
  assert.deepEqual([capability.category, capability.code], ['CAPABILITY', 'ADMIN_CREATE_ROLE_CAPABILITY_MISSING']);

  const pass = await diagnosePreviewAdminConnection(url, { ...network, PoolClass: simulatedPoolClass(), stateValidator: async () => {} });
  assert.deepEqual([pass.status, pass.category, pass.code], ['PASS', 'READ_ONLY_ADMIN', 'PREVIEW_ADMIN_CONNECTION_AND_CAPABILITIES_VERIFIED']);
  for (const result of [dns, tcp, tls, auth, permission, capability, pass])
    assert.doesNotMatch(JSON.stringify(result), /fictional-diagnostic-password|postgresql:\/\/|192\.0\.2\.7/);
});

test('failed pre-campaign admin diagnosis does not call campaign, create pool, or attempt containment', async () => {
  const runId = randomUUID();
  const url = `postgresql://postgres.${ref}:fictional-secret@${poolerHost}:5432/postgres`;
  let poolConstructed = false;
  let campaignCalled = false;
  const priorExitCode = process.exitCode;
  class NeverPool { constructor() { poolConstructed = true; } }
  try {
    const result = await runPreviewV4Operator({
      env: { U03_PREVIEW_ADMIN_DATABASE_URL: url, U03_PREVIEW_ADMIN_PASSWORD_EXPECTED: 'fictional-secret' }, runId, root: process.cwd(), PoolClass: NeverPool,
      diagnosticFn: async () => ({ status: 'FAIL', category: 'DNS', code: 'DNS_RESOLUTION_FAILED' }),
      campaignFn: async () => { campaignCalled = true; return { status: 'PASS' }; },
    });
    assert.equal(result, null);
    assert.equal(poolConstructed, false);
    assert.equal(campaignCalled, false);
    const ledger = await readFile(join(process.cwd(), 'test-results', 'u03-hosted', `${runId}.jsonl`), 'utf8');
    assert.match(ledger, /"category":"DNS","code":"DNS_RESOLUTION_FAILED"/);
    assert.doesNotMatch(ledger, /fictional-secret|postgresql:\/\//);
  } finally {
    process.exitCode = priorExitCode;
    await unlink(join(process.cwd(), 'test-results', 'u03-hosted', `${runId}.jsonl`)).catch(() => {});
  }
});
