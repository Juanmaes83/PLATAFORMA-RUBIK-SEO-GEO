import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { connectWebmasterProperty, getWebmasterProperty, revokeWebmasterProperty } from "@/lib/webmaster/properties";

const projectId = "00000000-0000-4000-8000-000000000001";
const active = { propertyId: "00000000-0000-4000-8000-000000000009", provider: "search-console", state: "ACTIVE",
  siteUrl: "sc-domain:cliente.example", grantedAt: "2026-10-09T10:00:00+00:00", revokedAt: null };
const fake = (result: { data?: unknown; error?: { code?: string; message?: string } } | Error) => {
  const rpc = vi.fn(async () => { if (result instanceof Error) throw result; return { data: result.data ?? null, error: result.error ?? null }; });
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
};

describe("Search Console / Bing property per project (ADR 0009, phase C)", () => {
  it("reads through the owner-only RPC and parses NONE per provider", async () => {
    const { client, rpc } = fake({ data: active });
    expect(await getWebmasterProperty(client, projectId, "search-console")).toEqual({ ok: true, property: active });
    expect(rpc).toHaveBeenCalledWith("webmaster_property", { p_project_id: projectId, p_provider: "search-console", p_command: "get", p_payload: undefined });
    expect(await getWebmasterProperty(fake({ data: { state: "NONE", provider: "bing-webmaster" } }).client, projectId, "bing-webmaster")).toEqual({ ok: true, property: null });
    // A NONE for another provider is not accepted as an answer to this one.
    expect(await getWebmasterProperty(fake({ data: { state: "NONE", provider: "bing-webmaster" } }).client, projectId, "search-console"))
      .toEqual({ ok: false, error: "PROPERTY_INVALID_RESPONSE" });
  });

  it("requires consent and a documented property form before calling the database", async () => {
    const { client, rpc } = fake({ data: active });
    for (const [provider, siteUrl, consent] of [
      ["search-console", "sc-domain:cliente.example", false], ["search-console", "http://cliente.example/", true], ["search-console", "https://cliente.example/es/", true],
      ["bing-webmaster", "sc-domain:cliente.example", true], ["search-console", "cliente.example", true],
    ] as const) expect(await connectWebmasterProperty(client, projectId, provider, { siteUrl, consent }), siteUrl).toEqual({ ok: false, error: "PROPERTY_INVALID" });
    expect(await getWebmasterProperty(client, projectId, "ga4" as never)).toEqual({ ok: false, error: "PROPERTY_INVALID" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends only the normalized property and consent, never a credential", async () => {
    const { client, rpc } = fake({ data: active });
    await connectWebmasterProperty(client, projectId, "search-console", { siteUrl: " SC-DOMAIN:Cliente.example ", consent: true });
    expect(rpc).toHaveBeenCalledWith("webmaster_property", { p_project_id: projectId, p_provider: "search-console", p_command: "connect",
      p_payload: { siteUrl: "sc-domain:cliente.example", consent: true } });
  });

  it("maps refusals to fixed codes and rejects malformed answers", async () => {
    for (const [code, error] of [["42501", "PROPERTY_FORBIDDEN"], ["22023", "PROPERTY_INVALID"], ["23514", "PROPERTY_CONFLICT"], ["23505", "PROPERTY_TAKEN"], ["XX000", "PROPERTY_UNAVAILABLE"]]) {
      const outcome = await revokeWebmasterProperty(fake({ error: { code, message: "detail with secrets" } }).client, projectId, "bing-webmaster");
      expect(outcome).toEqual({ ok: false, error });
      expect(JSON.stringify(outcome)).not.toContain("detail");
    }
    expect(await getWebmasterProperty(fake(new Error("network")).client, projectId, "search-console")).toEqual({ ok: false, error: "PROPERTY_UNAVAILABLE" });
    for (const data of [null, [], { ...active, provider: "bing-webmaster" }, { ...active, siteUrl: "javascript:alert(1)" }, { ...active, state: "REVOKED" },
      { ...active, grantedAt: "ayer" }, { ...active, propertyId: "1" }]) {
      expect(await getWebmasterProperty(fake({ data }).client, projectId, "search-console"), JSON.stringify(data)).toEqual({ ok: false, error: "PROPERTY_INVALID_RESPONSE" });
    }
    expect(await getWebmasterProperty(fake({ data: { ...active, provider: "bing-webmaster" } }).client, projectId, "bing-webmaster")).toEqual({ ok: false, error: "PROPERTY_INVALID_RESPONSE" });
  });
});
