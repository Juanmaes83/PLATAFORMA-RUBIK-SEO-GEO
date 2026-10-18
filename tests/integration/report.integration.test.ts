import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { providers } from "@/lib/core";
import { completeAuditJob } from "@/lib/openseo/jobs";
import { prepareCompletedAuditResults } from "@/lib/openseo/persistence";
import { loadKeyring } from "@/lib/provenance/keyring";
import { processAuditOutbox } from "@/lib/provenance/outbox";
import { storeProviderResult } from "@/lib/provenance/repository";
import { writerPool } from "@/lib/provenance/writer";
import { coverageOf, UNAVAILABLE, type ReportSection } from "@/lib/reports/report";
import { readReportSections } from "@/lib/reports/sources";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

// N2-14 report against the local database: signed OpenSEO and Google results are shown only
// when their signature verifies with the server keyring; the audit chain is read in full; and a
// non-member reading the same ids through RLS gets nothing. No provider is contacted: provider
// responses are in-memory fixtures, exactly as in the OpenSEO and Google capture tests.
const slug = `report-${RUN}`;
const users: string[] = [];
const keyOf = () => {
  const k = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-r:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-r" });
  if (!k.ok) throw new Error(k.error);
  return k.keyring;
};
const keyring = keyOf();
let project: { projectId: string; organizationId: string; scope: { tenantId: string; projectId: string } };
const by = (sections: ReportSection[], id: ReportSection["id"]) => sections.find((s) => s.id === id)!;

async function signPending() {
  const pool = writerPool();
  if (!pool) throw new Error("local writer required");
  const pending = await pool.query("select id from private.audit_outbox where project_id = $1 and state = 'pending' order by created_at, id", [project.projectId]);
  for (const { id } of pending.rows) expect(await processAuditOutbox(id, keyring)).toMatchObject({ ok: true });
}

beforeAll(async () => {
  vi.stubEnv("RUBIK_N2_SCHEMA_AVAILABLE", "true");
  users.push(await createConfirmedUser("report-owner"), await createConfirmedUser("report-outsider"));
  const owner = await signedIn("report-owner");
  expect((await owner.from("organizations").insert({ slug, name: "Informe (ficticia)" })).error).toBeNull();
  const org = (await owner.from("organizations").select("id").eq("slug", slug).single()).data!;
  expect((await owner.from("projects").insert({ organization_id: org.id, slug: "site", name: "Site", domain: "informe.ejemplo.test" })).error).toBeNull();
  const row = (await owner.from("projects").select("id").eq("organization_id", org.id).single()).data!;
  project = { projectId: row.id, organizationId: org.id, scope: { tenantId: slug, projectId: "site" } };
}, 60_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteOrganizations([slug]);
  await deleteUsers(users);
});

it("a new project reads every core source in full and reports it as empty, not as zero", async () => {
  const sections = await readReportSections(await signedIn("report-owner"), project, "/p", keyring);
  for (const id of ["technical", "imports", "keywords", "measurement", "competitors"] as const) expect(by(sections, id)).toMatchObject({ state: "empty", facts: [] });
  expect(by(sections, "audit").state).toBe("empty");
}, 60_000);

it("signed OpenSEO and Google results appear only when they verify; the audit chain is verified in full", async () => {
  const owner = await signedIn("report-owner");
  const job = (await owner.rpc("openseo_job", { p_project_id: project.projectId, p_command: "acquire" })).data as { jobId: string };
  const auditId = `audit-${RUN}`;
  expect((await owner.rpc("openseo_job", { p_project_id: project.projectId, p_command: "bind", p_job_id: job.jobId, p_payload: { auditId } })).error).toBeNull();
  const mcp = { kind: "live" as const, callTool: async (name: string) => ({ structuredContent: name === "get_audit_issues"
    ? { issues: [{ issueType: "missing-title", severity: "critical", url: "https://informe.ejemplo.test/carta" },
      { issueType: "canonical-mismatch", severity: "warning", url: "https://informe.ejemplo.test/menu" }] }
    : { pages: [{ url: "https://informe.ejemplo.test/carta" }], total: 1 } }) };
  const issues = await providers.runProviderRequest({ provider: "openseo", operation: "auditIssues", input: { projectId: "fixture", auditId }, mcp });
  const pages = await providers.runProviderRequest({ provider: "openseo", operation: "auditPages", input: { projectId: "fixture", auditId }, mcp });
  const prepared = prepareCompletedAuditResults({ auditId, issues, pages }, project, keyring);
  if (!prepared.ok) throw new Error(prepared.error);
  expect((await completeAuditJob(owner, project, job.jobId, prepared.prepared)).ok).toBe(true);
  const capture = await providers.runProviderRequest({ provider: "search-console", operation: "searchAnalytics",
    input: { siteUrl: "sc-domain:informe.ejemplo.test", startDate: "2026-09-01", endDate: "2026-09-28", rowLimit: 2 },
    transport: { kind: "live", request: async () => ({ rows: [{ query: "carta", clicks: 3, impressions: 9, ctr: 0.33, averagePosition: 4 }], truncated: false }) },
    clock: () => new Date("2026-10-16T08:00:00Z"), budget: { maxUnits: 2, maxRequests: 2 } });
  expect((await storeProviderResult(owner, project, capture, keyring)).ok).toBe(true);
  await signPending();

  const sections = await readReportSections(owner, project, "/p", keyring);
  expect(by(sections, "technical")).toMatchObject({ state: "available", natures: ["observed"] });
  expect(by(sections, "technical").facts).toEqual(expect.arrayContaining([
    { label: "Hallazgos registrados", value: "2", nature: "observed" }, { label: "Auditoría de OpenSEO", value: auditId }]));
  const measurement = by(sections, "measurement");
  expect(measurement.state).toBe("available");
  expect(measurement.facts).toContainEqual({ label: "Google Search Console: última, periodo", value: "2026-09-01 – 2026-09-28", nature: "observed" });
  expect(JSON.stringify(measurement.facts)).not.toMatch(/clics|impresiones|"3"|0\.33/i); // values stay in the measurement centre
  expect(by(sections, "audit")).toMatchObject({ state: "available", natures: ["observed"] });
  expect(by(sections, "audit").facts).toContainEqual({ label: "Cadena", value: "Verificada" });

  // Another server key cannot verify them: nothing signed is shown, and the report is not complete.
  const foreign = await readReportSections(owner, project, "/p", keyOf());
  expect(by(foreign, "technical")).toMatchObject({ state: "partial", facts: [] });
  expect(by(foreign, "measurement").state).toBe("partial");
  expect(by(foreign, "measurement").facts).toContainEqual({ label: "Capturas sin verificar (ocultas)", value: "1" });
  expect(by(foreign, "audit").state).toBe("partial");
  expect(coverageOf(foreign).complete).toBe(false);

  // Without any server key nothing is verified or shown as such.
  const unsigned = await readReportSections(owner, project, "/p", null);
  expect(by(unsigned, "technical")).toMatchObject({ state: "unavailable", reason: UNAVAILABLE.noKeyring });
  expect(by(unsigned, "audit")).toMatchObject({ state: "unavailable", reason: UNAVAILABLE.noKeyring });
  expect(by(unsigned, "measurement")).toMatchObject({ state: "partial", reason: UNAVAILABLE.noKeyring });
}, 90_000);

it("a non-member reading the same project ids through RLS gets no row of it", async () => {
  const outsider = await signedIn("report-outsider");
  const sections = await readReportSections(outsider, project, "/p", keyring);
  expect(sections.flatMap((s) => s.facts)).toEqual([]);
  expect(sections.some((s) => s.state === "available" || s.state === "partial")).toBe(false);
}, 60_000);
