import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { connectProject, getProjectConnection, revokeProjectConnection } from "@/lib/openseo/connections";

const projectId = "00000000-0000-4000-8000-000000000001";
const active = { connectionId: "00000000-0000-4000-8000-000000000009", state: "ACTIVE", credentialMode: "platform",
  openseoProjectId: "oseo-project_1", allowedHosts: ["example.com", "www.example.com"], grantedAt: "2026-10-09T10:00:00+00:00", revokedAt: null };
const fake = (result: { data?: unknown; error?: { code?: string; message?: string } | null } | Error) => {
  const rpc = vi.fn(async () => { if (result instanceof Error) throw result; return { data: result.data ?? null, error: result.error ?? null }; });
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
};

describe("OpenSEO project connections (phase 1)", () => {
  it("reads an active connection and an empty state through the session RPC", async () => {
    const { client, rpc } = fake({ data: active });
    expect(await getProjectConnection(client, projectId)).toEqual({ ok: true, connection: active });
    expect(rpc).toHaveBeenCalledWith("openseo_connection", { p_project_id: projectId, p_command: "get", p_payload: undefined });
    expect(await getProjectConnection(fake({ data: { state: "NONE" } }).client, projectId)).toEqual({ ok: true, connection: null });
  });

  it("requires explicit consent and auditable hosts before calling the database", async () => {
    const { client, rpc } = fake({ data: active });
    const base = { openseoProjectId: "oseo-project_1", allowedHosts: ["example.com"], consent: true };
    for (const bad of [
      { ...base, consent: false },
      { ...base, openseoProjectId: "bad id" },
      { ...base, allowedHosts: [] },
      { ...base, allowedHosts: ["a.example.com", "b.example.com", "c.example.com"] },
      { ...base, allowedHosts: ["client.vercel.app"] },
      { ...base, allowedHosts: ["127.0.0.1"] },
    ]) expect(await connectProject(client, projectId, bad)).toEqual({ ok: false, error: "CONNECTION_INVALID" });
    expect(await connectProject(client, "not-a-uuid", base)).toEqual({ ok: false, error: "CONNECTION_INVALID" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("normalizes hosts and sends only identifiers and consent, never a key", async () => {
    const { client, rpc } = fake({ data: active });
    await connectProject(client, projectId, { openseoProjectId: "oseo-project_1", allowedHosts: [" WWW.Example.com", "www.example.com"], consent: true });
    expect(rpc).toHaveBeenCalledWith("openseo_connection", { p_project_id: projectId, p_command: "connect",
      p_payload: { openseoProjectId: "oseo-project_1", allowedHosts: ["www.example.com"], consent: true } });
  });

  it("maps database refusals to fixed codes without leaking messages", async () => {
    const cases: [string | undefined, string][] = [["42501", "CONNECTION_FORBIDDEN"], ["22023", "CONNECTION_INVALID"],
      ["23514", "CONNECTION_CONFLICT"], ["23505", "CONNECTION_TAKEN"], ["XX000", "CONNECTION_UNAVAILABLE"], [undefined, "CONNECTION_UNAVAILABLE"]];
    for (const [code, error] of cases) {
      const outcome = await revokeProjectConnection(fake({ error: { code, message: "oseo-secret detail" } }).client, projectId);
      expect(outcome).toEqual({ ok: false, error });
      expect(JSON.stringify(outcome)).not.toContain("oseo-secret");
    }
    expect(await getProjectConnection(fake(new Error("network")).client, projectId)).toEqual({ ok: false, error: "CONNECTION_UNAVAILABLE" });
  });

  it("refuses malformed or inconsistent responses", async () => {
    for (const data of [null, [], { ...active, credentialMode: "project-secret" }, { ...active, openseoProjectId: "x y" },
      { ...active, allowedHosts: ["localhost"] }, { ...active, allowedHosts: [] }, { ...active, state: "REVOKED" },
      { ...active, revokedAt: "2026-10-09T11:00:00Z" }, { ...active, grantedAt: "yesterday" }, { ...active, connectionId: "1" }]) {
      expect(await getProjectConnection(fake({ data }).client, projectId)).toEqual({ ok: false, error: "CONNECTION_INVALID_RESPONSE" });
    }
  });

  it("every OpenSEO server action resolves its target first (phase 4)", () => {
    const actions = readFileSync("src/lib/openseo/actions.ts", "utf8");
    for (const name of ["testConnectionAction", "startAuditAction", "followAuditAction"]) {
      const body = actions.slice(actions.indexOf(`export async function ${name}`)).split("\nexport ")[0];
      expect(body).toContain("resolveOpenSeoTarget(");
    }
  });
});
