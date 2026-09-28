import { describe, expect, it } from "vitest";
import { MOCK_FORBIDDEN_IN_PRODUCTION, assertProductionAuthConfig, resolveAuthMode } from "@/lib/auth/mode";

describe("auth mode (CORE-9.0: mock only, development only)", () => {
  it("defaults to the local mock outside production", () => {
    expect(resolveAuthMode({ NODE_ENV: "development" })).toMatchObject({ mode: "mock", canSignIn: true });
    expect(resolveAuthMode({ NODE_ENV: "development", AUTH_MODE: "mock" }).mode).toBe("mock");
    expect(resolveAuthMode({ NODE_ENV: "test" }).mode).toBe("mock");
  });

  it("can never enable the mock in production, even with AUTH_MODE=mock", () => {
    expect(resolveAuthMode({ NODE_ENV: "production" })).toMatchObject({ mode: "disabled", canSignIn: false });
    for (const value of ["mock", "MOCK", " mock "]) {
      const info = resolveAuthMode({ NODE_ENV: "production", AUTH_MODE: value });
      expect(info, value).toMatchObject({ mode: "disabled", canSignIn: false, notice: MOCK_FORBIDDEN_IN_PRODUCTION });
    }
  });

  it("refuses to start a production server configured with AUTH_MODE=mock", () => {
    expect(() => assertProductionAuthConfig({ NODE_ENV: "production", AUTH_MODE: "mock" })).toThrow(/prohibido en producción/);
    expect(() => assertProductionAuthConfig({ NODE_ENV: "production" })).not.toThrow();
    expect(() => assertProductionAuthConfig({ NODE_ENV: "development", AUTH_MODE: "mock" })).not.toThrow();
  });

  it("never pretends Supabase is connected", () => {
    for (const NODE_ENV of ["development", "production"]) {
      const info = resolveAuthMode({ NODE_ENV, AUTH_MODE: "supabase" });
      expect(info).toMatchObject({ mode: "supabase-not-implemented", canSignIn: false });
    }
  });

  it("rejects unknown modes", () => {
    expect(resolveAuthMode({ NODE_ENV: "development", AUTH_MODE: "oauth" }).mode).toBe("disabled");
  });
});
