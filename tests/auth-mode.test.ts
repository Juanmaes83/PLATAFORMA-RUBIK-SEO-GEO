import { describe, expect, it } from "vitest";
import { resolveAuthMode } from "@/lib/auth/mode";

describe("auth mode (CORE-9.0: mock only)", () => {
  it("defaults to the local mock outside production", () => {
    expect(resolveAuthMode({ NODE_ENV: "development" })).toMatchObject({ mode: "mock", canSignIn: true });
    expect(resolveAuthMode({ NODE_ENV: "test" }).mode).toBe("mock");
  });

  it("is disabled in production unless the mock is requested explicitly", () => {
    expect(resolveAuthMode({ NODE_ENV: "production" })).toMatchObject({ mode: "disabled", canSignIn: false });
    expect(resolveAuthMode({ NODE_ENV: "production", AUTH_MODE: "mock" }).mode).toBe("mock");
  });

  it("never pretends Supabase is connected", () => {
    const info = resolveAuthMode({ NODE_ENV: "development", AUTH_MODE: "supabase" });
    expect(info).toMatchObject({ mode: "supabase-not-implemented", canSignIn: false });
    expect(info.notice).toMatch(/no está implementado/);
  });

  it("rejects unknown modes", () => {
    expect(resolveAuthMode({ NODE_ENV: "development", AUTH_MODE: "oauth" }).mode).toBe("disabled");
  });
});
