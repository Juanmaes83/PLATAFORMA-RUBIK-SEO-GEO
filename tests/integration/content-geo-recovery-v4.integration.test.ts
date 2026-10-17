import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { providers } from "@/lib/core";
import { importFile } from "@/lib/imports/repository";
import type { ProjectRef } from "@/lib/provenance/audit";
import { loadKeyring } from "@/lib/provenance/keyring";
import { signExportManifest } from "@/lib/provenance/manifest";
import { inspectProjectAuditOutbox, processAuditOutbox } from "@/lib/provenance/outbox";
import { exportProject, loadProviderResult, readAuditTrail, storeProviderResult } from "@/lib/provenance/repository";
import { readContentGeoRecoveryState } from "@/lib/recovery/content-geo-state";
import { operationalStateComplete, readOperationalState } from "@/lib/recovery/operations";
import { recoverySchemaContract } from "@/lib/recovery/schema-contract";
import { readSeoRecoveryState } from "@/lib/recovery/seo-state";
import { verifyProjectExport } from "@/lib/recovery/verify-export";
import { RESTORE_CONFLICT, planRestore } from "@/lib/restore/plan";
import { consentedMembership } from "../fixtures/consented-membership";
import { localDatabaseContainer } from "../../scripts/supabase-test-env.mjs";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

// Export v4 (Contenidos + GEO) end to end on the exclusive LOCAL stack that has both modules
// (selected by scripts/verify-n2-integration.mjs with RUBIK_N2_TEST_STACK=n2ContentGeo). Rows of
// both modules by several authors, review and verification states, links to a signed result and
// an import; export through the same gates as the route; offline verification and tampering;
// restore twice after a loss; conflicts; a missing author; isolation after restoring.
const contentGeoStack = process.env.RUBIK_TEST_N2_CONTENT_GEO_STACK === "1";
const container = contentGeoStack ? localDatabaseContainer() : "";
const org = `cgv4-${RUN}`, orphanOrg = `cgv4-autor-${RUN}`, foreignOrg = `cgv4-ajena-${RUN}`;
const users: Record<string, string> = {};
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-v4:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-v4" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const psqlError = (sql: string) => { try { psql(sql); } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } throw new Error("expected failure"); };
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

type Client = Awaited<ReturnType<typeof signedIn>>;
let owner: Client, analyst: Client, outsider: Client;
let ref: ProjectRef, orphanRef: ProjectRef;
let doc: Record<string, unknown>, orphanDoc: Record<string, unknown>;
let originalCG: Extract<Awaited<ReturnType<typeof readContentGeoRecoveryState>>, { ok: true }>;
let originalSeo: Awaited<ReturnType<typeof readSeoRecoveryState>>;

const must = <T extends { error: unknown }>(r: T) => { if (r.error) throw new Error(JSON.stringify(r.error)); return r; };
const signAll = async (projectId: string) => {
  const ids = psql(`select id from private.audit_outbox where project_id = '${projectId}' and state = 'pending' order by created_at, id;`).split(/\r?\n/).filter(Boolean);
  for (const id of ids) expect(await processAuditOutbox(id, keyring)).toMatchObject({ ok: true });
};
/** The export route's sequence and gates (exportar/route.ts), outside Next.js. */
async function exportV4(client: Client, project: ProjectRef, at: string) {
  const before = await inspectProjectAuditOutbox(project);
  if (!before.ok) throw new Error(before.error);
  expect(await recoverySchemaContract()).toBe("n2-v4");
  const exported = await exportProject(client, project, keyring, at);
  if (!exported.ok) throw new Error(exported.error);
  const operations = await readOperationalState(client, project, exported.export.results.map((r) => r.row));
  expect(operationalStateComplete(operations)).toBe(true);
  const seo = await readSeoRecoveryState(client, project);
  const cg = await readContentGeoRecoveryState(client, project);
  const cgAgain = await readContentGeoRecoveryState(client, project);
  if (!seo.ok || !cg.ok || !cgAgain.ok) throw new Error("read failed");
  expect(cgAgain).toEqual(cg);
  const body = { ...exported.export, format: "rubik-project-export-v4", operations, seo: seo.value, content: cg.content, geo: cg.geo };
  return JSON.parse(JSON.stringify({ ...body, manifest: signExportManifest(body, project, keyring) })) as Record<string, unknown>;
}
const restore = (d: Record<string, unknown>, operatorId: string) => {
  const plan = planRestore(d, keyring, { operatorId });
  if (!plan.ok) throw new Error(plan.error);
  return plan.plan;
};
const clone = (d: Record<string, unknown>) => JSON.parse(JSON.stringify(d)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeAll(async () => {
  if (!contentGeoStack) return;
  for (const n of ["owner", "analyst", "outsider", "orphan"]) users[n] = await createConfirmedUser(`cgv4-${n}`);
  [owner, analyst, outsider] = await Promise.all(["cgv4-owner", "cgv4-analyst", "cgv4-outsider"].map(signedIn));
  must(await owner.from("organizations").insert({ slug: org, name: "Agencia v4 (ficticia)" }));
  must(await owner.from("organizations").insert({ slug: orphanOrg, name: "Autor ausente (ficticia)" }));
  must(await outsider.from("organizations").insert({ slug: foreignOrg, name: "Ajena (ficticia)" }));
  const orgId = must(await owner.from("organizations").select("id").eq("slug", org).single()).data!.id;
  const orphanOrgId = must(await owner.from("organizations").select("id").eq("slug", orphanOrg).single()).data!.id;
  must(await owner.from("projects").insert({ organization_id: orgId, slug: "site", name: "Site", domain: "cgv4.example.test" }));
  must(await owner.from("projects").insert({ organization_id: orphanOrgId, slug: "site", name: "Site" }));
  const projectId = must(await owner.from("projects").select("id").eq("organization_id", orgId).single()).data!.id;
  const orphanId = must(await owner.from("projects").select("id").eq("organization_id", orphanOrgId).single()).data!.id;
  ref = { projectId, organizationId: orgId, scope: { tenantId: org, projectId: "site" } };
  orphanRef = { projectId: orphanId, organizationId: orphanOrgId, scope: { tenantId: orphanOrg, projectId: "site" } };
  await consentedMembership(owner, analyst, projectId, "analyst");
  const scoped = { project_id: projectId, organization_id: orgId };

  // Sources an evidence can cite: a signed provider result and an import, both of this project.
  const result = await providers.runProviderRequest({ provider: "search-console", operation: "searchAnalytics",
    input: { siteUrl: "sc-domain:cgv4.example.test", startDate: "2026-09-01", endDate: "2026-09-28", rowLimit: 1 },
    transport: { kind: "live", request: async () => ({ rows: [{ query: "q", clicks: 1, impressions: 2, ctr: 0.5, averagePosition: 3 }], truncated: false }) },
    clock: () => new Date("2026-10-16T08:00:00Z"), budget: { maxUnits: 2, maxRequests: 2 } });
  const stored = await storeProviderResult(owner, ref, result, keyring);
  if (!stored.ok) throw new Error(stored.error);
  const imported = await importFile(analyst, ref, new TextEncoder().encode(JSON.stringify({ format: "rubik-import-v1", scope: ref.scope,
    source: { kind: "audit", label: "Importación v4", tool: "revisión manual" }, capturedAt: "2026-10-16T09:00:00+02:00",
    findings: [{ url: "https://cgv4.example.test/a", ruleId: "r1", severity: "low", title: "Hallazgo", observation: "Ficticio." }] })),
    { role: "analyst", id: users.analyst }, keyring);
  if (!imported.ok) throw new Error(imported.error);
  // A declared keyword so the v4 file also carries the v3 SEO part.
  must(await analyst.from("seo_keywords").insert({ ...scoped, phrase: "menú del día", language_code: "es", country_code: "ES" }));

  // Contenidos: cluster, two opportunities, three kinds of evidence, a brief submitted and approved.
  const cluster = must(await analyst.from("content_clusters").insert({ ...scoped, name: "Carta", main_topic: "menú" }).select("id").single()).data!.id;
  const op1 = must(await analyst.from("content_opportunities").insert({ ...scoped, cluster_id: cluster, cluster_role: "pillar", topic: "Menú del día",
    search_intent: "local", market_language: "es", market_country: "ES", page_kind: "proposed", opportunity_type: "create",
    rationale: "Sin página para esta búsqueda local.", priority: "high", priority_reason: "Hipótesis del analista" }).select("id").single()).data!.id;
  must(await owner.from("content_opportunities").insert({ ...scoped, topic: "Reservas", search_intent: "transactional", market_language: "es",
    page_kind: "existing", page_url: "https://cgv4.example.test/reservas", opportunity_type: "improve", rationale: "Página existente mejorable." }));
  must(await analyst.from("content_evidence").insert([
    { ...scoped, opportunity_id: op1, kind: "provider-result", provider_result_id: stored.id, title: "x" },
    { ...scoped, opportunity_id: op1, kind: "import-finding", import_id: imported.id, title: "x" },
    { ...scoped, opportunity_id: op1, kind: "analyst-proposal", title: "Propuesta del analista", detail: "Declarada." }]));
  const brief = must(await analyst.from("content_briefs").insert({ ...scoped, opportunity_id: op1, objective: "Captar reservas", audience: "Vecinos",
    market_language: "es", market_country: "ES", search_intent: "local", main_topic: "Menú del día",
    outline: [{ level: 1, text: "Menú del día" }], questions: ["¿Precio?"] }).select("id").single()).data!.id;
  must(await analyst.from("content_briefs").update({ status: "in-review" }).eq("id", brief));
  must(await owner.from("content_briefs").update({ status: "approved", review_note: "Aprobado" }).eq("id", brief));

  // GEO: an observation, its correction (supersedes), verified by the owner; a proposal accepted.
  const obs = must(await analyst.from("geo_observations").insert({ ...scoped, entity_name: "Restaurante Sol", engine: "chatgpt",
    query_text: "¿Dónde comer menú del día?", observed_on: yesterday, method: "manual-copy", presence: "absent" }).select("id").single()).data!.id;
  const fix = must(await analyst.from("geo_observations").insert({ ...scoped, entity_name: "Restaurante Sol", engine: "chatgpt",
    query_text: "¿Dónde comer menú del día?", observed_on: today, method: "screenshot", presence: "cited",
    cited_sources: [{ url: "https://cgv4.example.test/", title: "Sol" }], supersedes_id: obs }).select("id").single()).data!.id;
  must(await owner.from("geo_observations").update({ verification: "verified" }).eq("id", fix));
  const proposal = must(await analyst.from("geo_proposals").insert({ ...scoped, rule: "manual", query_text: "¿Dónde comer menú del día?",
    title: "Reforzar la página", problem: "Ausente ayer.", hypothesis: "Una página clara ayuda.", suggested_action: "Crear la página.",
    priority: "medium", priority_reason: "Una lectura", evidence_ids: [obs, fix] }).select("id").single()).data!.id;
  must(await owner.from("geo_proposals").update({ status: "accepted", review_note: "Adelante" }).eq("id", proposal));

  // A pending Contenidos/GEO receipt blocks the export; signing it clears the gate (S1, R1).
  expect(await inspectProjectAuditOutbox(ref)).toEqual({ ok: false, error: "AUDIT_PENDING" });
  await signAll(projectId);
  originalSeo = await readSeoRecoveryState(owner, ref);
  const cg = await readContentGeoRecoveryState(owner, ref);
  if (!cg.ok) throw new Error(cg.error);
  originalCG = cg;
  doc = await exportV4(owner, ref, "2026-10-17T06:00:00.000Z");

  // A project whose only content author is a person who will not exist in the destination.
  const orphanUser = await signedIn("cgv4-orphan");
  await consentedMembership(owner, orphanUser, orphanId, "analyst");
  must(await orphanUser.from("content_clusters").insert({ project_id: orphanId, organization_id: orphanOrgId, name: "Solo", main_topic: "autor" }));
  await signAll(orphanId);
  orphanDoc = await exportV4(owner, orphanRef, "2026-10-17T06:00:00.000Z");
}, 120_000);

afterAll(async () => {
  if (!contentGeoStack) return;
  await deleteOrganizations([org, orphanOrg, foreignOrg]);
  await deleteUsers(Object.values(users));
});

describe.skipIf(!contentGeoStack)("export v4 · Contenidos y GEO", () => {
  it("verifies offline as COMPLETE and the signed manifest counts every Contenidos/GEO row", () => {
    const check = verifyProjectExport(doc, keyring);
    expect(check).toMatchObject({ ok: true, format: "rubik-project-export-v4", mismatches: [], completeness: { status: "COMPLETE" },
      results: { total: 1, verified: 1, failed: [] } });
    expect(doc.manifest).toMatchObject({ version: "rubik-export-manifest-v3",
      content: { clusters: { count: 1 }, opportunities: { count: 2 }, evidence: { count: 3 }, briefs: { count: 1 } },
      geo: { observations: { count: 2 }, proposals: { count: 1 } }, seo: { keywords: { count: 1 } } });
  });

  it("tampering, missing lists, broken links and relabelled formats never produce SQL", () => {
    const status = (d: Record<string, unknown>) => { const p = planRestore(d, keyring, { operatorId: users.owner }); return p.ok ? "PLANNED" : p.error; };
    const edited = clone(doc); edited.content.briefs[0].status = "draft";
    expect(verifyProjectExport(edited, keyring)).toMatchObject({ ok: true, completeness: { status: "INCOMPLETE", reasons: ["manifest.content"] } });
    expect(status(edited)).toBe("TAMPERED");
    const unverified = clone(doc);
    unverified.geo.observations.find((o: { verification: string }) => o.verification === "verified").verification = "declared";
    expect(status(unverified)).toBe("TAMPERED");
    const dropped = clone(doc); dropped.geo.proposals.pop();
    expect(status(dropped)).toBe("TAMPERED");
    const missing = clone(doc); delete missing.geo;
    expect(status(missing)).toBe("INVALID_CONTENT_GEO");
    const dangling = clone(doc); dangling.content.evidence[0].provider_result_id = "00000000-0000-4000-8000-00000000abcd";
    expect(status(dangling)).toBe("INVALID_CONTENT_GEO");
    const orphanBrief = clone(doc); orphanBrief.content.briefs[0].opportunity_id = "00000000-0000-4000-8000-00000000abce";
    expect(status(orphanBrief)).toBe("INVALID_CONTENT_GEO");
    const asV3 = clone(doc); asV3.format = "rubik-project-export-v3";
    expect(status(asV3)).toBe("INVALID_CONTENT_GEO");
    const noManifest = clone(doc); delete noManifest.manifest;
    expect(status(noManifest)).toBe("TAMPERED");
  });

  it("after a loss, restoring twice brings back every row, author, review state and signature, unchanged", async () => {
    await deleteOrganizations([org]);
    expect(psql(`select count(*) from public.content_opportunities where project_id = '${ref.projectId}';`)).toBe("0");
    const plan = restore(doc, users.owner);
    expect(plan.counts.contentGeo).toEqual({ clusters: 1, opportunities: 2, evidence: 3, briefs: 1, observations: 2, proposals: 1 });
    psql(plan.sql);
    const first = await readContentGeoRecoveryState(owner, ref);
    psql(plan.sql); // idempotent: identical rows are left as they are
    const second = await readContentGeoRecoveryState(owner, ref);
    expect(first).toEqual(originalCG);
    expect(second).toEqual(originalCG);
    const brief = (originalCG.content.briefs[0]);
    expect(brief).toMatchObject({ status: "approved", approved_by: users.owner, submitted_by: users.analyst, created_by: users.analyst });
    expect(originalCG.geo.observations.find((o) => o.verification === "verified")?.verified_by).toBe(users.owner);
    expect(await readSeoRecoveryState(owner, ref)).toEqual(originalSeo);
    const trail = await readAuditTrail(owner, ref, keyring);
    expect(trail.ok && trail.verification.valid).toBe(true);
    const resultId = (doc.results as { row: { id: string } }[])[0].row.id;
    expect(await loadProviderResult(owner, ref, resultId, keyring)).toMatchObject({ ok: true, verification: { verified: true } });
    // The offline restore queues no receipt and leaves every BEFORE trigger enabled again.
    expect(psql(`select count(*) from private.audit_outbox where project_id = '${ref.projectId}' and state = 'pending';`)).toBe("0");
    expect(psql(`select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and t.tgenabled <> 'O'
      and c.relname like any (array['content_%', 'geo_%']);`)).toBe("0");
    // Memberships are never restored: the analyst no longer sees the project.
    expect((await analyst.from("content_opportunities").select("id").eq("project_id", ref.projectId)).data).toEqual([]);
    // A re-export of the restored project carries the same Contenidos/GEO digests.
    const again = await exportV4(owner, ref, "2026-10-17T07:00:00.000Z");
    expect((again.manifest as { content: unknown; geo: unknown }).content).toEqual((doc.manifest as { content: unknown }).content);
    expect((again.manifest as { geo: unknown }).geo).toEqual((doc.manifest as { geo: unknown }).geo);
  });

  it("another organization cannot read any restored Contenidos/GEO row, even by its exact id", async () => {
    for (const [table, rows] of [["content_clusters", originalCG.content.clusters], ["content_opportunities", originalCG.content.opportunities],
      ["content_evidence", originalCG.content.evidence], ["content_briefs", originalCG.content.briefs],
      ["geo_observations", originalCG.geo.observations], ["geo_proposals", originalCG.geo.proposals]] as const) {
      const r = await outsider.from(table).select("id").in("id", rows.map((row) => row.id));
      expect(r.error).toBeNull();
      expect(r.data).toEqual([]);
    }
  });

  it("a divergent row aborts the whole restore: a missing row is not added while another conflicts", () => {
    const proposal = originalCG.geo.proposals[0].id;
    psql(`delete from public.geo_proposals where id = '${proposal}';`);
    psql(`alter table public.content_clusters disable trigger content_clusters_touch;
      update public.content_clusters set description = 'cambiada en destino' where project_id = '${ref.projectId}';
      alter table public.content_clusters enable trigger content_clusters_touch;`);
    expect(psqlError(restore(doc, users.owner).sql)).toContain(RESTORE_CONFLICT);
    expect(psql(`select count(*) from public.geo_proposals where id = '${proposal}';`)).toBe("0");
  });

  it("refuses to restore when an author account is missing, instead of assigning the operator", async () => {
    await deleteOrganizations([orphanOrg]);
    await deleteUsers([users.orphan]);
    delete users.orphan;
    expect(psqlError(restore(orphanDoc, users.owner).sql)).toContain(RESTORE_CONFLICT);
    expect(psql(`select count(*) from public.organizations where slug = '${orphanOrg}';`)).toBe("0");
    expect(psql(`select count(*) from public.content_clusters where project_id = '${orphanRef.projectId}';`)).toBe("0");
  });
});
