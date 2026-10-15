// Disposable stack owned by this N1-05/N1-06 worktree. Never stops or resets another stack.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { STACKS } from "./test-stacks.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const STACK = STACKS.n1Recovery;
const WORKDIR = join(ROOT, "test-results", "n1-recovery-stack");
const EXCLUDE = "postgres-meta,imgproxy,vector,logflare,supavisor,studio,realtime,storage-api,edge-runtime";
const PORTS = { 54321: 58321, 54322: 58322, 54320: 58320, 54329: 58329, 54323: 58323, 54324: 58324, 54327: 58327, 8083: 8103 };

function prepare() {
  const target = join(WORKDIR, "supabase");
  if (existsSync(join(target, "config.toml"))) {
    if (!readFileSync(join(target, "config.toml"), "utf8").includes(`project_id = "${STACK.projectId}"`))
      throw new Error("Refused: workdir belongs to another stack");
    return;
  }
  if (existsSync(WORKDIR)) throw new Error("Refused: incomplete N1 stack directory; inspect it before retrying");
  mkdirSync(target, { recursive: true });
  for (const sub of ["migrations", "tests", "fixtures", "templates", "rollbacks"]) {
    if (existsSync(join(ROOT, "supabase", sub))) cpSync(join(ROOT, "supabase", sub), join(target, sub), { recursive: true });
  }
  cpSync(join(ROOT, "supabase", "seed.sql"), join(target, "seed.sql"));
  let config = readFileSync(join(ROOT, "supabase", "config.toml"), "utf8");
  config = config.replace(/^project_id\s*=.*$/m, `project_id = "${STACK.projectId}"`);
  config = config.replace(/^(\s*[a-z_]*port\s*=\s*)(\d+)(.*)$/gm, (_, prefix, port, suffix) => {
    const mapped = PORTS[Number(port)];
    if (!mapped) throw new Error(`Unmapped port ${port}`);
    return `${prefix}${mapped}${suffix}`;
  });
  writeFileSync(join(target, "config.toml"), config);
}

function run(args) {
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["--yes", "supabase@2.118.0", "--workdir", WORKDIR, ...args],
    { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32" });
}

function containers() {
  const out = execFileSync("docker", ["ps", "-a", "--filter", `label=com.supabase.cli.project=${STACK.projectId}`, "--format", "{{.Names}}"], { encoding: "utf8" });
  return out.split(/\r?\n/).filter(Boolean);
}

if (process.argv[2] === "start") {
  if (containers().length) throw new Error("Refused: N1 stack containers already exist");
  prepare();
  run(["start", "-x", EXCLUDE]);
  const password = randomBytes(18).toString("hex");
  execFileSync("docker", ["exec", "-i", `supabase_db_${STACK.projectId}`, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: `alter role rubik_audit_writer login password '${password}';`, encoding: "utf8" });
  const lines = [
    `$env:SUPABASE_CLI = 'npx --yes supabase@2.118.0 --workdir "${WORKDIR}"'`,
    "$env:RUBIK_TEST_N1_RECOVERY_STACK = '1'",
    `$env:RUBIK_AUDIT_DATABASE_URL = 'postgresql://rubik_audit_writer:${password}@127.0.0.1:${STACK.dbPort}/postgres'`,
  ];
  writeFileSync(join(WORKDIR, "env.ps1"), lines.join("\n") + "\n", { mode: 0o600 });
  console.log(`N1 stack ready at 127.0.0.1:${STACK.apiPort}; source the ignored env.ps1 in this worktree only.`);
} else if (process.argv[2] === "prepare") {
  prepare();
} else {
  console.error("Usage: node scripts/n1-recovery-stack.mjs start|prepare");
  process.exitCode = 2;
}
