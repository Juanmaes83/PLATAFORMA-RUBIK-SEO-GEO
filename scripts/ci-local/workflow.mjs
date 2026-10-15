// N1-04 · Lectura estricta de .github/workflows/ci.yml para reproducir sus pasos en local.
// No es un parser YAML general: acepta solo la forma que usa este workflow y falla ante
// cualquier clave o estructura desconocida, para que un cambio en CI no quede sin reproducir
// en silencio. Sin dependencias: el proyecto no declara un parser YAML propio.

/**
 * @typedef {{ name?: string, run?: string, uses?: string, if?: string, with?: Record<string, string>, env?: Record<string, string> }} WorkflowStep
 * @typedef {{ id: string, name: string | null, runsOn: string | null, matrix: Record<string, string[]>, steps: WorkflowStep[] }} WorkflowJob
 * @typedef {{ name: string | null, env: Record<string, string>, permissions: Record<string, string>, triggers: string[], jobs: Record<string, WorkflowJob> }} Workflow
 * @typedef {{ index: number, label: string, kind: "run" | "checkout" | "setup-node" | "upload-artifact", always: boolean, script?: string, with?: Record<string, string>, forbidden?: string[], ownedStack?: string[] }} PlannedStep
 */

const STEP_KEYS = new Set(["name", "run", "uses", "if", "with", "env"]);
const JOB_KEYS = new Set(["name", "runs-on", "strategy", "steps", "env", "needs", "if", "timeout-minutes"]);

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function unquote(value) {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

/** Splits `key: value` (value may be empty). Returns null for lines that are not a mapping entry. */
function keyValue(text) {
  const m = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(text);
  return m ? [m[1], m[2] ?? ""] : null;
}

/** Reads a block scalar (`|`) or a plain value starting after `key:` at line i. */
function readValue(lines, i, keyIndent, inline) {
  if (inline === "|" || inline === "|-") {
    const body = [];
    let j = i + 1;
    let blockIndent = null;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === "") { body.push(""); continue; }
      const ind = indentOf(line);
      if (ind <= keyIndent) break;
      blockIndent ??= ind;
      body.push(line.slice(blockIndent));
    }
    while (body.length && body.at(-1) === "") body.pop();
    return { value: body.join("\n") + "\n", next: j };
  }
  if (inline === "") {
    // Nested mapping (with:, env:): collect `key: value` pairs one level deeper.
    const map = {};
    let j = i + 1;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === "" || line.trim().startsWith("#")) continue;
      if (indentOf(line) <= keyIndent) break;
      const kv = keyValue(line.trim());
      if (!kv) throw new Error(`ci.yml: unsupported nested value at line ${j + 1}: ${line.trim()}`);
      map[kv[0]] = unquote(kv[1]);
    }
    return { value: map, next: j };
  }
  return { value: unquote(inline), next: i + 1 };
}

function parseSteps(lines, start, stepsIndent) {
  const steps = [];
  let i = start;
  let current = null;
  let itemIndent = null;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) { i++; continue; }
    const ind = indentOf(line);
    if (ind <= stepsIndent) break;
    let text = trimmed;
    let keyIndent = ind;
    if (trimmed.startsWith("- ")) {
      itemIndent ??= ind;
      if (ind !== itemIndent) throw new Error(`ci.yml: unexpected list indentation at line ${i + 1}`);
      current = {};
      steps.push(current);
      text = trimmed.slice(2);
      keyIndent = ind + 2;
    } else if (!current || ind !== itemIndent + 2) {
      throw new Error(`ci.yml: unexpected step content at line ${i + 1}: ${trimmed}`);
    }
    const kv = keyValue(text);
    if (!kv) throw new Error(`ci.yml: unsupported step line ${i + 1}: ${trimmed}`);
    const [key, inline] = kv;
    if (!STEP_KEYS.has(key)) throw new Error(`ci.yml: unknown step key "${key}" at line ${i + 1}`);
    const { value, next } = readValue(lines, i, keyIndent, inline);
    current[key] = value;
    i = next;
  }
  return { steps, next: i };
}

/**
 * Parses the workflow into { name, env, permissions, triggers, jobs: { id: { name, runsOn, matrix, steps } } }.
 * @param {string} text
 * @returns {Workflow}
 */
export function parseWorkflow(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  /** @type {Workflow} */
  const wf = { name: null, env: {}, permissions: {}, triggers: [], jobs: {} };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) { i++; continue; }
    if (indentOf(line) !== 0) throw new Error(`ci.yml: unexpected top-level indentation at line ${i + 1}`);
    const kv = keyValue(trimmed);
    if (!kv) throw new Error(`ci.yml: unsupported top-level line ${i + 1}`);
    const [key, inline] = kv;
    if (key === "name") { wf.name = unquote(inline); i++; continue; }
    if (key === "env" || key === "permissions" || key === "concurrency") {
      const { value, next } = readValue(lines, i, 0, inline);
      if (key !== "concurrency") wf[key] = value;
      i = next;
      continue;
    }
    if (key === "on") {
      i++;
      while (i < lines.length && (lines[i].trim() === "" || indentOf(lines[i]) > 0)) {
        const t = lines[i].trim();
        if (indentOf(lines[i]) === 2) {
          const ev = keyValue(t);
          if (ev) wf.triggers.push(ev[0]);
        }
        i++;
      }
      continue;
    }
    if (key === "jobs") {
      i++;
      let job = null;
      while (i < lines.length) {
        const l = lines[i];
        const t = l.trim();
        if (t === "" || t.startsWith("#")) { i++; continue; }
        const ind = indentOf(l);
        if (ind === 0) break;
        const jkv = keyValue(t);
        if (ind === 2 && jkv && jkv[1] === "") {
          job = { id: jkv[0], name: null, runsOn: null, matrix: {}, steps: [] };
          wf.jobs[job.id] = job;
          i++;
          continue;
        }
        if (!job || ind !== 4 || !jkv) throw new Error(`ci.yml: unsupported job line ${i + 1}: ${t}`);
        const [jk, jv] = jkv;
        if (!JOB_KEYS.has(jk)) throw new Error(`ci.yml: unknown job key "${jk}" at line ${i + 1}`);
        if (jk === "steps") {
          const { steps, next } = parseSteps(lines, i + 1, 4);
          job.steps = steps;
          i = next;
          continue;
        }
        if (jk === "strategy") {
          i++;
          while (i < lines.length && (lines[i].trim() === "" || indentOf(lines[i]) > 4)) {
            const m = /^([A-Za-z0-9_-]+):\s*\[(.*)\]$/.exec(lines[i].trim());
            if (m && indentOf(lines[i]) === 8) job.matrix[m[1]] = m[2].split(",").map((s) => unquote(s));
            i++;
          }
          continue;
        }
        if (jk === "name") job.name = unquote(jv);
        else if (jk === "runs-on") job.runsOn = unquote(jv);
        else throw new Error(`ci.yml: job key "${jk}" is not reproduced by the local runner (line ${i + 1})`);
        i++;
      }
      continue;
    }
    throw new Error(`ci.yml: unknown top-level key "${key}" at line ${i + 1}`);
  }
  return wf;
}

/** Actions the local runner knows how to reproduce. Anything else stops the plan. */
export const KNOWN_ACTIONS = {
  "actions/checkout@v4": "checkout",
  "actions/setup-node@v4": "setup-node",
  "actions/upload-artifact@v4": "upload-artifact",
};

/** Commands that must never run from the local runner, whatever the stack ownership. */
export const FORBIDDEN_COMMANDS = [
  [/\bdb\s+push\b/, "db push (hosted migrations)"],
  [/\bsupabase(@[\d.]+)?\s+link\b|\$SUPABASE_CLI\s+link\b/, "supabase link (hosted project)"],
  [/--linked\b/, "--linked (hosted project)"],
  [/--project-ref\b/, "--project-ref (hosted project)"],
  [/--db-url\b/, "--db-url (arbitrary database)"],
  [/\bvercel\s+(env|deploy|link|promote|rollback|pull)\b/, "Vercel mutation or secret download"],
  [/\bgh\s+(secret|variable|workflow\s+run|pr\s+merge)\b/, "GitHub mutation"],
  [/\bsecrets\./, "GitHub secret reference"],
];

/** Commands that change or discard local stack state: allowed only on a stack this runner owns. */
export const OWNED_STACK_COMMANDS = [
  [/\$SUPABASE_CLI\s+start\b|\bsupabase(@[\d.]+)?\s+start\b/, "start local stack"],
  [/\$SUPABASE_CLI\s+stop\b|\bsupabase(@[\d.]+)?\s+stop\b/, "stop local stack"],
  [/\bdb\s+reset\b/, "db reset"],
  [/\btest\s+db\b/, "pgTAP against the local stack"],
  [/\bdocker\s+exec\b/, "SQL inside the local database container"],
  [/\bdrop\s+(event\s+trigger|function|table|schema)\b/i, "DROP on the local database"],
  [/\bnpm\s+run\s+test:(integration|e2e)\b/, "fixtures written to the local stack"],
  [/\bgen\s+types\b/, "reads the local schema"],
  [/\bstatus\s+-o\s+env\b/, "reads local stack keys"],
];

/**
 * Classifies a step script.
 * @param {string} script
 * @returns {{ forbidden: string[], ownedStack: string[] }}
 */
export function classifyScript(script) {
  const forbidden = FORBIDDEN_COMMANDS.filter(([re]) => re.test(script)).map(([, label]) => label);
  const ownedStack = OWNED_STACK_COMMANDS.filter(([re]) => re.test(script)).map(([, label]) => label);
  return { forbidden, ownedStack };
}

/**
 * npm scripts referenced by `npm run X` / `npm test` / `npm start` in a script.
 * @param {string} script
 * @returns {string[]}
 */
export function npmScriptsUsed(script) {
  const used = new Set();
  for (const m of script.matchAll(/\bnpm\s+run\s+(?:-s\s+)?([A-Za-z0-9:_-]+)/g)) used.add(m[1]);
  if (/\bnpm\s+test\b/.test(script)) used.add("test");
  if (/\bnpm\s+start\b/.test(script)) used.add("start");
  return [...used];
}

/**
 * Turns a job into local actions. Each `run` step keeps its exact script. Unknown `uses`
 * actions throw: the local procedure must never silently drop a CI step.
 * @param {WorkflowJob} job
 * @returns {PlannedStep[]}
 */
export function planJob(job) {
  return job.steps.map((step, index) => {
    const label = step.name ?? step.uses ?? `step ${index + 1}`;
    const always = (step.if ?? "").trim() === "always()";
    if (step.if && !always) throw new Error(`ci.yml: step "${label}" has condition "${step.if}" not reproduced locally`);
    if (step.env) throw new Error(`ci.yml: step "${label}" has step-level env not reproduced locally`);
    if (step.uses) {
      const kind = KNOWN_ACTIONS[step.uses];
      if (!kind) throw new Error(`ci.yml: action "${step.uses}" is not mapped by the local runner`);
      return { index, label, kind, with: step.with ?? {}, always };
    }
    if (typeof step.run !== "string" || !step.run.trim()) throw new Error(`ci.yml: step "${label}" has neither run nor uses`);
    return { index, label, kind: "run", script: step.run, always, ...classifyScript(step.run) };
  });
}
