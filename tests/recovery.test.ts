import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { providers } from "@/lib/core";
import type { Database } from "@/lib/supabase/database.types";
import { loadKeyring, type Keyring } from "@/lib/provenance/keyring";
import { buildAuditRow, verifyAuditTrail, type AuditRow, type ProjectRef } from "@/lib/provenance/audit";
import { openProviderResult, sealProviderResult } from "@/lib/provenance/results";
import { NOT_INCLUDED, auditIdsFromResults, readOperationalState } from "@/lib/recovery/operations";
import { verifyProjectExport } from "@/lib/recovery/verify-export";

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
    expect(state.notIncluded).toEqual([...NOT_INCLUDED]);
    // Only read commands: never acquire, bind, complete, fail, connect or revoke.
    for (const [, args] of rpc.mock.calls) expect(["get", undefined]).toContain((args as { p_command?: string }).p_command);
    expect(JSON.stringify(state)).not.toMatch(/secret|token|password|apiKey/i);
  });
});
