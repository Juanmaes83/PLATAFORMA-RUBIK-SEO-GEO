// N1-04 · Runner local equivalente a .github/workflows/ci.yml.
//
// Ejecuta los MISMOS bloques `run:` del workflow (leídos del archivo en cada ejecución), con el
// shell de GitHub (`bash --noprofile --norc -eo pipefail`), el `env:` del workflow, CI=true y un
// entorno de lista blanca: tokens, claves y variables del desarrollador no llegan a las pruebas.
// Los pasos `uses:` se sustituyen por equivalentes locales explícitos. La evidencia se guarda en
// test-results/ci-local/<sha12>-<fecha>/evidence.json, ligada al SHA, al hash de ci.yml y del
// lockfile. El resultado es EVIDENCIA LOCAL: nunca equivale a GitHub Actions en verde.
//
//   node scripts/ci-local/run.mjs --plan                 muestra el plan y las guardas, no ejecuta
//   node scripts/ci-local/run.mjs --job verify           solo el job verify (sin Docker)
//   node scripts/ci-local/run.mjs --job e2e              solo el job e2e (stack local propio)
//   node scripts/ci-local/run.mjs                        ambos jobs
// Opciones: --keep-stack (no detiene el stack propio al final), --skip-step "<nombre>=<motivo>"
// (el paso queda NO EJECUTADO y el veredicto nunca será PASS), --allow-dirty (evidencia no ligada
// a ningún SHA; veredicto UNBOUND), --pass-env NOMBRE (añade una variable a la lista blanca).
// Código de salida: 0 PASS, 3 PARTIAL (pasos o patas de matriz no ejecutados), 1 FAIL/UNBOUND/bloqueo.
import { execFileSync, spawn } from "node:child_process";
import { cpSync, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { checkStepResult, guardStep, runAllChecks, stackOwnership, summarizeLog } from "./checks.mjs";
import { LEDGER_PATH, ROOT, gatherFacts, listContainers } from "./facts.mjs";
import { planJob } from "./workflow.mjs";

const BASE_ENV = [
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "TERM", "LANG", "LC_ALL", "TMPDIR", "TZ",
  "DOCKER_HOST", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy",
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "CURL_CA_BUNDLE", "GIT_SSL_CAINFO",
  "NPM_CONFIG_USERCONFIG", "npm_config_https_proxy", "npm_config_noproxy", "npm_config_cache", "npm_config_registry",
  "PLAYWRIGHT_BROWSERS_PATH", "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD",
  // Windows equivalents of PATH/HOME/TMP.
  "SystemRoot", "ComSpec", "PATHEXT", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "TEMP", "TMP",
];

export function parseArgs(argv) {
  const opts = { job: "all", plan: false, keepStack: false, allowDirty: false, skip: new Map(), passEnv: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--plan") opts.plan = true;
    else if (a === "--keep-stack") opts.keepStack = true;
    else if (a === "--allow-dirty") opts.allowDirty = true;
    else if (a === "--job") opts.job = argv[++i];
    else if (a === "--pass-env") opts.passEnv.push(argv[++i]);
    else if (a === "--skip-step") {
      const [name, ...reason] = String(argv[++i] ?? "").split("=");
      if (!name || !reason.join("=").trim()) throw new Error('--skip-step necesita "<nombre del paso>=<motivo>"');
      opts.skip.set(name.trim(), reason.join("=").trim());
    } else throw new Error(`Opción desconocida: ${a}`);
  }
  if (!["all", "verify", "e2e"].includes(opts.job)) throw new Error("--job debe ser verify, e2e o all");
  return opts;
}

/** The environment a fresh GitHub runner would give the steps, plus what the machine needs to reach npm/Docker. */
export function runnerEnv(source, workflowEnv, passEnv = []) {
  const env = {};
  for (const name of [...BASE_ENV, ...passEnv]) if (source[name] !== undefined) env[name] = source[name];
  return { ...env, ...workflowEnv, CI: "true" };
}

/** Ports the workflow binds on the host (servers started by steps). */
export function workflowPorts(steps) {
  const ports = new Set();
  for (const s of steps) {
    for (const m of (s.script ?? "").matchAll(/(?:-p\s+|localhost:)(\d{4,5})\b/g)) ports.add(Number(m[1]));
    if (/npm\s+run\s+test:e2e/.test(s.script ?? "")) ports.add(3217);
  }
  return [...ports].sort((a, b) => a - b);
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.listen({ port, host: "127.0.0.1" }, () => srv.close(() => resolve(true)));
  });
}

function writeLedger(projectId, worktree) {
  const containers = (listContainers() ?? []).filter((c) => c.project === projectId);
  mkdirSync(join(ROOT, "test-results", "ci-local"), { recursive: true });
  writeFileSync(LEDGER_PATH, JSON.stringify({ worktree, projectId, containerIds: containers.map((c) => c.id), createdAt: new Date().toISOString(), pid: process.pid }, null, 2));
  return containers.length;
}

function currentOwnership(facts) {
  let ledger = null;
  try { ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8")); } catch { /* no ledger: not ours */ }
  return stackOwnership({ ...facts, containers: listContainers() ?? [], ledger }).state;
}

/** Runs one script exactly as GitHub's default bash shell does; returns exit code. */
function runScript(script, env, logPath, groups) {
  return new Promise((resolve) => {
    const log = createWriteStream(logPath);
    const child = spawn("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
      cwd: ROOT, env, detached: true, stdio: ["ignore", "pipe", "pipe"],
    });
    groups.push(child.pid);
    let captured = "";
    const onData = (chunk) => {
      const text = chunk.toString();
      captured += text;
      process.stdout.write(text);
      log.write(text);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code) => log.end(() => resolve({ code: code ?? 1, output: captured })));
  });
}

/** Untracked, non-ignored files in the worktree (CI steps write logs such as server.log there). */
function untrackedFiles() {
  return execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
}

/**
 * Each GitHub job starts from a clean checkout. Files a job leaves in the worktree are moved
 * (never deleted) into the evidence folder, so the next job and the next run start clean.
 */
function collectJobFiles(before, destination) {
  const moved = [];
  for (const file of untrackedFiles().filter((f) => !before.has(f))) {
    const target = join(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    renameSync(join(ROOT, file), target);
    moved.push(file);
  }
  return moved;
}

/** GitHub kills orphan processes at the end of each job; so do we (only our own process groups). */
function cleanupGroups(groups) {
  for (const pid of groups.splice(0)) {
    try { process.kill(-pid, "SIGTERM"); } catch { /* already gone */ }
  }
}

const TEST_STEP = /\b(npm\s+test|npm\s+run\s+test:(integration|e2e)|test\s+db)\b/;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const facts = gatherFacts();
  const jobs = Object.values(facts.workflow.jobs).filter((j) => opts.job === "all" || j.id === opts.job);
  const plans = jobs.map((job) => ({ job, steps: planJob(job) }));

  const preflight = runAllChecks(facts).filter((f) => {
    // Docker is required only by the e2e job.
    if (opts.job === "verify" && (f.code === "DEP_DOCKER" || f.code === "DEP_DOCKER_DAEMON")) return false;
    return true;
  });
  const blocking = preflight.filter((f) => f.level === "error");
  const allSteps = plans.flatMap((p) => p.steps);
  const ownershipAtStart = stackOwnership(facts).state;
  const busy = [];
  for (const port of workflowPorts(allSteps)) if (!(await portFree(port))) busy.push(port);
  if (opts.job !== "verify" && ownershipAtStart === "absent") {
    for (const port of [facts.config.apiPort, facts.config.dbPort, facts.config.shadowPort].filter(Boolean)) {
      if (!(await portFree(port))) busy.push(port);
    }
  }
  if (busy.length) blocking.push({ category: 5, level: "error", code: "FOREIGN_PORT_BUSY", message: `Puertos ocupados por otro proceso: ${busy.join(", ")}. No se detiene nada ajeno; liberar o usar otra máquina.` });
  if (facts.git.dirty.length && !opts.allowDirty) {
    blocking.push({ category: 9, level: "error", code: "EVIDENCE_DIRTY", message: `${facts.git.dirty.length} cambio(s) sin commit: la evidencia no probaría un SHA. Commit o --allow-dirty (veredicto UNBOUND).` });
  }

  if (opts.plan) {
    process.stdout.write(`Plan local equivalente a CI · HEAD ${facts.git.head} · stack ${ownershipAtStart}\n`);
    for (const { job, steps } of plans) {
      process.stdout.write(`\njob ${job.id} (${job.name}) runs-on ${job.runsOn}${Object.keys(job.matrix).length ? ` matrix ${JSON.stringify(job.matrix)}` : ""}\n`);
      for (const s of steps) {
        const guard = guardStep(s, s.ownedStack?.includes("start local stack") ? ownershipAtStart : "owned", opts);
        const notes = [s.always ? "always" : "", s.ownedStack?.length ? `stack propio: ${s.ownedStack.join("/")}` : "", s.forbidden?.length ? `PROHIBIDO: ${s.forbidden.join("/")}` : "", opts.skip.has(s.label) ? `NO SE EJECUTA: ${opts.skip.get(s.label)}` : "", guard.allowed ? "" : "BLOQUEADO"].filter(Boolean);
        process.stdout.write(`  ${String(s.index + 1).padStart(2)} [${s.kind}] ${s.label}${notes.length ? `  (${notes.join("; ")})` : ""}\n`);
      }
    }
    process.stdout.write(`\nPreflight: ${blocking.length} bloqueo(s)\n`);
    for (const f of blocking) process.stdout.write(`  [${f.code}] ${f.message}\n`);
    return blocking.length ? 1 : 0;
  }
  if (blocking.length) {
    for (const f of blocking) process.stderr.write(`[BLOQUEO ${f.code}] ${f.message}\n`);
    process.stderr.write("No se ejecuta nada. Ver node scripts/ci-local/preflight.mjs.\n");
    return 1;
  }

  const startedAt = new Date();
  const dir = join(ROOT, "test-results", "ci-local", `${facts.git.head.slice(0, 12)}-${startedAt.toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(join(dir, "logs"), { recursive: true });
  const env = runnerEnv(process.env, facts.workflow.env, opts.passEnv);
  const evidence = {
    kind: "local-ci-equivalent",
    disclaimer: "Evidencia local reproducible; NO es un resultado de GitHub Actions.",
    head: facts.git.head,
    dirty: facts.git.dirty,
    ciYmlSha256: facts.git.ciYmlSha256,
    lockSha256: facts.git.lockSha256,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    envNames: Object.keys(env).sort(),
    stack: { projectId: facts.config.projectId, apiPort: facts.config.apiPort, dbPort: facts.config.dbPort, ownershipAtStart },
    deviations: [],
    startedAt: startedAt.toISOString(),
    jobs: [],
    steps: [],
    findings: preflight.filter((f) => f.level !== "error"),
  };
  const save = () => writeFileSync(join(dir, "evidence.json"), JSON.stringify(evidence, null, 2));
  const nodeMajor = process.version.replace(/^v/, "").split(".")[0];

  for (const { job, steps } of plans) {
    const jobRecord = { id: job.id, name: job.name, runsOn: job.runsOn, matrix: job.matrix, status: "passed" };
    evidence.jobs.push(jobRecord);
    if (job.matrix.node) {
      jobRecord.matrixLegRun = nodeMajor;
      jobRecord.matrixLegsNotRun = job.matrix.node.filter((n) => n !== nodeMajor);
      if (jobRecord.matrixLegsNotRun.length) evidence.deviations.push(`job ${job.id}: patas de Node no ejecutadas: ${jobRecord.matrixLegsNotRun.join(", ")}`);
    }
    const groups = [];
    const untrackedBefore = new Set(untrackedFiles());
    let failed = false;
    for (const step of steps) {
      const record = { job: job.id, index: step.index + 1, label: step.label, kind: step.kind, status: "passed" };
      evidence.steps.push(record);
      if (failed && !step.always) { record.status = "not-run-after-failure"; continue; }
      if (opts.skip.has(step.label)) {
        record.status = "skipped";
        record.reason = opts.skip.get(step.label);
        evidence.deviations.push(`job ${job.id}: paso "${step.label}" no ejecutado: ${record.reason}`);
        continue;
      }
      if (step.kind === "checkout") {
        const now = gatherFacts({ withStatus: false }).git;
        if (now.head !== facts.git.head) { record.status = "failed"; record.reason = "HEAD cambió durante la ejecución"; failed = true; }
        else record.note = `HEAD ${now.head}; árbol ${now.dirty.length ? "con cambios" : "limpio"} (sin clonar de nuevo)`;
        continue;
      }
      if (step.kind === "setup-node") {
        const wanted = String(step.with["node-version"] ?? "");
        const effective = wanted.includes("matrix.node") ? jobRecord.matrixLegRun : wanted;
        record.note = `Node pedido ${effective}, usado ${process.version}`;
        if (effective !== nodeMajor) evidence.deviations.push(`job ${job.id}: pide Node ${effective}, se usó ${process.version}`);
        continue;
      }
      if (step.kind === "upload-artifact") {
        const src = join(ROOT, step.with.path ?? "");
        if (existsSync(src)) { cpSync(src, join(dir, "artifacts", step.with.name ?? "artifact"), { recursive: true }); record.note = `copiado a artifacts/${step.with.name}`; }
        else { record.status = "failed"; record.reason = `no existe ${step.with.path}`; }
        continue;
      }
      const ownership = step.ownedStack?.length ? currentOwnership(facts) : "n/a";
      const guard = guardStep(step, ownership, opts);
      if (!guard.allowed) {
        record.status = guard.skip ? "skipped" : "failed";
        record.reason = guard.finding.message;
        if (guard.skip) evidence.deviations.push(guard.finding.message);
        else failed = true;
        continue;
      }
      process.stdout.write(`\n▶ ${job.id} · ${step.label}\n`);
      const logPath = join(dir, "logs", `${job.id}-${String(step.index + 1).padStart(2, "0")}.log`);
      const t0 = Date.now();
      const { code, output } = await runScript(step.script, env, logPath, groups);
      record.durationMs = Date.now() - t0;
      record.exitCode = code;
      record.log = `logs/${job.id}-${String(step.index + 1).padStart(2, "0")}.log`;
      record.status = code === 0 ? "passed" : "failed";
      record.summary = summarizeLog(output);
      record.expectsSummary = TEST_STEP.test(step.script);
      record.findings = checkStepResult(record);
      if (code !== 0) failed = true;
      if (code === 0 && step.ownedStack?.includes("start local stack")) record.note = `stack propio registrado (${writeLedger(facts.config.projectId, facts.worktree)} contenedores)`;
      if (code === 0 && step.ownedStack?.includes("stop local stack")) rmSync(LEDGER_PATH, { force: true });
      save();
    }
    cleanupGroups(groups);
    jobRecord.workspaceFiles = collectJobFiles(untrackedBefore, join(dir, "workspace", job.id));
    jobRecord.status = failed ? "failed" : "passed";
    save();
  }

  evidence.finishedAt = new Date().toISOString();
  const statuses = evidence.steps.map((s) => s.status);
  if (statuses.some((s) => s === "failed" || s === "not-run-after-failure")) evidence.verdict = "FAIL";
  else if (evidence.dirty.length) evidence.verdict = "UNBOUND";
  else if (statuses.includes("skipped") || evidence.deviations.length) evidence.verdict = "PARTIAL";
  else evidence.verdict = "PASS";
  save();
  process.stdout.write(`\nVeredicto local: ${evidence.verdict} · evidencia ${join(dir, "evidence.json").replace(ROOT + "/", "")}\n`);
  for (const d of evidence.deviations) process.stdout.write(`  desviación: ${d}\n`);
  // 0 only for a complete PASS; 3 = PARTIAL (steps or matrix legs not run); 1 = FAIL/UNBOUND.
  return { PASS: 0, PARTIAL: 3 }[evidence.verdict] ?? 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => { process.exitCode = code; }, (error) => { console.error(error); process.exitCode = 1; });
}
