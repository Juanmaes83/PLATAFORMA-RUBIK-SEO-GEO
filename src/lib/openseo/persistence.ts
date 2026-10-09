import "server-only";

import { providers } from "@/lib/core";
import type { Keyring } from "@/lib/provenance/keyring";
import type { ProjectRef } from "@/lib/provenance/audit";
import { sealProviderResult, type ProviderResultRow } from "@/lib/provenance/results";
import type { CompletedAuditCapture } from "./bridge";

type Failure = { ok: false; error: string };

export interface PreparedAuditResults {
  auditId: string;
  issues: ProviderResultRow;
  pages: ProviderResultRow;
}

const belongsToAudit = (result: CompletedAuditCapture["issues"], operation: "auditIssues" | "auditPages", auditId: string) =>
  providers.isTrustedResult(result)
  && result.provider === "openseo"
  && result.operation === operation
  && result.provenance?.evidence?.auditId === auditId;

/**
 * Signs the original, scoped Core results while their in-memory trust mark still exists.
 * It deliberately does not write: idempotency and the audit/project job binding belong to
 * the database transaction introduced by the next migration.
 */
export function prepareCompletedAuditResults(
  capture: CompletedAuditCapture,
  project: ProjectRef,
  keyring: Keyring,
): { ok: true; prepared: PreparedAuditResults } | Failure {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(capture.auditId)) return { ok: false, error: "INVALID_AUDIT_ID" };
  if (!belongsToAudit(capture.issues, "auditIssues", capture.auditId) || !belongsToAudit(capture.pages, "auditPages", capture.auditId)) {
    return { ok: false, error: "RESULT_AUDIT_MISMATCH" };
  }
  const issues = sealProviderResult(capture.issues, project, keyring);
  if (!issues.ok) return issues;
  const pages = sealProviderResult(capture.pages, project, keyring);
  if (!pages.ok) return pages;
  return { ok: true, prepared: { auditId: capture.auditId, issues: issues.row, pages: pages.row } };
}
