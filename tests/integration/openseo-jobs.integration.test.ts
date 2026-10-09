import { afterAll, beforeAll, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { providers } from "@/lib/core";
import { prepareCompletedAuditResults } from "@/lib/openseo/persistence";
import { completeAuditJob } from "@/lib/openseo/jobs";
import { loadKeyring } from "@/lib/provenance/keyring";
import { loadProviderResult } from "@/lib/provenance/repository";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

const slug = `jobs-${RUN}`;
const users: string[] = [];
let projectId: string;
let organizationId: string;
let jobId: string;

beforeAll(async () => {
  users.push(await createConfirmedUser("job-owner"), await createConfirmedUser("job-other"));
  const owner = await signedIn("job-owner");
  expect((await owner.from("organizations").insert({ slug, name: "Jobs fixture" })).error).toBeNull();
  const org = await owner.from("organizations").select("id").eq("slug", slug).single();
  expect(org.error).toBeNull();
  organizationId = org.data!.id;
  expect((await owner.from("projects").insert({ organization_id: org.data!.id, slug: "site", name: "Site" })).error).toBeNull();
  const project = await owner.from("projects").select("id").eq("organization_id", org.data!.id).single();
  expect(project.error).toBeNull();
  projectId = project.data!.id;
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([slug]);
  await deleteUsers(users);
});

it("separate HTTP sessions acquire exactly one reservation; another client cannot release it", async () => {
  const clients = await Promise.all(Array.from({ length: 8 }, () => signedIn("job-owner")));
  const results = await Promise.all(clients.map(client => client.rpc("openseo_job", {
    p_project_id: projectId, p_command: "acquire",
  })));
  expect(results.every(result => result.error === null)).toBe(true);
  const jobs = results.map(result => result.data as { jobId: string; acquired: boolean; state: string });
  expect(new Set(jobs.map(job => job.jobId)).size).toBe(1);
  jobId = jobs[0].jobId;
  expect(jobs.filter(job => job.acquired)).toHaveLength(1);
  expect(jobs.every(job => job.state === "STARTING")).toBe(true);
  const other = await signedIn("job-other");
  const rejected = await other.rpc("openseo_job", {
    p_project_id: projectId, p_command: "fail", p_job_id: jobs[0].jobId,
  });
  expect(rejected.error?.code).toBe("42501");
  const current = await clients[0].rpc("openseo_job", {
    p_project_id: projectId, p_command: "get", p_job_id: jobs[0].jobId,
  });
  expect(current.error).toBeNull();
  expect(current.data).toMatchObject({ state: "STARTING", jobId: jobs[0].jobId });
}, 60_000);

it("stores actual Core-signed originals atomically and verifies them after a database read", async () => {
  const owner = await signedIn("job-owner");
  const auditId = `audit-${RUN}`;
  expect((await owner.rpc("openseo_job", { p_project_id: projectId, p_command: "bind", p_job_id: jobId,
    p_payload: { auditId } })).error).toBeNull();
  const project = { projectId, organizationId, scope: { tenantId: slug, projectId: "site" } };
  const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `test-key:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "test-key" });
  if (!loaded.ok) throw new Error(loaded.error);
  // API-shaped fixtures delivered entirely in memory, never a remote provider.
  const mcp = { kind: "live" as const, callTool: async (name: string) => ({ structuredContent:
    name === "get_audit_issues" ? { issues: [] } : { pages: [], total: 0 } }) };
  const issues = await providers.runProviderRequest({ provider: "openseo", operation: "auditIssues", input: { projectId: "fixture", auditId }, mcp });
  const pages = await providers.runProviderRequest({ provider: "openseo", operation: "auditPages", input: { projectId: "fixture", auditId }, mcp });
  const prepared = prepareCompletedAuditResults({ auditId, issues, pages }, project, loaded.keyring);
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) throw new Error(prepared.error);
  const stored = await completeAuditJob(owner, project, jobId, prepared.prepared);
  expect(stored.ok).toBe(true);
  if (!stored.ok) throw new Error(stored.error);
  expect(stored.job.state).toBe("COMPLETED");
  for (const id of [stored.job.issuesResultId, stored.job.pagesResultId]) {
    expect(id).not.toBeNull();
    const opened = await loadProviderResult(owner, project, id!, loaded.keyring);
    expect(opened.ok).toBe(true);
    if (opened.ok) expect(opened.verification.verified).toBe(true);
  }
  const retry = await completeAuditJob(owner, project, jobId, prepared.prepared);
  expect(retry).toEqual(stored);
  const rows = await owner.from("provider_results").select("id").eq("project_id", projectId);
  expect(rows.error).toBeNull();
  expect(rows.data).toHaveLength(2);
}, 60_000);
