// F1 demo: seeds the fictitious multi-client portfolio (scripts/demo-f1-data.mjs) and starts
// the dev server against the LOCAL Supabase stack on port 3231 (3000 may be taken by another
// project, and 3217 is reserved for Playwright). Ctrl+C stops the server; the demo data stays
// until `npm run demo:f1:cleanup`. The signing key below is a throwaway per-run key, exactly
// like the e2e config: it signs nothing real and never leaves this process.
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { localSupabaseEnv } from "./supabase-test-env.mjs";

const supabase = localSupabaseEnv();

const seed = spawnSync(process.execPath, ["scripts/demo-f1-data.mjs"], { stdio: "inherit" });
if (seed.status !== 0) process.exit(seed.status ?? 1);

const port = process.env.RUBIK_DEMO_PORT ?? "3231";
console.log(`\nDemo F1 en http://localhost:${port} (Ctrl+C para detener; datos hasta demo:f1:cleanup)\n`);

const child = spawn(process.execPath, ["scripts/run-next.mjs", "dev", "-p", port], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: supabase.apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
    RUBIK_N2_SCHEMA_AVAILABLE: "true",
    RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE: "false",
    PROVENANCE_SIGNING_KEYS: `k-demo:${randomBytes(32).toString("base64")}`,
    PROVENANCE_ACTIVE_KEY_ID: "k-demo",
    RUBIK_AUDIT_DATABASE_URL: process.env.RUBIK_AUDIT_DATABASE_URL ?? "",
    OPENSEO_PROJECT_JOBS_ENABLED: "true",
    OPENSEO_ENDPOINT: "",
    OPENSEO_API_KEY: "",
    OPENSEO_PROJECT_ID: "",
    OPENSEO_GOOGLE_READS_ENABLED: "false",
    OPENSEO_GOOGLE_CATALOG_CHECK_ENABLED: "false",
    OPENSEO_PROJECT_CONNECTIONS_MODE: "legacy",
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
