import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next.js resolves `server-only` internally; outside Next it is a no-op for tests.
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Needs the local Supabase stack: npm run test:integration (vitest.integration.config.mts).
    exclude: ["tests/integration/**", "node_modules/**"],
  },
});
