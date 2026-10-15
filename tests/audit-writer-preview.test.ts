import { afterEach, describe, expect, it, vi } from "vitest";

// The trusted writer opens a direct Postgres pool. A Vercel Preview must never open it, even
// with a writer URL and operator token configured: same fail-closed contract as the session lock.
const pg = vi.hoisted(() => ({ Pool: vi.fn(function Pool(this: { on: () => void; end: () => Promise<void> }) { this.on = () => {}; this.end = async () => {}; }) }));
vi.mock("pg", () => ({ Pool: pg.Pool, default: { Pool: pg.Pool } }));
const { writerPool } = await import("@/lib/provenance/writer");
const { drainAuditOutbox, pendingAuditOutbox } = await import("@/lib/provenance/outbox");

const WRITER = "postgresql://rubik_audit_writer:fictitious@127.0.0.1:57322/postgres";
afterEach(() => { vi.unstubAllEnvs(); pg.Pool.mockClear(); });

describe("trusted audit writer in Vercel Preview", () => {
  it("never creates a pool in Preview, with any isolation flag", async () => {
    for (const flag of ["", "true", "1"]) {
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("PREVIEW_SUPABASE_ISOLATED", flag);
      vi.stubEnv("RUBIK_AUDIT_DATABASE_URL", WRITER);
      expect(writerPool()).toBeNull();
    }
    expect(pg.Pool).not.toHaveBeenCalled();
    await expect(drainAuditOutbox({} as never)).rejects.toThrow("WRITER_NOT_CONFIGURED");
    await expect(pendingAuditOutbox()).rejects.toThrow("WRITER_NOT_CONFIGURED");
    expect(pg.Pool).not.toHaveBeenCalled();
  });

  it("keeps the local/production writer path", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RUBIK_AUDIT_DATABASE_URL", WRITER);
    expect(writerPool()).not.toBeNull();
    expect(pg.Pool).toHaveBeenCalledTimes(1);
  });
});
