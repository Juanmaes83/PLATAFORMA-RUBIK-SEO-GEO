import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { providers } from "@/lib/core";
import { buildAuditRow, type AuditRow, type ProjectRef } from "@/lib/provenance/audit";
import { loadKeyring, type Keyring } from "@/lib/provenance/keyring";
import { sealProviderResult } from "@/lib/provenance/results";
import { planRestore } from "@/lib/restore/plan";

// Entrega E2 (docs/RECUPERACION-ENSAYO.md): the restore plan is built only from a verified
// export and keeps every stored value. Keys are random per run and live only in this process.
const ring = (): Keyring => {
  const r = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-drill:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-drill" });
  if (!r.ok) throw new Error(r.error);
  return r.keyring;
};

async function result(status: "OK" | "PARTIAL") {
  return providers.runProviderRequest({
    provider: "search-console", operation: "searchAnalytics", input: { siteUrl: "sc-domain:ejemplo.test", startDate: "2026-09-01", endDate: "2026-09-28", rowLimit: 1 },
    transport: { kind: "live", request: async () => ({ rows: [{ query: "q", clicks: 1, impressions: 2, ctr: 0.5, averagePosition: 3 }], truncated: status === "PARTIAL" }) },
    clock: () => new Date("2026-10-09T10:00:00Z"), budget: { maxUnits: 2, maxRequests: 2 },
  });
}

/** A v2-shaped export of one project, as the export route builds it, with real signatures. */
export async function drillExport(keyring: Keyring, ids = { project: randomUUID(), org: randomUUID(), actor: randomUUID() }) {
  const project: ProjectRef = { projectId: ids.project, organizationId: ids.org, scope: { tenantId: "agencia-ensayo", projectId: "proyecto-ensayo" } };
  const audit: AuditRow[] = [];
  for (let i = 0; i < 3; i++) {
    const b = buildAuditRow(audit.at(-1) ?? null, { at: `2026-10-09T10:0${i}:00.000Z`, actor: { role: "owner", id: ids.actor }, action: `ensayo-${i}`, details: { n: i } }, project, keyring);
    if (!b.ok) throw new Error(b.error);
    audit.push({ ...b.row, actor_id: ids.actor });
  }
  const results = [];
  for (const status of ["OK", "PARTIAL"] as const) {
    const sealed = sealProviderResult(await result(status), project, keyring);
    if (!sealed.ok) throw new Error(sealed.error);
    results.push({ row: { ...sealed.row, id: randomUUID(), created_by: ids.actor, created_at: "2026-10-09T10:05:00.000Z" }, verification: { trust: "VERIFIED", verified: true, reason: null } });
  }
  return { project, doc: { format: "rubik-project-export-v2", exportedAt: "2026-10-09T11:00:00.000Z", scope: project.scope, audit: { rows: audit, verification: { valid: true } }, results, imports: [], operations: {} } };
}

describe("restore plan", () => {
  it("restores only a verified export, keeping ids, hashes and signatures", async () => {
    const keyring = ring();
    const { doc, project } = await drillExport(keyring);
    const r = planRestore(doc, keyring, { operatorId: randomUUID() });
    if (!r.ok) throw new Error(r.error);
    expect(r.plan).toMatchObject({ projectId: project.projectId, organizationId: project.organizationId, counts: { audit: 3, results: 2, imports: 0, skippedUnverified: 0 } });
    for (const row of [...doc.audit.rows, ...doc.results.map((x) => x.row)]) expect(r.plan.sql).toContain((row as { signature: string }).signature);
    expect(r.plan.sql.startsWith("-- Rubik restore drill")).toBe(true);
    expect(r.plan.sql).toMatch(/^begin;$/m);
    expect(r.plan.sql.trim().endsWith("commit;")).toBe(true);
    // Existing rows must match before anything is written; only missing rows are inserted.
    expect(r.plan.sql).toContain("\\set ON_ERROR_STOP on");
    expect(r.plan.sql.indexOf("ya existe con otro contenido")).toBeLessThan(r.plan.sql.indexOf("insert into public.organizations"));
    for (const t of ["audit_events", "provider_results", "imports"]) expect(r.plan.sql).toContain(`null::public.${t}`);
    // Memberships of an existing organization are never written; a new one gets its owner from
    // the tenancy trigger, and a new project's owner must already own the organization.
    expect(r.plan.sql).not.toMatch(/insert into public\.organization_members/);
    expect(r.plan.sql).toMatch(/where new_project and exists \(select 1 from public\.organization_members m where .* m\.role = 'owner'\)/);
    if (process.env.RESTORE_DRILL_OUT) {
      mkdirSync(process.env.RESTORE_DRILL_OUT, { recursive: true });
      writeFileSync(join(process.env.RESTORE_DRILL_OUT, "restore.sql"), r.plan.sql);
      writeFileSync(join(process.env.RESTORE_DRILL_OUT, "ids.json"), JSON.stringify({ ...project, results: doc.results.map((x) => x.row.id) }));
    }
  });

  it("refuses tampered files, broken chains, unverified results and foreign keys", async () => {
    const keyring = ring();
    const operatorId = randomUUID();
    const { doc } = await drillExport(keyring);
    expect(planRestore(doc, ring(), { operatorId })).toEqual({ ok: false, error: "TAMPERED" });
    const recordedLie = structuredClone(doc);
    recordedLie.audit.rows[1].action = "otra";
    expect(planRestore(recordedLie, keyring, { operatorId })).toEqual({ ok: false, error: "TAMPERED" });
    const brokenNoClaim = structuredClone(doc) as Record<string, unknown> & typeof doc;
    delete (brokenNoClaim.audit as { verification?: unknown }).verification;
    brokenNoClaim.audit.rows[1].action = "otra";
    expect(planRestore(brokenNoClaim, keyring, { operatorId })).toEqual({ ok: false, error: "AUDIT_CHAIN_INVALID" });
    const changed = structuredClone(doc);
    (changed.results[0].row as { data: unknown }).data = [];
    delete (changed.results[0] as { verification?: unknown }).verification;
    expect(planRestore(changed, keyring, { operatorId })).toEqual({ ok: false, error: "UNVERIFIED_RESULTS" });
    const skipped = planRestore(changed, keyring, { operatorId, skipUnverified: true });
    expect(skipped).toMatchObject({ ok: true, plan: { counts: { results: 1, skippedUnverified: 1 } }, skipped: [{ index: 0 }] });
    expect(planRestore(doc, keyring, { operatorId: "nope" })).toEqual({ ok: false, error: "INVALID_OPERATOR" });
    expect(planRestore({ format: "otra" }, keyring, { operatorId })).toEqual({ ok: false, error: "NOT_AN_EXPORT" });
  });

  it("refuses a file mixing projects and rows outside the scope", async () => {
    const keyring = ring();
    const operatorId = randomUUID();
    const { doc } = await drillExport(keyring);
    const mixed = structuredClone(doc);
    (mixed.results[0].row as { project_id: string }).project_id = randomUUID();
    expect(planRestore(mixed, keyring, { operatorId })).toEqual({ ok: false, error: "MIXED_PROJECTS" });
    const foreignImport = { ...structuredClone(doc), imports: [{ id: randomUUID(), project_id: randomUUID(), organization_id: randomUUID() }] };
    expect(planRestore(foreignImport, keyring, { operatorId })).toEqual({ ok: false, error: "INVALID_ROWS" });
    const imp = (id: string, sha: string) => ({ id, project_id: doc.results[0].row.project_id, organization_id: doc.results[0].row.organization_id, file_sha256: sha });
    const sha = "a".repeat(64);
    expect(planRestore({ ...structuredClone(doc), imports: {} }, keyring, { operatorId })).toEqual({ ok: false, error: "INVALID_ROWS" });
    expect(planRestore({ ...structuredClone(doc), imports: [imp(randomUUID(), "x")] }, keyring, { operatorId })).toEqual({ ok: false, error: "INVALID_ROWS" });
    // The same file twice, or the same id twice, would collide in the destination: refused here.
    expect(planRestore({ ...structuredClone(doc), imports: [imp(randomUUID(), sha), imp(randomUUID(), sha)] }, keyring, { operatorId })).toEqual({ ok: false, error: "INVALID_ROWS" });
    const dupId = randomUUID();
    expect(planRestore({ ...structuredClone(doc), imports: [imp(dupId, sha), imp(dupId, "b".repeat(64))] }, keyring, { operatorId })).toEqual({ ok: false, error: "INVALID_ROWS" });
    expect(planRestore({ ...structuredClone(doc), imports: [imp(randomUUID(), sha)] }, keyring, { operatorId })).toMatchObject({ ok: true, plan: { counts: { imports: 1 } } });
  });

  it("payloads cannot break out of their quoting", async () => {
    const keyring = ring();
    const { doc } = await drillExport(keyring);
    const r = planRestore(doc, keyring, { operatorId: randomUUID() });
    if (!r.ok) throw new Error(r.error);
    const tags = r.plan.sql.match(/\$rubik_[0-9a-f]{12}\$/g) ?? [];
    // Each literal opens and closes with its own tag, never reused inside the payload.
    expect(tags.length % 2).toBe(0);
    expect(tags.length).toBe(6);
  });
});
