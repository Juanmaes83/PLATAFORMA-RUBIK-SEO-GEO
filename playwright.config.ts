import { randomBytes } from "node:crypto";
import { defineConfig } from "@playwright/test";
import { localSupabaseEnv } from "./scripts/supabase-test-env.mjs";

// End-to-end, visual and responsive checks (D-27) against `next dev` connected to the LOCAL
// Supabase stack (npm run db:start). Accounts are fictitious and created by global-setup.
// Only the publishable key reaches the app; the helper refuses any non-local host.
const port = Number(process.env.E2E_PORT ?? 3217);
const supabase = localSupabaseEnv();
// CORE-9.2/9.3: a throwaway HMAC key generated for each run, so audited imports work in e2e.
// It exists only in this process and the dev server it starts; it signs nothing real.
const signingKey = randomBytes(32).toString("base64");

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/playwright",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: "chromium",
    colorScheme: "light",
    locale: "es-ES",
  },
  projects: [
    { name: "movil-360", use: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "movil-390", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: "escritorio-1280", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `node scripts/run-next.mjs dev -p ${port}`,
    url: `http://localhost:${port}/api/salud`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: supabase.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
      PROVENANCE_SIGNING_KEYS: `k-e2e:${signingKey}`,
      PROVENANCE_ACTIVE_KEY_ID: "k-e2e",
      // Job ledger on (local stack only) so the uncertain-launch reconciliation is reachable.
      // OpenSEO itself stays unconfigured: no e2e test can contact a provider.
      OPENSEO_PROJECT_JOBS_ENABLED: "true",
    },
  },
});
