// Reads the connection settings of the LOCAL Supabase stack (`supabase start`) at run time,
// for integration and e2e tests only. Nothing is written to disk and nothing is printed.
// It refuses any API URL that is not on this machine, so tests can never target the hosted
// project. The keys are the local development stack's own keys, not the hosted project's.
import { execSync } from "node:child_process";

export const SUPABASE_CLI = process.env.SUPABASE_CLI ?? "npx --yes supabase@2.118.0";

export function localSupabaseEnv() {
  let out;
  try {
    out = execSync(`${SUPABASE_CLI} status -o env`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw new Error("El stack local de Supabase no está en marcha. Ejecuta `npm run db:start` (requiere Docker).");
  }
  const env = Object.fromEntries(
    out
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  const url = new URL(env.API_URL ?? "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error(`Refused: ${url.origin} is not a local Supabase stack.`);
  }
  if (!env.PUBLISHABLE_KEY || !env.SECRET_KEY) throw new Error("supabase status did not return the local keys.");
  return {
    apiUrl: env.API_URL,
    publishableKey: env.PUBLISHABLE_KEY,
    // Local stack only: used by test setup to create fictitious users (auth admin API).
    secretKey: env.SECRET_KEY,
    mailpitUrl: env.MAILPIT_URL ?? env.INBUCKET_URL,
  };
}
