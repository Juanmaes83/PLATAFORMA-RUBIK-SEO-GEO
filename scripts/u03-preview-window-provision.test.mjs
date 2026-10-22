import assert from 'node:assert/strict';
import test from 'node:test';
import { provisionWindowVariables, WINDOW_BRANCH, WINDOW_VARIABLES } from './u03-preview-window-provision.mjs';
import { readFile } from 'node:fs/promises';

test('legacy Node provisioning is disabled; sensitive rotation is only exposed by the DPAPI-bound PowerShell operator', async () => {
  assert.equal(WINDOW_BRANCH,'codex/u03-final-gates-20261020');
  assert.equal(WINDOW_VARIABLES.length,8);
  await assert.rejects(provisionWindowVariables(),/WINDOW_DPAPI_REQUIRED_USE_VISIBLE_POWERSHELL/);
  const owner = await readFile(new URL('./u03-preview-b4-owner.ps1',import.meta.url),'utf8');
  const rotation = await readFile(new URL('./u03-preview-window-rotation.psm1',import.meta.url),'utf8');
  assert.match(owner,/Save-U03WindowBatch -Batch \$batch/);
  assert.match(owner,/\$previousBatch\.Sha -ceq \$head[\s\S]*New-U03WindowBatch -Sha \$head[\s\S]*Save-U03WindowBatch -Batch \$batch/);
  assert.match(owner,/Invoke-U03WindowRotation -Batch \$batch/);
  assert.match(rotation,/\$ordered = @\(\$Names \| Where-Object \{ \$_ -ne \$script:Flag \}\) \+ @\(\$script:Flag\)/);
  assert.match(owner,/--sensitive/);
  assert.doesNotMatch(owner,/--value\s+\$|VERCEL_TOKEN=/);
});
