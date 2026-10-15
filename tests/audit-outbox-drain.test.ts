import { afterEach, describe, expect, it, vi } from "vitest";
import type { Keyring } from "@/lib/provenance/keyring";

// Isolate the outbox unit tests from the PostgreSQL stack and writer credentials.
// A fake pool fails to process the first receipt while recording retry attempts.
const mocked = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock("@/lib/provenance/writer", () => ({ writerPool: () => mocked.pool }));
import { drainAuditOutbox } from "@/lib/provenance/outbox";

const keyring = {} as Keyring;
afterEach(() => { mocked.pool = null; });

describe("S1 audit outbox drain fails closed and makes bounded progress", () => {
  it("does not report a successful empty drain when the writer is unavailable", async () => {
    await expect(drainAuditOutbox(keyring)).rejects.toThrow("WRITER_NOT_CONFIGURED");
  });

  it("rejects invalid limits instead of reporting success", async () => {
    mocked.pool = { query: vi.fn(() => { throw new Error("must not query"); }) };
    for (const invalid of [0, -1, 1.5, 101, NaN, Infinity]) {
      await expect(drainAuditOutbox(keyring, invalid)).rejects.toThrow("INVALID_DRAIN_LIMIT");
    }
  });

  it("does not starve a newer receipt after the oldest has failed", async () => {
    const first = "00000000-0000-4000-8000-000000000101";
    const second = "00000000-0000-4000-8000-000000000102";
    const receipts = [
      { id: first, attempts: 0, created_at: "2026-10-15T10:00:00Z" },
      { id: second, attempts: 0, created_at: "2026-10-15T10:01:00Z" },
    ];
    const selected: string[] = [];
    const pool = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.startsWith("select id from private.audit_outbox")) {
          expect(sql).toContain("order by attempts, created_at, id limit $1");
          const eligible = [...receipts].sort(
            (a, b) => a.attempts - b.attempts || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
          ).slice(0, params?.[0] as number);
          selected.push(...eligible.map((r) => r.id));
          return { rows: eligible.map(({ id }) => ({ id })), rowCount: eligible.length };
        }
        if (sql.startsWith("update private.audit_outbox set attempts = attempts + 1")) {
          const row = receipts.find((r) => r.id === params?.[0]);
          if (!row) throw new Error("unexpected receipt");
          row.attempts++;
          return { rows: [], rowCount: 1 };
        }
        throw new Error("unexpected pool query");
      }),
      connect: vi.fn(async () => ({
        query: vi.fn(async (sql: string) => {
          if (sql === "begin" || sql === "rollback" || sql.startsWith("set local")) return { rows: [], rowCount: 0 };
          if (sql.startsWith("select * from private.audit_outbox")) throw new Error("simulated failing writer");
          throw new Error("unexpected client query");
        }),
        release: vi.fn(),
      })),
    };
    mocked.pool = pool;

    expect(await drainAuditOutbox(keyring, 1)).toEqual({ pending: 1, completed: 0, failed: 1 });
    expect(await drainAuditOutbox(keyring, 1)).toEqual({ pending: 1, completed: 0, failed: 1 });
    expect(selected).toEqual([first, second]);
    expect(receipts.map((r) => r.attempts)).toEqual([1, 1]);
  });
});
