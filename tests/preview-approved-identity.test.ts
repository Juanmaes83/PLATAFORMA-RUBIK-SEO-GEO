import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// U02 · Preview with the APPROVED isolated ref. Sessions open only after the real Data API read
// of the operational sentinel returns exactly preview/rhnnplewqsekrnaousyl. A missing sentinel,
// a failed read, the Production ref or a look-alike ref keep every session path closed: the SSR
// client is never built, auth cookies are not refreshed, the user is null and sign-in is off.
// fetch is a local stub: no request leaves the process.
const spies = vi.hoisted(() => ({ createServerClient: vi.fn(), cookies: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: spies.createServerClient }));
vi.mock("next/headers", () => ({ cookies: spies.cookies }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), connection: async () => {} }));

const { createClient } = await import("@/lib/supabase/server");
const { updateSession } = await import("@/lib/supabase/proxy");
const { currentUser, requestAuthMode } = await import("@/lib/auth/session");
const { PRODUCTION_SUPABASE_REF } = await import("@/lib/auth/mode");

const APPROVED = "rhnnplewqsekrnaousyl";
const RPC = `https://${APPROVED}.supabase.co/rest/v1/rpc/preview_environment_identity`;
// Built at run time so no key-shaped literal is committed (scripts/check-no-secrets.mjs).
const PUBLISHABLE = ["sb", "publishable", "x".repeat(20)].join("_");
const SENTINEL = [{ environment: "preview", project_ref: APPROVED }];

let fetchSpy: ReturnType<typeof vi.spyOn>;
const answer = (body: unknown, status = 200) => fetchSpy.mockImplementation(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

function preview(url = `https://${APPROVED}.supabase.co`) {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
}

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected network"));
  spies.cookies.mockResolvedValue({ getAll: () => [{ name: `sb-${APPROVED}-auth-token`, value: "previous-session" }], set: vi.fn() });
});
afterEach(() => {
  fetchSpy.mockRestore();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function expectClosed() {
  const request = new NextRequest("https://rubik-git-u02.vercel.app/panel", { headers: { cookie: `sb-${APPROVED}-auth-token=previous-session` } });
  expect(await createClient()).toBeNull();
  const response = await updateSession(request);
  expect(response.cookies.get(`sb-${APPROVED}-auth-token`)).toBeUndefined();
  expect(await currentUser()).toBeNull();
  expect(await requestAuthMode()).toMatchObject({ mode: "preview-locked", canSignIn: false });
  expect(spies.createServerClient).not.toHaveBeenCalled();
  expect(spies.cookies).not.toHaveBeenCalled();
}

describe("Preview with the approved ref", () => {
  it("opens the session paths only after the exact sentinel is read with the publishable key", async () => {
    preview();
    answer(SENTINEL);
    const getClaims = vi.fn(async () => ({ data: { claims: { sub: "u-1", iss: `https://${APPROVED}.supabase.co/auth/v1`, email: "a@ejemplo.test" } }, error: null }));
    spies.createServerClient.mockReturnValue({ auth: { getClaims } });
    expect(await requestAuthMode()).toMatchObject({ mode: "preview-isolated", canSignIn: true });
    expect(await createClient()).not.toBeNull();
    expect(await currentUser()).toEqual({ id: "u-1", email: "a@ejemplo.test" });
    for (const [url, init] of fetchSpy.mock.calls as [string, RequestInit][]) {
      expect(url).toBe(RPC);
      expect(init.headers).toEqual({ apikey: PUBLISHABLE });
    }
    expect(spies.createServerClient.mock.calls.every(([url]) => url === `https://${APPROVED}.supabase.co`)).toBe(true);
  });

  it("a session token issued by the Production project is not a Preview user", async () => {
    preview();
    answer(SENTINEL);
    spies.createServerClient.mockReturnValue({ auth: { getClaims: async () => ({ data: { claims: { sub: "u-1", iss: `https://${PRODUCTION_SUPABASE_REF}.supabase.co/auth/v1` } }, error: null }) } });
    expect(await currentUser()).toBeNull();
  });

  it("missing sentinel (PostgREST 404) keeps every session path closed", async () => {
    preview();
    answer({ code: "PGRST202", message: "Could not find the function public.preview_environment_identity" }, 404);
    await expectClosed();
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("read errors keep every session path closed: 500, 401, invalid JSON, network failure, timeout", async () => {
    preview();
    for (const setup of [
      () => answer({ message: "boom" }, 500),
      () => answer({ message: "invalid api key" }, 401),
      () => answer("<html>not json</html>"),
      () => fetchSpy.mockRejectedValue(new TypeError("fetch failed")),
      () => fetchSpy.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError")),
    ]) {
      setup();
      await expectClosed();
      vi.clearAllMocks();
    }
  });

  it("an unexpected sentinel answer keeps it closed", async () => {
    preview();
    for (const rows of [[], [{ environment: "production", project_ref: APPROVED }], [{ environment: "preview", project_ref: PRODUCTION_SUPABASE_REF }], [...SENTINEL, ...SENTINEL], { environment: "preview", project_ref: APPROVED }]) {
      answer(rows);
      await expectClosed();
      vi.clearAllMocks();
    }
  });

  it("the Production ref and look-alike refs are refused before any network read", async () => {
    for (const ref of [PRODUCTION_SUPABASE_REF, "rhnnplewqsekrnaousym", "rhnnplewqsekrnaousy", "rhnnplewqsekrnaousyl1", "xrhnnplewqsekrnaousyl", "rhnnplewqsekrnaous-l"]) {
      preview(`https://${ref}.supabase.co`);
      answer(SENTINEL);
      await expectClosed();
      expect(fetchSpy, ref).not.toHaveBeenCalled();
      vi.clearAllMocks();
      vi.unstubAllEnvs();
    }
  });

  it("a secret key in the public variable is refused before any read", async () => {
    preview();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ["sb", "secret", "x".repeat(20)].join("_"));
    answer(SENTINEL);
    expect(await createClient()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
