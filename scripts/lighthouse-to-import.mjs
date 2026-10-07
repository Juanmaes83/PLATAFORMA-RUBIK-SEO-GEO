// Converts one or more Lighthouse JSON reports into a single `rubik-import-v1` file (ADR 0005).
// Reads and writes local files only: no network, no database, no secrets.
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/lighthouse-to-import.mjs \
//     --tenant <tenantId> --project <projectId> --env LOCAL|PREVIEW|PRODUCTION|PAGESPEED \
//     [--map-origin http://localhost:3100=https://example.test] [--accept lh.mobile.is-crawlable,...] \
//     --out import.json report-1.json [report-2.json ...]
//
// Uses Node's built-in type stripping (Node >= 22.18) to load the TypeScript normaliser.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { lighthouseToImport } from "../src/lib/imports/lighthouse.ts";

const ENVIRONMENTS = ["LOCAL", "PREVIEW", "PRODUCTION", "PAGESPEED"];
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    tenant: { type: "string" },
    project: { type: "string" },
    env: { type: "string" },
    "map-origin": { type: "string" },
    accept: { type: "string" },
    out: { type: "string" },
  },
});

function fail(message) {
  console.error(message);
  process.exit(1);
}
if (!values.tenant || !values.project || !values.out || positionals.length === 0) fail("Uso: --tenant --project --env --out <fichero> <informes…>");
if (!ENVIRONMENTS.includes(values.env)) fail(`--env debe ser uno de ${ENVIRONMENTS.join(", ")}`);

let mapFrom = null;
let mapTo = null;
if (values["map-origin"]) {
  [mapFrom, mapTo] = values["map-origin"].split("=");
  if (!mapFrom || !mapTo) fail("--map-origin espera origen-medido=origen-público");
}

const scope = { tenantId: values.tenant, projectId: values.project };
const accepted = values.accept ? values.accept.split(",").map((s) => s.trim()).filter(Boolean) : [];
let merged = null;
const formFactors = new Set();
for (const file of positionals) {
  const lhr = JSON.parse(readFileSync(file, "utf8"));
  const measured = lhr.finalDisplayedUrl ?? "";
  formFactors.add(lhr.configSettings?.formFactor === "desktop" ? "desktop" : "mobile");
  const findingUrl = mapFrom && measured.startsWith(mapFrom) ? mapTo + measured.slice(mapFrom.length) : undefined;
  const out = lighthouseToImport(lhr, { scope, environment: values.env, findingUrl, acceptedRuleIds: accepted, evidenceRef: basename(file) });
  if (!merged) merged = out;
  else {
    merged.findings.push(...out.findings);
    // The file is captured when its newest report was taken.
    if (out.capturedAt > merged.capturedAt) merged.capturedAt = out.capturedAt;
  }
}
merged.source.label = `${merged.source.tool.replace("lighthouse@", "Lighthouse ")} · ${[...formFactors].join("+")} · ${values.env}`;
writeFileSync(values.out, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`${merged.findings.length} hallazgos de ${positionals.length} informes → ${values.out}`);
