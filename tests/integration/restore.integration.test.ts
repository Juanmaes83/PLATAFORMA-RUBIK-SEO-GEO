import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { providers } from "@/lib/core";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectRef } from "@/lib/provenance/audit";
import { loadKeyring } from "@/lib/provenance/keyring";
import { appendAudit, exportProject, storeProviderResult } from "@/lib/provenance/repository";
import { verifyProjectExport } from "@/lib/recovery/verify-export";
import { planRestore } from "@/lib/restore/plan";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

// Entrega E2: restore drill end to end against the DISPOSABLE local stack only. Export a
// project as its owner, verify the file offline, lose the project, restore it with the
// generated SQL (twice: the second run must change nothing), export again and compare.
// The SQL runs through psql inside the local stack's database container; nothing else.
type Client = SupabaseClient<Database>;
const CONTAINER = "supabase_db_plataforma-rubik-seo-geo";
const org = `ensayo-restauracion-${RUN}`, otherOrg = `ensayo-ajeno-${RUN}`;
const users: string[] = [];
let owner: Client, outsider: Client, project: ProjectRef;
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-drill:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-drill" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;

const psql = (sql: string) => execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"], { input: sql, encoding: "utf8" });

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
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([org, otherOrg]);
  await deleteUsers(users);
});

describe("restore drill on the local stack", () => {
  it("export → offline check → loss → restore twice → identical, verified project", async () => {
    const before = await exportProject(owner, project, keyring, "2026-10-09T11:00:00.000Z");
    if (!before.ok) throw new Error(before.error);
    const doc = JSON.parse(JSON.stringify({ ...before.export, format: "rubik-project-export-v2", operations: {} }));
    const offline = verifyProjectExport(doc, keyring);
    expect(offline).toMatchObject({ ok: true, audit: { valid: true, length: 2 }, results: { total: 2, verified: 2, failed: [] }, mismatches: [] });

    // Loss: the organization disappears with its project, audit trail and results.
    await deleteOrganizations([org]);
    expect((await owner.from("provider_results").select("id").eq("project_id", project.projectId)).data).toEqual([]);

    const plan = planRestore(doc, keyring, { operatorId: users[0] });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.plan.counts).toEqual({ audit: 2, results: 2, imports: 0, skippedUnverified: 0 });
    psql(plan.plan.sql);
    psql(plan.plan.sql); // idempotent: nothing duplicated, nothing changed
    expect(psql(`select count(*) from public.provider_results where project_id = '${project.projectId}';`).trim()).toBe("2");
    expect(psql(`select count(*) from public.audit_events where project_id = '${project.projectId}';`).trim()).toBe("2");

    const after = await exportProject(owner, project, keyring, "2026-10-09T12:00:00.000Z");
    if (!after.ok) throw new Error(after.error);
    expect(after.export.audit.verification).toEqual({ valid: true, length: 2 });
    expect(after.export.results.every((r) => r.verification.verified)).toBe(true);
    const sig = (rows: { row: { id?: string; signature: string; data_hash: string; status: string } }[]) =>
      rows.map((r) => [r.row.id, r.row.signature, r.row.data_hash, r.row.status]).sort();
    expect(sig(after.export.results as never)).toEqual(sig(before.export.results as never));
    expect(after.export.audit.rows.map((r) => [r.seq, r.hash, r.signature])).toEqual(before.export.audit.rows.map((r) => [r.seq, r.hash, r.signature]));
    expect(after.export.results.map((r) => r.row.status).sort()).toEqual(["OK", "PARTIAL"]);
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
