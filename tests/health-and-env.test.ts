import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// `connection()` only works inside a Next.js request; outside it (unit test) it is a no-op.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), connection: async () => {} }));
const { GET } = await import("@/app/api/salud/route");

describe("technical status endpoint", () => {
  it("reports configuration only and no connected service", async () => {
    const body = await (await GET()).json();
    expect(body).toMatchObject({ status: "ok", stage: "CORE-9.1", deployment: "none" });
    expect(["supabase", "not-configured"]).toContain(body.auth);
    expect(body.persistence).toBe(body.auth === "supabase" ? "supabase" : "none");
    expect(body.core.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(body.integrations.every((i: { status: string }) => i.status !== "CONNECTED")).toBe(true);
  });
});

describe(".env.example", () => {
  const lines = readFileSync(join(__dirname, "..", ".env.example"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"));

  it("contains variable names only, never values", () => {
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line, line).toMatch(/^[A-Z][A-Z0-9_]*=$/);
  });

  it("declares only the two public Supabase names, never a service-role or secret key", () => {
    expect(lines.some((l) => /SERVICE_ROLE|SECRET|ANON_KEY|AUTH_MODE/.test(l))).toBe(false);
    expect(lines).toEqual(["NEXT_PUBLIC_SUPABASE_URL=", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="]);
  });
});
