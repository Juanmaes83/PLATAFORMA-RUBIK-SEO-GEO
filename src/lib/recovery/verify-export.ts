import "server-only";
import { verifyAuditTrail, type AuditRow, type AuditVerification, type ProjectRef } from "@/lib/provenance/audit";
import type { Keyring } from "@/lib/provenance/keyring";
import { checkExportManifest, type Completeness } from "@/lib/provenance/manifest";
import { openProviderResult, type ProviderResultRow } from "@/lib/provenance/results";

// Pilot recovery: re-verifies an exported project file offline, with the owner's keyring and
// no database. It recomputes the audit chain and every result signature instead of trusting
// the verification written in the file, and reports where the recorded and recomputed values
// differ (a tampered or re-signed file). It never repairs, re-signs or imports anything.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const V3 = "rubik-project-export-v3", V4 = "rubik-project-export-v4";
const FORMATS = new Set(["rubik-project-export-v1", "rubik-project-export-v2", V3, V4]);
const CONTENT_PARTS = ["clusters", "opportunities", "evidence", "briefs"] as const;
const GEO_PARTS = ["observations", "proposals"] as const;

export type ExportCheck =
  | { ok: false; error: "NOT_AN_EXPORT" | "UNSUPPORTED_FORMAT" | "MIXED_PROJECTS" | "EMPTY_SCOPE" | "INVALID_SEO" | "INVALID_CONTENT_GEO" }
  | {
      ok: true;
      format: string;
      project: { projectId: string; organizationId: string };
      audit: AuditVerification;
      results: { total: number; verified: number; failed: { index: number; reason: string | null }[] };
      /** Recorded verification (or signed manifest) that disagrees with the recomputed one. */
      mismatches: string[];
      /** Whether the signed manifest proves nothing was removed or edited (UNPROVEN: older file without one). */
      completeness: Completeness;
    };

export function verifyProjectExport(doc: unknown, keyring: Keyring): ExportCheck {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { ok: false, error: "NOT_AN_EXPORT" };
  const d = doc as Record<string, unknown>;
  if (typeof d.format !== "string" || !Array.isArray((d.audit as { rows?: unknown })?.rows) || !Array.isArray(d.results)) {
    return { ok: false, error: "NOT_AN_EXPORT" };
  }
  if (!FORMATS.has(d.format)) return { ok: false, error: "UNSUPPORTED_FORMAT" };
  const seo = d.seo as { projectDomain?: unknown; keywords?: unknown; competitors?: unknown; observations?: unknown } | undefined;
  const hasSeo = d.format === V3 || d.format === V4;
  if (hasSeo && (!seo || !Array.isArray(seo.keywords)
    || !Array.isArray(seo.competitors) || !Array.isArray(seo.observations)
    || !(seo.projectDomain === null || typeof seo.projectDomain === "string")))
    return { ok: false, error: "INVALID_SEO" };
  const content = d.content as Record<string, unknown> | undefined, geo = d.geo as Record<string, unknown> | undefined;
  // v4 must carry every Contenidos/GEO list (possibly empty); a missing list is never "no data".
  if (d.format === V4 && (!content || !geo || CONTENT_PARTS.some((k) => !Array.isArray(content[k]))
    || GEO_PARTS.some((k) => !Array.isArray(geo[k]))))
    return { ok: false, error: "INVALID_CONTENT_GEO" };
  if (d.format !== V4 && (d.content !== undefined || d.geo !== undefined)) return { ok: false, error: "INVALID_CONTENT_GEO" };
  const scope = d.scope as ProjectRef["scope"] | undefined;
  const auditRows = (d.audit as { rows: AuditRow[]; verification?: AuditVerification }).rows;
  const results = d.results as { row: ProviderResultRow; verification?: { verified?: boolean } }[];
  const seoRows = hasSeo
    ? [...seo!.keywords as Record<string, unknown>[], ...seo!.competitors as Record<string, unknown>[],
      ...seo!.observations as Record<string, unknown>[]] : [];
  const contentGeoRows = d.format === V4
    ? [...CONTENT_PARTS.flatMap((k) => content![k] as Record<string, unknown>[]), ...GEO_PARTS.flatMap((k) => geo![k] as Record<string, unknown>[])] : [];
  const ids = new Set([...auditRows, ...results.map((r) => r?.row), ...seoRows, ...contentGeoRows]
    .map((r) => `${r?.project_id}|${r?.organization_id}`));
  // A new project may have no audit, provider or SEO rows yet. For v3/v4 only, the
  // manifest pins its identity; the completeness check below verifies its signature.
  if (ids.size === 0 && hasSeo) {
    const m = d.manifest as { projectId?: unknown; organizationId?: unknown } | undefined;
    if (typeof m?.projectId === "string" && typeof m.organizationId === "string")
      ids.add(`${m.projectId}|${m.organizationId}`);
  }
  if (ids.size === 0) return { ok: false, error: "EMPTY_SCOPE" };
  if (ids.size > 1) return { ok: false, error: "MIXED_PROJECTS" };
  const [projectId, organizationId] = [...ids][0].split("|");
  if (!UUID.test(projectId) || !UUID.test(organizationId) || !scope?.tenantId || !scope?.projectId) return { ok: false, error: "EMPTY_SCOPE" };
  const project: ProjectRef = { projectId, organizationId, scope };
  if (hasSeo) {
    const validIds = (rows: Record<string, unknown>[]) => rows.every((row) => typeof row?.id === "string" && UUID.test(row.id));
    const unique = (rows: Record<string, unknown>[]) => new Set(rows.map((row) => row.id)).size === rows.length;
    const keywords = seo!.keywords as Record<string, unknown>[];
    const competitors = seo!.competitors as Record<string, unknown>[];
    const observations = seo!.observations as Record<string, unknown>[];
    const competitorIds = new Set(competitors.map((row) => row.id));
    if (![keywords, competitors, observations].every((rows) => validIds(rows) && unique(rows))
      || observations.some((row) => row.competitor_id !== null && !competitorIds.has(row.competitor_id)))
      return { ok: false, error: "INVALID_SEO" };
  }
  if (d.format === V4) {
    const list = (rows: unknown) => rows as Record<string, unknown>[];
    const lists = [...CONTENT_PARTS.map((k) => list(content![k])), ...GEO_PARTS.map((k) => list(geo![k]))];
    const idsOf = (rows: Record<string, unknown>[]) => new Set(rows.map((row) => row.id));
    const clusters = idsOf(list(content!.clusters)), opportunities = idsOf(list(content!.opportunities));
    const observations = idsOf(list(geo!.observations));
    const resultIds = new Set<unknown>(results.map((r) => r?.row?.id)), importIds = new Set(((d.imports ?? []) as Record<string, unknown>[]).map((r) => r?.id));
    const uuidOrNull = (value: unknown) => value === null || (typeof value === "string" && UUID.test(value));
    const badLink = list(content!.opportunities).some((r) => r.cluster_id !== null && !clusters.has(r.cluster_id))
      || list(content!.evidence).some((r) => !opportunities.has(r.opportunity_id)
        || (r.provider_result_id !== null && !resultIds.has(r.provider_result_id))
        || (r.import_id !== null && !importIds.has(r.import_id)))
      || list(content!.briefs).some((r) => !opportunities.has(r.opportunity_id))
      || list(geo!.observations).some((r) => r.supersedes_id !== null && !observations.has(r.supersedes_id))
      // A proposal may name an observation erased later (no FK by design); the ids must still be UUIDs.
      || list(geo!.proposals).some((r) => !Array.isArray(r.evidence_ids) || !(r.evidence_ids as unknown[]).every((e) => typeof e === "string" && UUID.test(e)));
    if (!lists.every((rows) => rows.every((row) => typeof row?.id === "string" && UUID.test(row.id)) && idsOf(rows).size === rows.length)
      || badLink || !list(content!.opportunities).every((r) => uuidOrNull(r.cluster_id)))
      return { ok: false, error: "INVALID_CONTENT_GEO" };
  }

  const audit = verifyAuditTrail(auditRows, project, keyring);
  const mismatches: string[] = [];
  const recordedAudit = (d.audit as { verification?: AuditVerification }).verification;
  if (recordedAudit && recordedAudit.valid !== audit.valid) mismatches.push("audit.verification");
  const failed: { index: number; reason: string | null }[] = [];
  results.forEach((r, index) => {
    const v = openProviderResult(r.row, project, keyring);
    if (!v.verified) failed.push({ index, reason: v.reason });
    if (r.verification && r.verification.verified !== v.verified) mismatches.push(`results[${index}].verification`);
  });
  // A manifest that does not match its own body means rows were removed, added or edited.
  const completeness = checkExportManifest(d, project, keyring);
  if (completeness.status === "INCOMPLETE") mismatches.push(...completeness.reasons);
  return { ok: true, format: d.format, project: { projectId, organizationId }, audit,
    results: { total: results.length, verified: results.length - failed.length, failed }, mismatches, completeness };
}
