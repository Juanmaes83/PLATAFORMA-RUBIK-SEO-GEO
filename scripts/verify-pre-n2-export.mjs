// Creates and stops only this script's disposable, pre-N2 Supabase stack. It never touches
// the historical S1/S2/N1/N2 stacks or prints local credentials.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = resolve(root, "test-results", "n2-legacy-route-stack");
const projectId = "rubik-n2-legacy-route-20261016";
const dbPort = 62322;
if (!target.startsWith(resolve(root, "test-results") + sep)) throw new Error("Refused: target outside test-results");
if (!existsSync(join(target, "supabase", "config.toml"))) {
  if (existsSync(target)) throw new Error("Refused: incomplete legacy stack workdir");
  const supabase = join(target, "supabase");
  mkdirSync(join(supabase, "migrations"), { recursive: true });
  for (const name of readdirSync(join(root, "supabase", "migrations"))) {
    if (name <= "20261015210000_s1_provider_capture_receipts.sql")
      cpSync(join(root, "supabase", "migrations", name), join(supabase, "migrations", name));
  }
  const ports = new Map([[54321, 62321], [54322, dbPort], [54320, 62320], [54329, 62329],
    [54323, 62323], [54324, 62324], [54327, 62327], [8083, 8413]]);
  const config = readFileSync(join(root, "supabase", "config.toml"), "utf8")
    .replace(/^project_id\s*=.*$/m, `project_id = "${projectId}"`)
    .replace(/^(\s*[a-z_]*port\s*=\s*)(\d+)(.*)$/gm, (line, prefix, port, suffix) => {
      const mapped = ports.get(Number(port));
      if (!mapped) throw new Error(`Refused: unmapped port ${port}`);
      return `${prefix}${mapped}${suffix}`;
    });
  writeFileSync(join(supabase, "config.toml"), config);
  cpSync(join(root, "supabase", "seed.sql"), join(supabase, "seed.sql"));
}
if (!readFileSync(join(target, "supabase", "config.toml"), "utf8").includes(`project_id = "${projectId}"`))
  throw new Error("Refused: stack identity differs");
for (const part of ["templates", "fixtures"]) {
  const source = join(root, "supabase", part), destination = join(target, "supabase", part);
  if (existsSync(source) && !existsSync(destination)) cpSync(source, destination, { recursive: true });
}
const cli = (args) => {
  const command = `npx --yes supabase@2.118.0 --workdir test-results/n2-legacy-route-stack ${args.join(" ")}`;
  const result = process.platform === "win32"
    ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command], { cwd: root, encoding: "utf8" })
    : spawnSync("npx", ["--yes", "supabase@2.118.0", "--workdir", target, ...args], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    const detail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`
      .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[local-key]")
      .replace(/(SECRET_KEY|PUBLISHABLE_KEY|ANON_KEY|SERVICE_ROLE_KEY)=[^\s]+/g, "$1=[local-key]");
    throw new Error(`Local Supabase ${args[0]} failed: ${detail.trim().slice(-1000)}`);
  }
};
const name = `supabase_db_${projectId}`;
const existing = execFileSync("docker", ["ps", "-a", "--filter", `label=com.supabase.cli.project=${projectId}`,
  "--format", "{{.Names}}"], { encoding: "utf8" }).trim();
if (existing) throw new Error("Refused: legacy test stack already has containers");
let started = false;
try {
  cli(["start", "-x", "postgres-meta,imgproxy,vector,logflare,supavisor,studio,realtime,storage-api,edge-runtime"]);
  started = true;
  const port = execFileSync("docker", ["port", name, "5432/tcp"], { encoding: "utf8" }).trim();
  if (!port.endsWith(`:${dbPort}`)) throw new Error("Refused: legacy database port mismatch");
  const absent = execFileSync("docker", ["exec", "-i", name, "psql", "-U", "postgres", "-qAt", "-c",
    "select to_regclass('public.seo_keywords') is null, to_regclass('public.competitors') is null, to_regclass('public.competitor_observations') is null;"],
  { encoding: "utf8" }).trim();
  if (absent !== "t|t|t") throw new Error("Refused: legacy fixture contains N2 tables");
  const password = randomBytes(24).toString("hex");
  execFileSync("docker", ["exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"],
    { input: `alter role rubik_audit_writer login password '${password}';`, stdio: ["pipe", "ignore", "pipe"] });
  const run = spawnSync(process.execPath, [join(root, "node_modules", "vitest", "vitest.mjs"), "run", "tests/export-route-contract.test.ts"],
    { cwd: root, stdio: "inherit", env: { ...process.env, RUBIK_TEST_N2_LEGACY_STACK: "1",
      RUBIK_AUDIT_DATABASE_URL: `postgresql://rubik_audit_writer:${password}@127.0.0.1:${dbPort}/postgres` } });
  if (run.status !== 0) process.exitCode = run.status ?? 1;
} finally {
  if (started) cli(["stop"]);
}
