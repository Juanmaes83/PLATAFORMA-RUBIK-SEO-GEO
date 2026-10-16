import { afterAll, beforeAll, expect, it } from "vitest";
import { readContentGeoRecoveryState } from "@/lib/recovery/content-geo-state";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

const org = `cg-recovery-${RUN}`;
const otherOrg = `cg-foreign-${RUN}`;
const users: string[] = [];
let owner: Awaited<ReturnType<typeof signedIn>>;
let outsider: Awaited<ReturnType<typeof signedIn>>;
let projectId: string, organizationId: string;

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
