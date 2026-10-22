import { pathToFileURL } from 'node:url';

export const WINDOW_BRANCH = 'codex/h1a-integral-20261022';
export const WINDOW_VARIABLES = Object.freeze([
  'U03_PREVIEW_WRITER_WINDOW', 'U03_PREVIEW_WRITER_WINDOW_REF', 'U03_PREVIEW_WRITER_WINDOW_SHA',
  'U03_PREVIEW_WRITER_WINDOW_RUN_ID', 'U03_PREVIEW_WRITER_WINDOW_SECRET', 'RUBIK_AUDIT_DATABASE_URL',
  'PROVENANCE_SIGNING_KEYS', 'PROVENANCE_ACTIVE_KEY_ID', 'RUBIK_RECOVERY_SCHEMA_ATTESTATION',
]);

/** Secret provisioning must pass through the visible Windows PowerShell DPAPI vault. */
export async function provisionWindowVariables() {
  throw new Error('WINDOW_DPAPI_REQUIRED_USE_VISIBLE_POWERSHELL');
}

async function main() {
  try { await provisionWindowVariables(); }
  catch (error) {
    const code = error?.message === 'WINDOW_DPAPI_REQUIRED_USE_VISIBLE_POWERSHELL'
      ? error.message : 'WINDOW_PROVISION_BLOCKED';
    process.stderr.write(`U03_WINDOW_BRANCH_VARIABLES_BLOCKED code=${code}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
