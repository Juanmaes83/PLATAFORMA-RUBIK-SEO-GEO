// Runs the Next.js CLI with telemetry disabled on every platform (npm scripts run under
// cmd.exe on Windows, where `VAR=1 cmd` does not work). No network call is made by this
// wrapper; Next.js anonymous telemetry would otherwise be sent to a third party.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const result = spawnSync(process.execPath, [nextBin, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
process.exit(result.status ?? 1);
