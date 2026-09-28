// Runs the Next.js CLI with telemetry disabled on every platform (npm scripts run under
// cmd.exe on Windows, where `VAR=1 cmd` does not work). No network call is made by this
// wrapper; Next.js anonymous telemetry would otherwise be sent to a third party.
//
// It also refuses production commands (`build`, `start`) when AUTH_MODE=mock: the demo
// authentication exists only for development (`dev`). The server repeats this check at
// startup (src/instrumentation.ts), so it cannot be bypassed by calling `next` directly.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const [command, ...rest] = process.argv.slice(2);
if (["build", "start"].includes(command) && (process.env.AUTH_MODE ?? "").trim().toLowerCase() === "mock") {
  console.error(`Refused: AUTH_MODE=mock is development/demo only and cannot be used with "next ${command}" (production).`);
  process.exit(2);
}

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const result = spawnSync(process.execPath, [nextBin, command, ...rest].filter((x) => x !== undefined), {
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
process.exit(result.status ?? 1);
