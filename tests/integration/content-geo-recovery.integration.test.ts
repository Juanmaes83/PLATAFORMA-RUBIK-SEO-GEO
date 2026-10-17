import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { loadKeyring } from "@/lib/provenance/keyring";
import { signExportManifest } from "@/lib/provenance/manifest";
import { processAuditOutbox } from "@/lib/provenance/outbox";
import { exportProject } from "@/lib/provenance/repository";
import { readSeoRecoveryState } from "@/lib/recovery/seo-state";
import { recoverySchemaContract } from "@/lib/recovery/schema-contract";
import { verifyProjectExport } from "@/lib/recovery/verify-export";
import { planRestore } from "@/lib/restore/plan";
import { localDatabaseContainer } from "../../scripts/supabase-test-env.mjs";
import { readContentGeoRecoveryState } from "@/lib/recovery/content-geo-state";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

const org = `cg-recovery-${RUN}`;
const otherOrg = `cg-foreign-${RUN}`;
const users: string[] = [];
let owner: Awaited<ReturnType<typeof signedIn>>;
let outsider: Awaited<ReturnType<typeof signedIn>>;
let projectId: string, organizationId: string;
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", localDatabaseContainer(), "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

beforeAll(async () => {
  users.push(await createConfirmedUser("cg-owner"), await createConfirmedUser("cg-outsider"));
  [owner, outsider] = await Promise.all(["cg-owner", "cg-outsider"].map(signedIn));
  expect((await owner.from("organizations").insert({ slug: org, name: "Fictitious" })).error).toBeNull();
  expect((await outsider.from("organizations").insert({ slug: otherOrg, name: "Other" })).error).toBeNull();
  organizationId = (await owner.from("organizations").select("id").eq("slug", org).single()).data!.id;
  expect((await owner.from("projects").insert({ organization_id: organizationId, slug: "site", name: "Site" })).error).toBeNull();
  projectId = (await owner.from("projects").select("id").eq("organization_id", organizationId).single()).data!.id;
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([org, otherOrg]);
  await deleteUsers(users);
});

it("reads all six tables at exact project scope and refuses a foreign tenant's view", async () => {
  expect(await recoverySchemaContract()).toBe("n2-v4");
  const ref = { projectId, organizationId, scope: { tenantId: org, projectId: "site" } };
  expect((await owner.from("content_clusters").insert({ project_id: projectId,
    organization_id: organizationId, name: "Fictitious cluster", main_topic: "Test topic" })).error).toBeNull();
  const observed = await owner.from("geo_observations").insert({ project_id: projectId,
    organization_id: organizationId, entity_name: "Fictitious entity", engine: "chatgpt",
    query_text: "Fictitious query", observed_on: "2026-10-16", method: "manual-copy", presence: "absent" })
    .select("id").single();
  expect(observed.error).toBeNull();
  expect((await owner.from("geo_proposals").insert({ project_id: projectId,
    organization_id: organizationId, rule: "manual", query_text: "Fictitious query", title: "Proposal",
    problem: "Declared gap", hypothesis: "Check manually", suggested_action: "Review source",
    priority: "low", priority_reason: "Manual review", evidence_ids: [observed.data!.id] })).error).toBeNull();
  expect((await owner.from("geo_observations").delete().eq("id", observed.data!.id)).error).toBeNull();
  const own = await readContentGeoRecoveryState(owner, ref);
  expect(own.ok && own.value.clusters).toHaveLength(1);
  expect(own.ok && own.value.opportunities).toEqual([]);
  expect(own.ok && own.value.geoObservations).toEqual([]);
  expect(own.ok && own.value.geoProposals).toHaveLength(1);
  const foreign = await readContentGeoRecoveryState(outsider, ref);
  expect(foreign).toEqual({ ok: true, value: { clusters: [], opportunities: [], evidence: [], briefs: [],
    geoObservations: [], geoProposals: [] } });
});

it("seals and restores all six Content/GEO tables, preserves tombstones, and repeats without new rows", async () => {
  const ref = { projectId, organizationId, scope: { tenantId: org, projectId: "site" } };
  const cluster = (await owner.from("content_clusters").select("id").eq("project_id", projectId).single()).data!;
  const opportunity = await owner.from("content_opportunities").insert({ project_id: projectId, organization_id: organizationId,
    cluster_id: cluster.id, cluster_role: "pillar", topic: "Fictitious opportunity", search_intent: "informational",
    market_language: "es", page_kind: "proposed", opportunity_type: "create", rationale: "Manual research" }).select("id").single();
  expect(opportunity.error).toBeNull();
  expect((await owner.from("content_evidence").insert({ project_id: projectId, organization_id: organizationId,
    opportunity_id: opportunity.data!.id, kind: "manual-source", title: "Fictitious source", source_date: "2026-10-16" })).error).toBeNull();
  expect((await owner.from("content_briefs").insert({ project_id: projectId, organization_id: organizationId,
    opportunity_id: opportunity.data!.id, market_language: "es", search_intent: "informational", main_topic: "Fictitious topic" })).error).toBeNull();
  const geo = await owner.from("geo_observations").insert({ project_id: projectId, organization_id: organizationId,
    entity_name: "Fictitious entity", engine: "chatgpt", query_text: "Second fictitious query", observed_on: "2026-10-16",
    method: "manual-copy", presence: "absent" }).select("id").single();
  expect(geo.error).toBeNull();
  expect((await owner.from("geo_observations").insert({ project_id: projectId, organization_id: organizationId,
    entity_name: "Fictitious entity", engine: "chatgpt", query_text: "Corrected fictitious query", observed_on: "2026-10-16",
    method: "manual-copy", presence: "absent", supersedes_id: geo.data!.id })).error).toBeNull();
  const keys = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-v4:${randomBytes(32).toString("base64")}`,
    PROVENANCE_ACTIVE_KEY_ID: "k-v4" });
  if (!keys.ok) throw new Error(keys.error);
  const keyring = keys.keyring;
  const receipts = psql(`select id from private.audit_outbox where project_id = '${projectId}' and state = 'pending' order by created_at, id;`).split(/\r?\n/).filter(Boolean);
  for (const receipt of receipts) expect(await processAuditOutbox(receipt, keyring)).toMatchObject({ ok: true });
  const [contentGeo, seo, exported] = await Promise.all([
    readContentGeoRecoveryState(owner, ref), readSeoRecoveryState(owner, ref), exportProject(owner, ref, keyring, "2026-10-16T20:00:00.000Z"),
  ]);
  if (!contentGeo.ok || !seo.ok || !exported.ok) throw new Error("Recovery source unavailable");
  const body = { ...exported.export, format: "rubik-project-export-v4", operations: {}, seo: seo.value, contentGeo: contentGeo.value };
  const doc = JSON.parse(JSON.stringify({ ...body, manifest: signExportManifest(body, ref, keyring) }));
  expect(verifyProjectExport(doc, keyring)).toMatchObject({ ok: true, completeness: { status: "COMPLETE" }, mismatches: [] });
  const changed = structuredClone(doc);
  changed.contentGeo.clusters[0].name = "Tampered";
  expect(verifyProjectExport(changed, keyring)).toMatchObject({ ok: true,
    completeness: { status: "INCOMPLETE", reasons: ["manifest.contentGeo"] } });
  expect(planRestore(changed, keyring, { operatorId: users[0] })).toEqual({ ok: false, error: "TAMPERED" });
  const dangling = structuredClone(body);
  dangling.contentGeo.evidence[0].provider_result_id = randomUUID();
  const signedDangling = { ...dangling, manifest: signExportManifest(dangling, ref, keyring) };
  expect(verifyProjectExport(signedDangling, keyring)).toEqual({ ok: false, error: "INVALID_CONTENT_GEO" });
  expect(planRestore(signedDangling, keyring, { operatorId: users[0] })).toEqual({ ok: false, error: "INVALID_CONTENT_GEO" });
  const planned = planRestore(doc, keyring, { operatorId: users[0] });
  expect(planned.ok).toBe(true);
  if (!planned.ok) return;
  expect(planned.plan.counts.contentGeo).toEqual({ clusters: 1, opportunities: 1, evidence: 1, briefs: 1,
    geoObservations: 2, geoProposals: 1 });
  psql(`delete from public.projects where id = '${projectId}';`);
  psql(planned.plan.sql);
  psql(planned.plan.sql);
  expect(await readContentGeoRecoveryState(owner, ref)).toEqual(contentGeo);
  expect((await outsider.from("geo_proposals").select("id").eq("project_id", projectId)).data).toEqual([]);
  expect((await outsider.from("content_briefs").select("id").eq("project_id", projectId)).data).toEqual([]);
  psql(`update public.content_clusters set name = 'Conflicting fixture' where id = '${cluster.id}';`);
  expect(() => psql(planned.plan.sql)).toThrow();
  expect(psql(`select name from public.content_clusters where id = '${cluster.id}';`)).toBe("Conflicting fixture");
});
