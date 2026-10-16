// Full integration gate against the isolated LOCAL combined N2 stack. No password is saved or printed.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const stackKey = process.env.RUBIK_N2_TEST_STACK ?? "n2Integration";
const stackConfig = stackKey === "fops2Combined"
  ? { selector: "RUBIK_TEST_FOPS2_COMBINED_STACK", projectId: "rubik-fops2-n2-combined-20261016", workdir: "test-results/fops2-combined-stack", dbPort: 63322 }
  : stackKey === "n2Audit"
  ? { selector: "RUBIK_TEST_N2_AUDIT_STACK", projectId: "rubik-n2-audit-20261016", workdir: "test-results/n2-audit-stack", dbPort: 61322 }
  : stackKey === "pr119Integration"
  ? { selector: "RUBIK_TEST_PR119_STACK", projectId: "rubik-pr119-integration-20261016", workdir: "test-results/pr119-stack", dbPort: 62322 }
  : stackKey === "n2Integration"
    ? { selector: "RUBIK_TEST_N2_INTEGRATION_STACK", projectId: "rubik-n2-integration-20261016", workdir: "test-results/n2-integration-stack", dbPort: 60322 }
    : null;
if (!stackConfig) throw new Error("Refused: RUBIK_N2_TEST_STACK must be n2Integration, n2Audit, fops2Combined or pr119Integration");
process.env[stackConfig.selector] = "1";
process.env.RUBIK_N2_SCHEMA_AVAILABLE = "true";
process.env.SUPABASE_CLI = `npx --yes supabase@2.118.0 --workdir ${stackConfig.workdir}`;
const { localDatabaseContainer } = await import("./supabase-test-env.mjs");
const name = localDatabaseContainer(); // Checks API, database port and exact Docker container.
if (name !== `supabase_db_${stackConfig.projectId}`) throw new Error("Refused: not the selected N2 test database");
const relations = execFileSync("docker", ["exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt", "-c",
  "select to_regclass('public.seo_keywords') is not null, to_regclass('public.competitors') is not null, to_regclass('public.competitor_observations') is not null;"], { encoding: "utf8" }).trim();
if (relations !== "t|t|t") throw new Error("Refused: combined N2 schema is incomplete; expected seo_keywords, competitors and competitor_observations");
const typeCommand = `npx --yes supabase@2.118.0 --workdir ${stackConfig.workdir} gen types typescript --local --schema public`;
const typegen = process.platform === "win32"
  ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", typeCommand], { cwd: root, encoding: "utf8" })
  : spawnSync("npx", ["--yes", "supabase@2.118.0", "--workdir", stackConfig.workdir, "gen", "types", "typescript", "--local", "--schema", "public"], { cwd: root, encoding: "utf8" });
if (typegen.status !== 0) throw new Error(`Refused: pinned Supabase CLI type generation failed (${typegen.status ?? typegen.error?.message ?? "unknown"})`);
const committedTypes = readFileSync(resolve(root, "src/lib/supabase/database.types.ts"), "utf8")
  .split(/\r?\n/).slice(3).join("\n").replace(/\n?$/, "\n");
const generatedTypes = typegen.stdout.replace(/\r\n/g, "\n");
if (committedTypes !== generatedTypes) {
  let at = 0;
  while (at < committedTypes.length && committedTypes[at] === generatedTypes[at]) at++;
  throw new Error(`Refused: migrations do not match committed types (expected ${committedTypes.length} chars, generated ${generatedTypes.length}; first difference at ${at})`);
}
console.log("PASS: pinned Supabase CLI 2.118.0 generated types match the committed file from line 4 (CI gate)");
const password = randomBytes(24).toString("hex");
execFileSync("docker", ["exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], {
  input: `alter role rubik_audit_writer login password '${password}';`, stdio: ["pipe", "ignore", "pipe"],
});
const dbUrl = `postgresql://rubik_audit_writer:${password}@127.0.0.1:${stackConfig.dbPort}/postgres`;
const e2e = process.argv[2] === "e2e";
if (process.argv[2] && !e2e && !process.argv[2].startsWith("tests/integration/")) throw new Error("Usage: node scripts/verify-n2-integration.mjs [e2e <spec>|tests/integration/<spec>] ");
const cli = e2e ? resolve(root, "node_modules", "@playwright", "test", "cli.js") : resolve(root, "node_modules", "vitest", "vitest.mjs");
const args = e2e ? ["test", ...process.argv.slice(3)] : ["run", "--config", "vitest.integration.config.mts", ...process.argv.slice(2)];
const result = spawnSync(process.execPath, [cli, ...args], {
  cwd: root, stdio: "inherit", env: { ...process.env, RUBIK_AUDIT_DATABASE_URL: dbUrl },
});
process.exit(result.status ?? 1);
