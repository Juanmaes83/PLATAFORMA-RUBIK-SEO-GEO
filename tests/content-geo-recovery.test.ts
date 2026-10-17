import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadKeyring } from "@/lib/provenance/keyring";
import { checkExportManifest, manifestVersionFor, signExportManifest } from "@/lib/provenance/manifest";
import { readContentGeoRecoveryState } from "@/lib/recovery/content-geo-state";
import { verifyProjectExport } from "@/lib/recovery/verify-export";
import { planRestore } from "@/lib/restore/plan";

// Export v4 (Contenidos + GEO), offline: partial reads fail closed, the manifest version follows
// the format without changing v1-v3, and the restore SQL keeps every trigger change inside the
// one transaction. No database, network or provider.
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-u:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-u" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;
const projectId = randomUUID(), organizationId = randomUUID(), author = randomUUID();
const ref = { projectId, organizationId, scope: { tenantId: "agencia-u", projectId: "site" } };
const row = (extra: Record<string, unknown> = {}) => ({ id: randomUUID(), project_id: projectId, organization_id: organizationId, created_by: author, ...extra });

type Tables = Record<string, Record<string, unknown>[]>;
/** Minimal stand-in for the Data API: count, then pages ordered by id; `fail`/`changeCount` inject faults. */
function fakeClient(tables: Tables, faults: { fail?: string; changeCount?: string } = {}) {
  const counted = new Map<string, number>();
  return {
    from(table: string) {
      const builder = (head: boolean) => {
        let after: string | null = null;
        const q = {
          eq: () => q, order: () => q, limit: () => q,
          gt: (_c: string, v: string) => { after = v; return q; },
          then: (resolve: (v: unknown) => void) => {
            if (faults.fail === table || !(table in tables)) return resolve({ data: null, count: null, error: { code: "PGRST205" } });
            const rows = [...tables[table]].sort((a, b) => String(a.id).localeCompare(String(b.id)));
            if (head) {
              const n = (counted.get(table) ?? 0) + 1; counted.set(table, n);
              return resolve({ count: rows.length + (faults.changeCount === table && n > 1 ? 1 : 0), error: null });
            }
            resolve({ data: rows.filter((r) => after === null || String(r.id) > after).slice(0, 500), error: null });
          },
        };
        return q;
      };
      return { select: (_cols: string, opts?: { head?: boolean }) => builder(!!opts?.head) };
    },
  } as never;
}
const sample = () => {
  const cluster = row({ name: "Carta" });
  const opportunity = row({ cluster_id: cluster.id });
  const observation = row({ supersedes_id: null, verification: "declared", verified_by: null });
  return {
    content_clusters: [cluster], content_opportunities: [opportunity],
    content_evidence: [row({ opportunity_id: opportunity.id, provider_result_id: null, import_id: null })],
    content_briefs: [row({ opportunity_id: opportunity.id, status: "approved", approved_by: author, submitted_by: author, reviewed_by: author })],
    geo_observations: [observation], geo_proposals: [row({ evidence_ids: [observation.id], reviewed_by: null })],
  } satisfies Tables;
};

describe("Contenidos/GEO recovery reader (fail closed)", () => {
  it("reads the six tables in full", async () => {
    const r = await readContentGeoRecoveryState(fakeClient(sample()), ref);
    expect(r.ok && [r.content.clusters.length, r.content.opportunities.length, r.content.evidence.length, r.content.briefs.length,
      r.geo.observations.length, r.geo.proposals.length]).toEqual([1, 1, 1, 1, 1, 1]);
  });
  it("a missing table, a failed read or a count that changes during the read is never a partial success", async () => {
    const { geo_proposals: _omit, ...withoutProposals } = sample();
    void _omit;
    expect(await readContentGeoRecoveryState(fakeClient(withoutProposals), ref)).toEqual({ ok: false, error: "READ_FAILED" });
    expect(await readContentGeoRecoveryState(fakeClient(sample(), { fail: "content_evidence" }), ref)).toEqual({ ok: false, error: "READ_FAILED" });
    expect(await readContentGeoRecoveryState(fakeClient(sample(), { changeCount: "geo_observations" }), ref)).toEqual({ ok: false, error: "EXPORT_CHANGED" });
  });
  it("a link to a row outside the read set refuses the export instead of dropping it", async () => {
    const broken = sample();
    broken.content_briefs[0].opportunity_id = randomUUID();
    expect(await readContentGeoRecoveryState(fakeClient(broken), ref)).toEqual({ ok: false, error: "CONTENT_GEO_RELATION_MISSING" });
  });
});

const exported = (format: string, extra: Record<string, unknown> = {}) => {
  const body = { format, exportedAt: "2026-10-17T06:00:00.000Z", scope: ref.scope, audit: { rows: [], verification: { valid: true, length: 0 } },
    results: [], imports: [], operations: {}, ...extra };
  return JSON.parse(JSON.stringify({ ...body, manifest: signExportManifest(body, ref, keyring) })) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};
const seo = { projectDomain: null, keywords: [], competitors: [], observations: [] };
const v4 = () => {
  const s = sample();
  return exported("rubik-project-export-v4", { seo, content: { clusters: s.content_clusters, opportunities: s.content_opportunities,
    evidence: s.content_evidence, briefs: s.content_briefs }, geo: { observations: s.geo_observations, proposals: s.geo_proposals } });
};

describe("export v4 manifest and offline verification", () => {
  it("each format keeps its own manifest version; v1-v3 manifests have no Contenidos/GEO part", () => {
    expect(["rubik-project-export-v2", "rubik-project-export-v3", "rubik-project-export-v4"].map(manifestVersionFor))
      .toEqual(["rubik-export-manifest-v1", "rubik-export-manifest-v2", "rubik-export-manifest-v3"]);
    const v3 = exported("rubik-project-export-v3", { seo });
    expect(v3.manifest.content).toBeUndefined();
    expect(v3.manifest.geo).toBeUndefined();
    expect(verifyProjectExport(v3, keyring)).toMatchObject({ ok: true, completeness: { status: "COMPLETE" } });
    expect(v4().manifest).toMatchObject({ version: "rubik-export-manifest-v3", content: { briefs: { count: 1 } }, geo: { proposals: { count: 1 } } });
  });
  it("an empty v4 project verifies only through its signed manifest; a v4 body under a v2 manifest is malformed", () => {
    const empty = exported("rubik-project-export-v4", { seo, content: { clusters: [], opportunities: [], evidence: [], briefs: [] },
      geo: { observations: [], proposals: [] } });
    expect(verifyProjectExport(empty, keyring)).toMatchObject({ ok: true, completeness: { status: "COMPLETE" } });
    const relabelled = v4(); relabelled.manifest.version = "rubik-export-manifest-v2";
    expect(checkExportManifest(relabelled, ref, keyring)).toEqual({ status: "INCOMPLETE", reasons: ["manifest.malformed"] });
  });
  it("structural damage is refused before the manifest: missing list, duplicated id, bad cluster link, non-UUID evidence", () => {
    const missing = v4(); delete missing.content.evidence;
    const duplicated = v4(); duplicated.geo.observations.push(duplicated.geo.observations[0]);
    const badCluster = v4(); badCluster.content.opportunities[0].cluster_id = randomUUID();
    const badEvidence = v4(); badEvidence.geo.proposals[0].evidence_ids = ["no-es-uuid"];
    for (const d of [missing, duplicated, badCluster, badEvidence]) expect(verifyProjectExport(d, keyring)).toEqual({ ok: false, error: "INVALID_CONTENT_GEO" });
  });
});

describe("export v4 restore plan", () => {
  it("one transaction: every BEFORE trigger disabled is re-enabled, and authors are checked, never replaced", () => {
    const plan = planRestore(v4(), keyring, { operatorId: randomUUID() });
    if (!plan.ok) throw new Error(plan.error);
    const sql = plan.plan.sql;
    expect(plan.plan.counts.contentGeo).toEqual({ clusters: 1, opportunities: 1, evidence: 1, briefs: 1, observations: 1, proposals: 1 });
    const disabled = [...sql.matchAll(/disable trigger (\w+)/g)].map((m) => m[1]);
    const enabled = [...sql.matchAll(/enable trigger (\w+)/g)].map((m) => m[1]);
    expect(disabled.sort()).toEqual(enabled.sort());
    expect(disabled).toEqual(expect.arrayContaining(["content_briefs_before_write", "geo_observations_before_write", "geo_proposals_before_write"]));
    expect(sql.indexOf("begin;")).toBeLessThan(sql.indexOf("disable trigger"));
    expect(sql.lastIndexOf("enable trigger")).toBeLessThan(sql.lastIndexOf("commit;"));
    expect(sql).toContain("falta una cuenta de autor, revisor o verificador de Contenidos/GEO");
    expect(sql).not.toMatch(/update rubik_content|set created_by|set approved_by|set verified_by/);
  });
  it("a v3 plan carries no Contenidos/GEO statement", () => {
    const plan = planRestore(exported("rubik-project-export-v3", { seo }), keyring, { operatorId: randomUUID() });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.plan.counts.contentGeo).toBeNull();
    expect(plan.plan.sql).not.toMatch(/content_|geo_/);
  });
});
