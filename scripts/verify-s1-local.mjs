// Manual CI substitute while hosted Actions cannot start. This runner accepts only the
// dedicated local S1 stack and never reads hosted Supabase credentials.
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { localSupabaseEnv } from "./supabase-test-env.mjs";

if (process.env.RUBIK_TEST_S1_STACK !== "1" || process.env.RUBIK_TEST_ISOLATED_STACK === "1")
  throw new Error("Select only RUBIK_TEST_S1_STACK=1");
const api = localSupabaseEnv();
if (new URL(api.apiUrl).origin !== "http://127.0.0.1:56321") throw new Error("Wrong local API");
const writer = new URL(process.env.RUBIK_AUDIT_DATABASE_URL ?? "");
if (writer.protocol !== "postgresql:" || writer.hostname !== "127.0.0.1" || writer.port !== "56322")
  throw new Error("Writer must target the isolated local S1 database");

const root = resolve(import.meta.dirname, "..");
const tests = resolve(root, "test-results", "s1-stack", "supabase", "tests");
mkdirSync(tests, { recursive: true });
for (const name of readdirSync(resolve(root, "supabase", "tests")).filter((name) => name.endsWith(".sql")))
  copyFileSync(resolve(root, "supabase", "tests", name), resolve(tests, name));

const commands = [
  ["npm", ["run", "verify"]],
  ["npm", ["run", "test:integration"]],
  ["npx", ["--yes", "supabase@2.118.0", "--workdir", "test-results/s1-stack", "test", "db"]],
  ["npm", ["run", "test:e2e"]],
];
if (process.argv.includes("--check")) {
  process.stdout.write(`S1 local stack verified; ${commands.length} suites ready.\n`);
  process.exit(0);
}
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const evidence = { head, apiOrigin: "http://127.0.0.1:56321", dbPort: 56322, startedAt: new Date().toISOString(), suites: [] };
let failed = false;
for (const [name, args] of commands) {
  process.stdout.write(`\nRunning ${name} ${args.join(" ")}\n`);
  const run = spawnSync(name, args, { cwd: root, env: process.env, stdio: "inherit", shell: process.platform === "win32" });
  const passed = !run.error && run.status === 0;
  evidence.suites.push({ command: `${name} ${args.join(" ")}`, passed, exitCode: run.status });
  if (!passed) { failed = true; break; }
}
evidence.finishedAt = new Date().toISOString();
writeFileSync(resolve(root, "test-results", "s1-local-verification.json"), JSON.stringify(evidence, null, 2));
process.exitCode = failed ? 1 : 0;
