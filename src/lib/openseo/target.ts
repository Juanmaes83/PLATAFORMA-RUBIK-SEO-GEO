import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { BridgeError } from "./bridge";
import { getProjectConnection, type OpenSeoProjectConnection } from "./connections";
import { projectJobsEnabled } from "./jobs";

// OpenSEO multi-client, phase 4 (docs/adr/0007-openseo-conexion-por-proyecto.md). Decides which
// OpenSEO project and audit hosts a request uses. `legacy` (default) keeps the global server
// configuration. `project` builds the bridge environment from the project's ACTIVE connection:
// OPENSEO_PROJECT_ID and OPENSEO_AUDIT_ALLOWED_HOSTS are always overwritten, so the global
// values can never be used, and no connection means no OpenSEO request at all.

type Env = Record<string, string | undefined>;
export type ConnectionMode = "legacy" | "project";

export const connectionMode = (env: Env = process.env): ConnectionMode =>
  env.OPENSEO_PROJECT_CONNECTIONS_MODE === "project" ? "project" : "legacy";

/** Server environment for one project: the shared endpoint/key, that project's OpenSEO ids. */
export function connectionEnv(connection: OpenSeoProjectConnection, env: Env = process.env): Env {
  return { ...env, OPENSEO_PROJECT_ID: connection.openseoProjectId, OPENSEO_AUDIT_ALLOWED_HOSTS: connection.allowedHosts.join(",") };
}

export type OpenSeoTarget =
  | { mode: "legacy"; env: Env; connection: null }
  | { mode: "project"; env: Env; connection: OpenSeoProjectConnection }
  | { mode: "project"; error: BridgeError };

const refuse = (code: string, message: string): OpenSeoTarget => ({ mode: "project", error: { code, message, retryable: false } });

export async function resolveOpenSeoTarget(client: SupabaseClient<Database>, projectId: string, env: Env = process.env): Promise<OpenSeoTarget> {
  if (connectionMode(env) === "legacy") return { mode: "legacy", env, connection: null };
  // The job ledger is what ties each audit to its connection; without it, fail closed.
  if (!projectJobsEnabled(env)) return refuse("CONNECTIONS_REQUIRE_JOBS", "El modo por proyecto exige el registro de trabajos activado en el servidor.");
  const found = await getProjectConnection(client, projectId);
  if (!found.ok) return refuse(found.error === "CONNECTION_FORBIDDEN" ? "CONNECTION_FORBIDDEN" : "CONNECTION_UNAVAILABLE",
    "No se pudo leer la conexión de OpenSEO de este proyecto. No se ha contactado con OpenSEO.");
  if (!found.connection || found.connection.state !== "ACTIVE") return refuse("PROJECT_NOT_CONNECTED",
    "Este proyecto no tiene una conexión de OpenSEO activa. No se ha contactado con OpenSEO.");
  return { mode: "project", env: connectionEnv(found.connection, env), connection: found.connection };
}
