import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  PREVIEW_LOCKED_NOTICE,
  PUBLIC_KEY_IS_SECRET,
  assertProductionAuthConfig,
  resolveAuthMode,
  supabasePublicConfig,
} from "@/lib/auth/mode";

// N1-04 · Preview stays fail-closed until U02 (isolated Supabase project) is approved and a
// separately reviewed change unlocks it. Complements tests/auth-mode.test.ts and
// tests/preview-session-boundary.test.ts: here every entry point that could create a session,
// read or write tenant data is exercised in Preview, with spies proving that no Supabase client
// is built and no network request leaves the process. No external service is contacted.

const spies = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  cookies: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { url });
  }),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: spies.createServerClient }));
vi.mock("next/headers", () => ({ cookies: spies.cookies, headers: spies.headers }));
vi.mock("next/navigation", () => ({ redirect: spies.redirect }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), connection: async () => {} }));

// Built at run time so no key-shaped literal is committed (scripts/check-no-secrets.mjs).
const PUBLISHABLE = ["sb", "publishable", "x".repeat(20)].join("_");
const SECRET = ["sb", "secret", "x".repeat(20)].join("_");
const jwt = (role: string) => ["header", JSON.stringify({ role, iss: "supabase" }), "sig"].map((p) => Buffer.from(p).toString("base64url")).join(".");
const PRODUCTION_URL = ["https://", "prodproject", ".supabase.co"].join("");
const PREVIEW_URL = ["https://", "previewproject", ".supabase.co"].join("");

// Every plausible "unlock" switch an operator could set by mistake or by design.
const UNLOCK_FLAGS = ["PREVIEW_SUPABASE_ISOLATED", "PREVIEW_UNLOCK", "PREVIEW_AUTH_ENABLED", "SUPABASE_PREVIEW_ISOLATED", "ALLOW_PREVIEW_SESSIONS"];
const TRUTHY = ["true", "TRUE", "1", "yes", "on"];

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network is not allowed in this test"));
  spies.cookies.mockResolvedValue({ getAll: () => [{ name: "sb-prodproject-auth-token", value: "previous-session" }], set: vi.fn() });
  spies.headers.mockResolvedValue(new Headers({ origin: "https://rubik-git-feature.vercel.app" }));
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function stubPreview(extra: Record<string, string> = {}) {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PRODUCTION_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
}

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error && typeof error === "object" && "url" in error) return String((error as { url: string }).url);
    throw error;
  }
  throw new Error("expected a redirect");
}

describe("Preview configuration matrix (pure)", () => {
  it("no boolean switch unlocks Preview, whatever its name or value", () => {
    for (const url of [PRODUCTION_URL, PREVIEW_URL, "http://127.0.0.1:54321"]) {
      for (const flag of UNLOCK_FLAGS) {
        for (const value of TRUTHY) {
          const env = { VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE, [flag]: value };
          expect(supabasePublicConfig(env), `${flag}=${value}`).toBeNull();
          expect(resolveAuthMode(env), `${flag}=${value}`).toEqual({ mode: "preview-locked", canSignIn: false, notice: PREVIEW_LOCKED_NOTICE });
        }
      }
    }
  });

  it("stays locked with surrounding whitespace in VERCEL_ENV", () => {
    for (const value of ["preview", " preview", "preview ", "\tpreview\n"]) {
      expect(resolveAuthMode({ VERCEL_ENV: value, NEXT_PUBLIC_SUPABASE_URL: PREVIEW_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE }).mode, JSON.stringify(value)).toBe("preview-locked");
    }
  });

  it("missing or broken credentials never grant access, in any environment", () => {
    const broken: Record<string, string | undefined>[] = [
      {},
      { NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL },
      { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE },
      { NEXT_PUBLIC_SUPABASE_URL: "   ", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE },
      { NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "   " },
      { NEXT_PUBLIC_SUPABASE_URL: "http://prodproject.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE },
      { NEXT_PUBLIC_SUPABASE_URL: "javascript:alert(1)", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE },
      { NEXT_PUBLIC_SUPABASE_URL: "not a url", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE },
    ];
    for (const VERCEL_ENV of [undefined, "production", "development", "preview"]) {
      for (const env of broken) {
        const info = resolveAuthMode({ ...env, VERCEL_ENV });
        expect(info.canSignIn, `${VERCEL_ENV} ${JSON.stringify(env)}`).toBe(false);
        expect(supabasePublicConfig({ ...env, VERCEL_ENV })).toBeNull();
      }
    }
  });

  it("a secret or service_role key is never accepted as the public key, and refuses startup in every environment", () => {
    for (const key of [SECRET, ` ${SECRET} `, jwt("service_role")]) {
      for (const VERCEL_ENV of [undefined, "production", "development", "preview"]) {
        for (const NODE_ENV of ["development", "production"]) {
          const env = { VERCEL_ENV, NODE_ENV, NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key };
          expect(supabasePublicConfig(env)).toBeNull();
          expect(resolveAuthMode(env).canSignIn).toBe(false);
          expect(() => assertProductionAuthConfig(env), `${VERCEL_ENV}/${NODE_ENV}`).toThrow(PUBLIC_KEY_IS_SECRET);
        }
      }
    }
  });

  it("Production and Development keep their current contracts", () => {
    const hosted = { NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE };
    expect(resolveAuthMode({ ...hosted, VERCEL_ENV: "production" })).toMatchObject({ mode: "supabase", canSignIn: true });
    expect(supabasePublicConfig({ ...hosted, VERCEL_ENV: "production" })).toEqual({ url: PRODUCTION_URL, publishableKey: PUBLISHABLE });
    // Vercel Development and plain local runs are not locked: protection there relies on using
    // only the local stack (docs/ENVIRONMENT.md) and on the local CI preflight (scripts/ci-local).
    expect(resolveAuthMode({ ...hosted, VERCEL_ENV: "development" }).mode).toBe("supabase");
    expect(resolveAuthMode({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE }).mode).toBe("supabase");
    expect(() => assertProductionAuthConfig({ ...hosted, NODE_ENV: "production", VERCEL_ENV: "production" })).not.toThrow();
    expect(() => assertProductionAuthConfig({ NODE_ENV: "production", AUTH_MODE: "mock", VERCEL_ENV: "preview" })).toThrow();
  });
});

describe("Preview entry points (no Supabase client, no network)", () => {
  it("currentUser is null and requireSession sends to /acceso, even with a previous session cookie", async () => {
    stubPreview({ PREVIEW_SUPABASE_ISOLATED: "true" });
    const { currentUser, requireSession } = await import("@/lib/auth/session");
    expect(await currentUser()).toBeNull();
    expect(await redirectOf(() => requireSession())).toBe("/acceso");
    expect(spies.createServerClient).not.toHaveBeenCalled();
  });

  it("sign-in, sign-up, password reset and update never reach Supabase Auth", async () => {
    stubPreview();
    const auth = await import("@/lib/auth/actions");
    const email = "persona@ejemplo.test";
    expect(await redirectOf(() => auth.signIn(form({ email, password: "clave-larga-2026", next: "/panel" })))).toBe("/acceso");
    expect(await redirectOf(() => auth.signUp(form({ email, password: "clave-larga-2026" })))).toBe("/registro");
    expect(await redirectOf(() => auth.requestPasswordReset(form({ email })))).toBe("/recuperar");
    expect(await redirectOf(() => auth.updatePassword(form({ password: "clave-larga-2026", confirm: "clave-larga-2026" })))).toBe("/recuperar");
    expect(await redirectOf(() => auth.signOut())).toBe("/");
    expect(spies.createServerClient).not.toHaveBeenCalled();
  });

  it("e-mail confirmation and PKCE links cannot create a session", async () => {
    stubPreview();
    const { GET } = await import("@/app/auth/confirm/route");
    for (const query of ["token_hash=abc&type=signup", "token_hash=abc&type=recovery", "code=abc"]) {
      const target = await redirectOf(() => GET(new NextRequest(`https://rubik-git-x.vercel.app/auth/confirm?${query}&next=/panel`)));
      expect(target, query).toMatch(/^\/(acceso|recuperar)\?error=enlace$/);
    }
    expect(spies.createServerClient).not.toHaveBeenCalled();
  });

  it("tenant writes are refused before any database call", async () => {
    stubPreview();
    const tenancy = await import("@/lib/tenancy-actions");
    expect(await redirectOf(() => tenancy.createOrganization(form({ slug: "agencia", name: "Agencia" })))).toBe("/acceso");
    expect(await redirectOf(() => tenancy.createProject(form({ organization: "agencia", slug: "web", name: "Web", domain: "ejemplo.test" })))).toBe("/acceso");
    expect(spies.createServerClient).not.toHaveBeenCalled();
  });

  it("the project export (tenant data read) answers 404", async () => {
    stubPreview();
    const { GET } = await import("@/app/proyectos/[tenantId]/[projectId]/exportar/route");
    const response = await GET(new Request("https://rubik-git-x.vercel.app/proyectos/agencia/web/exportar"), { params: Promise.resolve({ tenantId: "agencia", projectId: "web" }) });
    expect(response.status).toBe(404);
    expect(spies.createServerClient).not.toHaveBeenCalled();
  });

  it("the proxy does not refresh or rewrite any auth cookie (chunked and refresh cookies included)", async () => {
    stubPreview({ PREVIEW_SUPABASE_ISOLATED: "1" });
    const { updateSession } = await import("@/lib/supabase/proxy");
    const cookie = "sb-prodproject-auth-token.0=part0; sb-prodproject-auth-token.1=part1; sb-prodproject-auth-token-code-verifier=v";
    const response = await updateSession(new NextRequest("https://rubik-git-x.vercel.app/panel", { headers: { cookie } }));
    expect(response.status).toBe(200);
    expect(response.cookies.getAll()).toEqual([]);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(spies.createServerClient).not.toHaveBeenCalled();
  });

  it("/api/salud reports the lock and no persistence", async () => {
    stubPreview({ PREVIEW_SUPABASE_ISOLATED: "true" });
    const { GET } = await import("@/app/api/salud/route");
    const body = await (await GET()).json();
    expect(body).toMatchObject({ auth: "preview-locked", persistence: "none", deployment: "none" });
    expect(JSON.stringify(body)).not.toContain("prodproject");
  });
});

describe("Production keeps its session path (contract unchanged)", () => {
  it("builds the SSR client with the publishable key only", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PRODUCTION_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
    spies.createServerClient.mockReturnValue({ auth: { getClaims: async () => ({ data: { claims: null }, error: null }) } });
    const { createClient } = await import("@/lib/supabase/server");
    expect(await createClient()).not.toBeNull();
    expect(spies.createServerClient).toHaveBeenCalledWith(PRODUCTION_URL, PUBLISHABLE, expect.anything());
  });
});
