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
export const SEO_MANIFEST_VERSION = "rubik-export-manifest-v2";
export const CONTENT_GEO_MANIFEST_VERSION = "rubik-export-manifest-v3";

export interface ExportManifest {
  version: typeof MANIFEST_VERSION | typeof SEO_MANIFEST_VERSION | typeof CONTENT_GEO_MANIFEST_VERSION;
  projectId: string;
  organizationId: string;
  scope: ProjectRef["scope"];
  exportedAt: string;
  audit: { count: number; lastSeq: number | null; headHash: string | null };
  results: { count: number; digest: string };
  imports: { count: number; digest: string };
  /** Digest of `operations` (export v2), or null when the body has none. */
  operations: { digest: string | null };
  /** Present only in v3 exports; binds declared SEO rows and their relationships. */
  seo?: { projectDomain: string | null; keywords: { count: number; digest: string }; competitors: { count: number; digest: string };
    observations: { count: number; digest: string } };
  /** Present only in v4; every Content/GEO table is bound separately. */
  contentGeo?: { clusters: { count: number; digest: string }; opportunities: { count: number; digest: string };
    evidence: { count: number; digest: string }; briefs: { count: number; digest: string };
    geoObservations: { count: number; digest: string }; geoProposals: { count: number; digest: string } };
  keyId: string;
  signature: string;
}

export type Completeness =
  | { status: "COMPLETE" }
  | { status: "UNPROVEN" }
  | { status: "INCOMPLETE"; reasons: string[] };

type Body = { format?: unknown; exportedAt?: unknown; scope?: unknown; audit?: { rows?: unknown }; results?: unknown;
  imports?: unknown; operations?: unknown; seo?: unknown; contentGeo?: unknown };
type Unsigned = Omit<ExportManifest, "keyId" | "signature">;

const digest = (value: unknown) => sha256.hash(platform.canonicalJson(value));
const signedText = (manifest: Unsigned) => `${manifest.version}:${platform.canonicalJson(manifest)}`;
const byId = (a: { id?: unknown }, b: { id?: unknown }) => String(a?.id).localeCompare(String(b?.id));

/** What the manifest says about a body, recomputed from the body itself. */
function describe(body: Body, project: Pick<ProjectRef, "projectId" | "organizationId" | "scope">): Unsigned {
  const audit = (Array.isArray(body.audit?.rows) ? body.audit.rows : []) as { seq?: unknown; hash?: unknown }[];
  const head = audit.reduce<{ seq?: unknown; hash?: unknown } | null>((top, row) => (top === null || Number(row?.seq) > Number(top.seq) ? row : top), null);
  const results = ((Array.isArray(body.results) ? body.results : []) as { row?: Record<string, unknown> }[]).map((r) => r?.row ?? {});
  const imports = (Array.isArray(body.imports) ? body.imports : []) as Record<string, unknown>[];
  const seo = body.seo as { projectDomain?: unknown; keywords?: unknown; competitors?: unknown; observations?: unknown } | undefined;
  const contentGeo = body.contentGeo as Record<string, unknown> | undefined;
  const seoRows = (value: unknown) => (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  return {
    version: body.format === "rubik-project-export-v4" ? CONTENT_GEO_MANIFEST_VERSION
      : body.format === "rubik-project-export-v3" ? SEO_MANIFEST_VERSION : MANIFEST_VERSION,
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
    ...(["rubik-project-export-v3", "rubik-project-export-v4"].includes(String(body.format)) ? { seo: {
      projectDomain: typeof seo?.projectDomain === "string" ? seo.projectDomain : null,
      keywords: { count: seoRows(seo?.keywords).length, digest: digest([...seoRows(seo?.keywords)].sort(byId)) },
      competitors: { count: seoRows(seo?.competitors).length, digest: digest([...seoRows(seo?.competitors)].sort(byId)) },
      observations: { count: seoRows(seo?.observations).length, digest: digest([...seoRows(seo?.observations)].sort(byId)) },
    } } : {}),
    ...(body.format === "rubik-project-export-v4" ? { contentGeo: Object.fromEntries(
      ["clusters", "opportunities", "evidence", "briefs", "geoObservations", "geoProposals"]
        .map((name) => [name, { count: seoRows(contentGeo?.[name]).length,
          digest: digest([...seoRows(contentGeo?.[name])].sort(byId)) }]),
    ) as NonNullable<ExportManifest["contentGeo"]> } : {}),
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
  const expected = doc.format === "rubik-project-export-v4" ? CONTENT_GEO_MANIFEST_VERSION
    : doc.format === "rubik-project-export-v3" ? SEO_MANIFEST_VERSION : MANIFEST_VERSION;
  if (!m || typeof m !== "object" || m.version !== expected || typeof m.signature !== "string" || typeof m.keyId !== "string") {
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
  if (claimed.seo !== undefined || actual.seo !== undefined) {
    if (claimed.seo === undefined || actual.seo === undefined || !same(claimed.seo, actual.seo)) reasons.push("manifest.seo");
  }
  if (claimed.contentGeo !== undefined || actual.contentGeo !== undefined) {
    if (claimed.contentGeo === undefined || actual.contentGeo === undefined || !same(claimed.contentGeo, actual.contentGeo)) reasons.push("manifest.contentGeo");
  }
  return reasons.length ? { status: "INCOMPLETE", reasons } : { status: "COMPLETE" };
}
