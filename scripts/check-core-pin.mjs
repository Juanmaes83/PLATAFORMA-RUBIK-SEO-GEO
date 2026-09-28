// Fails unless RUBIK-SEO-GEO-CORE is pinned to a full commit over HTTPS in package.json
// and the lockfile resolves that same commit (ADR 0001).
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const spec = pkg.dependencies?.["@rubik/seo-geo-core"] ?? "";
const match = /^git\+https:\/\/github\.com\/Juanmaes83\/RUBIK-SEO-GEO-CORE\.git#([0-9a-f]{40})$/.exec(spec);
const errors = [];
if (!match) errors.push(`package.json: @rubik/seo-geo-core must be git+https://github.com/Juanmaes83/RUBIK-SEO-GEO-CORE.git#<40-hex commit> (got "${spec}")`);
const resolved = lock.packages?.["node_modules/@rubik/seo-geo-core"]?.resolved ?? "";
if (match && !resolved.endsWith(`#${match[1]}`)) errors.push(`package-lock.json resolves "${resolved}", not commit ${match[1]}; run npm install`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`core pin ok: ${match[1]}`);
