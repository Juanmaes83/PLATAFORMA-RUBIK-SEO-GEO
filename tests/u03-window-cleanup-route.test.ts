import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  bearer: vi.fn(), currentUser: vi.fn(), createClient: vi.fn(), membership: vi.fn(), access: vi.fn(),
  project: vi.fn(), keyring: vi.fn(), eraseResults: vi.fn(), listImports: vi.fn(), eraseImport: vi.fn(),
  writerPool: vi.fn(), processReceipt: vi.fn(), capability: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createBearerClient: mocked.bearer, createClient: mocked.createClient }));
vi.mock("@/lib/auth/session", () => ({ currentUser: mocked.currentUser }));
vi.mock("@/lib/tenancy", () => ({ myProjectMembership: mocked.membership }));
vi.mock("@/lib/access", () => ({ projectAccess: mocked.access }));
vi.mock("@/lib/imports/repository", () => ({ loadProjectRef: mocked.project, listImports: mocked.listImports, eraseImport: mocked.eraseImport }));
vi.mock("@/lib/provenance/keyring", () => ({ serverKeyring: mocked.keyring }));
vi.mock("@/lib/provenance/repository", () => ({ eraseProviderResults: mocked.eraseResults }));
vi.mock("@/lib/provenance/writer", () => ({ writerPool: mocked.writerPool }));
vi.mock("@/lib/provenance/outbox", () => ({ processAuditOutboxWithPool: mocked.processReceipt }));
vi.mock("@/lib/provenance/preview-writer-capability", () => ({ withPreviewWriterCapability: mocked.capability }));

const RUN = "c14f4c11-570f-4e03-a3a1-33a702b85baa";
const PROJECT = { projectId: "a5c85b58-2cc9-4bf4-89af-c6e97f9f75d1", organizationId: "e4ed3cfe-8a11-4d6d-b4b5-7f72bbbaed09",
  scope: { tenantId: `u03-c14f4c11570f-a`, projectId: "a1" } };
const RECEIPT = "54350b0d-89a1-4b73-a8a2-0019c675d54d";
let pool: { query: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  mocked.capability.mockImplementation(async (_request, _tenant, _project, action) => action());
  mocked.bearer.mockResolvedValue({ user: { id: "7ee3e3fa-6091-4840-b433-8ce28193da75" }, client: {} });
  mocked.membership.mockResolvedValue({});
  mocked.access.mockReturnValue({ role: "owner" });
  mocked.project.mockResolvedValue(PROJECT);
  mocked.keyring.mockReturnValue({ activeKeyId: "fixture" });
  mocked.eraseResults.mockResolvedValue({ ok: true, erased: 1 });
  mocked.listImports.mockResolvedValue([{ id: "abf1fa19-82d9-407e-9f2d-792602e6903a" }]);
  mocked.eraseImport.mockResolvedValue({ ok: true, erased: 1 });
  pool = { query: vi.fn()
    .mockResolvedValueOnce({ rows: [{ id: RECEIPT, action: "import.erase", tenant_slug: PROJECT.scope.tenantId, project_slug: "a1" }] })
    .mockResolvedValueOnce({ rows: [{ pending: 0 }] }) };
  mocked.writerPool.mockReturnValue(pool);
  mocked.processReceipt.mockResolvedValue({ ok: true, seq: 4 });
});

async function call(body = { runId: RUN }) {
  const { POST } = await import("@/app/api/u03/window-cleanup/[tenantId]/[projectId]/route");
  const request = new Request("https://preview.example/api/u03/window-cleanup/u03-c14f4c11570f-a/a1", {
    method: "POST", headers: { "content-type": "application/json", "x-rubik-u03-run-id": RUN }, body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ tenantId: PROJECT.scope.tenantId, projectId: "a1" }) });
}

describe("run-scoped product cleanup route", () => {
  it("uses product erasers and the real receipt signer, then verifies no pending rows", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, resultRowsErased: 1, importsErased: 1, receiptsProcessed: 1 });
    expect(mocked.eraseResults).toHaveBeenCalledOnce();
    expect(mocked.eraseImport).toHaveBeenCalledWith({}, PROJECT, "abf1fa19-82d9-407e-9f2d-792602e6903a",
      { id: "7ee3e3fa-6091-4840-b433-8ce28193da75", role: "owner" }, { activeKeyId: "fixture" });
    expect(mocked.processReceipt).toHaveBeenCalledWith(RECEIPT, { activeKeyId: "fixture" }, pool);
    expect(pool.query).toHaveBeenLastCalledWith(expect.stringContaining("state='pending'"), [PROJECT.projectId]);
  });

  it("fails closed on a receipt outside the run's action/scope allowlist", async () => {
    pool.query.mockReset()
      .mockResolvedValueOnce({ rows: [{ id: RECEIPT, action: "member.withdraw", tenant_slug: PROJECT.scope.tenantId, project_slug: "a1" }] });
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, code: "RECEIPT_SCOPE_BLOCKED" });
    expect(mocked.processReceipt).not.toHaveBeenCalled();
  });

  it("rejects a mismatched run before deleting fixtures", async () => {
    const response = await call({ runId: "a different run" });
    expect(response.status).toBe(400);
    expect(mocked.eraseResults).not.toHaveBeenCalled();
    expect(mocked.listImports).not.toHaveBeenCalled();
  });
});
