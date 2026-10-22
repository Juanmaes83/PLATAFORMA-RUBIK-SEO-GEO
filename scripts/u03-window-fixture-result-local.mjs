// Runs the actual U03 result fixture and cleanup handlers against a fresh, isolated N1 stack.
// The runner refuses any pre-existing stack and retires only the stack it started.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const workdir = resolve(root, 'test-results/u03-window-local-stack');
const marker = resolve(workdir, '.u03-owned-stack.json');
const project = 'rubik-u03-window-20261020';
const run = (file, args, options = {}) => spawnSync(file, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
function checked(file, args, options) {
  const result = run(file, args, options);
  if (result.status !== 0) {
    const safe = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, '<DB_URL>')
      .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '<TOKEN>')
      .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/gi, '<KEY>')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '<EMAIL>')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
      .replace(/\b(password|secret|authorization|bearer)\s*[:=]?\s*\S+/gi, '$1=<REDACTED>');
    process.stderr.write(safe.slice(-3500));
    throw new Error('LOCAL_RESULT_RUNNER_PHASE_FAILED');
  }
  return result.stdout;
}
function containers() {
  return checked('docker', ['ps', '-a', '--filter', `label=com.supabase.cli.project=${project}`, '--format', '{{.Names}}'])
    .split(/\r?\n/).filter(Boolean);
}
if (existsSync(marker) || containers().length) throw new Error('LOCAL_RESULT_RUNNER_REFUSES_PREEXISTING_STACK');

const node = process.execPath;
const stack = resolve(root, 'scripts/u03-window-local-stack.mjs');
let started = false;
try {
  process.stdout.write(checked(node, [stack, 'start']));
  started = true;
  process.stdout.write(checked(node, [stack, 'inspect']));
  const cli = `npx --yes supabase@2.118.0 --workdir "${workdir}"`;
  const vitestArgs = ['node_modules\\.bin\\vitest.cmd', 'run', '--config', 'vitest.integration.config.mts',
    'tests/integration/u03-window-fixture-result.integration.test.ts'];
  const test = process.platform === 'win32'
    ? checked('cmd.exe', ['/d', '/s', '/c', vitestArgs.join(' ')], { env: { ...process.env, SUPABASE_CLI: cli, RUBIK_TEST_U03_WINDOW_STACK: '1' } })
    : checked(node, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.integration.config.mts',
      'tests/integration/u03-window-fixture-result.integration.test.ts'], { env: { ...process.env, SUPABASE_CLI: cli, RUBIK_TEST_U03_WINDOW_STACK: '1' } });
  process.stdout.write(test);
  process.stdout.write('U03_LOCAL_FIXTURE_RESULT PASS transport=postgres-direct migrations=27 fixtures=clean\n');
} finally {
  if (started || existsSync(marker) || containers().length) {
    const stop = run(node, [stack, 'stop']);
    if (stop.status !== 0) {
      process.stderr.write('U03_LOCAL_FIXTURE_RESULT CLEANUP_BLOCKED preserve owned stack for reconciliation\n');
      process.exitCode = 2;
    } else process.stdout.write(stop.stdout);
  }
}
