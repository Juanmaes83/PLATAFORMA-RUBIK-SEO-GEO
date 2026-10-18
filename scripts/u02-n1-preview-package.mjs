import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
const approvedBase = "f5afc09833eee77ab605abda3a2ec9d4a1e80a92";
const cutoff = "20261015210000";
const git = (...args) => execFileSync("git", args, { cwd: root });
const normalizedBytes = (path) => Buffer.from(readFileSync(path, "utf8").replace(/\r\n/g, "\n"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const all = readdirSync(source).filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
const n1 = all.filter((name) => name.slice(0, 14) <= cutoff);
const later = all.filter((name) => name.slice(0, 14) > cutoff);
const approvedN1 = git("ls-tree", "-r", "--name-only", approvedBase, "--", "supabase/migrations")
  .toString("utf8").trim().split(/\r?\n/).map((path) => path.replace(/^supabase\/migrations\//, ""))
  .filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name) && name.slice(0, 14) <= cutoff).sort();
if (approvedN1.length !== 27 || JSON.stringify(n1) !== JSON.stringify(approvedN1))
  throw new Error("N1 migration names differ from the 27 approved at the pinned base");

const configBytes = normalizedBytes(join(root, "supabase", "config.toml"));
if (sha256(configBytes) !== sha256(git("show", `${approvedBase}:supabase/config.toml`)))
  throw new Error("Supabase config differs from the approved base");
const config = configBytes.toString("utf8");
const safeConfig = config.replace(/(\[db\.seed\]\s*(?:#.*\r?\n)*)enabled = true/, "$1enabled = false");
if (safeConfig === config) throw new Error("Could not disable seed in the isolated CLI config");
const manifest = n1.map((name) => {
  const bytes = normalizedBytes(join(source, name));
  const approvedBytes = git("show", `${approvedBase}:supabase/migrations/${name}`);
  const digest = sha256(approvedBytes);
  if (sha256(bytes) !== digest) throw new Error(`N1 migration content differs from approved base: ${name}`);
  return { version: name.slice(0, 14), name, sha256: digest, bytes: approvedBytes };
});
const templates = ["confirmation.html", "recovery.html"].map((name) => {
  const bytes = git("show", `${approvedBase}:supabase/templates/${name}`);
  if (sha256(normalizedBytes(join(root, "supabase", "templates", name))) !== sha256(bytes))
    throw new Error(`Auth template differs from approved base: ${name}`);
  return { name, bytes };
});
mkdirSync(join(target, "supabase", "migrations"), { recursive: true });
mkdirSync(join(target, "supabase", "templates"), { recursive: true });
writeFileSync(join(target, "supabase", "config.toml"), safeConfig);
for (const { name, bytes } of manifest)
  writeFileSync(join(target, "supabase", "migrations", name), bytes);
for (const { name, bytes } of templates)
  writeFileSync(join(target, "supabase", "templates", name), bytes);
writeFileSync(join(target, "manifest.json"), JSON.stringify({ base: approvedBase, count: manifest.length,
  migrations: manifest.map(({ version, name, sha256 }) => ({ version, name, sha256 })) }, null, 2) + "\n");
console.log(JSON.stringify({ package: "test-results/u02-n1-preview-package", count: manifest.length, first: manifest[0].version, last: manifest.at(-1).version, excludedLater: later.length, seedEnabled: false }));
