import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), verifyOtp: vi.fn(), exchange: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { GET } from "@/app/auth/confirm/route";

const request = (query = "") => new NextRequest(`https://rubik.example/auth/confirm${query}`);
const failure = "redirect:/acceso?error=enlace";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({ auth: { verifyOtp: mocks.verifyOtp, exchangeCodeForSession: mocks.exchange } });
  mocks.verifyOtp.mockResolvedValue({ error: null });
  mocks.exchange.mockResolvedValue({ error: null });
});

describe("server auth confirmation", () => {
  it.each(["email", "signup"])("preserves token-hash confirmation for %s", async (type) => {
    await expect(GET(request(`?token_hash=fixture&type=${type}&next=/proyectos/rubik/sarah`))).rejects.toThrow("redirect:/proyectos/rubik/sarah");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type, token_hash: "fixture" });
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("exchanges standard PKCE codes through the SSR client", async () => {
    await expect(GET(request("?code=fixture-code"))).rejects.toThrow("redirect:/panel");
    expect(mocks.exchange).toHaveBeenCalledWith("fixture-code", undefined);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("preserves the explicit flow id for the correct verifier lookup", async () => {
    await expect(GET(request("?code=fixture-code&sb_flow_id=fixture-flow"))).rejects.toThrow("redirect:/panel");
    expect(mocks.exchange).toHaveBeenCalledWith("fixture-code", { flowId: "fixture-flow" });
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example"])("prevents redirect to %s after code exchange", async (next) => {
    await expect(GET(request(`?code=fixture-code&next=${encodeURIComponent(next)}`))).rejects.toThrow("redirect:/panel");
  });

  it.each(["recovery", "invite", "magiclink", "unknown"])("does not enable the %s OTP flow", async (type) => {
    await expect(GET(request(`?token_hash=fixture&type=${type}&code=fixture-code`))).rejects.toThrow(failure);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("does not fall back to a different credential after failed OTP verification", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { message: "fixture-error" } });
    await expect(GET(request("?token_hash=fixture&type=email&code=fixture-code"))).rejects.toThrow(failure);
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it.each(["", "?token_hash=fixture", "?code=", "#access_token=fixture"])("rejects missing or unsupported credentials: %s", async (query) => {
    await expect(GET(request(query))).rejects.toThrow(failure);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("rejects an expired code or missing verifier without leaking the error", async () => {
    mocks.exchange.mockResolvedValue({ error: { message: "fixture-private-error" } });
    await expect(GET(request("?code=fixture-code"))).rejects.toThrow(failure);
  });

  it("turns thrown transport errors into the same generic auth failure", async () => {
    mocks.exchange.mockRejectedValue(new Error("fixture-private-error"));
    await expect(GET(request("?code=fixture-code"))).rejects.toThrow(failure);
  });

  it("does not authenticate when Supabase is unavailable", async () => {
    mocks.createClient.mockResolvedValue(null);
    await expect(GET(request("?code=fixture-code"))).rejects.toThrow(failure);
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
});
