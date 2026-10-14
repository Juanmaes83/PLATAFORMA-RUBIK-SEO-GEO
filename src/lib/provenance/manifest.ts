import "server-only";

import { platform } from "@/lib/core";
import type { ProjectRef } from "./audit";
import { sha256, type Keyring } from "./keyring";

// Signed export manifest (RECUPERACION-PILOTO, export completeness). The audit chain and each
// result signature prove that what a file contains is authentic, but not that it is complete:
// dropping the last audit events leaves a valid prefix, and removing a result or an import, or
// editing an import (imports are declared data and carry no signature), went unnoticed. The
// manifest is signed by the server, with the active provenance key, over the final export body:
// counts, the head of the audit chain and digests of results, imports and operational state.
// A file without a manifest (exported before this change) still verifies, with its
// completeness reported as UNPROVEN; stripping the manifest from a newer file has the same
// effect, which is why the owner's tooling can require it (`--require-complete`).

export const MANIFEST_VERSION = "rubik-export-manifest-v1";

export interface ExportManifest {
  version: typeof MANIFEST_VERSION;
  projectId: string;
  organizationId: string;
  scope: ProjectRef["scope"];
  exportedAt: string;
  audit: { count: number; lastSeq: number | null; headHash: string | null };
  results: { count: number; digest: string };
  imports: { count: number; digest: string };
  /** Digest of `operations` (export v2), or null when the body has none. */
  operations: { digest: string | null };
  keyId: string;
  signature: string;
}

export type Completeness =
  | { status: "COMPLETE" }
  | { status: "UNPROVEN" }
  | { status: "INCOMPLETE"; reasons: string[] };

type Body = { exportedAt?: unknown; scope?: unknown; audit?: { rows?: unknown }; results?: unknown; imports?: unknown; operations?: unknown };
type Unsigned = Omit<ExportManifest, "keyId" | "signature">;

const digest = (value: unknown) => sha256.hash(platform.canonicalJson(value));
const signedText = (manifest: Unsigned) => `${MANIFEST_VERSION}:${platform.canonicalJson(manifest)}`;
const byId = (a: { id?: unknown }, b: { id?: unknown }) => String(a?.id).localeCompare(String(b?.id));

/** What the manifest says about a body, recomputed from the body itself. */
function describe(body: Body, project: Pick<ProjectRef, "projectId" | "organizationId" | "scope">): Unsigned {
  const audit = (Array.isArray(body.audit?.rows) ? body.audit.rows : []) as { seq?: unknown; hash?: unknown }[];
  const head = audit.reduce<{ seq?: unknown; hash?: unknown } | null>((top, row) => (top === null || Number(row?.seq) > Number(top.seq) ? row : top), null);
  const results = ((Array.isArray(body.results) ? body.results : []) as { row?: Record<string, unknown> }[]).map((r) => r?.row ?? {});
  const imports = (Array.isArray(body.imports) ? body.imports : []) as Record<string, unknown>[];
  return {
    version: MANIFEST_VERSION,
    projectId: project.projectId,
    organizationId: project.organizationId,
    scope: { tenantId: project.scope.tenantId, projectId: project.scope.projectId },
    exportedAt: String(body.exportedAt),
    audit: { count: audit.length, lastSeq: head ? Number(head.seq) : null, headHash: head ? String(head.hash) : null },
    // Results are already signed one by one: their id, data hash and signature pin each row.
    results: { count: results.length, digest: digest([...results].sort(byId)) },
    // Imports are not signed: the digest covers every stored column.
    imports: { count: imports.length, digest: digest([...imports].sort(byId)) },
    operations: { digest: body.operations === undefined ? null : digest(body.operations) },
  };
}

/** Signs the manifest of a finished export body (after `operations` is added). */
export function signExportManifest(body: Body, project: ProjectRef, keyring: Keyring): ExportManifest {
  const unsigned = describe(body, project);
  const { keyId, signature } = keyring.sign(signedText(unsigned));
  return { ...unsigned, keyId, signature };
}

/**
 * Checks a file's manifest against its own body. `project` is the one the rows belong to (as
 * established by verifyProjectExport). Never trusts recorded counts: everything is recomputed.
 */
export function checkExportManifest(doc: Body & { manifest?: unknown }, project: Pick<ProjectRef, "projectId" | "organizationId" | "scope">, keyring: Keyring): Completeness {
  if (doc.manifest === undefined) return { status: "UNPROVEN" };
  const m = doc.manifest as Partial<ExportManifest> | null;
  if (!m || typeof m !== "object" || m.version !== MANIFEST_VERSION || typeof m.signature !== "string" || typeof m.keyId !== "string") {
    return { status: "INCOMPLETE", reasons: ["manifest.malformed"] };
  }
  const { keyId, signature, ...claimed } = m as ExportManifest;
  if (!keyring.verify(signedText(claimed), signature, keyId)) return { status: "INCOMPLETE", reasons: ["manifest.signature"] };
  const actual = describe(doc, project);
  const reasons: string[] = [];
  const same = (a: unknown, b: unknown) => platform.canonicalJson(a) === platform.canonicalJson(b);
  if (claimed.projectId !== actual.projectId || claimed.organizationId !== actual.organizationId || !same(claimed.scope, actual.scope)) reasons.push("manifest.project");
  if (claimed.exportedAt !== actual.exportedAt) reasons.push("manifest.exportedAt");
  if (!same(claimed.audit, actual.audit)) reasons.push("manifest.audit");
  if (!same(claimed.results, actual.results)) reasons.push("manifest.results");
  if (!same(claimed.imports, actual.imports)) reasons.push("manifest.imports");
  if (!same(claimed.operations, actual.operations)) reasons.push("manifest.operations");
  return reasons.length ? { status: "INCOMPLETE", reasons } : { status: "COMPLETE" };
}
