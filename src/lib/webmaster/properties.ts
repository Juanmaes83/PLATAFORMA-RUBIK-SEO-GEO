import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// Search Console / Bing property per Rubik project (ADR 0009, phase C). Owner-only RPC, explicit
// consent, revocation with history; the database rechecks the property against the project
// domain. No credential is stored or returned. Nothing calls a provider from here.

export type WebmasterProvider = "search-console" | "bing-webmaster";
export interface WebmasterProperty {
  propertyId: string;
  provider: WebmasterProvider;
  state: "ACTIVE" | "REVOKED";
  siteUrl: string;
  grantedAt: string;
  revokedAt: string | null;
}
export type PropertyError = "PROPERTY_FORBIDDEN" | "PROPERTY_INVALID" | "PROPERTY_CONFLICT" | "PROPERTY_TAKEN" | "PROPERTY_UNAVAILABLE" | "PROPERTY_INVALID_RESPONSE";
type Outcome = { ok: true; property: WebmasterProperty | null } | { ok: false; error: PropertyError };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDERS: readonly string[] = ["search-console", "bing-webmaster"];
const ERRORS: Record<string, PropertyError> = { "42501": "PROPERTY_FORBIDDEN", "22023": "PROPERTY_INVALID", "23514": "PROPERTY_CONFLICT", "23505": "PROPERTY_TAKEN" };
const isTime = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));
/** Same forms the database accepts; a cheap first filter, never the authority. */
const SITE = /^(sc-domain:[a-z0-9.-]+|https:\/\/[a-z0-9.-]+\/)$/;

function parse(data: unknown, provider: WebmasterProvider): Outcome {
  if (!data || Array.isArray(data) || typeof data !== "object") return { ok: false, error: "PROPERTY_INVALID_RESPONSE" };
  const w = data as Record<string, unknown>;
  if (w.state === "NONE" && w.provider === provider) return { ok: true, property: null };
  if (typeof w.propertyId !== "string" || !uuid.test(w.propertyId) || w.provider !== provider
    || (w.state !== "ACTIVE" && w.state !== "REVOKED") || typeof w.siteUrl !== "string" || !SITE.test(w.siteUrl)
    || (provider === "bing-webmaster" && w.siteUrl.startsWith("sc-domain:"))
    || !isTime(w.grantedAt) || !(w.revokedAt === null || isTime(w.revokedAt)) || (w.state === "REVOKED") !== (w.revokedAt !== null)) {
    return { ok: false, error: "PROPERTY_INVALID_RESPONSE" };
  }
  return { ok: true, property: { propertyId: w.propertyId, provider, state: w.state, siteUrl: w.siteUrl, grantedAt: w.grantedAt as string, revokedAt: w.revokedAt as string | null } };
}

async function command(client: SupabaseClient<Database>, projectId: string, provider: WebmasterProvider,
  p_command: "get" | "connect" | "revoke", p_payload?: { siteUrl: string; consent: true }): Promise<Outcome> {
  if (!uuid.test(projectId) || !PROVIDERS.includes(provider)) return { ok: false, error: "PROPERTY_INVALID" };
  try {
    const { data, error } = await client.rpc("webmaster_property", { p_project_id: projectId, p_provider: provider, p_command, p_payload });
    if (error) return { ok: false, error: ERRORS[error.code ?? ""] ?? "PROPERTY_UNAVAILABLE" };
    return parse(data, provider);
  } catch { return { ok: false, error: "PROPERTY_UNAVAILABLE" }; }
}

export const getWebmasterProperty = (client: SupabaseClient<Database>, projectId: string, provider: WebmasterProvider) =>
  command(client, projectId, provider, "get");

export function connectWebmasterProperty(client: SupabaseClient<Database>, projectId: string, provider: WebmasterProvider,
  input: { siteUrl: string; consent: boolean }): Promise<Outcome> {
  const siteUrl = input.siteUrl.trim().toLowerCase();
  if (input.consent !== true || !SITE.test(siteUrl) || (provider === "bing-webmaster" && siteUrl.startsWith("sc-domain:"))) {
    return Promise.resolve({ ok: false, error: "PROPERTY_INVALID" });
  }
  return command(client, projectId, provider, "connect", { siteUrl, consent: true });
}

export const revokeWebmasterProperty = (client: SupabaseClient<Database>, projectId: string, provider: WebmasterProvider) =>
  command(client, projectId, provider, "revoke");
