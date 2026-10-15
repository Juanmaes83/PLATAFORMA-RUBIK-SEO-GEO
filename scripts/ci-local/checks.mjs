// N1-04 · Diagnósticos puros del procedimiento local equivalente a CI. Reciben hechos ya
// recogidos (facts.mjs) y devuelven hallazgos; no ejecutan comandos, no leen la red y nunca
// incluyen valores de variables en los mensajes (solo nombres y la clase de destino).
//
// Categorías (mandato N1-04 §2): 1 dependencias, 2 versiones, 3 Supabase alojado,
// 4 API/DB local incoherentes, 5 contenedores de otro worktree, 6 configuración incompleta,
// 7 pruebas omitidas, 8 build/tipado, 9 evidencia ligada al SHA, 10 operaciones destructivas.

export const CATEGORY = {
  DEPENDENCIES: 1,
  VERSIONS: 2,
  HOSTED: 3,
  STACK_MISMATCH: 4,
  FOREIGN_STACK: 5,
  CONFIG: 6,
  SKIPPED: 7,
  BUILD: 8,
  EVIDENCE: 9,
  DESTRUCTIVE: 10,
};

const finding = (category, level, code, message) => ({ category, level, code, message });

/** True only for loopback hosts. Anything else (including unparsable values) is not local. */
export function isLoopbackHost(host) {
  const h = String(host ?? "").toLowerCase().replace(/^\[|\]$/g, "");
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

/** Classifies a value as a URL destination without exposing it. */
export function destinationOf(value) {
  const v = String(value ?? "").trim();
  if (!v) return "empty";
  let url;
  try {
    url = new URL(v);
  } catch {
    return "not-a-url";
  }
  if (isLoopbackHost(url.hostname)) return "local";
  if (/\.supabase\.(co|com|in|net)$/i.test(url.hostname) || /pooler\.supabase/i.test(url.hostname)) return "hosted-supabase";
  return "remote";
}

// Variable names whose value can point the app, the CLI or the tests at a database or project.
const DESTINATION_NAMES = /^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL|API_URL|DB_URL|DATABASE_URL|POSTGRES_URL[A-Z_]*|SUPABASE_DB_URL|RUBIK_AUDIT_DATABASE_URL|[A-Z_]*_DATABASE_URL)$/;
const HOSTED_CREDENTIAL_NAMES = /^(SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|VERCEL_TOKEN|VERCEL_OIDC_TOKEN)$/;

/** 1 · Local tools needed by the CI jobs. */
export function checkDependencies(f) {
  const out = [];
  if (!f.tools?.git) out.push(finding(1, "error", "DEP_GIT", "git no está disponible."));
  if (!f.tools?.npm) out.push(finding(1, "error", "DEP_NPM", "npm no está disponible."));
  if (!f.tools?.dockerClient) out.push(finding(1, "error", "DEP_DOCKER", "Docker no está instalado: el job e2e (Supabase local) no se puede reproducir."));
  else if (!f.tools?.dockerDaemon) out.push(finding(1, "error", "DEP_DOCKER_DAEMON", "El daemon de Docker no responde: el job e2e no se puede reproducir."));
  if (!f.tools?.nodeModules) out.push(finding(1, "warn", "DEP_NODE_MODULES", "node_modules no existe; el paso Install (npm ci) lo creará."));
  else if (f.tools?.installMatchesLock === false) out.push(finding(1, "warn", "DEP_STALE_INSTALL", "node_modules no coincide con package-lock.json; el paso Install (npm ci) lo reinstalará."));
  if (f.tools?.curl === false) out.push(finding(1, "error", "DEP_CURL", "curl no está disponible: los smoke tests de CI lo usan."));
  return out;
}

function major(version) {
  return Number(String(version ?? "").replace(/^v/, "").split(".")[0]);
}

function satisfiesMin(version, range) {
  const m = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(String(range ?? "").trim());
  if (!m) return null;
  const v = String(version).replace(/^v/, "").split(".").map(Number);
  const r = m.slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (v[i] !== r[i]) return v[i] > r[i];
  return true;
}

/** 2 · Versions: Node against the CI matrix and engines, pinned Supabase CLI, Playwright browser. */
export function checkVersions(f) {
  const out = [];
  const nodeMajor = String(major(f.node?.version));
  const matrix = f.workflow?.jobs?.verify?.matrix?.node ?? [];
  if (matrix.length && !matrix.includes(nodeMajor)) {
    out.push(finding(2, "error", "VER_NODE_MATRIX", `Node ${f.node?.version} no pertenece a la matriz de CI (${matrix.join(", ")}).`));
  }
  const missingLegs = matrix.filter((m) => m !== nodeMajor);
  if (missingLegs.length) {
    out.push(finding(2, "warn", "VER_NODE_LEGS", `Con un solo Node local, las patas ${missingLegs.join(", ")} de la matriz verify NO se reproducen; repetir con esas versiones.`));
  }
  const ok = satisfiesMin(f.node?.version ?? "0.0.0", f.engines);
  if (ok === false) out.push(finding(2, "error", "VER_ENGINES", `Node ${f.node?.version} no cumple engines ${f.engines}.`));
  if (f.nvmrc && String(f.nvmrc).trim() !== nodeMajor) {
    out.push(finding(2, "warn", "VER_NVMRC", `.nvmrc pide Node ${String(f.nvmrc).trim()} y el job e2e usa Node 22; el local es ${f.node?.version}.`));
  }
  const pins = f.supabaseCliPins ?? {};
  const distinct = [...new Set(Object.values(pins).filter(Boolean))];
  if (distinct.length > 1) {
    out.push(finding(2, "error", "VER_SUPABASE_CLI", `Versiones distintas de Supabase CLI: ${Object.entries(pins).map(([k, v]) => `${k}=${v}`).join(", ")}.`));
  } else if (!distinct.length) {
    out.push(finding(2, "error", "VER_SUPABASE_CLI_MISSING", "No se encontró la versión fijada de Supabase CLI en ci.yml/package.json."));
  }
  const pw = f.playwright ?? {};
  if (pw.expectedRevision && !(pw.availableRevisions ?? []).includes(pw.expectedRevision)) {
    out.push(finding(2, "warn", "VER_PLAYWRIGHT_BROWSER", `Playwright espera Chromium rev. ${pw.expectedRevision}; disponibles: ${(pw.availableRevisions ?? []).join(", ") || "ninguna"}. CI lo instala; en local es una desviación a registrar.`));
  }
  return out;
}

/** 3 · Accidental hosted Supabase: process environment, .env files Next.js would load, CLI link. */
export function checkHosted(f) {
  const out = [];
  for (const [name, value] of Object.entries(f.env ?? {})) {
    if (DESTINATION_NAMES.test(name)) {
      const dest = destinationOf(value);
      if (dest === "hosted-supabase" || dest === "remote") {
        out.push(finding(3, "error", "HOSTED_ENV", `${name} apunta a un destino no local (${dest}). Las pruebas solo usan el stack local.`));
      }
    }
    if (name === "PGHOST" && value && !isLoopbackHost(value)) out.push(finding(3, "error", "HOSTED_PGHOST", "PGHOST apunta a un host no local."));
    if (HOSTED_CREDENTIAL_NAMES.test(name) && String(value ?? "").trim()) {
      out.push(finding(3, "error", "HOSTED_CREDENTIAL", `${name} está definida en el entorno: el procedimiento local no necesita credenciales alojadas; quitarla antes de ejecutar.`));
    }
  }
  if ((f.env?.VERCEL_ENV ?? "").trim() || (f.env?.VERCEL ?? "").trim()) {
    out.push(finding(3, "error", "HOSTED_VERCEL_ENV", "VERCEL/VERCEL_ENV definidas: el procedimiento local reproduce CI, no un entorno de Vercel."));
  }
  for (const file of f.envFiles ?? []) {
    const hosted = file.entries.filter((e) => e.destination === "hosted-supabase" || e.destination === "remote");
    if (hosted.length) {
      out.push(finding(3, "error", "HOSTED_ENV_FILE", `${file.path} define ${hosted.map((e) => e.name).join(", ")} con destino no local; Next.js lo cargaría en build/start/dev.`));
    } else {
      out.push(finding(6, "warn", "CONFIG_ENV_FILE", `${file.path} existe: CI no tiene archivos .env y Next.js lo cargaría (${file.entries.map((e) => e.name).join(", ") || "sin variables"}).`));
    }
  }
  if (f.supabaseLinked) out.push(finding(3, "error", "HOSTED_CLI_LINK", "supabase/.temp/project-ref existe: el CLI está vinculado a un proyecto alojado en este worktree."));
  if (f.vercelLinked) out.push(finding(3, "warn", "HOSTED_VERCEL_LINK", ".vercel/project.json existe: el worktree está vinculado a Vercel; no ejecutar comandos Vercel desde aquí."));
  return out;
}

/** 4 · `supabase status` must describe the stack in config.toml: same ports, loopback, same container. */
export function checkStackConsistency(f) {
  const out = [];
  const status = f.status;
  if (!status) return out;
  const cfg = f.config ?? {};
  let api;
  let db;
  try {
    api = new URL(status.API_URL ?? "");
    db = new URL(status.DB_URL ?? "");
  } catch {
    return [finding(4, "error", "STACK_STATUS_UNPARSABLE", "supabase status no devolvió API_URL/DB_URL válidas.")];
  }
  if (!isLoopbackHost(api.hostname) || !isLoopbackHost(db.hostname)) {
    out.push(finding(4, "error", "STACK_NOT_LOCAL", "supabase status describe un destino no local."));
  }
  if (Number(api.port) !== Number(cfg.apiPort)) out.push(finding(4, "error", "STACK_API_PORT", `API local en ${api.port}, config.toml declara ${cfg.apiPort}.`));
  if (Number(db.port) !== Number(cfg.dbPort)) out.push(finding(4, "error", "STACK_DB_PORT", `DB local en ${db.port}, config.toml declara ${cfg.dbPort}.`));
  const dbContainer = (f.containers ?? []).find((c) => c.name === `supabase_db_${cfg.projectId}`);
  if (dbContainer && !dbContainer.ports.some((p) => Number(p.host) === Number(db.port))) {
    out.push(finding(4, "error", "STACK_CONTAINER_PORT", `El contenedor supabase_db_${cfg.projectId} no publica el puerto ${db.port} que informa la API.`));
  }
  if (f.ciContainerNames?.length) {
    for (const name of f.ciContainerNames) {
      if (name !== `supabase_db_${cfg.projectId}`) out.push(finding(6, "error", "CONFIG_CI_CONTAINER", `ci.yml usa ${name}, pero config.toml define project_id ${cfg.projectId}.`));
    }
  }
  return out;
}

/**
 * 5 · Ownership. A stack is "owned" only when every container of this project_id is listed in
 * this worktree's ledger. Containers of other projects are someone else's (other worktree).
 */
export function stackOwnership(f) {
  const cfg = f.config ?? {};
  const mine = (f.containers ?? []).filter((c) => c.project === cfg.projectId);
  const others = (f.containers ?? []).filter((c) => c.project && c.project !== cfg.projectId);
  const ledger = f.ledger;
  const ledgerOk = ledger && ledger.worktree === f.worktree && ledger.projectId === cfg.projectId;
  const unknown = mine.filter((c) => !ledgerOk || !ledger.containerIds.includes(c.id));
  let state;
  if (!mine.length) state = "absent";
  else if (unknown.length) state = "foreign";
  else state = "owned";
  return { state, mine, others, unknown };
}

export function checkForeignStacks(f) {
  const out = [];
  const own = stackOwnership(f);
  if (own.state === "foreign") {
    out.push(finding(5, "error", "FOREIGN_SAME_PROJECT", `Hay ${own.unknown.length} contenedor(es) del proyecto ${f.config?.projectId} que este worktree no creó (${own.unknown.map((c) => c.name).join(", ")}). No usar, limpiar ni detener: pertenecen a otro worktree o sesión.`));
  }
  const ourPorts = new Set([f.config?.apiPort, f.config?.dbPort, f.config?.shadowPort, f.config?.poolerPort].filter(Boolean).map(Number));
  for (const c of own.others) {
    const clash = c.ports.filter((p) => ourPorts.has(Number(p.host)));
    out.push(finding(5, clash.length ? "error" : "info", clash.length ? "FOREIGN_PORT_CLASH" : "FOREIGN_OTHER_PROJECT",
      clash.length
        ? `${c.name} (proyecto ${c.project}) ocupa puertos de este stack (${clash.map((p) => p.host).join(", ")}).`
        : `${c.name} pertenece al proyecto ${c.project}; se preserva y no se toca.`));
  }
  return out;
}

/** 6 · Configuration the CI jobs rely on. */
export function checkConfig(f) {
  const out = [];
  const cfg = f.config ?? {};
  for (const [key, label] of [["projectId", "project_id"], ["apiPort", "[api].port"], ["dbPort", "[db].port"]]) {
    if (!cfg[key]) out.push(finding(6, "error", "CONFIG_SUPABASE", `supabase/config.toml no define ${label}.`));
  }
  const wfEnv = f.workflow?.env ?? {};
  for (const name of ["SUPABASE_CLI", "SUPABASE_EXCLUDE", "NEXT_TELEMETRY_DISABLED"]) {
    if (!wfEnv[name]) out.push(finding(6, "error", "CONFIG_WORKFLOW_ENV", `ci.yml no define ${name}.`));
  }
  for (const s of f.npmScriptsUsed ?? []) {
    if (!(f.packageScripts ?? {})[s]) out.push(finding(6, "error", "CONFIG_NPM_SCRIPT", `ci.yml ejecuta "npm run ${s}", que no existe en package.json.`));
  }
  for (const p of f.referencedFiles ?? []) {
    if (!p.exists) out.push(finding(6, "error", "CONFIG_REFERENCED_FILE", `ci.yml usa ${p.path}, que no existe.`));
  }
  if (!f.counts?.migrations) out.push(finding(6, "error", "CONFIG_MIGRATIONS", "supabase/migrations está vacío."));
  if (!f.counts?.pgtap) out.push(finding(6, "error", "CONFIG_PGTAP", "supabase/tests no contiene pruebas pgTAP."));
  const perms = f.workflow?.permissions ?? {};
  for (const [scope, level] of Object.entries(perms)) {
    if (level !== "read" && level !== "none") out.push(finding(6, "error", "CONFIG_PERMISSIONS", `ci.yml concede ${scope}: ${level}; CI debe ser de solo lectura.`));
  }
  if (!Object.keys(perms).length) out.push(finding(6, "error", "CONFIG_PERMISSIONS_DEFAULT", "ci.yml no fija permissions: GITHUB_TOKEN tendría los permisos por defecto del repositorio."));
  if ((f.workflow?.triggers ?? []).includes("pull_request_target")) {
    out.push(finding(6, "error", "CONFIG_PR_TARGET", "pull_request_target ejecutaría código de forks con permisos del repositorio."));
  }
  return out;
}

/** 7 · Static markers that hide tests. `.only` silently drops every other test. */
export function checkTestMarkers(markers) {
  const out = [];
  for (const m of markers ?? []) {
    if (m.kind === "only") out.push(finding(7, "error", "SKIP_ONLY", `${m.file}:${m.line} usa .only: el resto de pruebas no se ejecuta.`));
    else if (m.kind === "viewport-dedupe") continue;
    else out.push(finding(7, "warn", "SKIP_MARKER", `${m.file}:${m.line} usa ${m.kind}: esas pruebas cuentan como omitidas, nunca como PASS.`));
  }
  const dedupe = (markers ?? []).filter((m) => m.kind === "viewport-dedupe").length;
  if (dedupe) out.push(finding(7, "info", "SKIP_VIEWPORT_DEDUPE", `${dedupe} omisiones condicionales por viewport en e2e (se ejecutan solo en escritorio-1280); aparecen como SKIP y no cuentan como PASS.`));
  return out;
}

/**
 * Blanks string/template literal contents and comments, keeping line structure, so markers
 * quoted in fixtures or prose never count and real ones always do.
 */
export function codeOnly(text) {
  let out = "";
  let state = "code";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "\n") { if (state === "line") state = "code"; out += c; continue; }
    if (state === "code") {
      if (c === "/" && next === "/") { state = "line"; out += "  "; i++; continue; }
      if (c === "/" && next === "*") { state = "block"; out += "  "; i++; continue; }
      if (c === "'" || c === '"' || c === "`") { state = c; out += c; continue; }
      if (c === "/" && /(^|[(,=:[!&|?{};+\-*%<>~^]|\breturn|\btypeof)\s*$/.test(out.slice(-40))) { state = "regex"; out += c; continue; }
      out += c;
      continue;
    }
    if (state === "regex" || state === "class") {
      if (c === "\\") { out += "  "; i++; continue; }
      if (state === "regex" && c === "[") { state = "class"; out += " "; continue; }
      if (state === "class" && c === "]") { state = "regex"; out += " "; continue; }
      if (state === "regex" && c === "/") { state = "code"; out += c; continue; }
      out += " ";
      continue;
    }
    if (state === "line") { out += " "; continue; }
    if (state === "block") {
      if (c === "*" && next === "/") { state = "code"; out += "  "; i++; } else out += " ";
      continue;
    }
    // Inside a literal: keep escapes inside, close on the matching quote.
    if (c === "\\") { out += "  "; i++; continue; }
    if (c === state) { state = "code"; out += c; continue; }
    out += " ";
  }
  return out;
}

/** Finds skip/only/todo/fixme markers in test sources (code positions only). */
export function scanTestMarkers(file, text) {
  const markers = [];
  const raw = text.split(/\r?\n/);
  const at = (name) => new RegExp(`(^|[^\\w.$])(it|test|describe)\\.${name}\\s*\\(`);
  codeOnly(text).split(/\r?\n/).forEach((line, i) => {
    const kind = at("only").test(line) ? "only"
      : at("(skip|todo|fixme)").test(line) ? line.match(/\.(skip|todo|fixme)\b/)[0]
      : at("(skipIf|runIf)").test(line) ? line.match(/\.(skipIf|runIf)/)[0]
      : null;
    if (!kind) return;
    // Playwright projects: tests that change data run once, on the desktop project.
    const dedupe = kind === ".skip" && /test\.skip\s*\(\s*info\.project\.name\s*!==\s*["']escritorio-1280["']/.test(raw[i]);
    markers.push({ file, line: i + 1, kind: dedupe ? "viewport-dedupe" : kind });
  });
  return markers;
}

/** 7/8 · Reads the summary lines of the tools CI runs. Missing summaries are reported, never assumed. */
export function summarizeLog(log) {
  const text = String(log ?? "").replace(/\x1b\[[0-9;]*m/g, "");
  const summary = {};
  const vitest = /^\s*Tests\s+(.+)$/m.exec(text);
  if (vitest) {
    summary.vitest = {};
    for (const m of vitest[1].matchAll(/(\d+)\s+(passed|failed|skipped|todo)/g)) summary.vitest[m[2]] = Number(m[1]);
  }
  const pwPassed = /^\s*(\d+)\s+passed\b/m.exec(text);
  const pwSkipped = /^\s*(\d+)\s+skipped\b/m.exec(text);
  const pwFailed = /^\s*(\d+)\s+failed\b/m.exec(text);
  const pwFlaky = /^\s*(\d+)\s+flaky\b/m.exec(text);
  if (!vitest && (pwPassed || pwFailed)) {
    summary.playwright = { passed: Number(pwPassed?.[1] ?? 0), skipped: Number(pwSkipped?.[1] ?? 0), failed: Number(pwFailed?.[1] ?? 0), flaky: Number(pwFlaky?.[1] ?? 0) };
  }
  // A step may run pgTAP several times (ci.yml expects the open Studio state to FAIL first):
  // every run is kept, and the step result is the last one.
  const taps = [...text.matchAll(/^Files=(\d+),\s+Tests=(\d+)[\s\S]*?^Result:\s+(PASS|FAIL)/gm)];
  if (taps.length) {
    const runs = taps.map((m) => ({ result: m[3], files: Number(m[1]), tests: Number(m[2]) }));
    summary.pgtap = { ...runs.at(-1), ...(runs.length > 1 ? { runs } : {}) };
  }
  const tsErrors = text.match(/error TS\d+:/g);
  if (tsErrors) summary.typescript = { errors: tsErrors.length };
  if (/Failed to compile|Build error occurred|Type error:/.test(text)) summary.build = { failed: true };
  return summary;
}

/** 7/8 · Turns a step result into findings: failures, skips that must not count as PASS. */
export function checkStepResult(step) {
  const out = [];
  const s = step.summary ?? {};
  if (step.status === "failed") out.push(finding(step.category ?? 8, "error", "STEP_FAILED", `Paso "${step.label}" falló (código ${step.exitCode}).`));
  if (s.typescript?.errors) out.push(finding(8, "error", "BUILD_TYPES", `"${step.label}": ${s.typescript.errors} error(es) de TypeScript.`));
  if (s.build?.failed) out.push(finding(8, "error", "BUILD_FAILED", `"${step.label}": el build de Next.js falló.`));
  const skipped = (s.vitest?.skipped ?? 0) + (s.vitest?.todo ?? 0) + (s.playwright?.skipped ?? 0);
  if (skipped) out.push(finding(7, "warn", "SKIP_RUNTIME", `"${step.label}": ${skipped} prueba(s) omitidas; no cuentan como PASS.`));
  if (s.playwright?.flaky) out.push(finding(7, "warn", "SKIP_FLAKY", `"${step.label}": ${s.playwright.flaky} prueba(s) inestables.`));
  if (step.expectsSummary && step.status === "passed" && !Object.keys(s).length) {
    out.push(finding(7, "error", "SKIP_NO_SUMMARY", `"${step.label}" terminó sin resumen de pruebas: no se puede afirmar que se ejecutaron.`));
  }
  if (step.status === "skipped") out.push(finding(7, "warn", "STEP_NOT_RUN", `Paso "${step.label}" NO ejecutado: ${step.reason}.`));
  return out;
}

/** 9 · Evidence must name the commit it proves, a clean tree, and the exact CI definition. */
export function verifyEvidence(evidence, current) {
  const out = [];
  if (!evidence || typeof evidence !== "object") return [finding(9, "error", "EVIDENCE_MISSING", "No hay evidencia que verificar.")];
  if (!/^[0-9a-f]{40}$/.test(evidence.head ?? "")) out.push(finding(9, "error", "EVIDENCE_NO_SHA", "La evidencia no registra un SHA completo."));
  else if (current?.head && evidence.head !== current.head) {
    out.push(finding(9, "error", "EVIDENCE_SHA_MISMATCH", `La evidencia es de ${evidence.head.slice(0, 12)}, pero HEAD es ${current.head.slice(0, 12)}.`));
  }
  if (evidence.dirty?.length) out.push(finding(9, "error", "EVIDENCE_DIRTY", `La evidencia se generó con ${evidence.dirty.length} cambio(s) sin commit: no prueba ningún SHA.`));
  for (const key of ["ciYmlSha256", "lockSha256"]) {
    if (!evidence[key]) out.push(finding(9, "error", "EVIDENCE_INCOMPLETE", `La evidencia no registra ${key}.`));
    else if (current?.[key] && evidence[key] !== current[key]) out.push(finding(9, "error", "EVIDENCE_DEFINITION_CHANGED", `${key} cambió desde la ejecución registrada.`));
  }
  if (evidence.kind !== "local-ci-equivalent") out.push(finding(9, "error", "EVIDENCE_KIND", "La evidencia debe declararse local (local-ci-equivalent), nunca CI de GitHub."));
  const notRun = (evidence.steps ?? []).filter((s) => s.status !== "passed");
  if (evidence.verdict === "PASS" && notRun.length) out.push(finding(9, "error", "EVIDENCE_VERDICT", "Veredicto PASS con pasos fallidos u omitidos."));
  return out;
}

/** 10 · Gate for every step: forbidden commands never run; stack-changing ones only on an owned stack. */
export function guardStep(step, ownershipState, opts = {}) {
  if (step.forbidden?.length) {
    return { allowed: false, finding: finding(10, "error", "DESTRUCTIVE_FORBIDDEN", `Paso "${step.label}" contiene ${step.forbidden.join(", ")}: prohibido en local.`) };
  }
  if (step.ownedStack?.length) {
    const starting = step.ownedStack.includes("start local stack");
    if (starting && ownershipState === "absent") return { allowed: true };
    if (ownershipState !== "owned") {
      return { allowed: false, finding: finding(10, "error", "DESTRUCTIVE_NOT_OWNED", `Paso "${step.label}" (${step.ownedStack.join(", ")}) requiere un stack propio; estado: ${ownershipState}.`) };
    }
    if (step.ownedStack.includes("stop local stack") && opts.keepStack) {
      return { allowed: false, skip: true, finding: finding(10, "info", "DESTRUCTIVE_KEEP", `Paso "${step.label}" omitido por --keep-stack.`) };
    }
  }
  return { allowed: true };
}

export function runAllChecks(f) {
  return [
    ...checkDependencies(f),
    ...checkVersions(f),
    ...checkHosted(f),
    ...checkStackConsistency(f),
    ...checkForeignStacks(f),
    ...checkConfig(f),
    ...checkTestMarkers(f.testMarkers),
  ];
}
