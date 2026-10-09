import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getProjectConnection } from "@/lib/openseo/connections";

// Owner-declared association of an OpenSEO Google property to a Rubik project. The database
// stores consent and history; this module never accepts a browser-supplied destination for a
// read. Association is independent of the legacy/project crawl switch.
export type GoogleProvider = "search-console" | "google-analytics";
export interface GoogleProperty {
  propertyId: string;
  connectionId: string;
  provider: GoogleProvider;
  externalPropertyId: string;
  state: "ACTIVE" | "REVOKED";
  source: "OWNER_DECLARED";
  grantedAt: string;
  revokedAt: string | null;
}
export type GooglePropertyError = "FORBIDDEN" | "INVALID" | "CONFLICT" | "UNAVAILABLE" | "INVALID_RESPONSE";
type Outcome = { ok: true; property: GoogleProperty | null } | { ok: false; error: GooglePropertyError };
export type GoogleSource = {
  connectionId: string;
  propertyBindingId: string;
  openseoProjectId: string;
  externalPropertyId: string;
  provider: GoogleProvider;
  source: "OWNER_DECLARED";
  grantedAt: string;
};
type SourceOutcome = { ok: true; source: GoogleSource } | { ok: false; error: GooglePropertyError | "NOT_CONNECTED" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GSC = /^(sc-domain:[a-z0-9.-]+|https:\/\/[a-z0-9.-]+\/)$/;
const GA4 = /^properties\/[0-9]{1,20}$/;
const ERRORS: Record<string, GooglePropertyError> = {
  "42501": "FORBIDDEN", "22023": "INVALID", "23514": "CONFLICT", "23505": "CONFLICT",
};
const validExternal = (provider: GoogleProvider, id: string) => (provider === "search-console" ? GSC : GA4).test(id);
const time = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

function parse(data: unknown, provider: GoogleProvider): Outcome {
  if (!data || Array.isArray(data) || typeof data !== "object") return { ok: false, error: "INVALID_RESPONSE" };
  const p = data as Record<string, unknown>;
  if (p.state === "NONE" && p.provider === provider) return { ok: true, property: null };
  if (typeof p.propertyId !== "string" || !UUID.test(p.propertyId)
    || typeof p.connectionId !== "string" || !UUID.test(p.connectionId)
    || p.provider !== provider || (p.state !== "ACTIVE" && p.state !== "REVOKED")
    || typeof p.externalPropertyId !== "string" || !validExternal(provider, p.externalPropertyId)
    || p.source !== "OWNER_DECLARED" || !time(p.grantedAt)
    || !(p.revokedAt === null || time(p.revokedAt))
    || (p.state === "REVOKED") !== (p.revokedAt !== null)) return { ok: false, error: "INVALID_RESPONSE" };
  return { ok: true, property: {
    propertyId: p.propertyId, connectionId: p.connectionId, provider, externalPropertyId: p.externalPropertyId,
    state: p.state, source: "OWNER_DECLARED", grantedAt: p.grantedAt, revokedAt: p.revokedAt,
  } };
}

async function command(client: SupabaseClient<Database>, projectId: string, provider: GoogleProvider,
  p_command: "get" | "connect" | "revoke", p_payload?: { externalPropertyId: string; consent: true }): Promise<Outcome> {
  if (!UUID.test(projectId)) return { ok: false, error: "INVALID" };
  try {
    const { data, error } = await client.rpc("openseo_google_property", { p_project_id: projectId, p_provider: provider, p_command, p_payload });
    if (error) return { ok: false, error: ERRORS[error.code ?? ""] ?? "UNAVAILABLE" };
    return parse(data, provider);
  } catch { return { ok: false, error: "UNAVAILABLE" }; }
}

export const getGoogleProperty = (client: SupabaseClient<Database>, projectId: string, provider: GoogleProvider) =>
  command(client, projectId, provider, "get");

export function connectGoogleProperty(client: SupabaseClient<Database>, projectId: string, provider: GoogleProvider,
  input: { externalPropertyId: string; consent: boolean }): Promise<Outcome> {
  if (input.consent !== true || !validExternal(provider, input.externalPropertyId)) return Promise.resolve({ ok: false, error: "INVALID" });
  return command(client, projectId, provider, "connect", { externalPropertyId: input.externalPropertyId, consent: true });
}

export const revokeGoogleProperty = (client: SupabaseClient<Database>, projectId: string, provider: GoogleProvider) =>
  command(client, projectId, provider, "revoke");

/** Server caller resolves both ACTIVE records from the authenticated session, never from form fields. */
export async function resolveGoogleSource(client: SupabaseClient<Database>, projectId: string,
  provider: GoogleProvider): Promise<SourceOutcome> {
  const [connection, binding] = await Promise.all([
    getProjectConnection(client, projectId), getGoogleProperty(client, projectId, provider),
  ]);
  if (!connection.ok) return { ok: false, error: connection.error === "CONNECTION_FORBIDDEN" ? "FORBIDDEN" : "UNAVAILABLE" };
  if (!binding.ok) return { ok: false, error: binding.error };
  if (!connection.connection || !binding.property || connection.connection.state !== "ACTIVE"
    || binding.property.state !== "ACTIVE" || binding.property.connectionId !== connection.connection.connectionId) {
    return { ok: false, error: "NOT_CONNECTED" };
  }
  return { ok: true, source: {
    connectionId: connection.connection.connectionId,
    propertyBindingId: binding.property.propertyId,
    openseoProjectId: connection.connection.openseoProjectId,
    externalPropertyId: binding.property.externalPropertyId,
    provider, source: binding.property.source, grantedAt: binding.property.grantedAt,
  } };
}
