import { describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/lib/provenance/writer", () => ({ writerPool: () => ({ query }) }));
import { inspectProjectAuditOutbox, sameOutboxCheckpoint } from "@/lib/provenance/outbox";

const project = {
  projectId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  scope: { tenantId: "a", projectId: "a1" },
};

describe("R1 export audit gate", () => {
  it("accepts an empty project queue and ignores receipts of another project", async () => {
    query.mockResolvedValueOnce({ rows: [{ total: "0", pending: "0", wrong_scope: "0", unlinked: "0" }] });
    expect(await inspectProjectAuditOutbox(project)).toEqual({ ok: true, checkpoint: { total: 0 } });
    expect(query.mock.calls.at(-1)?.[1]).toEqual([project.projectId, project.organizationId]);
  });

  it("refuses pending receipts of this project", async () => {
    query.mockResolvedValueOnce({ rows: [{ total: "2", pending: "1", wrong_scope: "0", unlinked: "0" }] });
    expect(await inspectProjectAuditOutbox(project)).toEqual({ ok: false, error: "AUDIT_PENDING" });
  });

  it("refuses a scope mismatch or an unavailable writer", async () => {
    query.mockResolvedValueOnce({ rows: [{ total: "1", pending: "0", wrong_scope: "1", unlinked: "0" }] });
    expect(await inspectProjectAuditOutbox(project)).toEqual({ ok: false, error: "AUDIT_SCOPE_INVALID" });
    query.mockRejectedValueOnce(new Error("writer down"));
    expect(await inspectProjectAuditOutbox(project)).toEqual({ ok: false, error: "AUDIT_CHECK_UNAVAILABLE" });
  });

  it("refuses a completed receipt without its signed event", async () => {
    query.mockResolvedValueOnce({ rows: [{ total: "1", pending: "0", wrong_scope: "0", unlinked: "1" }] });
    expect(await inspectProjectAuditOutbox(project)).toEqual({ ok: false, error: "AUDIT_RECEIPT_UNLINKED" });
  });

  it("refuses a receipt created during export, then accepts its signed retry", () => {
    expect(sameOutboxCheckpoint({ total: 1 }, { total: 2 })).toBe(false);
    expect(sameOutboxCheckpoint({ total: 2 }, { total: 2 })).toBe(true);
  });
});
