// Conservative guard: fails if a tracked file looks like it contains a credential, or if
// an env file other than the names-only .env.example is tracked. It is a safety net, not a
// substitute for GitHub secret scanning or review.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const PATTERNS = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["provider API key", /\b(sk-(proj-|ant-)?[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}|xox[abp]-[A-Za-z0-9-]{10,})/],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{10,}/],
  ["assigned secret", /\b(SERVICE_ROLE_KEY|SECRET|PASSWORD|API_KEY|TOKEN)[A-Z0-9_]*\s*=\s*['"]?[A-Za-z0-9/+_.-]{8,}/],
];
const SKIP = /(^|\/)(package-lock\.json|node_modules\/)|\.(ico|png|jpg|jpeg|gif|webp|woff2?)$/;
const problems = [];
for (const file of files) {
  if (/(^|\/)\.env(\..+)?$/.test(file) && !file.endsWith(".env.example")) problems.push(`${file}: env file must not be committed`);
  if (SKIP.test(file) || file === "scripts/check-no-secrets.mjs") continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  for (const [name, re] of PATTERNS) if (re.test(text)) problems.push(`${file}: looks like a ${name}`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`secrets check ok: ${files.length} files scanned`);
