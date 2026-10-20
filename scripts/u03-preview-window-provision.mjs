import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const WINDOW_BRANCH = 'codex/u03-final-gates-20261020';
export const WINDOW_VARIABLES = Object.freeze([
  'U03_PREVIEW_WRITER_WINDOW', 'U03_PREVIEW_WRITER_WINDOW_REF', 'U03_PREVIEW_WRITER_WINDOW_SHA',
  'U03_PREVIEW_WRITER_WINDOW_RUN_ID', 'U03_PREVIEW_WRITER_WINDOW_SECRET', 'RUBIK_AUDIT_DATABASE_URL',
  'PROVENANCE_SIGNING_KEYS', 'PROVENANCE_ACTIVE_KEY_ID',
]);
const REF = 'rhnnplewqsekrnaousyl';
const ROLE = 'rubik_preview_u03_writer';
const ACTIVE_KEY_ID = 'u03-preview-window';
const SAFE_PROVISION_ERRORS = new Set(['WINDOW_BRANCH_MISMATCH','VERCEL_PROJECT_LINK_INVALID','VERCEL_PROJECT_LINK_MISMATCH',
  'WINDOW_GIT_STATE_INVALID','WINDOW_GIT_PIN_MISMATCH','WINDOW_VARIABLES_ALREADY_EXIST','WINDOW_VARIABLES_NOT_VERIFIED']);

export function makeWindowVariables({ sha, runId = randomUUID(), random = randomBytes }) {
  if (!/^[0-9a-f]{40}$/i.test(sha) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId))
    throw new Error('WINDOW_PROVISION_INPUT_REJECTED');
  const rolePassword = random(32).toString('base64url');
  const windowSecret = random(32).toString('base64url');
  const signingKey = random(32).toString('base64');
  const url = new URL('postgresql://placeholder@aws-1-eu-west-3.pooler.supabase.com:5432/postgres');
  url.username = `${ROLE}.${REF}`;
  url.password = rolePassword;
  url.searchParams.set('options', '-c role=rubik_audit_writer');
  return {
    runId,
    values: {
      U03_PREVIEW_WRITER_WINDOW: 'armed-run-capability',
      U03_PREVIEW_WRITER_WINDOW_REF: REF,
      U03_PREVIEW_WRITER_WINDOW_SHA: sha.toLowerCase(),
      U03_PREVIEW_WRITER_WINDOW_RUN_ID: runId,
      U03_PREVIEW_WRITER_WINDOW_SECRET: windowSecret,
      RUBIK_AUDIT_DATABASE_URL: url.toString(),
      PROVENANCE_SIGNING_KEYS: `${ACTIVE_KEY_ID}:${signingKey}`,
      PROVENANCE_ACTIVE_KEY_ID: ACTIVE_KEY_ID,
    },
  };
}

function run(cli, args, { input = '', cwd = process.cwd(), env = process.env, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cli, args, { cwd, env, windowsHide: true, shell: process.platform === 'win32',
      stdio: ['pipe', capture ? 'pipe' : 'ignore', 'ignore'] });
    let stdout = '';
    if (capture) child.stdout.setEncoding('utf8').on('data', chunk => { stdout = (stdout + chunk).slice(-64_000); });
    child.once('error', () => reject(new Error('VERCEL_ENV_COMMAND_START_FAILED')));
    child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error('VERCEL_ENV_COMMAND_FAILED')));
    child.stdin.end(input);
  });
}

export async function provisionWindowVariables({ cli = process.env.U03_VERCEL_CLI || 'vercel.cmd', cwd = process.cwd(),
  env = process.env, exec = run, read = readFile, sha } = {}) {
  if (env.U03_PIN_DEPLOYMENT_BRANCH && env.U03_PIN_DEPLOYMENT_BRANCH !== WINDOW_BRANCH) throw new Error('WINDOW_BRANCH_MISMATCH');
  let link;
  try { link = JSON.parse(await read(`${cwd}/.vercel/project.json`, 'utf8')); } catch { throw new Error('VERCEL_PROJECT_LINK_INVALID'); }
  if (link.projectId !== 'prj_HgnTtNtisi9Kt1A4Dq2pxoCQBook' || link.orgId !== 'team_hLhdb3M9MviTIysXD9whFF2c')
    throw new Error('VERCEL_PROJECT_LINK_MISMATCH');
  let branch;
  let head;
  try {
    branch = (await exec('git', ['-C', cwd, 'branch', '--show-current'], { capture: true })).trim();
    head = (await exec('git', ['-C', cwd, 'rev-parse', 'HEAD'], { capture: true })).trim();
    const status = (await exec('git', ['-C', cwd, 'status', '--porcelain'], { capture: true })).trim();
    if (status) throw new Error('DIRTY');
  } catch { throw new Error('WINDOW_GIT_STATE_INVALID'); }
  if (branch !== WINDOW_BRANCH || !/^[0-9a-f]{40}$/i.test(head) || (sha && sha.toLowerCase() !== head.toLowerCase()))
    throw new Error('WINDOW_GIT_PIN_MISMATCH');

  const vars = makeWindowVariables({ sha: head });
  const added = [];
  let verified = false;
  try {
    const existing = await exec(cli, ['env', 'ls', 'preview', WINDOW_BRANCH], { cwd, env, capture: true });
    if (WINDOW_VARIABLES.some(name => new RegExp(`\\b${name}\\b`).test(existing))) throw new Error('WINDOW_VARIABLES_ALREADY_EXIST');
    for (const name of WINDOW_VARIABLES) {
      await exec(cli, ['env', 'add', name, 'preview', WINDOW_BRANCH, '--yes', '--sensitive'],
        { cwd, env, input: `${vars.values[name]}\n` });
      added.push(name);
    }
    const after = await exec(cli, ['env', 'ls', 'preview', WINDOW_BRANCH], { cwd, env, capture: true });
    if (!WINDOW_VARIABLES.every(name => new RegExp(`\\b${name}\\b`).test(after))) throw new Error('WINDOW_VARIABLES_NOT_VERIFIED');
    verified = true;
    return { runId: vars.runId, branch, sha: head, ref: REF, variableNames: [...WINDOW_VARIABLES] };
  } catch (error) {
    for (const name of added.reverse()) await exec(cli, ['env', 'rm', name, 'preview', WINDOW_BRANCH, '--yes'], { cwd, env }).catch(() => {});
    const code = SAFE_PROVISION_ERRORS.has(error?.message) ? error.message : 'WINDOW_VARIABLE_PROVISION_FAILED';
    throw Object.assign(new Error(code), { cause: error });
  } finally {
    if (!verified) for (const name of Object.keys(vars.values)) vars.values[name] = '';
    else for (const name of Object.keys(vars.values)) vars.values[name] = '';
  }
}

async function main() {
  try {
    const result = await provisionWindowVariables();
    process.stdout.write(`U03_WINDOW_BRANCH_VARIABLES_READY runId=${result.runId} branch=${result.branch} sha=${result.sha} ref=${result.ref} count=${result.variableNames.length}\n`);
  } catch (error) {
    const code = /^[A-Z][A-Z0-9_]{1,79}$/.test(error?.message ?? '') ? error.message : 'WINDOW_VARIABLE_PROVISION_FAILED';
    process.stderr.write(`U03_WINDOW_BRANCH_VARIABLES_BLOCKED code=${code}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main();
