import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client, Pool } from "pg";

const mocks = vi.hoisted(() => ({ pool: vi.fn(), reject: vi.fn(), capability: vi.fn() }));
vi.mock("@/lib/provenance/writer", () => ({ writerPool: mocks.pool }));
vi.mock("@/lib/provenance/preview-writer-capability", () => ({
  previewWriterCapabilityRejection: mocks.reject, withPreviewWriterCapability: mocks.capability,
}));

const RUN = "c14f4c11-570f-4e03-a3a1-33a702b85baa";
const HOST = "aws-1-eu-west-3.pooler.supabase.com";
const SIGNATURES = ["private.audit_writer_actor(uuid, uuid)", "private.audit_writer_project(uuid)"];
const IDENTITY = {
  database_ok: true, session_user: "rubik_preview_u03_writer", current_user: "rubik_preview_u03_writer",
  audit_insert: true, audit_select: true, results_insert: true, results_select: true,
  idempotency_insert: true, outbox_select: true, outbox_state_update: true, auth_schema: false,
  import_insert: false, import_select: false, membership_select: false, organizations_select: false,
  projects_select: false, audit_delete: false, outbox_delete: false, public_create: false, private_create: false,
};

function fakePool(rows: unknown[] = [IDENTITY, { definers: SIGNATURES },
  { google: false, openseo: false, writer_member: false }, { n: 4 }, { empty: true }]) {
  const query = vi.fn().mockImplementation(async () => ({ rows: [rows.shift()] }));
  const client = { connectionParameters: { host: HOST, port: 5432 },
    connection: { stream: { encrypted: true, authorized: true, authorizationError: null } },
    query, release: vi.fn() };
  const pool = { options: { connectionString: `postgresql://fixture:fictional@${HOST}:5432/postgres`,
    ssl: { rejectUnauthorized: true, servername: HOST, ca: "pinned-test-ca" } },
    connect: vi.fn().mockResolvedValue(client) };
  // Crucial regression: pg.Pool does not populate options.host/port from connectionString.
  expect((pool.options as Record<string, unknown>).host).toBeUndefined();
  expect((pool.options as Record<string, unknown>).port).toBeUndefined();
  mocks.pool.mockReturnValue(pool);
  return { pool, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.reject.mockReturnValue(null);
  mocks.capability.mockImplementation(async (_request, _tenant, _project, action) => action());
  process.env.RUBIK_AUDIT_DATABASE_URL = `postgresql://fixture:fictional@${HOST}:5432/postgres`;
});

async function call() {
  const { SUPABASE_ROOT_2021_CA } = await import("@/lib/provenance/supabase-root-ca");
  const { GET } = await import("@/app/api/u03/window/route");
  const pool = mocks.pool();
  if (pool) pool.options.ssl.ca = SUPABASE_ROOT_2021_CA;
  return GET(new Request("https://fixed-preview.vercel.app/api/u03/window", {
    headers: { "x-rubik-u03-run-id": RUN },
  }));
}

describe("protected runtime preflight route", () => {
  it("reproduces the actual node-postgres connectionString parsing defect", async () => {
    const pool = new Pool({ connectionString: `postgresql://fixture:fictional@${HOST}:5432/postgres`,
      ssl: { rejectUnauthorized: true, servername: HOST } });
    try {
      expect(pool.options.host).toBeUndefined();
      expect(pool.options.port).toBeUndefined();
      const client = new Client(pool.options);
      const parameters = (client as typeof client & { connectionParameters: { host: string; port: number } }).connectionParameters;
      expect(parameters.host).toBe(HOST);
      expect(parameters.port).toBe(5432);
    } finally { await pool.end(); }
  });

  it("passes valid client TLS despite pg.Pool options.host/port being absent", async () => {
    const { client } = fakePool();
    const response = await call();
    expect(response.status).toBe(200);
    expect((await response.json()).checks).toContain("CLIENT_TLS");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it.each([
    ["TLS", () => { const { client } = fakePool(); client.connection.stream.authorized = false; }, "RUNTIME_CLIENT_TLS_REJECTED"],
    ["principal", () => fakePool([{ ...IDENTITY, current_user: "other" }]), "RUNTIME_PRINCIPAL_REJECTED"],
    ["privileges", () => fakePool([{ ...IDENTITY, auth_schema: true }]), "RUNTIME_PRIVILEGES_REJECTED"],
    ["definers", () => fakePool([IDENTITY, { definers: [...SIGNATURES, "private.extra()"] }]), "RUNTIME_DEFINERS_REJECTED"],
    ["provider RPC", () => fakePool([IDENTITY, { definers: SIGNATURES }, { google: true }]), "RUNTIME_PROVIDER_RPC_REJECTED"],
    ["RLS", () => fakePool([IDENTITY, { definers: SIGNATURES }, { google: false, openseo: false, writer_member: false }, { n: 3 }]), "RUNTIME_RLS_REJECTED"],
    ["inventory", () => fakePool([IDENTITY, { definers: SIGNATURES }, { google: false, openseo: false, writer_member: false }, { n: 4 }, { empty: false }]), "RUNTIME_INVENTORY_REJECTED"],
  ])("keeps %s fail closed with a closed diagnostic", async (_label, arrange, code) => {
    arrange();
    const response = await call();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false });
    expect(response.headers.get("x-rubik-u03-diagnostic")).toBe(code);
  });

  it("categorizes SQL failure without persisting a free message or secret", async () => {
    const { client } = fakePool();
    client.query.mockRejectedValueOnce({ code: "42501", message: "fictional-secret@example.invalid" });
    const response = await call();
    expect(response.status).toBe(404);
    expect(response.headers.get("x-rubik-u03-diagnostic")).toBe("RUNTIME_IDENTITY_QUERY_FAILED");
    const logged = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logged).toContain('"sqlstate\\\":\\\"42501');
    expect(logged).not.toContain("fictional-secret");
  });

  it("keeps a rejected capability public response generic and never opens the pool", async () => {
    mocks.reject.mockReturnValue("WINDOW_MAC_REJECTED");
    const response = await call();
    expect(response.status).toBe(404);
    expect(response.headers.get("x-rubik-u03-diagnostic")).toBeNull();
    expect(mocks.capability).not.toHaveBeenCalled();
  });
});
