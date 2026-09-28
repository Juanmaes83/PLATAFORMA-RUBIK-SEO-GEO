import { defineConfig } from "@playwright/test";

// Visual/responsive checks (D-27). They run against `next dev` because the demo login
// (AUTH_MODE=mock) exists only in development; production refuses it by design.
const port = Number(process.env.E2E_PORT ?? 3217);

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/playwright",
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
    env: { AUTH_MODE: "", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
