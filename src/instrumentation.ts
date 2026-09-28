import { assertProductionAuthConfig } from "@/lib/auth/mode";

// Runs once when a Next.js server instance starts, before it serves requests. A production
// server configured with AUTH_MODE=mock does not start at all: throwing alone only makes
// Next.js log "Failed to prepare server" and keep the process alive, so the Node.js
// process exits with code 1 instead.
export function register() {
  try {
    assertProductionAuthConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (process.env.NEXT_RUNTIME === "nodejs") process.exit(1);
    throw error;
  }
}
