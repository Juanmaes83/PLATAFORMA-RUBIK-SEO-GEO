// Reads the connection settings of the LOCAL Supabase stack (`supabase start`) at run time,
// for integration and e2e tests only. Nothing is written to disk and nothing is printed.
// It refuses any API URL that is not on this machine, so tests can never target the hosted
// project. The keys are the local development stack's own keys, not the hosted project's.
import { execFileSync, execSync } from "node:child_process";
import { selectedStack } from "./test-stacks.mjs";

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
  const stack = selectedStack();
  const expectedOrigin = `http://127.0.0.1:${stack.apiPort}`;
  if (url.origin !== expectedOrigin) {
    throw new Error(`Refused: ${url.origin} is not a local Supabase stack.`);
  }
  const db = new URL(env.DB_URL ?? "");
  if (db.hostname !== "127.0.0.1" || db.port !== String(stack.dbPort)) throw new Error("Refused: local API and database do not match");
  if (!env.PUBLISHABLE_KEY || !env.SECRET_KEY) throw new Error("supabase status did not return the local keys.");
  return {
    apiUrl: env.API_URL,
    publishableKey: env.PUBLISHABLE_KEY,
    // Local stack only: used by test setup to create fictitious users (auth admin API).
    secretKey: env.SECRET_KEY,
    mailpitUrl: env.MAILPIT_URL ?? env.INBUCKET_URL,
  };
}

// Recovery drills execute SQL directly. Bind Docker to the SAME validated stack as Auth,
// never a fixed shared container when the API was selected from another CLI workdir.
export function localDatabaseContainer() {
  localSupabaseEnv();
  const stack = selectedStack();
  const name = `supabase_db_${stack.projectId}`;
  const ports = execFileSync("docker", ["port", name, "5432/tcp"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(/\r?\n/);
  if (!ports.length || ports.some(p => !p.endsWith(`:${stack.dbPort}`))) throw new Error("Refused: Docker database does not match local API");
  return name;
}
