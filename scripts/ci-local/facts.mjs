// N1-04 · Recogida de hechos de solo lectura para el preflight y el runner local.
// Ejecuta únicamente comandos de consulta (git, docker ps/inspect/port, supabase status) y lee
// archivos del worktree. Nunca guarda ni imprime valores de variables: de los .env solo extrae
// nombres y la clase de destino (local / alojado / remoto).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { destinationOf, scanTestMarkers } from "./checks.mjs";
import { npmScriptsUsed, parseWorkflow } from "./workflow.mjs";

export const ROOT = resolve(import.meta.dirname, "..", "..");
export const LEDGER_PATH = join(ROOT, "test-results", "ci-local", "stack-owner.json");

function tryExec(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60_000, ...opts }).trim();
  } catch {
    return null;
  }
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Minimal TOML reading: the values the local CI needs from supabase/config.toml. */
export function readSupabaseConfig(text) {
  const cfg = {};
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) { section = sec[1]; continue; }
    const kv = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!kv) continue;
    const value = kv[2].replace(/^"|"$/g, "");
    if (section === "" && kv[1] === "project_id") cfg.projectId = value;
    if (section === "api" && kv[1] === "port") cfg.apiPort = Number(value);
    if (section === "db" && kv[1] === "port") cfg.dbPort = Number(value);
    if (section === "db" && kv[1] === "shadow_port") cfg.shadowPort = Number(value);
    if (section === "db.pooler" && kv[1] === "port") cfg.poolerPort = Number(value);
  }
  return cfg;
}

/** Names and destination classes of a dotenv file, never its values. */
export function envFileEntries(text) {
  const entries = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(raw);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    entries.push({ name: m[1], destination: value ? destinationOf(value) : "empty" });
  }
  return entries;
}

/** Parses `supabase status -o env` lines. Only API_URL and DB_URL are kept. */
export function parseStatusEnv(out) {
  if (!out) return null;
  const env = {};
  for (const line of out.split(/\r?\n/)) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (m && (m[1] === "API_URL" || m[1] === "DB_URL")) env[m[1]] = m[2];
  }
  return env.API_URL || env.DB_URL ? env : null;
}

/** Docker containers with their Supabase CLI project label and published host ports. */
export function listContainers() {
  const out = tryExec("docker", ["ps", "-a", "--format", "{{json .}}"]);
  if (out === null) return null;
  const containers = [];
  for (const line of out.split(/\r?\n/).filter(Boolean)) {
    const c = JSON.parse(line);
    const labels = Object.fromEntries(String(c.Labels ?? "").split(",").filter(Boolean).map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i), kv.slice(i + 1)];
    }));
    const ports = [];
    for (const m of String(c.Ports ?? "").matchAll(/(?:[\d.]+|\[::\]|::):(\d+)->(\d+)\/tcp/g)) ports.push({ host: Number(m[1]), container: Number(m[2]) });
    containers.push({ id: c.ID, name: c.Names, project: labels["com.supabase.cli.project"] ?? null, state: c.State, ports });
  }
  return containers;
}

function walk(dir, filter, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "node_modules") walk(p, filter, acc); }
    else if (filter(p)) acc.push(p);
  }
  return acc;
}

function playwrightFacts() {
  const facts = { expectedRevision: null, availableRevisions: [] };
  try {
    const browsers = JSON.parse(readFileSync(join(ROOT, "node_modules", "playwright-core", "browsers.json"), "utf8"));
    facts.expectedRevision = browsers.browsers.find((b) => b.name === "chromium")?.revision ?? null;
  } catch { /* not installed yet */ }
  const dirs = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(process.env.HOME ?? "", ".cache", "ms-playwright")].filter(Boolean);
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const name of readdirSync(d)) {
      const m = /^chromium-(\d+)$/.exec(name);
      if (m) facts.availableRevisions.push(m[1]);
    }
  }
  return facts;
}

function installMatchesLock() {
  const installed = join(ROOT, "node_modules", ".package-lock.json");
  if (!existsSync(installed)) return null;
  try {
    const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8")).packages ?? {};
    const inst = JSON.parse(readFileSync(installed, "utf8")).packages ?? {};
    for (const [path, meta] of Object.entries(lock)) {
      if (!path) continue;
      // Optional packages (other platforms) are legitimately absent; a present one must match.
      if (!inst[path]) { if (!meta.optional && !meta.peer) return false; continue; }
      if (inst[path].version !== meta.version) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Gathers every fact the checks need. `withStatus` queries the running local stack (read-only). */
export function gatherFacts({ env = process.env, withStatus = true } = {}) {
  const workflowText = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  const workflow = parseWorkflow(workflowText);
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const config = readSupabaseConfig(readFileSync(join(ROOT, "supabase", "config.toml"), "utf8"));
  const allScripts = Object.values(workflow.jobs).flatMap((j) => j.steps.map((s) => s.run ?? ""));

  const pins = {};
  const wfPin = /supabase@([\d.]+)/.exec(workflow.env.SUPABASE_CLI ?? "");
  pins["ci.yml SUPABASE_CLI"] = wfPin?.[1] ?? null;
  for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
    const m = /supabase@([\d.]+)/.exec(cmd);
    if (m) pins[`package.json ${name}`] = m[1];
  }
  const testEnv = join(ROOT, "scripts", "supabase-test-env.mjs");
  if (existsSync(testEnv)) pins["supabase-test-env.mjs"] = /supabase@([\d.]+)/.exec(readFileSync(testEnv, "utf8"))?.[1] ?? null;

  const referenced = new Set();
  for (const s of allScripts) for (const m of s.matchAll(/\b(supabase\/[\w./-]+\.sql)\b/g)) referenced.add(m[1]);

  const envFiles = [];
  for (const name of readdirSync(ROOT)) {
    if (/^\.env(\..+)?$/.test(name) && name !== ".env.example" && statSync(join(ROOT, name)).isFile()) {
      envFiles.push({ path: name, entries: envFileEntries(readFileSync(join(ROOT, name), "utf8")) });
    }
  }

  const markers = [];
  for (const file of walk(join(ROOT, "tests"), (p) => /\.(test|spec)\.(ts|tsx)$/.test(p)).concat(walk(join(ROOT, "e2e"), (p) => /\.spec\.ts$/.test(p)))) {
    markers.push(...scanTestMarkers(relative(ROOT, file), readFileSync(file, "utf8")));
  }

  const dockerVersion = tryExec("docker", ["version", "--format", "{{.Server.Version}}"]);
  const containers = dockerVersion ? listContainers() ?? [] : [];
  let ledger = null;
  try { ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8")); } catch { /* none */ }

  const supabaseCli = (workflow.env.SUPABASE_CLI ?? "npx --yes supabase@2.118.0").split(/\s+/);
  const status = withStatus && dockerVersion && containers.some((c) => c.project === config.projectId)
    ? parseStatusEnv(tryExec(supabaseCli[0], [...supabaseCli.slice(1), "status", "-o", "env"], { cwd: ROOT, timeout: 120_000 }))
    : null;

  const head = tryExec("git", ["rev-parse", "HEAD"], { cwd: ROOT });
  const porcelain = tryExec("git", ["status", "--porcelain"], { cwd: ROOT }) ?? "";

  return {
    worktree: realpathSync(ROOT),
    node: { version: process.version },
    engines: pkg.engines?.node ?? null,
    nvmrc: existsSync(join(ROOT, ".nvmrc")) ? readFileSync(join(ROOT, ".nvmrc"), "utf8").trim() : null,
    tools: {
      git: head !== null,
      npm: tryExec("npm", ["--version"]) !== null,
      curl: tryExec("curl", ["--version"]) !== null,
      dockerClient: tryExec("docker", ["--version"]) !== null,
      dockerDaemon: dockerVersion !== null,
      nodeModules: existsSync(join(ROOT, "node_modules")),
      installMatchesLock: installMatchesLock(),
    },
    supabaseCliPins: pins,
    playwright: playwrightFacts(),
    env,
    envFiles,
    supabaseLinked: existsSync(join(ROOT, "supabase", ".temp", "project-ref")),
    vercelLinked: existsSync(join(ROOT, ".vercel", "project.json")),
    config,
    status,
    containers,
    ledger,
    workflow,
    packageScripts: pkg.scripts ?? {},
    npmScriptsUsed: [...new Set(allScripts.flatMap(npmScriptsUsed))],
    referencedFiles: [...referenced].map((p) => ({ path: p, exists: existsSync(join(ROOT, p)) })),
    ciContainerNames: [...new Set(allScripts.flatMap((s) => [...s.matchAll(/\b(supabase_db_[A-Za-z0-9_-]+)/g)].map((m) => m[1])))],
    counts: {
      migrations: walk(join(ROOT, "supabase", "migrations"), (p) => p.endsWith(".sql")).length,
      pgtap: walk(join(ROOT, "supabase", "tests"), (p) => p.endsWith(".sql")).length,
    },
    testMarkers: markers,
    git: {
      head,
      dirty: porcelain.split(/\r?\n/).filter(Boolean),
      ciYmlSha256: sha256File(join(ROOT, ".github", "workflows", "ci.yml")),
      lockSha256: sha256File(join(ROOT, "package-lock.json")),
    },
  };
}
