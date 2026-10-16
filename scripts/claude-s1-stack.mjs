// Claude's own disposable LOCAL Supabase stack for the S1 integration worktree.
//   node scripts/claude-s1-stack.mjs prepare   copy supabase/ into the workdir with own project_id and ports
//   node scripts/claude-s1-stack.mjs start     prepare + start + enable the local writer login (fictitious password)
//   node scripts/claude-s1-stack.mjs sync      copy migrations/tests again and apply pending migrations
//   node scripts/claude-s1-stack.mjs stop      stop and discard THIS stack only
// It never touches another project's containers (Codex S1/S2, shared) and never contacts a
// hosted project. Secrets: the writer password is random, local, written only to the ignored
// test-results/claude-s1-stack/env.sh and valid only inside this disposable container.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { STACKS } from "./test-stacks.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const STACK = STACKS.claudeS1;
export const WORKDIR = join(ROOT, "test-results", "claude-s1-stack");
const CLI = ["--yes", "supabase@2.118.0", "--workdir", WORKDIR];
const EXCLUDE = "postgres-meta,imgproxy,vector,logflare,supavisor,studio,realtime,storage-api,edge-runtime";
// Shared port → Claude port. Every published port moves, so both stacks can coexist.
const PORTS = { 54321: 57321, 54322: 57322, 54320: 57320, 54329: 57329, 54323: 57323, 54324: 57324, 54327: 57327, 8083: 8093 };

/** Rewrites project_id and every `port`/`*_port` line of config.toml. Unknown ports fail. */
export function rewriteConfig(text) {
  let projectIdSeen = false;
  const out = text.replace(/\r\n/g, "\n").split("\n").map((line) => {
    if (/^project_id\s*=/.test(line)) { projectIdSeen = true; return `project_id = "${STACK.projectId}"`; }
    const m = /^(\s*[a-z_]*port\s*=\s*)(\d+)(.*)$/.exec(line);
    if (!m) return line;
    const mapped = PORTS[Number(m[2])];
    if (!mapped) throw new Error(`config.toml: unmapped port ${m[2]}`);
    return `${m[1]}${mapped}${m[3]}`;
  });
  if (!projectIdSeen) throw new Error("config.toml: project_id missing");
  return out.join("\n");
}

function prepare() {
  const target = join(WORKDIR, "supabase");
  if (!target.startsWith(join(ROOT, "test-results") + "/")) throw new Error("Refused: workdir outside test-results");
  for (const sub of ["migrations", "tests", "fixtures", "templates", "rollbacks"]) {
    rmSync(join(target, sub), { recursive: true, force: true });
    if (existsSync(join(ROOT, "supabase", sub))) cpSync(join(ROOT, "supabase", sub), join(target, sub), { recursive: true });
  }
  mkdirSync(target, { recursive: true });
  if (existsSync(join(ROOT, "supabase", "seed.sql"))) cpSync(join(ROOT, "supabase", "seed.sql"), join(target, "seed.sql"));
  writeFileSync(join(target, "config.toml"), rewriteConfig(readFileSync(join(ROOT, "supabase", "config.toml"), "utf8")));
}

function containersOf(project) {
  const out = execFileSync("docker", ["ps", "-a", "--filter", `label=com.supabase.cli.project=${project}`, "--format", "{{.Names}}"], { encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", `supabase_db_${STACK.projectId}`, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], { input: sql, encoding: "utf8" });
}

function enableWriter() {
  // A fictitious, random local password. LOGIN exists only in this disposable stack.
  const password = randomBytes(18).toString("hex");
  psql(`alter role rubik_audit_writer login password '${password}';`);
  const env = [
    `export SUPABASE_CLI='npx --yes supabase@2.118.0 --workdir ${WORKDIR}'`,
    "export RUBIK_TEST_CLAUDE_S1_STACK=1",
    `export RUBIK_AUDIT_DATABASE_URL='postgresql://rubik_audit_writer:${password}@127.0.0.1:${STACK.dbPort}/postgres'`,
    `export S1_LOCAL_POSTGRES_ADMIN_URL='postgresql://postgres:postgres@127.0.0.1:${STACK.dbPort}/postgres'`,
  ].join("\n");
  writeFileSync(join(WORKDIR, "env.sh"), env + "\n", { mode: 0o600 });
}

function npx(args, opts = {}) {
  execFileSync("npx", [...CLI, ...args], { cwd: ROOT, stdio: "inherit", ...opts });
}

const command = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}`) {
  if (command === "prepare") prepare();
  else if (command === "start") {
    prepare();
    for (const other of Object.values(STACKS).filter((s) => s !== STACK)) {
      const clash = containersOf(other.projectId);
      if (clash.length) console.log(`Preserved (not ours): ${clash.length} container(s) of ${other.projectId}`);
    }
    if (containersOf(STACK.projectId).length) throw new Error(`Refused: ${STACK.projectId} already has containers; run stop first`);
    npx(["start", "-x", EXCLUDE]);
    enableWriter();
    console.log(`Claude S1 stack ready on 127.0.0.1:${STACK.apiPort}/${STACK.dbPort}. source ${join(WORKDIR, "env.sh")}`);
  } else if (command === "sync") {
    prepare();
    npx(["migration", "up", "--local"]);
    enableWriter();
  } else if (command === "stop") {
    npx(["stop", "--no-backup"]);
    rmSync(join(WORKDIR, "env.sh"), { force: true });
  } else {
    console.error("Usage: node scripts/claude-s1-stack.mjs prepare|start|sync|stop");
    process.exitCode = 2;
  }
}
