import "server-only";
import { verifyAuditTrail, type AuditRow, type AuditVerification, type ProjectRef } from "@/lib/provenance/audit";
import type { Keyring } from "@/lib/provenance/keyring";
import { openProviderResult, type ProviderResultRow } from "@/lib/provenance/results";

// Pilot recovery: re-verifies an exported project file offline, with the owner's keyring and
// no database. It recomputes the audit chain and every result signature instead of trusting
// the verification written in the file, and reports where the recorded and recomputed values
// differ (a tampered or re-signed file). It never repairs, re-signs or imports anything.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATS = new Set(["rubik-project-export-v1", "rubik-project-export-v2"]);

export type ExportCheck =
  | { ok: false; error: "NOT_AN_EXPORT" | "UNSUPPORTED_FORMAT" | "MIXED_PROJECTS" | "EMPTY_SCOPE" }
  | {
      ok: true;
      format: string;
      project: { projectId: string; organizationId: string };
      audit: AuditVerification;
      results: { total: number; verified: number; failed: { index: number; reason: string | null }[] };
      /** Recorded verification that disagrees with the recomputed one. */
      mismatches: string[];
    };

export function verifyProjectExport(doc: unknown, keyring: Keyring): ExportCheck {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { ok: false, error: "NOT_AN_EXPORT" };
  const d = doc as Record<string, unknown>;
  if (typeof d.format !== "string" || !Array.isArray((d.audit as { rows?: unknown })?.rows) || !Array.isArray(d.results)) {
    return { ok: false, error: "NOT_AN_EXPORT" };
  }
  if (!FORMATS.has(d.format)) return { ok: false, error: "UNSUPPORTED_FORMAT" };
  const scope = d.scope as ProjectRef["scope"] | undefined;
  const auditRows = (d.audit as { rows: AuditRow[]; verification?: AuditVerification }).rows;
  const results = d.results as { row: ProviderResultRow; verification?: { verified?: boolean } }[];
  const ids = new Set([...auditRows, ...results.map((r) => r?.row)].map((r) => `${r?.project_id}|${r?.organization_id}`));
  if (ids.size === 0) return { ok: false, error: "EMPTY_SCOPE" };
  if (ids.size > 1) return { ok: false, error: "MIXED_PROJECTS" };
  const [projectId, organizationId] = [...ids][0].split("|");
  if (!UUID.test(projectId) || !UUID.test(organizationId) || !scope?.tenantId || !scope?.projectId) return { ok: false, error: "EMPTY_SCOPE" };
  const project: ProjectRef = { projectId, organizationId, scope };

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
  return { ok: true, format: d.format, project: { projectId, organizationId }, audit,
    results: { total: results.length, verified: results.length - failed.length, failed }, mismatches };
}
