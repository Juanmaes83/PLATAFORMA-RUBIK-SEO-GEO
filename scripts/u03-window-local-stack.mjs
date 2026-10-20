// Disposable 27-migration N1 stack for validating the U03 writer-window boundary.
// It never targets the shared Supabase stack or any hosted project.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORKDIR = join(ROOT, "test-results", "u03-window-local-stack");
const SUPABASE_DIR = join(WORKDIR, "supabase");
const PROJECT = "rubik-u03-window-20261020";
const CUT = 20261015210000;
const EXCLUDE = "studio,realtime,storage-api,imgproxy,mailpit,postgres-meta,edge-runtime,logflare,vector";
const PORTS = new Map([[54320, 63420], [54321, 63421], [54322, 63422], [54323, 63423],
  [54324, 63424], [54327, 63427], [54329, 63429], [8083, 8103]]);
const MARKER = join(WORKDIR, ".u03-owned-stack.json");

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
  } catch (error) {
    const code = typeof error?.status === "number" ? `EXIT_${error.status}` : "PROCESS_FAILED";
    throw new Error(code);
  }
}

function cli(args) {
  const cliArgs = ["--yes", "supabase@2.118.0", "--workdir", WORKDIR, ...args];
  if (process.platform !== "win32") return run("npx", cliArgs);
  const quotePs = value => `'${String(value).replaceAll("'", "''")}'`;
  const command = `& npx.cmd ${cliArgs.map(quotePs).join(" ")}`;
  return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command]);
}

function dockerNames() {
  return run("docker", ["ps", "-a", "--filter", `label=com.supabase.cli.project=${PROJECT}`, "--format", "{{.Names}}"])
    .split(/\r?\n/).filter(Boolean);
}

function createInput() {
  if (dockerNames().length) throw new Error("U03_LOCAL_STACK_ALREADY_EXISTS");
  if (existsSync(WORKDIR)) {
    if (!existsSync(MARKER)) throw new Error("U03_LOCAL_STACK_UNOWNED_WORKDIR");
    const marker = JSON.parse(readFileSync(MARKER, "utf8"));
    let existingConfig = existsSync(join(SUPABASE_DIR, "config.toml"))
      ? readFileSync(join(SUPABASE_DIR, "config.toml"), "utf8") : "";
    const existingMigrations = existsSync(join(SUPABASE_DIR, "migrations"))
      ? readdirSync(join(SUPABASE_DIR, "migrations")).filter(name => name.endsWith(".sql")) : [];
    if (marker.project !== PROJECT || marker.migrations !== 27 ||
        !existingConfig.includes(`project_id = "${PROJECT}"`) || existingMigrations.length !== 27)
      throw new Error("U03_LOCAL_STACK_OWNERSHIP_CHECK_FAILED");
    existingConfig = existingConfig.replace(/^(\s*[a-z_]*port\s*=\s*)643(2\d)(.*)$/gim, "$1634$2$3");
    writeFileSync(join(SUPABASE_DIR, "config.toml"), existingConfig);
    const templates = join(SUPABASE_DIR, "templates");
    if (!existsSync(templates)) cpSync(join(ROOT, "supabase", "templates"), templates, { recursive: true });
    return;
  }
  const migrationFiles = readdirSync(join(ROOT, "supabase", "migrations"))
    .filter(name => /^\d{14}_.*\.sql$/.test(name) && Number(name.slice(0, 14)) <= CUT).sort();
  if (migrationFiles.length !== 27 || Number(migrationFiles.at(-1)?.slice(0, 14)) !== CUT)
    throw new Error("U03_LOCAL_MIGRATION_SET_REJECTED");
  mkdirSync(join(SUPABASE_DIR, "migrations"), { recursive: true });
  for (const name of migrationFiles) cpSync(join(ROOT, "supabase", "migrations", name), join(SUPABASE_DIR, "migrations", name));
  cpSync(join(ROOT, "supabase", "seed.sql"), join(SUPABASE_DIR, "seed.sql"));
  cpSync(join(ROOT, "supabase", "templates"), join(SUPABASE_DIR, "templates"), { recursive: true });
  let config = readFileSync(join(ROOT, "supabase", "config.toml"), "utf8")
    .replace(/^project_id\s*=.*$/m, `project_id = "${PROJECT}"`);
  config = config.replace(/^([ \t]*[a-z_]*port[ \t]*=[ \t]*)(\d+)(.*)$/gim, (line, prefix, port, suffix) => {
    const mapped = PORTS.get(Number(port));
    return mapped ? `${prefix}${mapped}${suffix}` : line;
  });
  config = config.replace(/(\[db\.pooler\][\s\S]*?enabled\s*=\s*)false/, "$1true")
    .replace(/(\[db\.pooler\][\s\S]*?pool_mode\s*=\s*)"transaction"/, "$1\"session\"");
  if (!config.includes(`project_id = "${PROJECT}"`) || !config.includes("pool_mode = \"session\""))
    throw new Error("U03_LOCAL_CONFIG_REJECTED");
  writeFileSync(join(SUPABASE_DIR, "config.toml"), config, { flag: "wx" });
  writeFileSync(MARKER, JSON.stringify({ project: PROJECT, createdAt: new Date().toISOString(), migrations: 27, lastMigration: String(CUT) }), { flag: "wx" });
}

const command = process.argv[2];
if (command === "start") {
  createInput();
  cli(["start", "--exclude", EXCLUDE, "--yes"]);
  const names = dockerNames();
  if (!names.some(name => name === `supabase_db_${PROJECT}`)) throw new Error("U03_LOCAL_DATABASE_CONTAINER_MISSING");
  process.stdout.write("U03_LOCAL_STACK_STARTED project=rubik-u03-window-20261020 ports=63420-63429 migrations=27 pooler=session\n");
} else if (command === "inspect") {
  const marker = JSON.parse(readFileSync(MARKER, "utf8"));
  if (marker.project !== PROJECT || marker.migrations !== 27 || dockerNames().length === 0)
    throw new Error("U03_LOCAL_STACK_OWNERSHIP_CHECK_FAILED");
  const result = run("docker", ["exec", `supabase_db_${PROJECT}`, "psql", "-U", "postgres", "-d", "postgres", "-Atqc",
    "select count(*)::text || '|' || max(version)::text from supabase_migrations.schema_migrations"]);
  if (result.trim() !== `27|${CUT}`) throw new Error("U03_LOCAL_MIGRATION_PREFLIGHT_FAILED");
  process.stdout.write(`U03_LOCAL_STACK_VERIFIED migrations=27 last=${CUT} poolerMode=session\n`);
} else if (command === "stop") {
  const marker = JSON.parse(readFileSync(MARKER, "utf8"));
  const resolved = resolve(WORKDIR);
  const allowed = resolve(ROOT, "test-results") + (process.platform === "win32" ? "\\" : "/");
  if (marker.project !== PROJECT || !resolved.startsWith(allowed)) throw new Error("U03_LOCAL_STACK_CLEANUP_REFUSED");
  cli(["stop"]);
  if (dockerNames().length) throw new Error("U03_LOCAL_STACK_CONTAINERS_REMAIN");
  rmSync(WORKDIR, { recursive: true, force: false });
  process.stdout.write("U03_LOCAL_STACK_RETIRED containers=0 workdir=removed\n");
} else {
  process.stderr.write("Usage: node scripts/u03-window-local-stack.mjs start|inspect|stop\n");
  process.exitCode = 2;
}
