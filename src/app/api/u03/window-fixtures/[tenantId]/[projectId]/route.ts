import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { projectAccess } from "@/lib/access";
import { providers, type Role } from "@/lib/core";
import { currentUser } from "@/lib/auth/session";
import { serverKeyring } from "@/lib/provenance/keyring";
import { appendAudit, loadProviderResult, storeProviderResult } from "@/lib/provenance/repository";
import { createBearerClient, createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";
import { importFile, loadProjectRef } from "@/lib/imports/repository";
import { withPreviewWriterCapability } from "@/lib/provenance/preview-writer-capability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(status: number, code: string) {
  return NextResponse.json({ ok: false, code }, { status, headers: { "Cache-Control": "no-store" } });
}

function fixtureResultId(runId: string, projectId: string, actorId: string) {
  const bytes = createHash("sha256").update(`u03-window-provider-result-v1\n${runId}\n${projectId}\n${actorId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Only test-window mutation endpoint: HMAC capability bound to the exact deployment and run. */
export async function POST(request: Request, context: { params: Promise<{ tenantId: string; projectId: string }> }) {
  const { tenantId, projectId } = await context.params;
  if (!/^[a-z0-9-]{1,63}$/.test(tenantId) || !/^(a1|a2|b1)$/.test(projectId)) return fail(404, "NOT_FOUND");
  const response = await withPreviewWriterCapability(request, tenantId, projectId, async () => {
    const bearer = await createBearerClient(request);
    const [user, supabase, keyring] = await Promise.all([bearer?.user ?? currentUser(), bearer?.client ?? createClient(), Promise.resolve(serverKeyring())]);
    if (!user || !supabase) return fail(401, "AUTH_REQUIRED");
    if (!keyring) return fail(503, "SIGNING_UNAVAILABLE");
    const membership = await myProjectMembership(supabase, user.id, tenantId, projectId);
    const access = membership && projectAccess(membership);
    if (!access || access.role !== "owner") return fail(404, "NOT_FOUND");
    const project = await loadProjectRef(supabase, { tenantId, projectId });
    if (!project) return fail(404, "NOT_FOUND");
    const actor = { id: user.id, role: access.role as Role };
    const input = await request.json().catch(() => null) as { kind?: string; runId?: string } | null;
    if (!input || input.runId !== request.headers.get("x-rubik-u03-run-id")) return fail(400, "INVALID_FIXTURE_REQUEST");

    if (input.kind === "audit") {
      const written = await appendAudit(supabase, project, { actor, action: "u03.fixture.audit", target: input.runId,
        outcome: "allowed", details: { runId: input.runId, fixture: true } }, keyring, { operationId: randomUUID() });
      return written.ok ? NextResponse.json({ ok: true, kind: "audit", seq: written.row.seq }, { headers: { "Cache-Control": "no-store" } }) : fail(409, "FIXTURE_WRITE_FAILED");
    }
    if (input.kind === "result") {
      // Core's normal provider adapter receives an in-process fixture transport; no network/provider is invoked.
      const synthetic = await providers.runProviderRequest({ provider: "search-console", operation: "searchAnalytics",
        input: { siteUrl: "sc-domain:fixture.invalid", startDate: "2026-10-01", endDate: "2026-10-01", rowLimit: 1 },
        transport: { kind: "live", request: async () => ({ rows: [{ query: "u03 synthetic", clicks: 1, impressions: 1, ctr: 1, averagePosition: 1 }], truncated: false }) },
        // Fixed fixture time plus run-scoped ID makes a retry byte-for-byte idempotent.
        clock: () => new Date("2026-10-01T00:00:00.000Z"), budget: { maxUnits: 1, maxRequests: 1 } });
      if (!providers.isTrustedResult(synthetic)) return fail(422, "SYNTHETIC_RESULT_REJECTED");
      const id = fixtureResultId(input.runId, project.projectId, user.id);
      const stored = await storeProviderResult(supabase, project, synthetic, keyring, { operationId: id });
      if (!stored.ok) return fail(409, "FIXTURE_WRITE_FAILED");
      // This synthetic evidence is a signed provider_results row, not a Google capture.
      // google.capture receipts are enqueued only by the google_captures STORED trigger.
      // Verify the persisted row through the owner's RLS client; cleanup later resolves its
      // real provider-results.erase receipt through the normal outbox processor.
      const verified = await loadProviderResult(supabase, project, stored.id, keyring);
      if (!verified.ok || !verified.verification.verified) return fail(409, "FIXTURE_RESULT_VERIFICATION_FAILED");
      return NextResponse.json({ ok: true, kind: "result", id: stored.id }, { headers: { "Cache-Control": "no-store" } });
    }
    if (input.kind === "import") {
      const bytes = new TextEncoder().encode(JSON.stringify({ format: "rubik-import-v1", scope: project.scope,
        source: { kind: "manual-review", label: "U03 ficticio", url: null, tool: null }, capturedAt: new Date().toISOString(),
        findings: [{ url: "https://fixture.invalid/u03", ruleId: "u03.synthetic", severity: "info", title: "Fixture U03", observation: "Dato ficticio", proposal: null, evidenceRef: input.runId, status: "open" }] }));
      const imported = await importFile(supabase, project, bytes, actor, keyring);
      return imported.ok ? NextResponse.json({ ok: true, kind: "import", id: imported.id }, { headers: { "Cache-Control": "no-store" } }) : fail(409, "FIXTURE_WRITE_FAILED");
    }
    return fail(400, "INVALID_FIXTURE_KIND");
  });
  return response ?? fail(404, "WINDOW_CAPABILITY_REJECTED");
}
