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
const FORMATS = new Set(["rubik-project-export-v1", "rubik-project-export-v2", "rubik-project-export-v3", "rubik-project-export-v4"]);
const CONTENT_GEO_FIELDS = ["clusters", "opportunities", "evidence", "briefs", "geoObservations", "geoProposals"] as const;

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
  const modern = d.format === "rubik-project-export-v3" || d.format === "rubik-project-export-v4";
  if (modern && (!seo || !Array.isArray(seo.keywords)
    || !Array.isArray(seo.competitors) || !Array.isArray(seo.observations)
    || !(seo.projectDomain === null || typeof seo.projectDomain === "string")))
    return { ok: false, error: "INVALID_SEO" };
  const contentGeo = d.contentGeo as Record<string, unknown> | undefined;
  if (d.format === "rubik-project-export-v4" && (!contentGeo || !CONTENT_GEO_FIELDS.every((field) => Array.isArray(contentGeo[field]))))
    return { ok: false, error: "INVALID_CONTENT_GEO" };
  const scope = d.scope as ProjectRef["scope"] | undefined;
  const auditRows = (d.audit as { rows: AuditRow[]; verification?: AuditVerification }).rows;
  const results = d.results as { row: ProviderResultRow; verification?: { verified?: boolean } }[];
  const seoRows = modern
    ? [...seo!.keywords as Record<string, unknown>[], ...seo!.competitors as Record<string, unknown>[],
      ...seo!.observations as Record<string, unknown>[]] : [];
  const contentGeoRows = d.format === "rubik-project-export-v4"
    ? CONTENT_GEO_FIELDS.flatMap((field) => contentGeo![field] as Record<string, unknown>[]) : [];
  const imports = Array.isArray(d.imports) ? d.imports as Record<string, unknown>[] : [];
  const ids = new Set([...auditRows, ...results.map((r) => r?.row), ...imports, ...seoRows, ...contentGeoRows]
    .map((r) => `${r?.project_id}|${r?.organization_id}`));
  // A new project may have no audit, provider or SEO rows yet. For v3 only, the
  // manifest pins its identity; the completeness check below verifies its signature.
  if (ids.size === 0 && modern) {
    const m = d.manifest as { projectId?: unknown; organizationId?: unknown } | undefined;
    if (typeof m?.projectId === "string" && typeof m.organizationId === "string")
      ids.add(`${m.projectId}|${m.organizationId}`);
  }
  if (ids.size === 0) return { ok: false, error: "EMPTY_SCOPE" };
  if (ids.size > 1) return { ok: false, error: "MIXED_PROJECTS" };
  const [projectId, organizationId] = [...ids][0].split("|");
  if (!UUID.test(projectId) || !UUID.test(organizationId) || !scope?.tenantId || !scope?.projectId) return { ok: false, error: "EMPTY_SCOPE" };
  const project: ProjectRef = { projectId, organizationId, scope };
  if (modern) {
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
  if (d.format === "rubik-project-export-v4") {
    const rows = (field: typeof CONTENT_GEO_FIELDS[number]) => contentGeo![field] as Record<string, unknown>[];
    const valid = (items: Record<string, unknown>[]) => items.every((row) => typeof row?.id === "string" && UUID.test(row.id))
      && new Set(items.map((row) => row.id)).size === items.length;
    if (!CONTENT_GEO_FIELDS.every((field) => valid(rows(field)))) return { ok: false, error: "INVALID_CONTENT_GEO" };
    const clusterIds = new Set(rows("clusters").map((row) => row.id));
    const opportunityIds = new Set(rows("opportunities").map((row) => row.id));
    const observationIds = new Set(rows("geoObservations").map((row) => row.id));
    if (rows("opportunities").some((row) => row.cluster_id !== null && !clusterIds.has(row.cluster_id))
      || rows("evidence").some((row) => !opportunityIds.has(row.opportunity_id))
      || rows("briefs").some((row) => !opportunityIds.has(row.opportunity_id))
      || rows("geoObservations").some((row) => row.supersedes_id !== null && !observationIds.has(row.supersedes_id)))
      return { ok: false, error: "INVALID_CONTENT_GEO" };
    const resultIds = new Set<unknown>(results.map((result) => result?.row?.id));
    const importIds = new Set<unknown>(imports.map((row) => row?.id));
    if (rows("evidence").some((row) => (row.provider_result_id !== null && !resultIds.has(row.provider_result_id))
      || (row.import_id !== null && !importIds.has(row.import_id))))
      return { ok: false, error: "INVALID_CONTENT_GEO" };
    // A proposal can retain evidence_ids of observations since erased; those UUIDs are historical tombstones.
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
