import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests against the LOCAL Supabase stack (npm run db:start first). Kept out of
// `npm test` / `npm run verify`, which must pass without Docker.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Same stand-in as vitest.config.mts: outside Next, `server-only` is a no-op marker.
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    // U03 window integration owns a separate disposable 27-migration N1 stack. The shared
    // 33-migration N2 stack used by CI must never run these tests or their cleanup hooks.
    exclude: process.env.RUBIK_TEST_U03_WINDOW_STACK === "1" || process.env.RUBIK_TEST_U03_I5_STACK === "1"
      ? []
      : ["tests/integration/u03-window-*.integration.test.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
