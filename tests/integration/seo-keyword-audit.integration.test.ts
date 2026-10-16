import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { consentedMembership } from "../fixtures/consented-membership";
import { loadKeyring } from "@/lib/provenance/keyring";
import { readAuditTrail } from "@/lib/provenance/repository";
import { loadProjectRef } from "@/lib/imports/repository";
import { signKeywordReceipts } from "@/lib/seo/audit";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

type Client = SupabaseClient<Database>;
const orgSlug = `seo-audit-${RUN}`;
const users: string[] = [];
let owner: Client, analyst: Client;
let ownerId: string, analystId: string, projectId: string, organizationId: string;
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-seo:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-seo" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;

beforeAll(async () => {
  [ownerId, analystId] = await Promise.all([createConfirmedUser("seo-audit-owner"), createConfirmedUser("seo-audit-analyst")]);
  users.push(ownerId, analystId);
  [owner, analyst] = await Promise.all(["seo-audit-owner", "seo-audit-analyst"].map(signedIn));
  expect((await owner.from("organizations").insert({ slug: orgSlug, name: "SEO audit fixture" })).error).toBeNull();
  organizationId = (await owner.from("organizations").select("id").eq("slug", orgSlug).single()).data!.id;
  expect((await owner.from("projects").insert({ organization_id: organizationId, slug: "site", name: "Site", domain: "seo-audit.example.test" })).error).toBeNull();
  projectId = (await owner.from("projects").select("id").eq("organization_id", organizationId).single()).data!.id;
  await consentedMembership(owner, analyst, projectId, "analyst");
}, 90_000);

afterAll(async () => {
  await deleteOrganizations([orgSlug]);
  await deleteUsers(users);
});

it("queues and signs keyword create/update/delete receipts with the live actor role", async () => {
  const ref = await loadProjectRef(owner, { tenantId: orgSlug, projectId: "site" });
  expect(ref).not.toBeNull();
  const created = await owner.from("seo_keywords").insert({ project_id: projectId, organization_id: organizationId,
    phrase: "consulta auditada", language_code: "es", country_code: "ES" }).select("id,updated_at").single();
  expect(created.error).toBeNull();
  expect(await signKeywordReceipts(projectId, ownerId, keyring)).toMatchObject({ ok: true, signed: 1, pending: 0 });

  const forbiddenDelete = await analyst.from("seo_keywords").delete({ count: "exact" }).eq("id", created.data!.id);
  expect(forbiddenDelete.error).toBeNull();
  expect(forbiddenDelete.count).toBe(0);
  const forgedTime = await analyst.from("seo_keywords").update({ updated_at: "2000-01-01T00:00:00.000Z" }).eq("id", created.data!.id);
  expect(forgedTime.error).not.toBeNull();

  expect((await analyst.from("seo_keywords").update({ topic: "revisión" }).eq("id", created.data!.id)).error).toBeNull();
  expect(await signKeywordReceipts(projectId, analystId, keyring)).toMatchObject({ ok: true, signed: 1, pending: 0 });
  expect((await owner.from("seo_keywords").delete().eq("id", created.data!.id)).error).toBeNull();
  expect(await signKeywordReceipts(projectId, ownerId, keyring)).toMatchObject({ ok: true, signed: 1, pending: 0 });

  const trail = await readAuditTrail(owner, ref!, keyring);
  expect(trail.ok && trail.verification.valid).toBe(true);
  expect(trail.ok && trail.rows.map((row) => [row.action, row.actor_role])).toEqual([
    ["seo.keyword.add", "owner"], ["seo.keyword.update", "analyst"], ["seo.keyword.erase", "owner"],
  ]);
});
