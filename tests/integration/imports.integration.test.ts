import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { loadKeyring } from "@/lib/provenance/keyring";
import { readAuditTrail, exportProject } from "@/lib/provenance/repository";
import { eraseImport, findingsForUrl, getImport, importFile, listImports, loadProjectRef } from "@/lib/imports/repository";
import type { ProjectRef } from "@/lib/provenance/audit";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

// CORE-9.3 end to end against the LOCAL Supabase stack as signed-in fictitious users:
// import → store → open → export → erase, with RLS deciding every step.
type Client = SupabaseClient<Database>;
const orgA = `imp-a-${RUN}`, orgB = `imp-b-${RUN}`;
const users: string[] = [];
let a: Client, b: Client, c: Client, v: Client;
let pa: ProjectRef;
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-int:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-int" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;
const enc = (s: string) => new TextEncoder().encode(s);
const file = (scope: { tenantId: string; projectId: string }, findings: unknown[], label = "Auditoría de prueba") =>
  enc(JSON.stringify({
    format: "rubik-import-v1",
    scope,
    source: { kind: "audit", label, tool: "revisión manual" },
    capturedAt: "2026-10-07T09:00:00+02:00",
    findings,
  }));
const finding = (url: string, ruleId: string) => ({ url, ruleId, severity: "low", title: `Hallazgo ${ruleId}`, observation: "Observación de prueba." });

beforeAll(async () => {
  // a: owner of orgA/a1 · b: owner of orgB · c: analyst in a1 · v: viewer in a1.
  users.push(await createConfirmedUser("ia"), await createConfirmedUser("ib"), await createConfirmedUser("ic"), await createConfirmedUser("iv"));
  [a, b, c, v] = await Promise.all(["ia", "ib", "ic", "iv"].map(signedIn));
  expect((await a.from("organizations").insert({ slug: orgA, name: "Agencia A" })).error).toBeNull();
  expect((await b.from("organizations").insert({ slug: orgB, name: "Agencia B" })).error).toBeNull();
  const oa = (await a.from("organizations").select("id").eq("slug", orgA).single()).data!.id;
  expect((await a.from("projects").insert({ organization_id: oa, slug: "proyecto-a1", name: "A1" })).error).toBeNull();
  const a1 = (await a.from("projects").select("id").eq("organization_id", oa).single()).data!.id;
  for (const [i, role] of [[2, "analyst"], [3, "viewer"]] as const) {
    expect((await a.from("organization_members").insert({ organization_id: oa, user_id: users[i], role: "member" })).error).toBeNull();
    expect((await a.from("project_members").insert({ project_id: a1, organization_id: oa, user_id: users[i], role })).error).toBeNull();
  }
  const ref = await loadProjectRef(c, { tenantId: orgA, projectId: "proyecto-a1" });
  if (!ref) throw new Error("project not visible to the analyst");
  pa = ref;
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([orgA, orgB]);
  await deleteUsers(users);
});

describe("CORE-9.3 manual import through the Data API", () => {
  let first = "";

  it("loadProjectRef resolves only projects the user belongs to", async () => {
    expect(pa.projectId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await loadProjectRef(b, { tenantId: orgA, projectId: "proyecto-a1" })).toBeNull();
  });

  it("an analyst imports a partial file; it is stored, listed, opened and audited", async () => {
    const out = await importFile(c, pa, file(pa.scope, [finding("https://ejemplo.test/a", "r1"), finding("https://ejemplo.test/b", "r2"), { url: "nope" }]), { role: "analyst", id: users[2] }, keyring);
    if (!out.ok) throw new Error(out.error);
    first = out.id;
    // One invalid row with five invalid fields: one error per field, never the rejected value.
    expect(out).toMatchObject({ status: "partial", findings: 2, errors: 5 });
    const listed = await listImports(v, pa);
    expect(listed.map((i) => [i.id, i.status, i.finding_count, i.error_count])).toEqual([[first, "partial", 2, 5]]);
    expect(listed[0].captured_at).toBe("2026-10-07T07:00:00+00:00");
    const opened = await getImport(v, pa, first);
    expect(opened?.findings.map((f) => f.ruleId)).toEqual(["r1", "r2"]);
    expect(opened?.errors).toEqual([{ row: 2, field: "url", code: "INVALID" }, { row: 2, field: "ruleId", code: "REQUIRED" }, { row: 2, field: "severity", code: "REQUIRED" }, { row: 2, field: "title", code: "REQUIRED" }, { row: 2, field: "observation", code: "REQUIRED" }]);
    const trail = await readAuditTrail(a, pa, keyring);
    expect(trail.ok && trail.rows.at(-1)).toMatchObject({ action: "import.file", outcome: "allowed", details: { importId: first, status: "partial" } });
    expect(trail.ok && trail.verification.valid).toBe(true);
  });

  it("the same file is a duplicate; a file for another scope is rejected, stored nowhere and audited", async () => {
    const again = await importFile(c, pa, file(pa.scope, [finding("https://ejemplo.test/a", "r1"), finding("https://ejemplo.test/b", "r2"), { url: "nope" }]), { role: "analyst", id: users[2] }, keyring);
    expect(again).toEqual({ ok: false, error: "DUPLICATE", existingId: first });
    const foreign = await importFile(c, pa, file({ tenantId: orgB, projectId: "proyecto-a1" }, []), { role: "analyst", id: users[2] }, keyring);
    expect(foreign).toEqual({ ok: false, error: "SCOPE_MISMATCH" });
    expect((await listImports(a, pa)).length).toBe(1);
    const trail = await readAuditTrail(a, pa, keyring);
    expect(trail.ok && trail.rows.slice(-2).map((r) => [r.outcome, (r.details as Record<string, unknown>).reason])).toEqual([["denied", "DUPLICATE"], ["denied", "SCOPE_MISMATCH"]]);
  });

  it("findings can be looked up by URL across imports", async () => {
    const second = await importFile(a, pa, file(pa.scope, [finding("https://ejemplo.test/a", "r3")], "Segunda auditoría"), { role: "owner", id: users[0] }, keyring);
    expect(second.ok).toBe(true);
    const hits = await findingsForUrl(v, pa, "https://ejemplo.test/a");
    expect(hits.map((h) => h.finding.ruleId).sort()).toEqual(["r1", "r3"]);
  });

  it("a viewer cannot import; another tenant sees nothing", async () => {
    expect(await importFile(v, pa, file(pa.scope, []), { role: "viewer", id: users[3] }, keyring)).toEqual({ ok: false, error: "NOT_ALLOWED" });
    expect((await b.from("imports").select("id")).data).toEqual([]);
    expect(await getImport(b, pa, first)).toBeNull();
  });

  it("export includes the imports; only the owner erases, and the erasure is audited", async () => {
    const ex = await exportProject(a, pa, keyring, new Date().toISOString());
    if (!ex.ok) throw new Error(ex.error);
    expect(ex.export.imports).toHaveLength(2);
    expect(await eraseImport(c, pa, first, { role: "analyst", id: users[2] }, keyring)).toEqual({ ok: false, error: "NOT_FOUND_OR_NOT_ALLOWED" });
    expect(await eraseImport(a, pa, first, { role: "owner", id: users[0] }, keyring)).toEqual({ ok: true, erased: 1 });
    expect(await getImport(a, pa, first)).toBeNull();
    const trail = await readAuditTrail(a, pa, keyring);
    expect(trail.ok && trail.rows.at(-1)).toMatchObject({ action: "import.erase", target: first });
    expect(trail.ok && trail.verification.valid).toBe(true);
  });
});
