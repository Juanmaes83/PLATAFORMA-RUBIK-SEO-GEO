import { assertProductionAuthConfig } from "@/lib/auth/mode";

// Runs once when a Next.js server instance starts, before it serves requests. The server does
// not start with a secret/service_role key in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, nor in
// production with the retired AUTH_MODE=mock. Throwing alone only makes Next.js log "Failed
// to prepare server" and keep the process alive, so the Node.js process exits with code 1.
export function register() {
  try {
    assertProductionAuthConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (process.env.NEXT_RUNTIME === "nodejs") process.exit(1);
    throw error;
  }
}
