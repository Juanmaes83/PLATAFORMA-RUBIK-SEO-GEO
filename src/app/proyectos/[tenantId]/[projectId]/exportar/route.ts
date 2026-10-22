import { projectAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";
import type { Role } from "@/lib/core";
import { loadProjectRef } from "@/lib/imports/repository";
import { serverKeyring } from "@/lib/provenance/keyring";
import { signExportManifest } from "@/lib/provenance/manifest";
import { inspectProjectAuditOutbox, sameOutboxCheckpoint } from "@/lib/provenance/outbox";
import { appendAudit, exportProject } from "@/lib/provenance/repository";
import { operationalStateComplete, readOperationalState } from "@/lib/recovery/operations";
import { readSeoRecoveryState } from "@/lib/recovery/seo-state";
import { readContentGeoRecoveryState } from "@/lib/recovery/content-geo-state";
import { recoverySchemaContract } from "@/lib/recovery/schema-contract";
import { createBearerClient, createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";
import { currentPreviewWriterCapability, withPreviewWriterCapability } from "@/lib/provenance/preview-writer-capability";

// Closed diagnostic only for the signed Preview window; public responses keep their text.
const unavailable = (code: string, message: string) => {
  const window = currentPreviewWriterCapability();
  if (window) console.info(JSON.stringify({ event: "H1A_EXPORT_GATE", runId: window.runId, code }));
  return new Response(message, { status: 503, headers: window ? { "x-rubik-h1a-export-gate": code } : undefined });
};

// Full project export (ADR 0004 §4, ADR 0005): audit trail, signed results and imports, each
// with its verification, plus (v2) the operational state needed to recover the pilot: OpenSEO
// connection, active and linked jobs and webmaster properties, read through the owner RPCs. Only roles with `export-data` in the Core MATRIX (today: owner). An
// unknown project, another tenant's project and a missing permission all answer 404, so the
// endpoint reveals nothing about projects the user cannot export.
export async function GET(request: Request, { params }: { params: Promise<{ tenantId: string; projectId: string }> }) {
  const { tenantId, projectId } = await params;
  if (process.env.VERCEL_ENV === "preview" && process.env.U03_PREVIEW_WRITER_WINDOW === "armed-run-capability") {
    return await withPreviewWriterCapability(request, tenantId, projectId,
      () => exportProjectResponse(request, tenantId, projectId)) ?? new Response("Not found", { status: 404 });
  }
  return exportProjectResponse(request, tenantId, projectId);
}

async function exportProjectResponse(_request: Request, tenantId: string, projectId: string) {
  const notFound = () => new Response("Not found", { status: 404 });
  const bearer = await createBearerClient(_request);
  const [user, supabase] = await Promise.all([bearer?.user ?? currentUser(), bearer?.client ?? createClient()]);
  if (!user || !supabase) return notFound();
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access || !access.permissions.find((p) => p.action === "export-data")?.decision.allowed) return notFound();
  const keyring = serverKeyring();
  if (!keyring) return unavailable("SIGNING_UNAVAILABLE", "Export unavailable: audit signing is not configured");
  const ref = await loadProjectRef(supabase, { tenantId: access.project.tenantId, projectId: access.project.projectId });
  if (!ref) return notFound();
  const before = await inspectProjectAuditOutbox(ref);
  if (!before.ok) return unavailable("RECEIPT_PRECHECK", "Export unavailable: audit receipts require review");
  const schema = await recoverySchemaContract();
  if (schema === "unknown") return unavailable("SCHEMA_UNKNOWN", "Export unavailable: recovery schema could not be established");
  const at = new Date().toISOString();
  const logged = await appendAudit(supabase, ref, { actor: { role: access.role as Role, id: user.id }, action: "project.export", outcome: "allowed" }, keyring);
  if (!logged.ok) return new Response("Export failed", { status: 500 });
  const result = await exportProject(supabase, ref, keyring, at);
  if (!result.ok) return new Response("Export failed", { status: 500 });
  if (!result.export.audit.verification.valid || result.export.results.some((r) => !r.verification.verified))
    return unavailable("PROVENANCE_INVALID", "Export unavailable: provenance verification failed");
  const operations = await readOperationalState(supabase, ref, result.export.results.map((r) => r.row));
  if (!operationalStateComplete(operations)) return unavailable("OPERATIONS_INCOMPLETE", "Export unavailable: recovery state could not be read");
  let seo, contentGeo;
  if (schema === "n2-v3" || schema === "n2-v4") {
    seo = await readSeoRecoveryState(supabase, ref);
    if (!seo.ok) return unavailable("SEO_INCOMPLETE", "Export unavailable: SEO data could not be read completely");
    const seoAgain = await readSeoRecoveryState(supabase, ref);
    if (!seoAgain.ok || JSON.stringify(seo.value) !== JSON.stringify(seoAgain.value))
      return unavailable("SEO_CHANGED", "Export unavailable: SEO data changed during read");
  }
  if (schema === "n2-v4") {
    // Contenidos and GEO (v4): read in full twice; any missing table, partial page, broken link
    // or change between both reads refuses the export instead of signing a partial file.
    contentGeo = await readContentGeoRecoveryState(supabase, ref);
    if (!contentGeo.ok) return unavailable("CONTENT_GEO_INCOMPLETE", "Export unavailable: content and GEO data could not be read completely");
    const again = await readContentGeoRecoveryState(supabase, ref);
    if (!again.ok || JSON.stringify(contentGeo) !== JSON.stringify(again))
      return unavailable("CONTENT_GEO_CHANGED", "Export unavailable: content and GEO data changed during read");
  }
  if (await recoverySchemaContract() !== schema)
    return unavailable("SCHEMA_CHANGED", "Export unavailable: recovery schema changed during read");
  const after = await inspectProjectAuditOutbox(ref);
  if (!after.ok || !sameOutboxCheckpoint(before.checkpoint, after.checkpoint))
    return unavailable("RECEIPT_CHANGED", "Export unavailable: audit receipts changed");
  const sealed = schema === "n2-v4" && contentGeo?.ok
    ? { ...result.export, format: "rubik-project-export-v4", operations, seo: seo!.value, content: contentGeo.content, geo: contentGeo.geo }
    : schema === "n2-v3"
      ? { ...result.export, format: "rubik-project-export-v3", operations, seo: seo!.value }
      : { ...result.export, format: "rubik-project-export-v2", operations };
  // Signed last, over the finished body: proves on the owner's machine that nothing was removed.
  const body = { ...sealed, manifest: signExportManifest(sealed, ref, keyring) };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${ref.scope.tenantId}-${ref.scope.projectId}-${at.slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
