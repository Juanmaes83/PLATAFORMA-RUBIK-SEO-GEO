import { projectAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth/session";
import type { Role } from "@/lib/core";
import { loadProjectRef } from "@/lib/imports/repository";
import { serverKeyring } from "@/lib/provenance/keyring";
import { appendAudit, exportProject } from "@/lib/provenance/repository";
import { readOperationalState } from "@/lib/recovery/operations";
import { createClient } from "@/lib/supabase/server";
import { myProjectMembership } from "@/lib/tenancy";

// Full project export (ADR 0004 §4, ADR 0005): audit trail, signed results and imports, each
// with its verification, plus (v2) the operational state needed to recover the pilot: OpenSEO
// connection, active and linked jobs and webmaster properties, read through the owner RPCs. Only roles with `export-data` in the Core MATRIX (today: owner). An
// unknown project, another tenant's project and a missing permission all answer 404, so the
// endpoint reveals nothing about projects the user cannot export.
export async function GET(_request: Request, { params }: { params: Promise<{ tenantId: string; projectId: string }> }) {
  const notFound = () => new Response("Not found", { status: 404 });
  const [{ tenantId, projectId }, user, supabase] = await Promise.all([params, currentUser(), createClient()]);
  if (!user || !supabase) return notFound();
  const access = projectAccess(await myProjectMembership(supabase, user.id, tenantId, projectId));
  if (!access || !access.permissions.find((p) => p.action === "export-data")?.decision.allowed) return notFound();
  const keyring = serverKeyring();
  if (!keyring) return new Response("Export unavailable: audit signing is not configured", { status: 503 });
  const ref = await loadProjectRef(supabase, { tenantId: access.project.tenantId, projectId: access.project.projectId });
  if (!ref) return notFound();
  const at = new Date().toISOString();
  const logged = await appendAudit(supabase, ref, { actor: { role: access.role as Role, id: user.id }, action: "project.export", outcome: "allowed" }, keyring);
  if (!logged.ok) return new Response("Export failed", { status: 500 });
  const result = await exportProject(supabase, ref, keyring, at);
  if (!result.ok) return new Response("Export failed", { status: 500 });
  const operations = await readOperationalState(supabase, ref, result.export.results.map((r) => r.row));
  const body = { ...result.export, format: "rubik-project-export-v2", operations };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${ref.scope.tenantId}-${ref.scope.projectId}-${at.slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
