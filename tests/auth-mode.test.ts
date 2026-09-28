import { describe, expect, it } from "vitest";
import {
  MOCK_FORBIDDEN_IN_PRODUCTION,
  PUBLIC_KEY_IS_SECRET,
  assertProductionAuthConfig,
  isSecretKey,
  resolveAuthMode,
  supabasePublicConfig,
} from "@/lib/auth/mode";
import { safeNextPath } from "@/lib/auth/redirect";
import { PASSWORD_RULE, isValidEmail } from "@/lib/auth/credentials";

// Built at run time so no key-shaped literal is committed (see scripts/check-no-secrets.mjs).
const fakeJwt = (role: string) =>
  ["header", JSON.stringify({ role, iss: "supabase-demo" }), "signature"].map((p) => Buffer.from(p).toString("base64url")).join(".");
const PUBLISHABLE = ["sb", "publishable", "x".repeat(20)].join("_");
const SECRET = ["sb", "secret", "x".repeat(20)].join("_");
const LOCAL = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE };

describe("auth configuration (CORE-9.1: Supabase Auth only)", () => {
  it("has no sign-in at all without Supabase settings, in any environment", () => {
    for (const NODE_ENV of ["development", "test", "production"]) {
      expect(resolveAuthMode({ NODE_ENV })).toMatchObject({ mode: "not-configured", canSignIn: false });
      // The CORE-9.0 demo is gone: AUTH_MODE=mock no longer enables anything anywhere.
      expect(resolveAuthMode({ NODE_ENV, AUTH_MODE: "mock" })).toMatchObject({ mode: "not-configured", canSignIn: false });
    }
  });

  it("uses Supabase Auth when the URL and publishable key are set", () => {
    expect(resolveAuthMode(LOCAL)).toMatchObject({ mode: "supabase", canSignIn: true });
    expect(supabasePublicConfig({ ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).not.toBeNull();
  });

  it("ignores unusable URLs (plain http outside this machine, garbage)", () => {
    expect(supabasePublicConfig({ ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: "http://example.com" })).toBeNull();
    expect(supabasePublicConfig({ ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toBeNull();
  });

  it("never accepts a secret or service_role key as the public key", () => {
    expect(isSecretKey(SECRET)).toBe(true);
    expect(isSecretKey(fakeJwt("service_role"))).toBe(true);
    expect(isSecretKey(fakeJwt("anon"))).toBe(false);
    expect(isSecretKey(PUBLISHABLE)).toBe(false);
    for (const key of [SECRET, fakeJwt("service_role")]) {
      expect(supabasePublicConfig({ ...LOCAL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })).toBeNull();
      for (const NODE_ENV of ["development", "production"]) {
        expect(() => assertProductionAuthConfig({ ...LOCAL, NODE_ENV, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })).toThrow(PUBLIC_KEY_IS_SECRET);
      }
    }
  });

  it("still refuses to start a production server configured with the retired AUTH_MODE=mock", () => {
    for (const value of ["mock", "MOCK", " mock "]) {
      expect(() => assertProductionAuthConfig({ NODE_ENV: "production", AUTH_MODE: value }), value).toThrow(MOCK_FORBIDDEN_IN_PRODUCTION);
    }
    expect(() => assertProductionAuthConfig({ NODE_ENV: "production" })).not.toThrow();
    expect(() => assertProductionAuthConfig({ NODE_ENV: "production", ...LOCAL })).not.toThrow();
  });
});

describe("auth input rules", () => {
  it("only redirects to same-site relative paths after sign-in or confirmation", () => {
    expect(safeNextPath("/proyectos/a/b")).toBe("/proyectos/a/b");
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "panel", "/a\u0000b", null, 3]) {
      expect(safeNextPath(bad), String(bad)).toBe("/panel");
    }
  });

  it("requires 12+ characters with letters and digits (same as supabase/config.toml)", () => {
    expect(PASSWORD_RULE.test("corta1")).toBe(false);
    expect(PASSWORD_RULE.test("solamenteletras")).toBe(false);
    expect(PASSWORD_RULE.test("123456789012")).toBe(false);
    expect(PASSWORD_RULE.test("clave-larga-2026")).toBe(true);
    expect(isValidEmail("persona@ejemplo.test")).toBe(true);
    expect(isValidEmail("sin-arroba")).toBe(false);
  });
});
