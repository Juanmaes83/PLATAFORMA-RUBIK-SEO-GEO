import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isAuditableHostname } from "./config";

// OpenSEO multi-client, phase 1 (docs/OPENSEO-MULTITENANT.md): the owner-authorized mapping
// from one Rubik project to one OpenSEO project and its audit hosts. No secret is stored or
// returned: `platform` means the server-side OPENSEO_API_KEY. Nothing in run/follow reads this
// yet; the global OPENSEO_PROJECT_ID stays in force until phase 4 wires the resolver.

export interface OpenSeoProjectConnection {
  connectionId: string;
  state: "ACTIVE" | "REVOKED";
  credentialMode: "platform";
  /** Server-side only: never put it in the Project State or a browser payload. */
  openseoProjectId: string;
  allowedHosts: string[];
  grantedAt: string;
  revokedAt: string | null;
}
export type ConnectionError = "CONNECTION_FORBIDDEN" | "CONNECTION_INVALID" | "CONNECTION_CONFLICT"
  | "CONNECTION_TAKEN" | "CONNECTION_UNAVAILABLE" | "CONNECTION_INVALID_RESPONSE";
type Outcome = { ok: true; connection: OpenSeoProjectConnection | null } | { ok: false; error: ConnectionError };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const providerProject = /^[A-Za-z0-9_-]{1,100}$/;
const ERRORS: Record<string, ConnectionError> = {
  "42501": "CONNECTION_FORBIDDEN", "22023": "CONNECTION_INVALID", "23514": "CONNECTION_CONFLICT", "23505": "CONNECTION_TAKEN",
};
const isTime = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));

function parse(data: unknown): Outcome {
  if (!data || Array.isArray(data) || typeof data !== "object") return { ok: false, error: "CONNECTION_INVALID_RESPONSE" };
  const c = data as Record<string, unknown>;
  if (c.state === "NONE") return { ok: true, connection: null };
  const hosts = c.allowedHosts;
  if (typeof c.connectionId !== "string" || !uuid.test(c.connectionId)
    || (c.state !== "ACTIVE" && c.state !== "REVOKED") || c.credentialMode !== "platform"
    || typeof c.openseoProjectId !== "string" || !providerProject.test(c.openseoProjectId)
    || !Array.isArray(hosts) || hosts.length < 1 || hosts.length > 2
    || !hosts.every(h => typeof h === "string" && isAuditableHostname(h))
    || !isTime(c.grantedAt) || !(c.revokedAt === null || isTime(c.revokedAt))
    || (c.state === "REVOKED") !== (c.revokedAt !== null)) return { ok: false, error: "CONNECTION_INVALID_RESPONSE" };
  return { ok: true, connection: { connectionId: c.connectionId, state: c.state, credentialMode: "platform",
    openseoProjectId: c.openseoProjectId, allowedHosts: hosts as string[], grantedAt: c.grantedAt as string,
    revokedAt: c.revokedAt as string | null } };
}

/** Session client only; never a service key. Database messages are not serialized. */
async function command(client: SupabaseClient<Database>, projectId: string, p_command: "get" | "connect" | "revoke",
  p_payload?: { openseoProjectId: string; allowedHosts: string[]; consent: true }): Promise<Outcome> {
  if (!uuid.test(projectId)) return { ok: false, error: "CONNECTION_INVALID" };
  try {
    const { data, error } = await client.rpc("openseo_connection", { p_project_id: projectId, p_command, p_payload });
    if (error) return { ok: false, error: ERRORS[error.code ?? ""] ?? "CONNECTION_UNAVAILABLE" };
    return parse(data);
  } catch { return { ok: false, error: "CONNECTION_UNAVAILABLE" }; }
}

export const getProjectConnection = (client: SupabaseClient<Database>, projectId: string) => command(client, projectId, "get");

/** Connects only with explicit consent; hosts are rechecked by the database against the project domain. */
export function connectProject(client: SupabaseClient<Database>, projectId: string,
  input: { openseoProjectId: string; allowedHosts: string[]; consent: boolean }): Promise<Outcome> {
  const hosts = [...new Set(input.allowedHosts.map(h => h.trim().toLowerCase()))];
  if (input.consent !== true || !providerProject.test(input.openseoProjectId)
    || hosts.length < 1 || hosts.length > 2 || !hosts.every(isAuditableHostname)) {
    return Promise.resolve({ ok: false, error: "CONNECTION_INVALID" });
  }
  return command(client, projectId, "connect", { openseoProjectId: input.openseoProjectId, allowedHosts: hosts, consent: true });
}

export const revokeProjectConnection = (client: SupabaseClient<Database>, projectId: string) => command(client, projectId, "revoke");
