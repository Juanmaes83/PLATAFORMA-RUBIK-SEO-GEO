import { beforeEach, describe, expect, it, vi } from "vitest";
import { providerWriterReady } from "@/lib/provenance/provider-writer-readiness";

const m = vi.hoisted(() => ({ writerPool: vi.fn(), query: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/provenance/writer", () => ({ writerPool: m.writerPool }));
const client = { auth: { getUser: m.getUser } } as never;
const project = { projectId: "11111111-1111-4111-8111-111111111111", organizationId: "22222222-2222-4222-8222-222222222222",
  scope: { tenantId: "tenant", projectId: "site" } };

beforeEach(() => {
  vi.resetAllMocks();
  m.writerPool.mockReturnValue({ query: m.query });
  m.getUser.mockResolvedValue({ data: { user: { id: "33333333-3333-4333-8333-333333333333" } }, error: null });
  m.query.mockResolvedValue({ rows: [{ role_ok: true, actor_ok: true, schema_ok: true, receipt_ok: true }] });
});

describe("provider writer preflight", () => {
  it("rejects absent configuration and never contacts SQL", async () => {
    m.writerPool.mockReturnValue(null);
    expect(await providerWriterReady(client, project, "google")).toBe(false);
    expect(m.query).not.toHaveBeenCalled();
  });
  it("rejects connection failures, missing schema, missing receipt trigger and wrong SQL role", async () => {
    m.query.mockRejectedValueOnce(new Error("connection refused"));
    expect(await providerWriterReady(client, project, "google")).toBe(false);
    for (const field of ["role_ok", "actor_ok", "schema_ok", "receipt_ok"]) {
      m.query.mockResolvedValueOnce({ rows: [{ role_ok: true, actor_ok: true, schema_ok: true, receipt_ok: true, [field]: false }] });
      expect(await providerWriterReady(client, project, "openseo")).toBe(false);
    }
  });
  it("requires live actor authentication and checks the role, routines, tables and receipt trigger through SQL", async () => {
    expect(await providerWriterReady(client, project, "google")).toBe(true);
    const [{ text: sql, values, query_timeout: timeout }] = m.query.mock.calls[0];
    expect(sql).toContain("private.audit_writer_actor");
    expect(sql).toContain("private.google_capture_command");
    expect(sql).toContain("private.openseo_job");
    expect(sql).toContain("private.audit_outbox");
    expect(sql).toContain("has_table_privilege");
    expect(sql).toContain("pg_trigger");
    expect(values).toEqual([project.projectId, "33333333-3333-4333-8333-333333333333", project.organizationId, "tenant", "site", "google"]);
    expect(timeout).toBe(3000);
  });
});
