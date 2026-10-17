import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Creates a local, N1-only CLI input. It never connects to Supabase or runs db push.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "test-results", "u02-n1-preview-package");
const allowedParent = resolve(root, "test-results") + sep;
if (!target.startsWith(allowedParent) || existsSync(target)) {
  throw new Error("U02 package target must be new and inside this worktree's test-results directory");
}

const source = join(root, "supabase", "migrations");
const changedInputs = execFileSync("git", ["diff", "--name-only", "f5afc09833eee77ab605abda3a2ec9d4a1e80a92", "--", "supabase/config.toml", "supabase/migrations"], { cwd: root, encoding: "utf8" }).trim();
if (changedInputs) throw new Error("N1 migration inputs differ from the approved Production SHA");
const all = readdirSync(source).filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
const n1 = all.filter((name) => name.slice(0, 14) <= "20261015210000");
const later = all.filter((name) => name.slice(0, 14) > "20261015210000");
if (n1.length !== 27 || n1[0] !== "20260928120000_core_9_1_tenancy.sql"
  || n1.at(-1) !== "20261015210000_s1_provider_capture_receipts.sql"
  || later.length !== 4) throw new Error("Unexpected migration inventory; review this checkout before packaging");

const config = readFileSync(join(root, "supabase", "config.toml"), "utf8");
const safeConfig = config.replace(/(\[db\.seed\]\s*(?:#.*\r?\n)*)enabled = true/, "$1enabled = false");
if (safeConfig === config) throw new Error("Could not disable seed in the isolated CLI config");
mkdirSync(join(target, "supabase", "migrations"), { recursive: true });
writeFileSync(join(target, "supabase", "config.toml"), safeConfig);

const manifest = n1.map((name) => {
  const bytes = readFileSync(join(source, name));
  copyFileSync(join(source, name), join(target, "supabase", "migrations", name));
  return { version: name.slice(0, 14), name, sha256: createHash("sha256").update(bytes).digest("hex") };
});
writeFileSync(join(target, "manifest.json"), JSON.stringify({ base: "f5afc09833eee77ab605abda3a2ec9d4a1e80a92", count: manifest.length, migrations: manifest }, null, 2) + "\n");
console.log(JSON.stringify({ package: "test-results/u02-n1-preview-package", count: manifest.length, first: manifest[0].version, last: manifest.at(-1).version, excludedLater: later.length, seedEnabled: false }));
