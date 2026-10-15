import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadKeyring } from "@/lib/provenance/keyring";
import { inspectProjectAuditOutbox, processAuditOutbox } from "@/lib/provenance/outbox";
import type { ProjectRef } from "@/lib/provenance/audit";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";
import { localDatabaseContainer } from "../../scripts/supabase-test-env.mjs";

const container = localDatabaseContainer();
const orgA = `r1-a-${RUN}`;
const orgB = `r1-b-${RUN}`;
const users: string[] = [];
let a: ProjectRef, b: ProjectRef, receipt: string;
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-r1:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-r1" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"],
  { input: sql, encoding: "utf8" }).trim();

beforeAll(async () => {
  users.push(await createConfirmedUser("r1-owner-a"), await createConfirmedUser("r1-owner-b"));
  const ownerA = await signedIn("r1-owner-a");
  const ownerB = await signedIn("r1-owner-b");
  for (const [client, slug] of [[ownerA, orgA], [ownerB, orgB]] as const) {
    expect((await client.from("organizations").insert({ slug, name: slug })).error).toBeNull();
    const organizationId = (await client.from("organizations").select("id").eq("slug", slug).single()).data!.id;
    expect((await client.from("projects").insert({ organization_id: organizationId, slug: "site", name: "Site" })).error).toBeNull();
    const projectId = (await client.from("projects").select("id").eq("slug", "site").single()).data!.id;
    const ref = { projectId, organizationId, scope: { tenantId: slug, projectId: "site" } };
    if (slug === orgA) a = ref; else b = ref;
  }
  const inserted = await ownerA.from("imports").insert({
    project_id: a.projectId, organization_id: a.organizationId, format: "rubik-import-v1", source_kind: "manual-review",
    source_label: "R1 fixture", captured_at: new Date().toISOString(), status: "empty", finding_count: 0,
    error_count: 0, findings: [], errors: [], file_sha256: randomBytes(32).toString("hex"), file_bytes: 1,
  }).select("id").single();
  expect(inserted.error).toBeNull();
  receipt = psql(`select id from private.audit_outbox where project_id = '${a.projectId}' and state = 'pending' limit 1;`);
  expect(receipt).toMatch(/^[0-9a-f-]{36}$/i);
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([orgA, orgB]);
  await deleteUsers(users);
});

describe("R1 outbox guard on an exclusive local database", () => {
  it("blocks A's pending receipt without blocking independent B", async () => {
    expect(await inspectProjectAuditOutbox(a)).toEqual({ ok: false, error: "AUDIT_PENDING" });
    expect(await inspectProjectAuditOutbox(b)).toEqual({ ok: true, checkpoint: { total: 0 } });
  });
  it("a successful signing retry clears the gate without repeating the business effect", async () => {
    expect(await processAuditOutbox(receipt, keyring)).toMatchObject({ ok: true });
    expect(await inspectProjectAuditOutbox(a)).toEqual({ ok: true, checkpoint: { total: 1 } });
    expect(psql(`select count(*) from public.imports where project_id = '${a.projectId}';`)).toBe("1");
    expect(psql(`select count(*) from private.audit_outbox where id = '${receipt}' and state = 'completed';`)).toBe("1");
  });
  it("a completed receipt without its signed event is refused", async () => {
    const id = randomUUID();
    psql(`insert into private.audit_outbox (id, project_id, organization_id, actor_id, actor_role, action, target_text, state, event_seq)
      values ('${id}', '${a.projectId}', '${a.organizationId}', '${users[0]}', 'owner', 'import.file', '${randomUUID()}', 'completed', 999999);`);
    try {
      expect(await inspectProjectAuditOutbox(a)).toEqual({ ok: false, error: "AUDIT_RECEIPT_UNLINKED" });
    } finally {
      psql(`delete from private.audit_outbox where id = '${id}' and project_id = '${a.projectId}';`);
    }
  });
  it("detects a new receipt after the successful checkpoint", async () => {
    const prior = await inspectProjectAuditOutbox(a);
    expect(prior.ok).toBe(true);
    psql(`insert into private.audit_outbox (project_id, organization_id, actor_id, actor_role, action, target_text)
      values ('${a.projectId}', '${a.organizationId}', '${users[0]}', 'owner', 'import.file', '${randomUUID()}');`);
    expect(await inspectProjectAuditOutbox(a)).toEqual({ ok: false, error: "AUDIT_PENDING" });
  });
});
