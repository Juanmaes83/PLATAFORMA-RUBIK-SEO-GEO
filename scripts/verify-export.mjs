// Local owner tool (pilot recovery, RECUPERACION-PILOTO): re-verifies a downloaded project export
// with the owner's keyring, on the owner's machine. It reuses verifyProjectExport from the app,
// reads two local files and prints a verdict. It sends nothing, writes nothing, never prints a
// key or a key value, and never repairs or re-signs the file.
//
//   npm run verify:export -- <export.json> [--keyring <file.env>] [--json]
//
// Keyring: PROVENANCE_SIGNING_KEYS and PROVENANCE_ACTIVE_KEY_ID, read from --keyring (an env file
// kept outside the repository) or, without it, from the environment. Exit codes: 0 verified,
// 1 not verified, 2 usage or input error.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

register("./lib/app-ts-hooks.mjs", import.meta.url);

const REPO = fileURLToPath(new URL("..", import.meta.url));
const USAGE = "Uso: npm run verify:export -- <exportacion.json> [--keyring <anillo.env>] [--json]";

function fail(message) {
  console.error(message);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { file: null, keyring: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = true;
    else if (a === "--keyring") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) fail(`Falta la ruta tras --keyring.\n${USAGE}`);
      opts.keyring = argv[++i];
    } else if (a === "-h" || a === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else if (a.startsWith("--")) fail(`Opción desconocida: ${a}\n${USAGE}`);
    else if (opts.file) fail(`Solo se verifica un fichero cada vez.\n${USAGE}`);
    else opts.file = a;
  }
  if (!opts.file) fail(USAGE);
  return opts;
}

/** Refuses files tracked by Git and warns about files inside the working tree. */
function guardLocation(path, label, warnings) {
  const rel = relative(REPO, path);
  if (rel.startsWith("..") || isAbsolute(rel)) return;
  let tracked = false;
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", rel], { cwd: REPO, stdio: "ignore" });
    tracked = true;
  } catch {
    // not tracked, or git unavailable: only the warning below applies
  }
  if (tracked) fail(`${label} está versionado en Git (${rel}). Sácalo del repositorio y retíralo del historial antes de seguir.`);
  warnings.push(`${label} está dentro del repositorio (${rel}). Guárdalo fuera para no subirlo por error.`);
}

function readKeyringEnv(path) {
  if (!path) return { PROVENANCE_SIGNING_KEYS: process.env.PROVENANCE_SIGNING_KEYS, PROVENANCE_ACTIVE_KEY_ID: process.env.PROVENANCE_ACTIVE_KEY_ID };
  let text;
  try { text = readFileSync(path, "utf8"); } catch { fail("No se puede leer el fichero del anillo."); }
  let env;
  try { env = parseEnv(text); } catch { fail("El fichero del anillo no tiene formato de variables de entorno."); }
  return { PROVENANCE_SIGNING_KEYS: env.PROVENANCE_SIGNING_KEYS, PROVENANCE_ACTIVE_KEY_ID: env.PROVENANCE_ACTIVE_KEY_ID };
}

function googleSummary(doc) {
  const g = doc?.operations?.google;
  if (!g) return { present: false, note: "sin operations.google (exportación anterior a 20261012130000 o v1)" };
  if (g.ok === false) return { present: false, note: `operations.google no disponible (${String(g.error).slice(0, 40)})` };
  const v = g.value ?? {};
  const n = (k) => (Array.isArray(v[k]) ? v[k].length : 0);
  return { present: true, connections: n("connections"), bindings: n("bindings"), captures: n("captures") };
}

const opts = parseArgs(process.argv.slice(2));
const warnings = [];
const exportPath = resolve(opts.file);
guardLocation(exportPath, "La exportación", warnings);
if (opts.keyring) guardLocation(resolve(opts.keyring), "El fichero del anillo", warnings);

const { loadKeyring } = await import("../src/lib/provenance/keyring.ts");
const { verifyProjectExport } = await import("../src/lib/recovery/verify-export.ts");

const loaded = loadKeyring(readKeyringEnv(opts.keyring ? resolve(opts.keyring) : null));
if (!loaded.ok) fail(`Anillo no válido: ${loaded.error}. Revisa PROVENANCE_SIGNING_KEYS y PROVENANCE_ACTIVE_KEY_ID (no se muestran valores).`);

let doc;
try { doc = JSON.parse(readFileSync(exportPath, "utf8")); } catch { fail("No se puede leer la exportación como JSON."); }

const check = verifyProjectExport(doc, loaded.keyring);
if (!check.ok) {
  if (opts.json) console.log(JSON.stringify({ verified: false, error: check.error, warnings }));
  else console.error(`No es una exportación verificable: ${check.error}`);
  process.exit(2);
}

const verified = check.audit.valid && check.results.failed.length === 0 && check.mismatches.length === 0;
const report = {
  verified,
  format: check.format,
  project: check.project,
  keyring: { keys: loaded.keyring.keyIds.length, activeKeyId: loaded.keyring.activeKeyId },
  audit: check.audit,
  results: check.results,
  mismatches: check.mismatches,
  google: googleSummary(doc),
  warnings,
};

if (opts.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const a = check.audit;
  const lines = [
    `Formato: ${check.format}`,
    `Proyecto: ${check.project.projectId} (organización ${check.project.organizationId})`,
    `Anillo: ${report.keyring.keys} clave(s), activa «${report.keyring.activeKeyId}»`,
    a.valid ? `Auditoría: válida, ${a.length} evento(s)` : `Auditoría: ROTA en la posición ${a.brokenAt} (${a.reason})`,
    `Resultados firmados: ${check.results.verified}/${check.results.total} verificados`,
    ...check.results.failed.map((f) => `  - results[${f.index}]: ${f.reason ?? "sin motivo"}`),
    check.mismatches.length ? `Verificación escrita que no coincide con la recalculada: ${check.mismatches.join(", ")}` : "La verificación escrita coincide con la recalculada",
    report.google.present
      ? `Estado Google (informativo, sin firma): ${report.google.connections} conexión(es), ${report.google.bindings} asociación(es), ${report.google.captures} captura(s)`
      : `Estado Google: ${report.google.note}`,
    ...warnings.map((w) => `Aviso: ${w}`),
    verified ? "RESULTADO: VERIFICADA" : "RESULTADO: NO VERIFICADA",
  ];
  console.log(lines.join("\n"));
}
process.exit(verified ? 0 : 1);
