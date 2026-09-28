// Regenerates the committed screenshots in docs/visual/ (360, 390 and 1280 px) by running
// the Playwright visual suite with UPDATE_VISUAL_EVIDENCE=1. Local only; CI uploads its own
// screenshots as a workflow artifact instead of committing them.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cli = require.resolve("@playwright/test/cli");
const result = spawnSync(process.execPath, [cli, "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, UPDATE_VISUAL_EVIDENCE: "1" },
});
process.exit(result.status ?? 1);
