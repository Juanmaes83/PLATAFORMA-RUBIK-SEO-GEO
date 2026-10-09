import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { connectGoogleProperty, resolveGoogleSource } from "@/lib/openseo/google/properties";

const projectId = "11111111-1111-4111-8111-111111111111";
const otherProjectId = "22222222-2222-4222-8222-222222222222";
const connectionId = "33333333-3333-4333-8333-333333333333";
const otherConnectionId = "44444444-4444-4444-8444-444444444444";
const propertyId = "55555555-5555-4555-8555-555555555555";
const connection = { connectionId, state: "ACTIVE", credentialMode: "platform", openseoProjectId: "openseo-a",
  allowedHosts: ["sarah.example"], grantedAt: "2026-10-09T10:00:00Z", revokedAt: null };
const property = { propertyId, connectionId, provider: "search-console", state: "ACTIVE", externalPropertyId: "https://sarah.es/",
  source: "OWNER_DECLARED", grantedAt: "2026-10-09T10:10:00Z", revokedAt: null };

function setup(conn: unknown = connection, binding: unknown = property) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (args.p_project_id !== projectId) return { data: null, error: { code: "42501" } };
    return { data: name === "openseo_connection" ? conn : binding, error: null };
  });
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe("explicit Google property source, in-memory only", () => {
  it("resolves .es GSC independently from the .example crawl host and does not trust a browser property", async () => {
    const { client, rpc } = setup();
    expect(await resolveGoogleSource(client, projectId, "search-console")).toEqual({ ok: true, source: {
      connectionId, propertyBindingId: propertyId, openseoProjectId: "openseo-a", externalPropertyId: "https://sarah.es/",
      provider: "search-console", source: "OWNER_DECLARED", grantedAt: property.grantedAt,
    } });
    expect(rpc).toHaveBeenCalledWith("openseo_google_property", { p_project_id: projectId, p_provider: "search-console", p_command: "get", p_payload: undefined });
  });
  it("fails closed for another project, absent or revoked connection, and mismatched binding", async () => {
    expect(await resolveGoogleSource(setup().client, otherProjectId, "search-console")).toMatchObject({ ok: false });
    expect(await resolveGoogleSource(setup({ state: "NONE" }).client, projectId, "search-console")).toEqual({ ok: false, error: "NOT_CONNECTED" });
    expect(await resolveGoogleSource(setup({ ...connection, state: "REVOKED", revokedAt: "2026-10-09T11:00:00Z" }).client, projectId, "search-console"))
      .toEqual({ ok: false, error: "NOT_CONNECTED" });
    expect(await resolveGoogleSource(setup(connection, { ...property, connectionId: otherConnectionId }).client, projectId, "search-console"))
      .toEqual({ ok: false, error: "NOT_CONNECTED" });
    expect(await resolveGoogleSource(setup(connection, { state: "NONE", provider: "search-console" }).client, projectId, "search-console"))
      .toEqual({ ok: false, error: "NOT_CONNECTED" });
  });
  it("rejects malformed provider data and invalid consent without calling the database", async () => {
    expect(await resolveGoogleSource(setup(connection, { ...property, externalPropertyId: "https://private.example/path?token=x" }).client,
      projectId, "search-console")).toEqual({ ok: false, error: "INVALID_RESPONSE" });
    const { client, rpc } = setup();
    expect(await connectGoogleProperty(client, projectId, "google-analytics", { externalPropertyId: "properties/123", consent: false }))
      .toEqual({ ok: false, error: "INVALID" });
    expect(await connectGoogleProperty(client, projectId, "google-analytics", { externalPropertyId: "properties/x", consent: true }))
      .toEqual({ ok: false, error: "INVALID" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("uses only the owner-scoped property RPC for an explicitly consented association", async () => {
    const { client, rpc } = setup();
    await connectGoogleProperty(client, projectId, "search-console", { externalPropertyId: "https://sarah.es/", consent: true });
    expect(rpc).toHaveBeenCalledWith("openseo_google_property", { p_project_id: projectId, p_provider: "search-console",
      p_command: "connect", p_payload: { externalPropertyId: "https://sarah.es/", consent: true } });
  });
});
