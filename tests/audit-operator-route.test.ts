import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/operaciones/auditoria/pendientes/route";

afterEach(() => vi.unstubAllEnvs());

describe("manual audit outbox operator gate", () => {
  const url = "http://localhost/api/operaciones/auditoria/pendientes";
  it("is absent until explicitly configured", async () => {
    vi.stubEnv("RUBIK_AUDIT_DRAIN_TOKEN", "");
    expect((await GET(new Request(url))).status).toBe(404);
    expect((await POST(new Request(url))).status).toBe(404);
  });

  it("rejects missing, wrong, and partial bearer credentials before touching the database", async () => {
    vi.stubEnv("RUBIK_AUDIT_DRAIN_TOKEN", "fictitious-local-operator-token-32-characters");
    for (const value of [undefined, "Bearer wrong", "Bearer fictitious-local-operator-token-32-characters-more"]) {
      const headers = value ? { authorization: value } : undefined;
      expect((await GET(new Request(url, { headers }))).status).toBe(401);
      expect((await POST(new Request(url, { method: "POST", headers }))).status).toBe(401);
    }
  });
});
