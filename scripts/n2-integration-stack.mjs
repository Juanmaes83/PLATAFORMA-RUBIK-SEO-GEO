// Disposable, private stack for the combined #113/#114/#115 review.
// Never resets/stops another agent's stack or adopts its fixtures.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { STACKS } from "./test-stacks.mjs";

const root = resolve(import.meta.dirname, "..");
const stack = STACKS.n2Integration;
const workdir = join(root, "test-results", "n2-integration-stack");
const target = join(workdir, "supabase");
const ports = { 54321: 60321, 54322: 60322, 54320: 60320, 54329: 60329,
  54323: 60323, 54324: 60324, 54327: 60327, 8083: 8123 };
const exclude = "postgres-meta,imgproxy,vector,logflare,supavisor,studio,realtime,storage-api,edge-runtime";

function prepare() {
  if (existsSync(workdir)) throw new Error("Refused: integration stack directory already exists; inspect ownership before retrying");
  mkdirSync(target, { recursive: true });
  for (const part of ["migrations", "tests", "fixtures", "templates", "rollbacks"]) {
    if (existsSync(join(root, "supabase", part))) cpSync(join(root, "supabase", part), join(target, part), { recursive: true });
  }
  if (existsSync(join(root, "supabase", "seed.sql"))) cpSync(join(root, "supabase", "seed.sql"), join(target, "seed.sql"));
  const config = readFileSync(join(root, "supabase", "config.toml"), "utf8")
    .replace(/^project_id\s*=.*$/m, `project_id = "${stack.projectId}"`)
    .replace(/^(\s*[a-z_]*port\s*=\s*)(\d+)(.*)$/gm, (_, before, value, after) => {
      const port = ports[Number(value)];
      if (!port) throw new Error(`Unmapped local port ${value}`);
      return `${before}${port}${after}`;
    });
  writeFileSync(join(target, "config.toml"), config);
}

function containers() {
  const result = execFileSync("docker", ["ps", "-a", "--filter", `label=com.supabase.cli.project=${stack.projectId}`,
    "--format", "{{.Names}}"], { encoding: "utf8" });
  return result.split(/\r?\n/).filter(Boolean);
}

if (process.argv[2] === "prepare" || process.argv[2] === "start") {
  if (containers().length) throw new Error("Refused: integration stack containers already exist");
  prepare();
  if (process.argv[2] === "start") {
    execFileSync(process.platform === "win32" ? "npx.cmd" : "npx",
      ["--yes", "supabase@2.118.0", "--workdir", workdir, "start", "-x", exclude],
      { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    const password = randomBytes(18).toString("hex");
    execFileSync("docker", ["exec", "-i", `supabase_db_${stack.projectId}`, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
      { input: `alter role rubik_audit_writer login password '${password}';`, encoding: "utf8" });
    writeFileSync(join(workdir, "env.ps1"), [
      `$env:SUPABASE_CLI = 'npx --yes supabase@2.118.0 --workdir test-results/n2-integration-stack'`,
      "$env:RUBIK_TEST_N2_INTEGRATION_STACK = '1'",
      `$env:RUBIK_AUDIT_DATABASE_URL = 'postgresql://rubik_audit_writer:${password}@127.0.0.1:${stack.dbPort}/postgres'`,
    ].join("\n") + "\n", { mode: 0o600 });
    console.log(`Integration stack ready at 127.0.0.1:${stack.apiPort}; source its ignored env.ps1 only in this worktree.`);
  }
} else {
  console.error("Usage: node scripts/n2-integration-stack.mjs prepare|start");
  process.exitCode = 2;
}
