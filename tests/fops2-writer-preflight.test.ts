import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preflightTrustedWriter } from "@/lib/provenance/writer";
import type { Keyring } from "@/lib/provenance/keyring";

const m = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), release: vi.fn(), end: vi.fn() }));
vi.mock("pg", () => ({ Pool: class {
  connect = m.connect;
  end = m.end;
  on() { return this; }
} }));

const project = { projectId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333", scope: { tenantId: "org-a", projectId: "site-a" } };
const actorId = "11111111-1111-4111-8111-111111111111";
const client = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: actorId } }, error: null })) } };
const ring = {} as Keyring;
const originalUrl = process.env.RUBIK_AUDIT_DATABASE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RUBIK_AUDIT_DATABASE_URL = "postgresql://fictional:fictional@127.0.0.1:65432/fictional";
  m.connect.mockResolvedValue({ query: m.query, release: m.release });
  m.query.mockImplementation(async (sql: string) => {
    if (sql.includes("has_table_privilege")) return { rows: [{ ready: true }] };
    if (sql.includes("audit_writer_actor")) return { rows: [{ organization_id: project.organizationId,
      actor_role: "owner", tenant_slug: "org-a", project_slug: "site-a" }] };
    return { rows: [] };
  });
});
afterEach(() => {
  if (originalUrl === undefined) delete process.env.RUBIK_AUDIT_DATABASE_URL;
  else process.env.RUBIK_AUDIT_DATABASE_URL = originalUrl;
});

describe("F-OPS-2 dedicated writer readiness", () => {
  it("fails closed without a configured SQL identity", async () => {
    delete process.env.RUBIK_AUDIT_DATABASE_URL;
    expect(await preflightTrustedWriter(client as never, project, actorId, ring, "google"))
      .toEqual({ ok: false, error: "WRITER_NOT_CONFIGURED" });
    expect(m.connect).not.toHaveBeenCalled();
  });

  it("checks actual SQL connection, grants, actor and chain without writing a receipt", async () => {
    expect(await preflightTrustedWriter(client as never, project, actorId, ring, "google")).toEqual({ ok: true });
    expect(m.connect).toHaveBeenCalledTimes(1);
    expect(m.query.mock.calls.map(call => String(call[0]))).toEqual(expect.arrayContaining([
      "begin", "rollback",
    ]));
    expect(m.query.mock.calls.every(call => !/^\s*(insert|update|delete)\b/i.test(String(call[0])))).toBe(true);
    expect(m.release).toHaveBeenCalledTimes(1);
  });

  it("fails closed on lost connection or missing grants", async () => {
    m.connect.mockRejectedValueOnce(new Error("local connection refused"));
    expect(await preflightTrustedWriter(client as never, project, actorId, ring, "openseo"))
      .toEqual({ ok: false, error: "WRITER_UNAVAILABLE" });
    m.query.mockImplementation(async (sql: string) => sql.includes("has_table_privilege")
      ? { rows: [{ ready: false }] } : { rows: [] });
    expect(await preflightTrustedWriter(client as never, project, actorId, ring, "openseo"))
      .toEqual({ ok: false, error: "WRITER_UNAVAILABLE" });
  });

  it("rejects cross-organization scope before any provider can run", async () => {
    m.query.mockImplementation(async (sql: string) => {
      if (sql.includes("has_table_privilege")) return { rows: [{ ready: true }] };
      if (sql.includes("audit_writer_actor")) return { rows: [{ organization_id: "other-org",
        actor_role: "owner", tenant_slug: "org-a", project_slug: "site-a" }] };
      return { rows: [] };
    });
    expect(await preflightTrustedWriter(client as never, project, actorId, ring, "google"))
      .toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect(m.query.mock.calls.some(call => String(call[0]).includes("public.audit_events"))).toBe(true);
  });
});
