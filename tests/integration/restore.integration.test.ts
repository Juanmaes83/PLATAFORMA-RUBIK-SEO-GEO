import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { providers } from "@/lib/core";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectRef } from "@/lib/provenance/audit";
import { loadKeyring } from "@/lib/provenance/keyring";
import { importFile } from "@/lib/imports/repository";
import { appendAudit, exportProject, storeProviderResult } from "@/lib/provenance/repository";
import { verifyProjectExport } from "@/lib/recovery/verify-export";
import { RESTORE_CONFLICT, planRestore } from "@/lib/restore/plan";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

// Entrega E2: restore drill end to end against the DISPOSABLE local stack only. Export a
// project as its owner and verify the file offline; then restore it over an identical, a
// partially restored, a conflicting and an empty destination. Conflicts must abort the whole
// transaction, existing memberships must never change, and a full loss must come back with
// the same ids, hashes and signatures. The SQL (and the damage each case needs) runs through
// psql inside the local stack's database container as its superuser; nothing else.
type Client = SupabaseClient<Database>;
const CONTAINER = "supabase_db_plataforma-rubik-seo-geo";
const org = `ensayo-restauracion-${RUN}`, otherOrg = `ensayo-ajeno-${RUN}`;
const users: string[] = [];
let owner: Client, outsider: Client, project: ProjectRef;
let doc: Record<string, unknown>, original: State;
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-drill:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-drill" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;

const psql = (sql: string) => execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
/** Runs SQL that must fail; returns psql's error output. */
const psqlError = (sql: string) => {
  try { psql(sql); } catch (e) { return String((e as { stderr?: string }).stderr ?? e); }
  throw new Error("expected the SQL to fail");
};
const restore = (operatorId: string) => {
  const plan = planRestore(doc, keyring, { operatorId });
  if (!plan.ok) throw new Error(plan.error);
  return plan.plan.sql;
};

/** Everything the restore may touch, in comparable form (ids, hashes, signatures, roles). */
type State = { org: string[]; project: string[]; orgMembers: string[]; projectMembers: string[]; audit: string[]; results: string[]; imports: string[] };
const state = (): State => {
  const p = `'${project.projectId}'`, o = `'${project.organizationId}'`;
  const list = (sql: string) => `(select coalesce(json_agg(x order by x), '[]'::json) from (${sql}) s(x))`;
  return JSON.parse(psql(`select json_build_object(
    'org', ${list(`select id || ':' || slug from public.organizations where id = ${o}`)},
    'project', ${list(`select id || ':' || organization_id || ':' || slug from public.projects where id = ${p}`)},
    'orgMembers', ${list(`select user_id || ':' || role from public.organization_members where organization_id = ${o}`)},
    'projectMembers', ${list(`select user_id || ':' || role from public.project_members where project_id = ${p}`)},
    'audit', ${list(`select seq || ':' || hash || ':' || signature from public.audit_events where project_id = ${p}`)},
    'results', ${list(`select id || ':' || data_hash || ':' || signature || ':' || status from public.provider_results where project_id = ${p}`)},
    'imports', ${list(`select id || ':' || file_sha256 from public.imports where project_id = ${p}`)});`));
};
const importBytes = (scope: ProjectRef["scope"]) => new TextEncoder().encode(JSON.stringify({
  format: "rubik-import-v1", scope, source: { kind: "audit", label: "Ensayo de restauración", tool: "revisión manual" },
  capturedAt: "2026-10-07T09:00:00+02:00", findings: [{ url: "https://ensayo.test/a", ruleId: "r1", severity: "low", title: "Hallazgo", observation: "Observación de prueba." }],
}));

const result = (status: "OK" | "PARTIAL") => providers.runProviderRequest({
  provider: "search-console", operation: "searchAnalytics",
  input: { siteUrl: "sc-domain:ensayo.test", startDate: "2026-09-01", endDate: "2026-09-28", rowLimit: 1 },
  transport: { kind: "live", request: async () => ({ rows: [{ query: "q", clicks: 1, impressions: 2, ctr: 0.5, averagePosition: 3 }], truncated: status === "PARTIAL" }) },
  clock: () => new Date("2026-10-09T10:00:00Z"), budget: { maxUnits: 2, maxRequests: 2 },
});

beforeAll(async () => {
  users.push(await createConfirmedUser("restore-owner"), await createConfirmedUser("restore-outsider"));
  [owner, outsider] = await Promise.all(["restore-owner", "restore-outsider"].map(signedIn));
  expect((await owner.from("organizations").insert({ slug: org, name: "Ensayo" })).error).toBeNull();
  expect((await outsider.from("organizations").insert({ slug: otherOrg, name: "Ajena" })).error).toBeNull();
  const orgId = (await owner.from("organizations").select("id").eq("slug", org).single()).data!.id;
  expect((await owner.from("projects").insert({ organization_id: orgId, slug: "proyecto-ensayo", name: "Ensayo" })).error).toBeNull();
  const projectId = (await owner.from("projects").select("id").eq("organization_id", orgId).single()).data!.id;
  project = { projectId, organizationId: orgId, scope: { tenantId: org, projectId: "proyecto-ensayo" } };
  for (const action of ["project.open", "result.store"]) {
    expect((await appendAudit(owner, project, { actor: { role: "owner", id: users[0] }, action }, keyring)).ok).toBe(true);
  }
  for (const status of ["OK", "PARTIAL"] as const) {
    expect((await storeProviderResult(owner, project, await result(status), keyring)).ok).toBe(true);
  }
  expect((await importFile(owner, project, importBytes(project.scope), { role: "owner", id: users[0] }, keyring)).ok).toBe(true);
  const exported = await exportProject(owner, project, keyring, "2026-10-09T11:00:00.000Z");
  if (!exported.ok) throw new Error(exported.error);
  doc = JSON.parse(JSON.stringify({ ...exported.export, format: "rubik-project-export-v2", operations: {} }));
  original = state();
  expect(original).toMatchObject({ orgMembers: [`${users[0]}:owner`], projectMembers: [`${users[0]}:owner`] });
  expect([original.audit.length, original.results.length, original.imports.length]).toEqual([3, 2, 1]);
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([org, otherOrg]);
  await deleteUsers(users);
});

describe("restore drill on the local stack", () => {
  it("the export verifies offline before anything else", () => {
    expect(verifyProjectExport(doc, keyring)).toMatchObject({ ok: true, audit: { valid: true, length: 3 }, results: { total: 2, verified: 2, failed: [] }, mismatches: [] });
  });

  it("identical destination: changes nothing, and a non-owner operator gains no access", () => {
    psql(restore(users[1]));
    expect(state()).toEqual(original);
    expect(psql(`select count(*) from public.organization_members where user_id = '${users[1]}' and organization_id = '${project.organizationId}';`).trim()).toBe("0");
  });

  it("partially restored destination: only the missing rows come back, unchanged", () => {
    const [firstResult] = original.results[0].split(":");
    psql(`delete from public.audit_events where project_id = '${project.projectId}' and seq = 3;
      delete from public.provider_results where id = '${firstResult}';
      delete from public.imports where project_id = '${project.projectId}';`);
    expect(state()).toMatchObject({ audit: original.audit.slice(0, 2), results: original.results.slice(1), imports: [] });
    psql(restore(users[0]));
    expect(state()).toEqual(original);
  });

  it("an existing row with other content refuses the whole transaction, then nothing is written", () => {
    const [id] = original.results[0].split(":");
    // A result with the same id but other data, and a missing import the restore would add.
    psql(`create temp table damaged as select * from public.provider_results where id = '${id}';
      update damaged set data = '[]'::jsonb;
      delete from public.provider_results where id = '${id}';
      insert into public.provider_results select * from damaged;
      delete from public.imports where project_id = '${project.projectId}';`);
    const error = psqlError(restore(users[0]));
    expect(error).toContain(`${RESTORE_CONFLICT}: el resultado ${id} ya existe con otro contenido.`);
    // Rolled back: the missing import was not restored and the damaged row is still there.
    expect(state().imports).toEqual([]);
    expect(psql(`select data::text from public.provider_results where id = '${id}';`).trim()).toBe("[]");
    // Once the operator removes the damaged row, the restore completes.
    psql(`delete from public.provider_results where id = '${id}';`);
    psql(restore(users[0]));
    expect(state()).toEqual(original);
  });

  it("a different audit event with the same sequence is refused", () => {
    psql(`create temp table damaged as select * from public.audit_events where project_id = '${project.projectId}' and seq = 3;
      update damaged set details = '{"cambiado": true}'::jsonb;
      delete from public.audit_events where project_id = '${project.projectId}' and seq = 3;
      insert into public.audit_events select * from damaged;`);
    expect(psqlError(restore(users[0]))).toContain(`${RESTORE_CONFLICT}: el evento de auditoría 3 del proyecto ya existe con otro contenido.`);
    psql(`delete from public.audit_events where project_id = '${project.projectId}' and seq = 3;`);
    psql(restore(users[0]));
    expect(state()).toEqual(original);
  });

  it("manual imports: the same file under another id, or the same id with other content, is refused", () => {
    const [id, sha] = original.imports[0].split(":");
    psql(`create temp table damaged as select * from public.imports where id = '${id}';
      update damaged set id = gen_random_uuid();
      delete from public.imports where id = '${id}';
      insert into public.imports select * from damaged;`);
    expect(psqlError(restore(users[0]))).toContain(`${RESTORE_CONFLICT}: el archivo ${sha} ya está importado en el proyecto con otro id`);
    psql(`delete from public.imports where project_id = '${project.projectId}';`);
    psql(restore(users[0]));
    psql(`create temp table damaged as select * from public.imports where id = '${id}';
      update damaged set source_label = 'Otra etiqueta';
      delete from public.imports where id = '${id}';
      insert into public.imports select * from damaged;`);
    expect(psqlError(restore(users[0]))).toContain(`${RESTORE_CONFLICT}: la importación ${id} ya existe con otro contenido.`);
    psql(`delete from public.imports where id = '${id}';`);
    psql(restore(users[0]));
    expect(state()).toEqual(original);
  });

  it("missing project in an existing organization: created without granting a non-owner operator anything", () => {
    psql(`delete from public.projects where id = '${project.projectId}';`);
    psql(restore(users[1]));
    // Same project, data and organization owners; the outsider is not added anywhere and the new
    // project has no members until an organization owner grants access in the app.
    expect(state()).toEqual({ ...original, projectMembers: [] });
    expect(psql(`select count(*) from public.organization_members where user_id = '${users[1]}' and organization_id = '${project.organizationId}';`).trim()).toBe("0");
  });

  it("loss: empty destination, restored twice, verifies with the same ids, hashes and signatures", async () => {
    const before = doc as unknown as { audit: { rows: { seq: number; hash: string; signature: string }[] }; results: { row: { id?: string; signature: string; data_hash: string; status: string } }[]; imports: { id: string; file_sha256: string }[] };
    await deleteOrganizations([org]);
    expect((await owner.from("provider_results").select("id").eq("project_id", project.projectId)).data).toEqual([]);

    psql(restore(users[0]));
    psql(restore(users[0])); // idempotent: nothing duplicated, nothing changed
    // A new organization is created with the operator as its owner (the only membership added).
    expect(state()).toEqual(original);

    const after = await exportProject(owner, project, keyring, "2026-10-09T12:00:00.000Z");
    if (!after.ok) throw new Error(after.error);
    expect(after.export.audit.verification).toEqual({ valid: true, length: 3 });
    expect(after.export.results.every((r) => r.verification.verified)).toBe(true);
    const sig = (rows: { row: { id?: string; signature: string; data_hash: string; status: string } }[]) =>
      rows.map((r) => [r.row.id, r.row.signature, r.row.data_hash, r.row.status]).sort();
    expect(sig(after.export.results as never)).toEqual(sig(before.results));
    expect(after.export.audit.rows.map((r) => [r.seq, r.hash, r.signature])).toEqual(before.audit.rows.map((r) => [r.seq, r.hash, r.signature]));
    expect(((after.export.imports ?? []) as { id: string; file_sha256: string }[]).map((i) => [i.id, i.file_sha256])).toEqual(before.imports.map((i) => [i.id, i.file_sha256]));
  });

  it("the restored project stays isolated from other organizations", async () => {
    expect((await outsider.from("provider_results").select("id").eq("project_id", project.projectId)).data).toEqual([]);
    expect((await outsider.from("audit_events").select("seq").eq("project_id", project.projectId)).data).toEqual([]);
  });

  it("a tampered export is refused before any SQL exists", async () => {
    const current = await exportProject(owner, project, keyring, "2026-10-09T13:00:00.000Z");
    if (!current.ok) throw new Error(current.error);
    const tampered = JSON.parse(JSON.stringify({ ...current.export, format: "rubik-project-export-v2" }));
    tampered.results[0].row.data = [];
    expect(planRestore(tampered, keyring, { operatorId: users[0] })).toEqual({ ok: false, error: "TAMPERED" });
  });
});
