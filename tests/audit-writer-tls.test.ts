import { createHash, X509Certificate } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const pools = vi.hoisted(() => ({ configs: [] as Record<string, unknown>[] }));
vi.mock("pg", () => ({ Pool: class {
  constructor(config: Record<string, unknown>) { pools.configs.push(config); }
  on() { return this; }
  async end() {}
} }));
const { writerPool } = await import("@/lib/provenance/writer");

afterEach(() => { vi.unstubAllEnvs(); pools.configs.length = 0; });

describe("dedicated writer TLS", () => {
  it("pins Supabase's public root and verifies the hosted pooler", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RUBIK_AUDIT_DATABASE_URL", "postgresql://rubik_audit_writer.test:fictitious@aws-1-eu-west-3.pooler.supabase.com:5432/postgres");
    expect(writerPool()).not.toBeNull();
    const ssl = pools.configs.at(-1)?.ssl as { rejectUnauthorized: boolean; ca: string };
    expect(ssl.rejectUnauthorized).toBe(true);
    const fingerprint = createHash("sha256").update(new X509Certificate(ssl.ca).raw).digest("hex");
    expect(fingerprint).toBe("807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa");
  });

  it("rejects URL parameters that could override verified TLS", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("RUBIK_AUDIT_DATABASE_URL", "postgresql://rubik_audit_writer.test:fictitious@aws-1-eu-west-3.pooler.supabase.com:5432/postgres?sslmode=no-verify");
    expect(writerPool()).toBeNull();
    expect(pools.configs).toHaveLength(0);
  });
});
