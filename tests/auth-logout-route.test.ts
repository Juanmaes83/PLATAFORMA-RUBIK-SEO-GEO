import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({ client: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: auth.client }));
import { POST } from "@/app/api/auth/logout/route";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("https://internal.invalid/api/auth/logout", {
    method: "POST", body: "",
    headers: { origin: "https://preview.example.test", host: "preview.example.test",
      "content-type": "application/x-www-form-urlencoded", "content-length": "0", ...headers },
  });
}

describe("native logout POST", () => {
  beforeEach(() => {
    auth.signOut.mockReset().mockResolvedValue({ error: null });
    auth.client.mockReset().mockResolvedValue({ auth: { signOut: auth.signOut } });
  });
  it("uses the existing signOut scope and redirects the browser to its submitted origin", async () => {
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://preview.example.test/");
    expect(auth.signOut).toHaveBeenCalledExactlyOnceWith();
  });
  it("accepts numeric loopback and rejects the localhost alias before Auth", async () => {
    expect((await POST(request({ origin: "http://localhost:3217", host: "localhost:3217" }))).status).toBe(403);
    expect(auth.client).not.toHaveBeenCalled();
    const response = await POST(request({ origin: "http://127.0.0.1:3217", host: "127.0.0.1:3217" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3217/");
  });
  it.each(["", "https://foreign.example.test", "http://preview.example.test",
    "https://person@preview.example.test", "https://preview.example.test/path"])("rejects unsafe Origin %j before Auth", async origin => {
    expect((await POST(request({ origin }))).status).toBe(403);
    expect(auth.client).not.toHaveBeenCalled();
  });
  it("rejects a missing Host before Auth", async () => {
    expect((await POST(request({ host: "" }))).status).toBe(403);
    expect(auth.client).not.toHaveBeenCalled();
  });
  it("rejects unsupported media and excessive lengths before Auth", async () => {
    expect((await POST(request({ "content-type": "application/json" }))).status).toBe(415);
    for (const length of ["8193", "unknown"]) expect((await POST(request({ "content-length": length }))).status).toBe(413);
    expect(auth.client).not.toHaveBeenCalled();
  });
  it("does not announce success when the guarded Preview client is unavailable", async () => {
    auth.client.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect(auth.signOut).not.toHaveBeenCalled();
  });
  it("keeps Auth failures closed and does not leak provider details", async () => {
    auth.signOut.mockResolvedValue({ error: { message: "private-provider-detail" } });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).not.toContain("private-provider-detail");
  });
  it("keeps unexpected errors closed without exposing credentials", async () => {
    auth.client.mockRejectedValue(new Error("private-config-detail"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-config-detail");
  });
});
