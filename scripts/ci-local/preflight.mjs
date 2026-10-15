// N1-04 · Preflight del procedimiento local equivalente a CI.
//   node scripts/ci-local/preflight.mjs            informe legible; código 1 si hay errores
//   node scripts/ci-local/preflight.mjs --json     informe JSON (sin valores de variables)
//   node scripts/ci-local/preflight.mjs --evidence <ruta>   verifica una evidencia contra HEAD
// Solo lectura: no arranca, detiene ni limpia nada. No sustituye a GitHub Actions.
import { readFileSync } from "node:fs";
import { CATEGORY, runAllChecks, stackOwnership, verifyEvidence } from "./checks.mjs";
import { gatherFacts } from "./facts.mjs";

const args = process.argv.slice(2);
const facts = gatherFacts();
let findings = runAllChecks(facts);
if (facts.git.dirty.length) {
  findings.push({ category: CATEGORY.EVIDENCE, level: "warn", code: "EVIDENCE_DIRTY_TREE",
    message: `Hay ${facts.git.dirty.length} cambio(s) sin commit: una ejecución ahora no probaría ningún SHA.` });
}
const evidenceIndex = args.indexOf("--evidence");
if (evidenceIndex !== -1) {
  const evidence = JSON.parse(readFileSync(args[evidenceIndex + 1], "utf8"));
  findings = findings.concat(verifyEvidence(evidence, facts.git));
}

const ownership = stackOwnership(facts);
const report = {
  kind: "local-ci-preflight",
  head: facts.git.head,
  node: facts.node.version,
  stack: { projectId: facts.config.projectId, apiPort: facts.config.apiPort, dbPort: facts.config.dbPort, ownership: ownership.state },
  errors: findings.filter((f) => f.level === "error").length,
  warnings: findings.filter((f) => f.level === "warn").length,
  findings,
};

if (args.includes("--json")) {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} else {
  const names = Object.fromEntries(Object.entries(CATEGORY).map(([k, v]) => [v, k]));
  process.stdout.write(`Preflight local (no es CI de GitHub) · HEAD ${facts.git.head ?? "?"} · Node ${facts.node.version}\n`);
  process.stdout.write(`Stack ${facts.config.projectId} API ${facts.config.apiPort} DB ${facts.config.dbPort} · propiedad: ${ownership.state}\n`);
  for (const f of [...findings].sort((a, b) => a.category - b.category)) {
    process.stdout.write(`[${f.level.toUpperCase()}] ${f.category}·${names[f.category]} ${f.code}: ${f.message}\n`);
  }
  process.stdout.write(`${report.errors} error(es), ${report.warnings} aviso(s).\n`);
}
process.exitCode = report.errors ? 1 : 0;
