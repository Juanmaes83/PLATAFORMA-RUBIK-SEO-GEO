import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  client: vi.fn(), signIn: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: auth.client }));

import { POST } from "@/app/api/auth/login/route";

function request(fields: Record<string, string>, origin = "https://preview.example.test", host = "preview.example.test") {
  const body = new URLSearchParams(fields).toString();
  return new NextRequest("https://preview.example.test/api/auth/login", {
    method: "POST", body,
    headers: { origin, host, "content-type": "application/x-www-form-urlencoded", "content-length": String(Buffer.byteLength(body)) },
  });
}

describe("native login POST", () => {
  beforeEach(() => {
    auth.signIn.mockReset().mockResolvedValue({ error: null });
    auth.client.mockReset().mockResolvedValue({ auth: { signInWithPassword: auth.signIn } });
  });

  it("rejects a foreign origin before calling Auth", async () => {
    expect((await POST(request({ email: "a@example.test", password: "secret" }, "https://other.example.test"))).status).toBe(403);
    expect(auth.client).not.toHaveBeenCalled();
  });

  it("accepts the loopback origin used by Playwright and rejects a different local hostname", async () => {
    const fields = { email: "a@example.test", password: "secret" };
    expect((await POST(request(fields, "http://localhost:3217", "localhost:3217"))).status).toBe(403);
    expect(auth.signIn).not.toHaveBeenCalled();
    const response = await POST(request(fields, "http://127.0.0.1:3217", "127.0.0.1:3217"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3217/panel");
    expect(auth.signIn).toHaveBeenCalledOnce();
  });

  it("rejects an oversized body before calling Auth", async () => {
    expect((await POST(request({ email: "a@example.test", password: "x".repeat(9000) }))).status).toBe(413);
    expect(auth.client).not.toHaveBeenCalled();
  });

  it("uses Auth and a document redirect for a valid form", async () => {
    const response = await POST(request({ email: "a@example.test", password: "secret", next: "/panel" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://preview.example.test/panel");
    expect(auth.signIn).toHaveBeenCalledWith({ email: "a@example.test", password: "secret" });
  });

  it("does not redirect to an external destination", async () => {
    const response = await POST(request({ email: "a@example.test", password: "secret", next: "//external.example.test" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://preview.example.test/panel");
  });

  it("keeps authentication errors as closed codes", async () => {
    auth.signIn.mockResolvedValue({ error: { code: "invalid_credentials" } });
    const response = await POST(request({ email: "a@example.test", password: "wrong" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://preview.example.test/acceso?error=credenciales");
  });

  it("fails closed when Preview Auth is unavailable", async () => {
    auth.client.mockResolvedValue(null);
    const response = await POST(request({ email: "a@example.test", password: "secret" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://preview.example.test/acceso");
    expect(auth.signIn).not.toHaveBeenCalled();
  });
});
