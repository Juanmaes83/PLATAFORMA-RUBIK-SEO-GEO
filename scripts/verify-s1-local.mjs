// Manual CI substitute while hosted Actions cannot start. This runner accepts only the
// dedicated local S1 stack and never reads hosted Supabase credentials.
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { localSupabaseEnv } from "./supabase-test-env.mjs";
import { STACKS, selectedStack } from "./test-stacks.mjs";

// Codex's S1 stack (test-results/s1-stack) or Claude's (test-results/claude-s1-stack); each
// agent uses only its own. selectedStack() refuses more than one selector.
const stack = selectedStack();
const workdirs = { [STACKS.s1.projectId]: "s1-stack", [STACKS.claudeS1.projectId]: "claude-s1-stack" };
const workdir = workdirs[stack.projectId];
if (!workdir) throw new Error("Select RUBIK_TEST_S1_STACK=1 or RUBIK_TEST_CLAUDE_S1_STACK=1");
const api = localSupabaseEnv();
if (new URL(api.apiUrl).origin !== `http://127.0.0.1:${stack.apiPort}`) throw new Error("Wrong local API");
const writer = new URL(process.env.RUBIK_AUDIT_DATABASE_URL ?? "");
if (writer.protocol !== "postgresql:" || writer.hostname !== "127.0.0.1" || writer.port !== String(stack.dbPort))
  throw new Error("Writer must target the selected isolated local S1 database");

const root = resolve(import.meta.dirname, "..");
const tests = resolve(root, "test-results", workdir, "supabase", "tests");
mkdirSync(tests, { recursive: true });
for (const name of readdirSync(resolve(root, "supabase", "tests")).filter((name) => name.endsWith(".sql")))
  copyFileSync(resolve(root, "supabase", "tests", name), resolve(tests, name));

const commands = [
  ["npm", ["run", "verify"]],
  ["npm", ["run", "test:integration"]],
  ["npx", ["--yes", "supabase@2.118.0", "--workdir", `test-results/${workdir}`, "test", "db"]],
  ["npm", ["run", "test:e2e"]],
];
if (process.argv.includes("--check")) {
  process.stdout.write(`S1 local stack verified; ${commands.length} suites ready.\n`);
  process.exit(0);
}
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
const evidence = { head, dirty, apiOrigin: `http://127.0.0.1:${stack.apiPort}`, dbPort: stack.dbPort, startedAt: new Date().toISOString(), suites: [] };
let failed = false;
for (const [name, args] of commands) {
  process.stdout.write(`\nRunning ${name} ${args.join(" ")}\n`);
  const childEnv = { ...process.env };
  // Static unit tests exercise all three stack selectors; the S1 selection is only
  // passed to suites that actually connect to the isolated database.
  if (args[1] === "verify") {
    delete childEnv.SUPABASE_CLI;
    delete childEnv.RUBIK_TEST_S1_STACK;
    delete childEnv.RUBIK_TEST_CLAUDE_S1_STACK;
    delete childEnv.RUBIK_AUDIT_DATABASE_URL;
  }
  const run = spawnSync(name, args, { cwd: root, env: childEnv, stdio: "inherit", shell: process.platform === "win32" });
  const passed = !run.error && run.status === 0;
  evidence.suites.push({ command: `${name} ${args.join(" ")}`, passed, exitCode: run.status });
  if (!passed) { failed = true; break; }
}
evidence.finishedAt = new Date().toISOString();
writeFileSync(resolve(root, "test-results", "s1-local-verification.json"), JSON.stringify(evidence, null, 2));
process.exitCode = failed ? 1 : 0;
