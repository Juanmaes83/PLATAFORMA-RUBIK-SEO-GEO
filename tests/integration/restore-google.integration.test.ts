import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { loadProjectRef } from "@/lib/imports/repository";
import { connectProject } from "@/lib/openseo/connections";
import { captureGoogleReport } from "@/lib/openseo/google/capture";
import { connectGoogleProperty } from "@/lib/openseo/google/properties";
import type { ProjectRef } from "@/lib/provenance/audit";
import { loadKeyring } from "@/lib/provenance/keyring";
import { exportProject, loadProviderResult } from "@/lib/provenance/repository";
import { readOperationalState } from "@/lib/recovery/operations";
import { planRestore } from "@/lib/restore/plan";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

// Full recovery of the Google state against the DISPOSABLE local stack only (migration
// 20261012130000): capture once through a simulated MCP, export (signed results + operations.google),
// lose the organization, restore twice with the generated SQL, then prove the operational state
// came back: the property binding is active again and a retry with the SAME idempotency key returns
// the stored result without calling the provider. No network, no real Google.
type Client = SupabaseClient<Database>;
const CONTAINER = "supabase_db_plataforma-rubik-seo-geo";
const org = `rgoog-${RUN}`;
const users: string[] = [];
let owner: Client, project: ProjectRef;
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-int:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-int" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;
const env = { OPENSEO_GOOGLE_READS_ENABLED: "true", OPENSEO_ENDPOINT: "https://openseo.example", OPENSEO_API_KEY: "oseo_123456789" };
const site = `sc-domain:rgoog-${RUN}.example`;
const query = { provider: "search-console" as const, startDate: "2026-09-01", endDate: "2026-09-28", dimensions: ["page"], rowLimit: 10 };
const reply = { structuredContent: { ok: true, siteUrl: site, startDate: "2026-09-01", endDate: "2026-09-28", dimensions: ["page"], rowCount: 1,
  rows: [{ keys: [`https://rgoog-${RUN}.example/`], clicks: 2, impressions: 20, ctr: 0.1, position: 4 }], hasMore: false, nextStartRow: 1 } };
const mcp = () => { const callTool = vi.fn(async () => reply); return { callTool, factory: vi.fn(() => ({ callTool, close: vi.fn(async () => {}) })) }; };
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const key = randomUUID();
let resultId = "";
let doc: Record<string, unknown>;

beforeAll(async () => {
  users.push(await createConfirmedUser("rgoog-owner"));
  owner = await signedIn("rgoog-owner");
  expect((await owner.from("organizations").insert({ slug: org, name: "Recuperación Google" })).error).toBeNull();
  const orgId = (await owner.from("organizations").select("id").eq("slug", org).single()).data!.id;
  expect((await owner.from("projects").insert({ organization_id: orgId, slug: "site", name: "Site", domain: `rgoog-${RUN}.example` })).error).toBeNull();
  const ref = await loadProjectRef(owner, { tenantId: org, projectId: "site" });
  if (!ref) throw new Error("project not visible");
  project = ref;
  expect(await connectProject(owner, project.projectId, { openseoProjectId: `rgoog-${RUN}`, allowedHosts: [`rgoog-${RUN}.example`], consent: true })).toMatchObject({ ok: true });
  expect(await connectGoogleProperty(owner, project.projectId, "search-console", { externalPropertyId: site, consent: true })).toMatchObject({ ok: true });
  const m = mcp();
  const captured = await captureGoogleReport(owner, project, query, key, { role: "owner", id: users[0] }, keyring, { env, mcpFactory: m.factory });
  expect(captured).toMatchObject({ ok: true, replayed: false });
  resultId = (captured as { resultId: string }).resultId;
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([org]);
  await deleteUsers(users);
});

describe("Google state recovery on the local stack", () => {
  it("the export carries the connection, the binding and the stored capture", async () => {
    const exported = await exportProject(owner, project, keyring, "2026-10-10T12:00:00.000Z");
    if (!exported.ok) throw new Error(exported.error);
    const operations = await readOperationalState(owner, project, exported.export.results.map((r) => r.row));
    expect(operations.google).toMatchObject({ ok: true, value: { connections: [{ state: "ACTIVE" }], bindings: [{ external_property_id: site, state: "ACTIVE" }],
      captures: [{ idempotency_key: key, result_id: resultId, state: "STORED" }] } });
    expect(operations.notIncluded.join(" ")).not.toMatch(/google-property-bindings|google-captures-ledger/);
    doc = JSON.parse(JSON.stringify({ ...exported.export, format: "rubik-project-export-v2", operations }));
  });

  it("after a loss, restoring twice brings back the Google state, and a retry with the same key reads nothing", async () => {
    await deleteOrganizations([org]);
    const plan = planRestore(doc, keyring, { operatorId: users[0] });
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.plan.counts.google).toEqual({ connections: 1, bindings: 1, captures: 1, skippedCaptures: 0 });
    psql(plan.plan.sql);
    psql(plan.plan.sql); // idempotent
    expect(psql(`select count(*) from private.google_captures where project_id = '${project.projectId}';`).trim()).toBe("1");
    expect(await loadProviderResult(owner, project, resultId, keyring)).toMatchObject({ ok: true, verification: { verified: true } });

    const m = mcp();
    expect(await captureGoogleReport(owner, project, query, key, { role: "owner", id: users[0] }, keyring, { env, mcpFactory: m.factory }))
      .toEqual({ ok: true, resultId, replayed: true, audited: false });
    expect(m.callTool).not.toHaveBeenCalled();
  });
});
