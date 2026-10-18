// Local-only U02 gate. Never connects to a hosted project or prints API keys.
import { execFileSync, execSync } from "node:child_process";
import { previewDatabaseIdentityMatches } from "../src/lib/auth/mode.ts";

const projectId = "rubik-u02-n1-local-20261018";
const ref = "rhnnplewqsekrnaousyl";
const envText = execSync("npx --yes supabase@2.118.0 --workdir test-results/u02-n1-local status -o env", {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
});
const env = Object.fromEntries(envText.split(/\r?\n/).map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
  .filter(Boolean).map((match) => [match[1], match[2]]));
if (env.API_URL !== "http://127.0.0.1:51321" || !env.PUBLISHABLE_KEY?.startsWith("sb_publishable_"))
  throw new Error("Refused: unexpected local U02 API or key type");
const container = `supabase_db_${projectId}`;
const dbPorts = execFileSync("docker", ["port", container, "5432/tcp"], { encoding: "utf8" }).trim().split(/\r?\n/);
if (!dbPorts.length || dbPorts.some((port) => !port.endsWith(":51322")))
  throw new Error("Refused: local U02 database port differs from the API stack");
const migrationCount = execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-qAt", "-c",
  "select count(*) || '|' || max(version) from supabase_migrations.schema_migrations"], { encoding: "utf8" }).trim();
if (migrationCount !== "27|20261015210000") throw new Error("Refused: local U02 N1 history differs");

let calls = 0;
const localFetcher = (url, options) => {
  const parsed = new URL(url);
  if (parsed.origin !== `https://${ref}.supabase.co`) throw new Error("Refused: unexpected Preview host");
  calls++;
  return fetch(`${env.API_URL}${parsed.pathname}${parsed.search}`, {
    ...options, headers: { ...options.headers, apikey: env.PUBLISHABLE_KEY },
  });
};
const previewEnv = { VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture" };
if (!await previewDatabaseIdentityMatches(previewEnv, localFetcher) || calls !== 1)
  throw new Error("Preview Data API sentinel rejected the local isolated schema");
if (await previewDatabaseIdentityMatches({ ...previewEnv, NEXT_PUBLIC_SUPABASE_URL: "https://yvdgmklgwlshizzgefpv.supabase.co" }, localFetcher)
  || calls !== 1) throw new Error("Production URL reached the Preview Data API");
const denied = await fetch(`${env.API_URL}/rest/v1/environment_identity`, {
  method: "POST", headers: { apikey: env.PUBLISHABLE_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ environment: "preview", project_ref: ref }),
});
if (denied.ok) throw new Error("Anonymous write to Preview sentinel was accepted");
console.log("PASS: 27 N1, local Data API sentinel, Production URL rejected before fetch, anonymous write denied");
