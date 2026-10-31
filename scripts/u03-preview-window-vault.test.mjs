import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { env } from 'node:process';
import { join } from 'node:path';

const powershell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const selftest = join(process.cwd(), 'scripts', 'u03-preview-window-vault-selftest.ps1');
const parseTest = join(process.cwd(), 'scripts', 'u03-preview-window-ps-parse-selftest.ps1');
function run(mode, root) {
  return execFileSync(powershell, ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',selftest,
    '-Mode',mode,'-ProfileRoot',root], { encoding:'utf8', windowsHide:true, timeout:30000 });
}

test('Windows PowerShell 5.1 DPAPI vault survives a new process and rejects tampering without exposing contents', () => {
  const root = mkdtempSync(join(env.LOCALAPPDATA,'u03-window-vault-'));
  try {
    assert.match(run('write',root), /VAULT_WRITE_PASS/);
    const path = join(root,'Rubik','H1A-Window','v2','window-batch.json');
    const record = JSON.parse(readFileSync(path,'utf8'));
    assert.equal(record.version,1);
    assert.ok(record.ciphertext);
    assert.doesNotMatch(record.ciphertext, /armed-run-capability|postgresql|u03-preview-window|d9c4f0a2/);
    assert.match(run('read',root), /VAULT_READ_PASS/);
    assert.match(run('identity',root), /VAULT_IDENTITY_REJECTED/);
    record.ciphertext = 'not-base64-ciphertext';
    writeFileSync(path,JSON.stringify(record));
    assert.match(run('corrupt',root), /VAULT_CORRUPT_REJECTED/);
    assert.doesNotMatch(run('remove',root), /postgresql|armed-run-capability/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('Windows PowerShell 5.1 parser accepts the owner wrapper and vault module', () => {
  assert.match(execFileSync(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',parseTest],
    {encoding:'utf8',windowsHide:true,timeout:30000}),/U03_WINDOW_PS51_PARSE_PASS/);
});

test('partial nine variable rotation removes the arming flag first, adds it last, and rolls back in failure', () => {
  const root = join(env.LOCALAPPDATA,'u03-window-rotation-'+Math.random().toString(16).slice(2));
  try {
    assert.match(run('rotation',root),/WINDOW_ROTATION_SUCCESS_PARTIAL_ROLLBACK_AND_RETRY_PASS/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
