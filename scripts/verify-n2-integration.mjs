// Full integration gate against the isolated LOCAL N2 stack. No password is saved or printed.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
process.env.RUBIK_TEST_N2_STACK = "1";
process.env.SUPABASE_CLI = "npx --yes supabase@2.118.0 --workdir test-results/n2-seo-stack";
const { localDatabaseContainer } = await import("./supabase-test-env.mjs");
const name = localDatabaseContainer(); // Checks API, database port and exact Docker container.
if (name !== "supabase_db_rubik-n2-seo-20261015") throw new Error("Refused: not the N2 disposable database");
const password = randomBytes(24).toString("hex");
execFileSync("docker", ["exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], {
  input: `alter role rubik_audit_writer login password '${password}';`, stdio: ["pipe", "ignore", "pipe"],
});
const dbUrl = `postgresql://rubik_audit_writer:${password}@127.0.0.1:59322/postgres`;
const e2e = process.argv[2] === "e2e";
if (process.argv[2] && !e2e && !process.argv[2].startsWith("tests/integration/")) throw new Error("Usage: node scripts/verify-n2-integration.mjs [e2e <spec>|tests/integration/<spec>] ");
const cli = e2e ? resolve(root, "node_modules", "@playwright", "test", "cli.js") : resolve(root, "node_modules", "vitest", "vitest.mjs");
const args = e2e ? ["test", ...process.argv.slice(3)] : ["run", "--config", "vitest.integration.config.mts", ...process.argv.slice(2)];
const result = spawnSync(process.execPath, [cli, ...args], {
  cwd: root, stdio: "inherit", env: { ...process.env, RUBIK_AUDIT_DATABASE_URL: dbUrl },
});
process.exit(result.status ?? 1);
