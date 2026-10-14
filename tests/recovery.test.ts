import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { providers } from "@/lib/core";
import type { Database } from "@/lib/supabase/database.types";
import { loadKeyring, type Keyring } from "@/lib/provenance/keyring";
import { buildAuditRow, verifyAuditTrail, type AuditRow, type ProjectRef } from "@/lib/provenance/audit";
import { openProviderResult, sealProviderResult } from "@/lib/provenance/results";
import { NOT_INCLUDED, auditIdsFromResults, readOperationalState } from "@/lib/recovery/operations";
import { signExportManifest } from "@/lib/provenance/manifest";
import { verifyProjectExport } from "@/lib/recovery/verify-export";
import { planRestore } from "@/lib/restore/plan";

// Pilot recovery: operational state read through owner RPCs and offline re-verification of an
// exported file. Keys are random per run; no database, provider or network.
const ring = (entries: string, active: string): Keyring => {
  const r = loadKeyring({ PROVENANCE_SIGNING_KEYS: entries, PROVENANCE_ACTIVE_KEY_ID: active });
  if (!r.ok) throw new Error(r.error);
  return r.keyring;
};
const keyA = randomBytes(32).toString("base64"), keyB = randomBytes(32).toString("base64");
const owner = ring(`k-a:${keyA}`, "k-a");
const project: ProjectRef = {
  projectId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  scope: { tenantId: "rubik", projectId: "sarah-katerina" },
};
const actor = { role: "owner" as const, id: "33333333-3333-4333-8333-333333333333" };

async function exportFixture(keyring = owner) {
  const rows: AuditRow[] = [];
  for (let i = 0; i < 2; i++) {
    const b = buildAuditRow(rows.at(-1) ?? null, { at: `2026-10-09T10:0${i}:00.000Z`, actor, action: `step-${i}` }, project, keyring);
    if (!b.ok) throw new Error(b.error);
    rows.push({ ...b.row, actor_id: actor.id });
  }
  const result = await providers.runProviderRequest({
    provider: "dataforseo", operation: "backlinks", input: { target: "ejemplo.test" },
    transport: { kind: "live", request: async () => ({ rows: [{ url_from: "https://a.ejemplo.test/1", url_to: "https://ejemplo.test/" }] }) },
    clock: () => new Date("2026-10-09T10:00:00Z"), budget: { maxUnits: 1, maxRequests: 1 }, confirmCost: true,
  });
  const sealed = sealProviderResult(result, project, keyring);
  if (!sealed.ok) throw new Error(sealed.error);
  const row = { id: "44444444-4444-4444-8444-444444444444", ...sealed.row };
  const v = openProviderResult(row, project, keyring);
  // Same shape the export route writes, after a JSON round trip (what a backup file is).
  return JSON.parse(JSON.stringify({
    format: "rubik-project-export-v2", exportedAt: "2026-10-09T12:00:00.000Z", scope: project.scope,
    audit: { rows, verification: verifyAuditTrail(rows, project, keyring) },
    results: [{ row, verification: { trust: v.trust, verified: v.verified, reason: v.reason } }], imports: [], operations: {},
  }));
}

describe("offline verification of an exported project", () => {
  it("re-verifies the audit chain and every signed result from the file alone", async () => {
    const check = verifyProjectExport(await exportFixture(), owner);
    expect(check).toMatchObject({ ok: true, format: "rubik-project-export-v2", audit: { valid: true, length: 2 },
      results: { total: 1, verified: 1, failed: [] }, mismatches: [] });
  });

  it("recomputes instead of trusting recorded verification: tampering is reported", async () => {
    const doc = await exportFixture();
    doc.results[0].row.data[0].url_from = "https://otro.test/";
    doc.audit.rows[1].action = "edited";
    const check = verifyProjectExport(doc, owner);
    if (!check.ok) throw new Error(check.error);
    expect(check.audit.valid).toBe(false);
    expect(check.results.failed).toHaveLength(1);
    expect(check.mismatches).toEqual(["audit.verification", "results[0].verification"]);
  });

  it("needs the original keys: another keyring cannot verify, a rotated keyring that kept them can", async () => {
    const doc = await exportFixture();
    const other = verifyProjectExport(doc, ring(`k-b:${keyB}`, "k-b"));
    expect(other).toMatchObject({ ok: true, audit: { valid: false }, results: { verified: 0 } });
    const rotated = verifyProjectExport(doc, ring(`k-a:${keyA},k-b:${keyB}`, "k-b"));
    expect(rotated).toMatchObject({ ok: true, audit: { valid: true }, results: { verified: 1 } });
  });

  it("refuses files that are not a single-project export", async () => {
    expect(verifyProjectExport(null, owner)).toEqual({ ok: false, error: "NOT_AN_EXPORT" });
    expect(verifyProjectExport({ format: "x", audit: { rows: [] }, results: [] }, owner)).toEqual({ ok: false, error: "UNSUPPORTED_FORMAT" });
    expect(verifyProjectExport({ format: "rubik-project-export-v1", audit: { rows: [] }, results: [] }, owner)).toEqual({ ok: false, error: "EMPTY_SCOPE" });
    const mixed = await exportFixture();
    mixed.results[0].row.project_id = "55555555-5555-4555-8555-555555555555";
    expect(verifyProjectExport(mixed, owner)).toEqual({ ok: false, error: "MIXED_PROJECTS" });
  });
});

describe("operational state for recovery", () => {
  const rows = [
    { provider: "openseo", signed_payload: { provenance: { evidence: { auditId: "aud-2" } } } },
    { provider: "openseo", signed_payload: { provenance: { evidence: { auditId: "aud-1" } } } },
    { provider: "openseo", signed_payload: { provenance: { evidence: { auditId: "aud-1" } } } },
    { provider: "openseo", signed_payload: { provenance: { evidence: { auditId: "bad id;" } } } },
    { provider: "dataforseo", signed_payload: { provenance: { evidence: { auditId: "aud-x" } } } },
  ];

  it("collects distinct, well-formed OpenSEO audit ids only", () => {
    expect(auditIdsFromResults(rows)).toEqual(["aud-1", "aud-2"]);
  });

  it("reads every part through read-only owner RPCs and keeps going when one fails", async () => {
    const job = (auditId: string) => ({ jobId: "66666666-6666-4666-8666-666666666666", auditId, state: "COMPLETED", acquired: false,
      connectionId: null, issuesResultId: null, pagesResultId: null });
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "openseo_connection") return { data: { state: "NONE" }, error: null };
      if (fn === "openseo_active_job") return { data: { state: "NONE" }, error: null };
      if (fn === "google_recovery_state") return { data: { connections: [], bindings: [], captures: [] }, error: null };
      if (fn === "webmaster_property") return args.p_provider === "bing-webmaster"
        ? { data: null, error: { code: "42501", message: "denied" } } : { data: { state: "NONE", provider: args.p_provider }, error: null };
      if (fn === "openseo_job") {
        const auditId = (args.p_payload as { auditId: string }).auditId;
        return auditId === "aud-2" ? { data: null, error: { code: "22023", message: "x" } } : { data: job(auditId), error: null };
      }
      throw new Error(`unexpected ${fn}`);
    });
    const state = await readOperationalState({ rpc } as unknown as SupabaseClient<Database>, project, rows);
    expect(state.openseo.connection).toEqual({ ok: true, value: null });
    expect(state.openseo.activeJob).toEqual({ ok: true, value: null });
    expect(state.openseo.jobs).toEqual([
      { auditId: "aud-1", job: { ok: true, value: expect.objectContaining({ auditId: "aud-1", state: "COMPLETED", connectionId: null }) } },
      { auditId: "aud-2", job: { ok: false, error: "JOB_NOT_FOUND" } },
    ]);
    expect(state.webmaster).toEqual({ searchConsole: { ok: true, value: null }, bing: { ok: false, error: "PROPERTY_FORBIDDEN" } });
    expect(state.google).toEqual({ ok: true, value: { connections: [], bindings: [], captures: [] } });
    expect(state.notIncluded).toEqual([...NOT_INCLUDED]);
    // Only read commands: never acquire, bind, complete, fail, connect or revoke.
    for (const [, args] of rpc.mock.calls) expect(["get", undefined]).toContain((args as { p_command?: string }).p_command);
    expect(JSON.stringify(state)).not.toMatch(/secret|token|password|apiKey/i);
  });
});

describe("signed export manifest: completeness, not only authenticity", () => {
  const importRow = (id: string, label: string) => ({
    id, project_id: project.projectId, organization_id: project.organizationId, format: "rubik-import-v1", source_kind: "manual-review",
    source_label: label, source_url: null, source_tool: null, captured_at: "2026-10-09T09:00:00+00:00", period_start: null, period_end: null,
    status: "empty", finding_count: 0, error_count: 0, findings: [], errors: [], file_sha256: id.replaceAll("-", "").padEnd(64, "0").slice(0, 64),
    file_bytes: 2, created_by: actor.id, created_at: "2026-10-09T09:00:01+00:00",
  });
  // What the route sends: the finished body plus a manifest signed over it, after a JSON round trip.
  async function sealedFixture(keyring = owner) {
    const body = await exportFixture(keyring);
    body.imports = [importRow("66666666-6666-4666-8666-666666666666", "Revisión A"), importRow("77777777-7777-4777-8777-777777777777", "Revisión B")];
    body.operations = { google: { ok: true, value: { connections: [], bindings: [], captures: [] } } };
    return JSON.parse(JSON.stringify({ ...body, manifest: signExportManifest(body, project, keyring) }));
  }
  const check = (doc: unknown, keyring = owner) => {
    const c = verifyProjectExport(doc, keyring);
    if (!c.ok) throw new Error(c.error);
    return c;
  };

  it("a sealed export is complete; an older file without manifest stays verifiable but UNPROVEN", async () => {
    expect(check(await sealedFixture())).toMatchObject({ audit: { valid: true }, mismatches: [], completeness: { status: "COMPLETE" } });
    expect(check(await exportFixture())).toMatchObject({ audit: { valid: true }, mismatches: [], completeness: { status: "UNPROVEN" } });
    const stripped = await sealedFixture();
    delete stripped.manifest;
    expect(check(stripped).completeness).toEqual({ status: "UNPROVEN" });
  });

  it("dropping the tail of the audit chain still verifies the chain, but not the manifest", async () => {
    const doc = await sealedFixture();
    doc.audit.rows.pop();
    doc.audit.verification = verifyAuditTrail(doc.audit.rows, project, owner); // a careful forger rewrites it too
    const c = check(doc);
    expect(c.audit.valid).toBe(true);
    expect(c.completeness).toEqual({ status: "INCOMPLETE", reasons: ["manifest.audit"] });
    expect(c.mismatches).toEqual(["manifest.audit"]);
  });

  it("removing a result, removing or editing an import, or editing operations is detected", async () => {
    const noResult = await sealedFixture();
    noResult.results = [];
    expect(check(noResult).completeness).toEqual({ status: "INCOMPLETE", reasons: ["manifest.results"] });
    const noImport = await sealedFixture();
    noImport.imports.pop();
    expect(check(noImport).completeness).toEqual({ status: "INCOMPLETE", reasons: ["manifest.imports"] });
    const editedImport = await sealedFixture();
    editedImport.imports[0].source_label = "Etiqueta cambiada";
    expect(check(editedImport).completeness).toEqual({ status: "INCOMPLETE", reasons: ["manifest.imports"] });
    const reordered = await sealedFixture();
    reordered.imports.reverse();
    expect(check(reordered).completeness).toEqual({ status: "COMPLETE" });
    const ops = await sealedFixture();
    ops.operations.google.value.connections.push({ id: "88888888-8888-4888-8888-888888888888" });
    expect(check(ops).completeness).toEqual({ status: "INCOMPLETE", reasons: ["manifest.operations"] });
  });

  it("a manifest recomputed without the key, or edited, is refused; a rotated keyring that kept the key verifies it", async () => {
    const forged = await sealedFixture();
    forged.imports.pop();
    const { manifest: _old, ...rest } = forged;
    void _old;
    forged.manifest = JSON.parse(JSON.stringify(signExportManifest(rest, project, ring(`k-b:${keyB}`, "k-b"))));
    expect(check(forged).completeness).toEqual({ status: "INCOMPLETE", reasons: ["manifest.signature"] });
    const edited = await sealedFixture();
    edited.manifest.imports.count = 1;
    expect(check(edited).completeness).toEqual({ status: "INCOMPLETE", reasons: ["manifest.signature"] });
    const malformed = await sealedFixture();
    malformed.manifest = { version: "otra" };
    expect(check(malformed).completeness).toEqual({ status: "INCOMPLETE", reasons: ["manifest.malformed"] });
    expect(check(await sealedFixture(), ring(`k-a:${keyA},k-b:${keyB}`, "k-b")).completeness).toEqual({ status: "COMPLETE" });
  });

  it("the restore plan refuses a sealed export with rows removed, before any SQL exists", async () => {
    const operatorId = actor.id;
    expect(planRestore(await sealedFixture(), owner, { operatorId })).toMatchObject({ ok: true });
    const truncated = await sealedFixture();
    truncated.audit.rows.pop();
    truncated.audit.verification = verifyAuditTrail(truncated.audit.rows, project, owner);
    expect(planRestore(truncated, owner, { operatorId })).toEqual({ ok: false, error: "TAMPERED" });
  });
});
