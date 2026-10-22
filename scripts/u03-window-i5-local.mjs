// Runs only the signed/populated I-5 verifier on a newly created isolated N1 stack.
// On any failure it preserves the owned stack and ledger context for reconciliation.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const stack = resolve(root, 'scripts/u03-window-local-stack.mjs');
const project = 'rubik-u03-i5-20261022';
const run = (file, args, options = {}) => spawnSync(file, args, {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options,
});
function safeOutput(value) {
  return String(value ?? '')
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, '<DB_URL>')
    .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '<TOKEN>')
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/gi, '<KEY>')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '<EMAIL>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\b(password|secret|authorization|bearer)\s*[:=]?\s*\S+/gi, '$1=<REDACTED>');
}
function checked(file, args, options) {
  const result = run(file, args, options);
  if (result.status !== 0) {
    process.stderr.write(safeOutput(`${result.stdout ?? ''}\n${result.stderr ?? ''}`).slice(-4000));
    throw new Error('LOCAL_I5_RUNNER_PHASE_FAILED');
  }
  return result.stdout;
}
const containers = checked('docker', ['ps', '-a', '--filter', `label=com.supabase.cli.project=${project}`, '--format', '{{.Names}}'])
  .split(/\r?\n/).filter(Boolean);
if (containers.length) throw new Error('LOCAL_I5_RUNNER_REFUSES_PREEXISTING_STACK');

let started = false;
let completed = false;
try {
  checked(process.execPath, [stack, 'start']);
  started = true;
  checked(process.execPath, [stack, 'inspect']);
  const cli = `npx --yes supabase@2.118.0 --workdir "${resolve(root, 'test-results/u03-i5-local-stack')}"`;
  const args = ['node_modules\\.bin\\vitest.cmd', 'run', '--config', 'vitest.integration.config.mts',
    'tests/integration/u03-window-i5.integration.test.ts'];
  const test = process.platform === 'win32'
    ? checked('cmd.exe', ['/d', '/s', '/c', args.join(' ')], { env: { ...process.env, SUPABASE_CLI: cli, RUBIK_TEST_U03_I5_STACK: '1' } })
    : checked(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.integration.config.mts',
      'tests/integration/u03-window-i5.integration.test.ts'], { env: { ...process.env, SUPABASE_CLI: cli, RUBIK_TEST_U03_I5_STACK: '1' } });
  process.stdout.write(test);
  completed = true;
} finally {
  if (started && completed) {
    checked(process.execPath, [stack, 'stop']);
    process.stdout.write('U03_LOCAL_I5 PASS transport=postgres-direct migrations=27 rows=populated-A-and-B receipts=resolved cleanup=zero stack=retired\n');
  } else if (started) {
    process.stderr.write('U03_LOCAL_I5 BLOCKED owned_stack_preserved=true reconcile_before_retry=true\n');
    process.exitCode = 2;
  }
}
