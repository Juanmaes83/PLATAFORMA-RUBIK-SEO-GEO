import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { loadProjectRef } from "@/lib/imports/repository";
import { connectProject } from "@/lib/openseo/connections";
import { captureGoogleReport, listGoogleCaptures } from "@/lib/openseo/google/capture";
import { connectGoogleProperty, revokeGoogleProperty } from "@/lib/openseo/google/properties";
import type { ProjectRef } from "@/lib/provenance/audit";
import { loadKeyring } from "@/lib/provenance/keyring";
import { exportProject, loadProviderResult, readAuditTrail } from "@/lib/provenance/repository";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

// Manual Google capture end to end against the LOCAL stack only: the owner connects OpenSEO,
// binds a GSC property, captures once through a simulated MCP and the signed result is stored,
// verified, listed, exported and audited. A retry replays without a second provider call; a
// revoked binding stops new captures; an analyst cannot capture. No network, no real Google.
type Client = SupabaseClient<Database>;
const org = `gcap-${RUN}`;
const users: string[] = [];
let owner: Client, analyst: Client, project: ProjectRef;
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-int:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-int" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;
const env = { OPENSEO_GOOGLE_READS_ENABLED: "true", OPENSEO_ENDPOINT: "https://openseo.example", OPENSEO_API_KEY: "oseo_123456789" };
const query = { provider: "search-console" as const, startDate: "2026-09-01", endDate: "2026-09-28", dimensions: ["page"], rowLimit: 10 };
const site = `sc-domain:gcap-${RUN}.example`;
const reply = { structuredContent: { ok: true, siteUrl: site, startDate: "2026-09-01", endDate: "2026-09-28", dimensions: ["page"], rowCount: 1,
  rows: [{ keys: [`https://gcap-${RUN}.example/`], clicks: 4, impressions: 40, ctr: 0.1, position: 2.5 }], hasMore: false, nextStartRow: 1 } };
const mcp = () => { const callTool = vi.fn(async () => reply); return { callTool, factory: vi.fn(() => ({ callTool, close: vi.fn(async () => {}) })) }; };

beforeAll(async () => {
  users.push(await createConfirmedUser("gcap-owner"), await createConfirmedUser("gcap-analyst"));
  [owner, analyst] = await Promise.all(["gcap-owner", "gcap-analyst"].map(signedIn));
  expect((await owner.from("organizations").insert({ slug: org, name: "Google capture" })).error).toBeNull();
  const orgId = (await owner.from("organizations").select("id").eq("slug", org).single()).data!.id;
  expect((await owner.from("projects").insert({ organization_id: orgId, slug: "site", name: "Site", domain: `gcap-${RUN}.example` })).error).toBeNull();
  const ref = await loadProjectRef(owner, { tenantId: org, projectId: "site" });
  if (!ref) throw new Error("project not visible");
  project = ref;
  expect((await owner.from("organization_members").insert({ organization_id: orgId, user_id: users[1], role: "member" })).error).toBeNull();
  expect((await owner.from("project_members").insert({ project_id: project.projectId, organization_id: orgId, user_id: users[1], role: "analyst" })).error).toBeNull();
  expect(await connectProject(owner, project.projectId, { openseoProjectId: `gcap-${RUN}`, allowedHosts: [`gcap-${RUN}.example`], consent: true })).toMatchObject({ ok: true });
  expect(await connectGoogleProperty(owner, project.projectId, "search-console", { externalPropertyId: site, consent: true })).toMatchObject({ ok: true });
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([org]);
  await deleteUsers(users);
});

describe("manual Google capture on the local stack (simulated MCP)", () => {
  const key = randomUUID();
  let resultId = "";

  it("stores one signed, verifiable result with its source, lists it, exports it and audits it", async () => {
    const m = mcp();
    const r = await captureGoogleReport(owner, project, query, key, { role: "owner", id: users[0] }, keyring, { env, mcpFactory: m.factory });
    expect(r).toMatchObject({ ok: true, replayed: false, audited: true });
    resultId = (r as { resultId: string }).resultId;
    expect(m.callTool).toHaveBeenCalledTimes(1);
    const stored = await loadProviderResult(owner, project, resultId, keyring);
    expect(stored).toMatchObject({ ok: true, verification: { verified: true }, row: { provider: "search-console", status: "OK" } });
    const payload = (stored as { row: { signed_payload: { provenance: { sourceContext: Record<string, string> } } } }).row.signed_payload;
    expect(payload.provenance.sourceContext).toMatchObject({ providerProjectId: `gcap-${RUN}` });
    expect(await listGoogleCaptures(analyst, project)).toMatchObject({ ok: true, rows: [{ id: resultId, provider: "search-console" }] });
    const exported = await exportProject(owner, project, keyring, "2026-10-10T12:00:00.000Z");
    expect(exported.ok && exported.export.results.some((x) => x.row.id === resultId && x.verification.verified)).toBe(true);
    const audit = await readAuditTrail(owner, project, keyring);
    expect(audit.ok && audit.rows.some((e) => e.action === "google.capture" && e.target === resultId)).toBe(true);
  });

  it("a retry with the same key returns the same result without calling the provider", async () => {
    const m = mcp();
    expect(await captureGoogleReport(owner, project, query, key, { role: "owner", id: users[0] }, keyring, { env, mcpFactory: m.factory }))
      .toEqual({ ok: true, resultId, replayed: true, audited: false });
    expect(m.callTool).not.toHaveBeenCalled();
    expect((await owner.from("provider_results").select("id").eq("project_id", project.projectId)).data).toHaveLength(1);
  });

  it("an analyst cannot capture, even with a fresh key", async () => {
    const m = mcp();
    expect(await captureGoogleReport(analyst, project, query, randomUUID(), { role: "analyst", id: users[1] }, keyring, { env, mcpFactory: m.factory }))
      .toEqual({ ok: false, error: "FORBIDDEN" });
    expect(m.callTool).not.toHaveBeenCalled();
  });

  it("after revoking the binding no capture starts; the stored one stays verifiable", async () => {
    expect(await revokeGoogleProperty(owner, project.projectId, "search-console")).toMatchObject({ ok: true });
    const m = mcp();
    expect(await captureGoogleReport(owner, project, query, randomUUID(), { role: "owner", id: users[0] }, keyring, { env, mcpFactory: m.factory }))
      .toEqual({ ok: false, error: "NOT_CONNECTED" });
    expect(m.callTool).not.toHaveBeenCalled();
    expect(await loadProviderResult(owner, project, resultId, keyring)).toMatchObject({ ok: true, verification: { verified: true } });
  });
});
