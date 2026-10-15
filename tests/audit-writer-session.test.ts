import { afterEach, describe, expect, it, vi } from "vitest";

// An expired or invalid JWT is refused by Auth before the writer opens any connection.
const pg = vi.hoisted(() => {
  const connect = vi.fn();
  return { connect, Pool: vi.fn(function Pool(this: Record<string, unknown>) { this.on = () => {}; this.end = async () => {}; this.connect = connect; }) };
});
vi.mock("pg", () => ({ Pool: pg.Pool, default: { Pool: pg.Pool } }));
const { appendTrustedAudit, storeTrustedProviderResult, completeTrustedProviderCommand } = await import("@/lib/provenance/writer");

const project = { projectId: "11111111-1111-4111-8111-111111111111", organizationId: "22222222-2222-4222-8222-222222222222", scope: { tenantId: "a", projectId: "b" } };
const actor = { role: "owner" as const, id: "33333333-3333-4333-8333-333333333333" };
const expired = { auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { status: 401, code: "bad_jwt", message: "JWT expired" } })) } };
afterEach(() => { vi.unstubAllEnvs(); pg.connect.mockClear(); });

describe("trusted writer with an expired session", () => {
  it("refuses audit, results and provider completion before connecting", async () => {
    vi.stubEnv("RUBIK_AUDIT_DATABASE_URL", "postgresql://rubik_audit_writer:fictitious@127.0.0.1:57322/postgres");
    vi.stubEnv("VERCEL_ENV", "");
    const client = expired as never;
    expect(await appendTrustedAudit(client, project, { actor, action: "x", outcome: "allowed" }, {} as never)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(await storeTrustedProviderResult(client, project, {}, {} as never)).toMatchObject({ ok: false });
    expect(await completeTrustedProviderCommand(client, project, { kind: "openseo", jobId: actor.id, issues: {} as never, pages: {} as never }))
      .toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(expired.auth.getUser).toHaveBeenCalled();
    expect(pg.connect).not.toHaveBeenCalled();
  });
});
