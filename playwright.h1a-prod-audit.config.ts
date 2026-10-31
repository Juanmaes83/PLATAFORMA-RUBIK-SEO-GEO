import { randomBytes } from 'node:crypto';
import { defineConfig } from '@playwright/test';
import { localSupabaseEnv } from './scripts/supabase-test-env.mjs';
import { assertFixtureEndpoint } from './e2e/fixture-scope';

const local = localSupabaseEnv();
assertFixtureEndpoint(local.apiUrl);
const port = 3218;
process.env.RUBIK_E2E_RUN_ID ??= randomBytes(16).toString('hex');
process.env.RUBIK_E2E_PASSPHRASE ??= randomBytes(24).toString('hex');

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'h1a-prod-xhr-audit.audit.ts',
  outputDir: 'test-results/playwright-h1a-prod-audit',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium', locale: 'es-ES', serviceWorkers: 'block' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `node scripts/run-next.mjs start -H 127.0.0.1 -p ${port}`,
    url: `http://127.0.0.1:${port}/api/salud`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: local.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.publishableKey,
      RUBIK_N2_SCHEMA_AVAILABLE: 'false',
      RUBIK_N2_CONTENT_GEO_SCHEMA_AVAILABLE: 'false',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
