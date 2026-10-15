import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// No Supabase requests are allowed in this test. Spies fail if the Preview attempts to
// initialise its SSR client, even when a browser supplies a previously valid auth cookie.
const spies = vi.hoisted(() => ({ createServerClient: vi.fn(), cookies: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: spies.createServerClient }));
vi.mock("next/headers", () => ({ cookies: spies.cookies }));

const { createClient } = await import("@/lib/supabase/server");
const { updateSession } = await import("@/lib/supabase/proxy");

function environment(kind: string, isolationFlag = "") {
  vi.stubEnv("VERCEL_ENV", kind);
  vi.stubEnv("PREVIEW_SUPABASE_ISOLATED", isolationFlag);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://tenant.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ["sb", "publishable", "x".repeat(20)].join("_"));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Vercel Preview session boundary (no external network)", () => {
  for (const isolationFlag of ["", "true"]) {
    it(`ignores existing auth cookies and does not initialise Supabase in Preview (flag=${isolationFlag || "unset"})`, async () => {
      environment("preview", isolationFlag);
      const request = new NextRequest("https://example.vercel.app/panel", {
        headers: { cookie: "sb-example-auth-token=previous-session; another=value" },
      });
      expect(request.cookies.get("sb-example-auth-token")?.value).toBe("previous-session");

      expect(await createClient()).toBeNull();
      const response = await updateSession(request);

      expect(response.status).toBe(200);
      expect(spies.createServerClient).not.toHaveBeenCalled();
      expect(spies.cookies).not.toHaveBeenCalled();
      expect(response.cookies.get("sb-example-auth-token")).toBeUndefined();
      expect(request.cookies.get("sb-example-auth-token")?.value).toBe("previous-session");
    });
  }

  it("preserves the production SSR client and session refresh path", async () => {
    environment("production");
    const getClaims = vi.fn(async () => ({ data: { claims: null }, error: null }));
    const client = { auth: { getClaims } };
    spies.createServerClient.mockReturnValue(client);
    spies.cookies.mockResolvedValue({ getAll: () => [], set: vi.fn() });

    expect(await createClient()).toBe(client);
    const response = await updateSession(new NextRequest("https://example.com/panel"));
    expect(response.status).toBe(200);
    expect(spies.createServerClient).toHaveBeenCalledTimes(2);
    expect(spies.cookies).toHaveBeenCalledTimes(1);
    expect(getClaims).toHaveBeenCalledOnce();
  });
});
