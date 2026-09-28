import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests against the LOCAL Supabase stack (npm run db:start first). Kept out of
// `npm test` / `npm run verify`, which must pass without Docker.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
