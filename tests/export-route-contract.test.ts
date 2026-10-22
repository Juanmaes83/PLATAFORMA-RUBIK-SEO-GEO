import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuditRow, verifyAuditTrail, type ProjectRef } from "@/lib/provenance/audit";
import { loadKeyring } from "@/lib/provenance/keyring";
import { verifyProjectExport } from "@/lib/recovery/verify-export";
import { planRestore } from "@/lib/restore/plan";

// Calls the real route and real manifest/offline verifier/restore planner. Only the session,
// database and outbox are controlled, so unavailable or changing states are deterministic.
const mocked = vi.hoisted(() => ({
  schema: vi.fn(), user: vi.fn(), client: vi.fn(), membership: vi.fn(), access: vi.fn(), ref: vi.fn(),
  keyring: vi.fn(), beforeAfter: vi.fn(), append: vi.fn(), export: vi.fn(), operations: vi.fn(), seo: vi.fn(), contentGeo: vi.fn(),
  windowScope: vi.fn(),
}));
vi.mock("@/lib/recovery/schema-contract", () => ({ recoverySchemaContract: mocked.schema }));
vi.mock("@/lib/auth/session", () => ({ currentUser: mocked.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocked.client, createBearerClient: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/tenancy", () => ({ myProjectMembership: mocked.membership }));
vi.mock("@/lib/access", () => ({ projectAccess: mocked.access }));
vi.mock("@/lib/imports/repository", () => ({ loadProjectRef: mocked.ref }));
vi.mock("@/lib/provenance/keyring", async (importOriginal) => ({ ...(await importOriginal<object>()), serverKeyring: mocked.keyring }));
vi.mock("@/lib/provenance/preview-writer-capability", async (importOriginal) => ({
  ...(await importOriginal<object>()), currentPreviewWriterCapability: mocked.windowScope,
}));
vi.mock("@/lib/provenance/outbox", async (importOriginal) => ({ ...(await importOriginal<object>()), inspectProjectAuditOutbox: mocked.beforeAfter }));
vi.mock("@/lib/provenance/repository", async (importOriginal) => ({ ...(await importOriginal<object>()), appendAudit: mocked.append, exportProject: mocked.export }));
vi.mock("@/lib/recovery/operations", async (importOriginal) => ({ ...(await importOriginal<object>()), readOperationalState: mocked.operations }));
vi.mock("@/lib/recovery/seo-state", () => ({ readSeoRecoveryState: mocked.seo }));
vi.mock("@/lib/recovery/content-geo-state", () => ({ readContentGeoRecoveryState: mocked.contentGeo }));

const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-test:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-test" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;
const actor = randomUUID();
const project: ProjectRef = { projectId: randomUUID(), organizationId: randomUUID(),
  scope: { tenantId: "agencia", projectId: "proyecto" } };
const params = { params: Promise.resolve({ tenantId: "agencia", projectId: "proyecto" }) };
const request = new Request("https://localhost/proyectos/agencia/proyecto/exportar");
const checkpoint = { ok: true, checkpoint: { total: 1 } };
const operations = {
  openseo: { connection: { ok: true, value: null }, activeJob: { ok: true, value: null }, jobs: [] },
  webmaster: { searchConsole: { ok: true, value: null }, bing: { ok: true, value: null } },
  google: { ok: true, value: { connections: [], bindings: [], captures: [] } }, notIncluded: [],
};
const seo = { projectDomain: null, keywords: [], competitors: [], observations: [] };
const contentGeo = { ok: true, content: { clusters: [], opportunities: [], evidence: [], briefs: [] }, geo: { observations: [], proposals: [] } };

beforeEach(() => {
  vi.clearAllMocks();
  mocked.windowScope.mockReturnValue(null);
  const row = buildAuditRow(null, { at: "2026-10-16T10:00:00.000Z", actor: { id: actor, role: "owner" },
    action: "project.export" }, project, keyring);
  if (!row.ok) throw new Error(row.error);
  const auditRows = [{ ...row.row, actor_id: actor }];
  mocked.schema.mockResolvedValue("legacy-v2");
  mocked.user.mockResolvedValue({ id: actor });
  mocked.client.mockResolvedValue({});
  mocked.membership.mockResolvedValue({});
  mocked.access.mockReturnValue({ role: "owner", project: { tenantId: "agencia", projectId: "proyecto" },
    permissions: [{ action: "export-data", decision: { allowed: true } }] });
  mocked.ref.mockResolvedValue(project);
  mocked.keyring.mockReturnValue(keyring);
  mocked.beforeAfter.mockResolvedValue(checkpoint);
  mocked.append.mockResolvedValue({ ok: true });
  mocked.export.mockResolvedValue({ ok: true, export: { format: "rubik-project-export-v1", exportedAt: "2026-10-16T10:00:00.000Z",
    scope: project.scope, audit: { rows: auditRows, verification: verifyAuditTrail(auditRows, project, keyring) },
    results: [], imports: [] } });
  mocked.operations.mockResolvedValue(operations);
  mocked.seo.mockResolvedValue({ ok: true, value: seo });
  mocked.contentGeo.mockResolvedValue(contentGeo);
});

async function exported() {
  const { GET } = await import("@/app/proyectos/[tenantId]/[projectId]/exportar/route");
  return GET(request, params);
}

describe("real export endpoint recovery contract", () => {
  it("fails closed at the schema gate and exposes a closed category only inside the signed window", async () => {
    mocked.schema.mockResolvedValue("unknown");
    const publicResponse = await exported();
    expect(publicResponse.status).toBe(503);
    expect(publicResponse.headers.get("x-rubik-h1a-export-gate")).toBeNull();
    expect(mocked.append).not.toHaveBeenCalled();
    mocked.windowScope.mockReturnValue({ runId: "fictional-run" });
    const scopedResponse = await exported();
    expect(scopedResponse.status).toBe(503);
    expect(scopedResponse.headers.get("x-rubik-h1a-export-gate")).toBe("SCHEMA_UNKNOWN");
    expect(mocked.append).not.toHaveBeenCalled();
  });
  it.runIf(process.env.RUBIK_TEST_N2_LEGACY_STACK === "1")("legacy database catalog drives a signed and restorable v2 response", async () => {
    const real = await vi.importActual<typeof import("@/lib/recovery/schema-contract")>("@/lib/recovery/schema-contract");
    mocked.schema.mockImplementation(() => real.recoverySchemaContract({
      RUBIK_RECOVERY_SCHEMA_ATTESTATION: "pre-n2-through-20261015210000",
    }));
    const response = await exported();
    expect(response.status).toBe(200);
    const doc = await response.json();
    expect(doc.format).toBe("rubik-project-export-v2");
    expect(verifyProjectExport(doc, keyring)).toMatchObject({ ok: true, completeness: { status: "COMPLETE" } });
    const planned = planRestore(doc, keyring, { operatorId: actor });
    expect(planned).toMatchObject({ ok: true });
    if (!planned.ok) return;
    const container = "supabase_db_rubik-n2-legacy-route-20261016";
    const psql = (sql: string) => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"],
      { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    try {
      psql(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        values ('${actor}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '${actor}@fixture.test', '', now(), now(), now());`);
      psql(planned.plan.sql);
      psql(planned.plan.sql);
      expect(psql(`select count(*) from public.audit_events where project_id = '${project.projectId}';`)).toBe("1");
      expect(psql(`select count(*) from public.projects where id = '${project.projectId}';`)).toBe("1");
    } finally {
      psql(`delete from public.organizations where id = '${project.organizationId}';`);
      psql(`delete from auth.users where id = '${actor}';`);
    }
  });

  it("accredited pre-N2 schema returns signed, verifiable and restorable v2 after both outbox checks", async () => {
    const response = await exported();
    expect(response.status).toBe(200);
    const doc = await response.json();
    expect(doc.format).toBe("rubik-project-export-v2");
    expect(verifyProjectExport(doc, keyring)).toMatchObject({ ok: true, completeness: { status: "COMPLETE" } });
    expect(planRestore(doc, keyring, { operatorId: actor })).toMatchObject({ ok: true });
    expect(mocked.beforeAfter).toHaveBeenCalledTimes(2);
    expect(mocked.schema).toHaveBeenCalledTimes(2);
    expect(mocked.seo).not.toHaveBeenCalled();
  });

  it.each(["true", "false"])("N2 schema returns signed v3 with UI flag %s", async (flag) => {
    vi.stubEnv("RUBIK_N2_SCHEMA_AVAILABLE", flag);
    mocked.schema.mockResolvedValue("n2-v3");
    const expectedSeo = flag === "false" ? { ...seo, keywords: [{ id: randomUUID(), project_id: project.projectId,
      organization_id: project.organizationId, created_by: actor, phrase: "consulta ficticia" }] } : seo;
    mocked.seo.mockResolvedValue({ ok: true, value: expectedSeo });
    const response = await exported();
    expect(response.status).toBe(200);
    const doc = await response.json();
    expect(doc.format).toBe("rubik-project-export-v3");
    expect(doc.seo).toEqual(expectedSeo);
    expect(verifyProjectExport(doc, keyring)).toMatchObject({ ok: true, completeness: { status: "COMPLETE" } });
    expect(planRestore(doc, keyring, { operatorId: actor })).toMatchObject({ ok: true });
    expect(mocked.beforeAfter).toHaveBeenCalledTimes(2);
    expect(mocked.schema).toHaveBeenCalledTimes(2);
    vi.unstubAllEnvs();
  });

  it("Contenidos/GEO schema returns signed, verifiable and restorable v4 after two full reads", async () => {
    mocked.schema.mockResolvedValue("n2-v4");
    const response = await exported();
    expect(response.status).toBe(200);
    const doc = await response.json();
    expect(doc.format).toBe("rubik-project-export-v4");
    expect(doc.manifest.version).toBe("rubik-export-manifest-v3");
    expect(doc.content).toEqual(contentGeo.content);
    expect(doc.geo).toEqual(contentGeo.geo);
    expect(verifyProjectExport(doc, keyring)).toMatchObject({ ok: true, completeness: { status: "COMPLETE" } });
    expect(planRestore(doc, keyring, { operatorId: actor })).toMatchObject({ ok: true });
    expect(mocked.contentGeo).toHaveBeenCalledTimes(2);
    expect(mocked.beforeAfter).toHaveBeenCalledTimes(2);
  });

  it("a Contenidos/GEO read failure or a change between both reads refuses v4 without falling back to v3", async () => {
    mocked.schema.mockResolvedValue("n2-v4");
    mocked.contentGeo.mockResolvedValueOnce({ ok: false, error: "READ_FAILED" });
    expect((await exported()).status).toBe(503);
    mocked.contentGeo.mockResolvedValueOnce(contentGeo).mockResolvedValueOnce({ ...contentGeo,
      geo: { observations: [{ id: randomUUID() }], proposals: [] } });
    expect((await exported()).status).toBe(503);
    expect(mocked.beforeAfter).toHaveBeenCalledTimes(2);
  });

  it("v2 and v3 exports never read Contenidos/GEO", async () => {
    for (const schema of ["legacy-v2", "n2-v3"]) { mocked.schema.mockResolvedValue(schema); expect((await exported()).status).toBe(200); }
    expect(mocked.contentGeo).not.toHaveBeenCalled();
  });

  it("unknown schema or missing N2 function refuses without fallback", async () => {
    mocked.schema.mockResolvedValue("unknown");
    const response = await exported();
    expect(response.status).toBe(503);
    expect(mocked.export).not.toHaveBeenCalled();
  });

  it("N2 read errors refuse without v2 fallback", async () => {
    mocked.schema.mockResolvedValue("n2-v3");
    mocked.seo.mockResolvedValueOnce({ ok: false, error: "PGRST205" });
    expect((await exported()).status).toBe(503);
    expect(mocked.beforeAfter).toHaveBeenCalledTimes(1);
  });

  it("a schema change during a legacy export refuses before the final outbox check", async () => {
    mocked.schema.mockResolvedValueOnce("legacy-v2").mockResolvedValueOnce("n2-v3");
    expect((await exported()).status).toBe(503);
    expect(mocked.beforeAfter).toHaveBeenCalledTimes(1);
  });

  it("pending receipts or a changed outbox reject both signed formats", async () => {
    mocked.beforeAfter.mockResolvedValueOnce({ ok: false, error: "AUDIT_PENDING" });
    expect((await exported()).status).toBe(503);
    for (const schema of ["legacy-v2", "n2-v3"]) {
      mocked.beforeAfter.mockReset().mockResolvedValueOnce(checkpoint)
        .mockResolvedValueOnce({ ok: true, checkpoint: { total: 2 } });
      mocked.schema.mockResolvedValue(schema);
      expect((await exported()).status).toBe(503);
      expect(mocked.beforeAfter).toHaveBeenCalledTimes(2);
    }
  });
});
