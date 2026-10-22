import { NextResponse } from "next/server";
import { projectAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";
import { eraseImport, listImports, loadProjectRef } from "@/lib/imports/repository";
import { serverKeyring } from "@/lib/provenance/keyring";
import { eraseProviderResults } from "@/lib/provenance/repository";
import { processAuditOutboxWithPool } from "@/lib/provenance/outbox";
import { withPreviewWriterCapability } from "@/lib/provenance/preview-writer-capability";
import { writerPool } from "@/lib/provenance/writer";
import { createBearerClient, createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, code: string) {
  return NextResponse.json({ ok: false, code }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Reconciles only this owner's run-scoped result/import rows and their product receipts. */
export async function POST(request: Request, context: { params: Promise<{ tenantId: string; projectId: string }> }) {
  const { tenantId, projectId } = await context.params;
  if (!/^[a-z0-9-]{1,63}$/.test(tenantId) || !/^(a1|a2|b1)$/.test(projectId)) return fail(404, "NOT_FOUND");
  const response = await withPreviewWriterCapability(request, tenantId, projectId, async () => {
    const bearer = await createBearerClient(request);
    const [user, client, keyring] = await Promise.all([
      bearer?.user ?? currentUser(), bearer?.client ?? createClient(), Promise.resolve(serverKeyring()),
    ]);
    if (!user || !client) return fail(401, "AUTH_REQUIRED");
    if (!keyring) return fail(503, "SIGNING_UNAVAILABLE");
    const membership = await myProjectMembership(client, user.id, tenantId, projectId);
    const access = membership && projectAccess(membership);
    if (access?.role !== "owner") return fail(404, "NOT_FOUND");
    const project = await loadProjectRef(client, { tenantId, projectId });
    if (!project) return fail(404, "NOT_FOUND");
    const input = await request.json().catch(() => null) as { runId?: string } | null;
    const runId = request.headers.get("x-rubik-u03-run-id") ?? "";
    if (!input || input.runId !== runId) return fail(400, "INVALID_CLEANUP_REQUEST");
    const namespace = `u03-${runId.replaceAll("-", "").slice(0, 12).toLowerCase()}`;
    if (tenantId !== `${namespace}-a` && tenantId !== `${namespace}-b`) return fail(404, "NOT_FOUND");

    const results = await eraseProviderResults(client, project, { id: user.id, role: "owner" }, keyring);
    if (!results.ok) return fail(503, "RESULT_CLEANUP_BLOCKED");
    let imports;
    try { imports = await listImports(client, project); } catch { return fail(503, "IMPORT_CLEANUP_BLOCKED"); }
    let erasedImports = 0;
    for (const row of imports) {
      const erased = await eraseImport(client, project, row.id, { id: user.id, role: "owner" }, keyring);
      if (!erased.ok) return fail(503, "IMPORT_CLEANUP_BLOCKED");
      erasedImports += erased.erased;
    }

    const pool = writerPool();
    if (!pool) return fail(503, "WRITER_UNAVAILABLE");
    let pending;
    try {
      pending = await pool.query<{ id: string; action: string; tenant_slug: string; project_slug: string }>(
        `select o.id, o.action, s.tenant_slug, s.project_slug
         from private.audit_outbox o
         cross join lateral private.audit_writer_project(o.project_id) s
         where o.project_id = $1::uuid and o.state = 'pending'
         order by o.created_at, o.id`, [project.projectId]);
    } catch { return fail(503, "RECEIPT_RECONCILIATION_BLOCKED"); }
    const allowedActions = new Set(["import.file", "import.erase", "provider-results.erase", "google.capture"]);
    for (const receipt of pending.rows) {
      if (receipt.tenant_slug !== tenantId || receipt.project_slug !== projectId || !allowedActions.has(receipt.action))
        return fail(409, "RECEIPT_SCOPE_BLOCKED");
      const signed = await processAuditOutboxWithPool(receipt.id, keyring, pool);
      if (!signed.ok) return fail(503, "RECEIPT_SIGNING_BLOCKED");
    }
    try {
      const left = await pool.query<{ pending: number }>(
        "select count(*)::int as pending from private.audit_outbox where project_id=$1::uuid and state='pending'", [project.projectId]);
      if (left.rows[0]?.pending !== 0) return fail(503, "RECEIPTS_REMAIN_PENDING");
    } catch { return fail(503, "RECEIPT_FINAL_READ_BLOCKED"); }
    return NextResponse.json({ ok: true, resultRowsErased: results.erased, importsErased: erasedImports, receiptsProcessed: pending.rows.length },
      { headers: { "Cache-Control": "no-store" } });
  });
  return response ?? fail(404, "WINDOW_CAPABILITY_REJECTED");
}
