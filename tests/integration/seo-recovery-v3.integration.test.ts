import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { loadKeyring } from "@/lib/provenance/keyring";
import { processAuditOutbox } from "@/lib/provenance/outbox";
import { signExportManifest } from "@/lib/provenance/manifest";
import { exportProject } from "@/lib/provenance/repository";
import { readSeoRecoveryState } from "@/lib/recovery/seo-state";
import { verifyProjectExport } from "@/lib/recovery/verify-export";
import { planRestore } from "@/lib/restore/plan";
import { localDatabaseContainer } from "../../scripts/supabase-test-env.mjs";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

const container = localDatabaseContainer();
const org = `seo-restore-${RUN}`, otherOrg = `seo-foreign-${RUN}`;
const users: string[] = [];
const keyringResult = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-v3:${randomBytes(32).toString("base64")}`,
  PROVENANCE_ACTIVE_KEY_ID: "k-v3" });
if (!keyringResult.ok) throw new Error(keyringResult.error);
const keyring = keyringResult.keyring;
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

let owner: Awaited<ReturnType<typeof signedIn>>;
let outsider: Awaited<ReturnType<typeof signedIn>>;
let projectId: string, organizationId: string;
let original: Awaited<ReturnType<typeof readSeoRecoveryState>>;
let doc: Record<string, unknown>;

beforeAll(async () => {
  users.push(await createConfirmedUser("seo-restore-owner"), await createConfirmedUser("seo-restore-outsider"));
  [owner, outsider] = await Promise.all(["seo-restore-owner", "seo-restore-outsider"].map(signedIn));
  expect((await owner.from("organizations").insert({ slug: org, name: "SEO restore" })).error).toBeNull();
  expect((await outsider.from("organizations").insert({ slug: otherOrg, name: "Foreign" })).error).toBeNull();
  organizationId = (await owner.from("organizations").select("id").eq("slug", org).single()).data!.id;
  expect((await owner.from("projects").insert({ organization_id: organizationId, slug: "site", name: "Site",
    domain: "seo-restore.example.test" })).error).toBeNull();
  projectId = (await owner.from("projects").select("id").eq("organization_id", organizationId).single()).data!.id;
  const keyword = await owner.from("seo_keywords").insert({ project_id: projectId, organization_id: organizationId,
    phrase: "consulta ficticia", language_code: "es", country_code: "ES", target_url: "https://seo-restore.example.test/pagina" });
  expect(keyword.error).toBeNull();
  const competitor = await owner.from("competitors").insert({ project_id: projectId, organization_id: organizationId,
    domain: "competidor.example.test", name: "Competidor ficticio" }).select("id").single();
  expect(competitor.error).toBeNull();
  const observation = await owner.from("competitor_observations").insert({ project_id: projectId, organization_id: organizationId,
    competitor_id: competitor.data!.id, metric: "organic-traffic", availability: "available", value: 10,
    method: "declared", source_name: "Fixture", observed_on: "2026-10-15" }).select("id").single();
  expect(observation.error).toBeNull();
  expect((await owner.from("competitor_observations").update({ verification: "verified" }).eq("id", observation.data!.id)).error).toBeNull();
  const receipts = psql(`select id from private.audit_outbox where project_id = '${projectId}' and state = 'pending' order by created_at, id;`)
    .split(/\r?\n/).filter(Boolean);
  for (const receipt of receipts) expect(await processAuditOutbox(receipt, keyring)).toMatchObject({ ok: true });
  const ref = { projectId, organizationId, scope: { tenantId: org, projectId: "site" } };
  original = await readSeoRecoveryState(owner, ref);
  if (!original.ok) throw new Error(original.error);
  const exported = await exportProject(owner, ref, keyring, "2026-10-16T06:00:00.000Z");
  if (!exported.ok) throw new Error(exported.error);
  const body = { ...exported.export, format: "rubik-project-export-v3", operations: {}, seo: original.value };
  doc = JSON.parse(JSON.stringify({ ...body, manifest: signExportManifest(body, ref, keyring) }));
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([org, otherOrg]);
  await deleteUsers(users);
});

it("v3 binds declarations, relations and verification without reinterpreting v1/v2", async () => {
  expect(verifyProjectExport(doc, keyring)).toMatchObject({ ok: true, format: "rubik-project-export-v3",
    completeness: { status: "COMPLETE" }, mismatches: [] });
  const changed = structuredClone(doc) as { seo: { observations: { value: number }[] } };
  changed.seo.observations[0].value = 999;
  expect(verifyProjectExport(changed, keyring)).toMatchObject({ ok: true,
    completeness: { status: "INCOMPLETE", reasons: ["manifest.seo"] } });
  const plan = planRestore(changed, keyring, { operatorId: users[0] });
  expect(plan).toEqual({ ok: false, error: "TAMPERED" });
});

it("accepts an empty v3 project only when a valid signed manifest pins its identity", () => {
  const { manifest: _manifest, ...body } = doc;
  const empty = { ...body, audit: { rows: [], verification: { valid: true } }, results: [], imports: [],
    seo: { projectDomain: "seo-restore.example.test", keywords: [], competitors: [], observations: [] } };
  const ref = { projectId, organizationId, scope: { tenantId: org, projectId: "site" } };
  const signed = { ...empty, manifest: signExportManifest(empty, ref, keyring) };
  expect(verifyProjectExport(signed, keyring)).toMatchObject({ ok: true, completeness: { status: "COMPLETE" } });
  expect(verifyProjectExport({ ...signed, manifest: undefined }, keyring)).toEqual({ ok: false, error: "EMPTY_SCOPE" });
});

it("restores owned SEO rows with original ids, relationships and human verification; repeat is idempotent", async () => {
  const planned = planRestore(doc, keyring, { operatorId: users[0] });
  expect(planned.ok).toBe(true);
  if (!planned.ok || !original.ok) return;
  psql(`delete from public.projects where id = '${projectId}';`);
  psql(planned.plan.sql);
  psql(planned.plan.sql);
  const ref = { projectId, organizationId, scope: { tenantId: org, projectId: "site" } };
  expect(await readSeoRecoveryState(owner, ref)).toEqual(original);
  expect((await outsider.from("competitor_observations").select("id").eq("project_id", projectId)).data).toEqual([]);
  expect((await outsider.from("seo_keywords").select("id").eq("project_id", projectId)).data).toEqual([]);
});
