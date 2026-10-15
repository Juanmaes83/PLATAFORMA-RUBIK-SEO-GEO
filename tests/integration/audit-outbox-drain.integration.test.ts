import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadKeyring } from "@/lib/provenance/keyring";
import { drainAuditOutbox } from "@/lib/provenance/outbox";
import { readAuditTrail } from "@/lib/provenance/repository";
import type { ProjectRef } from "@/lib/provenance/audit";
import { localDatabaseContainer } from "../../scripts/supabase-test-env.mjs";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

// #107 against PostgreSQL: a permanently failing oldest receipt cannot starve more than one
// drain page (25) of valid receipts, and the operator route fails closed (503) without a writer.
const CONTAINER = localDatabaseContainer();
const psql = (sql: string) => execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-At"],
  { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const loaded = loadKeyring({ PROVENANCE_SIGNING_KEYS: `k-drain:${randomBytes(32).toString("base64")}`, PROVENANCE_ACTIVE_KEY_ID: "k-drain" });
if (!loaded.ok) throw new Error(loaded.error);
const keyring = loaded.keyring;
const org = `drain-${RUN}`;
const users: string[] = [];
let project: ProjectRef;
const POISON = 25; // a whole drain page of permanently failing, oldest receipts
const VALID = 29;

beforeAll(async () => {
  users.push(await createConfirmedUser("drain-owner"));
  const owner = await signedIn("drain-owner");
  expect((await owner.from("organizations").insert({ slug: org, name: "Drenaje" })).error).toBeNull();
  const orgId = (await owner.from("organizations").select("id").eq("slug", org).single()).data!.id;
  expect((await owner.from("projects").insert({ organization_id: orgId, slug: "drenaje", name: "Drenaje" })).error).toBeNull();
  const projectId = (await owner.from("projects").select("id").eq("organization_id", orgId).single()).data!.id;
  project = { projectId, organizationId: orgId, scope: { tenantId: org, projectId: "drenaje" } };
  // The 25 oldest receipts are poisoned (organization mismatch → INVALID_SCOPE forever): with
  // created_at ordering alone they would fill every page and starve the 29 valid ones.
  psql(`insert into private.audit_outbox (project_id, organization_id, actor_id, actor_role, target_id, created_at)
    select '${projectId}', gen_random_uuid(), '${users[0]}', 'owner', gen_random_uuid(), now() - interval '2 hours' + g * interval '1 second'
    from generate_series(1, ${POISON}) g;`);
  psql(`insert into private.audit_outbox (project_id, organization_id, actor_id, actor_role, target_id, created_at)
    select '${projectId}', '${orgId}', '${users[0]}', 'owner', gen_random_uuid(), now() - interval '30 minutes' + g * interval '1 second'
    from generate_series(1, ${VALID}) g;`);
});

afterAll(async () => {
  // Own rows only. The poisoned receipts would (correctly) block the project deletion (#106).
  if (project) psql(`delete from private.audit_outbox where project_id = '${project.projectId}' and state = 'pending';`);
  await deleteOrganizations([org]);
  await deleteUsers(users);
});

describe("audit outbox drain against the local writer (S1, #107)", () => {
  it("drains every valid receipt past a full page of permanently failing oldest receipts", async () => {
    const pendingValid = () => Number(psql(`select count(*) from private.audit_outbox o join public.projects p on p.id = o.project_id
      where o.project_id = '${project.projectId}' and o.state = 'pending' and o.organization_id = p.organization_id;`));
    let drains = 0;
    while (pendingValid() > 0 && drains < 5) {
      const result = await drainAuditOutbox(keyring, 25);
      expect(result.pending).toBeLessThanOrEqual(25);
      drains++;
    }
    expect(pendingValid()).toBe(0);
    // Other suites may leave pending receipts of their own projects; still, a full page of
    // poisoned receipts costs at most one extra page before the valid ones are reached.
    expect(drains).toBeLessThanOrEqual(3);
    expect(psql(`select count(*) || ':' || bool_and(attempts > 0)::text || ':' || string_agg(distinct last_error, ',')
      from private.audit_outbox o join public.projects p on p.id = o.project_id
      where o.project_id = '${project.projectId}' and o.organization_id <> p.organization_id and o.state = 'pending';`)).toBe(`${POISON}:true:INVALID_SCOPE`);
    const owner = await signedIn("drain-owner");
    const trail = await readAuditTrail(owner, project, keyring);
    if (!trail.ok) throw new Error(trail.error);
    expect(trail.verification.valid).toBe(true);
    expect(trail.rows.filter((r) => r.action === "member.withdraw")).toHaveLength(VALID);
    expect(new Set(trail.rows.map((r) => (r.details as Record<string, unknown>).receiptId)).size).toBe(VALID);
  });

  it("repeating the drain adds no event (idempotent)", async () => {
    await drainAuditOutbox(keyring, 25);
    const owner = await signedIn("drain-owner");
    const trail = await readAuditTrail(owner, project, keyring);
    expect(trail.ok && trail.rows.length).toBe(VALID);
  });

  it("the operator route answers 503 without a writer, never an empty success", async () => {
    vi.stubEnv("RUBIK_AUDIT_DRAIN_TOKEN", "fictitious-local-operator-token-32-characters");
    vi.stubEnv("RUBIK_AUDIT_DATABASE_URL", "");
    vi.stubEnv("PROVENANCE_SIGNING_KEYS", `k-drain:${randomBytes(32).toString("base64")}`);
    vi.stubEnv("PROVENANCE_ACTIVE_KEY_ID", "k-drain");
    try {
      const { GET, POST } = await import("@/app/api/operaciones/auditoria/pendientes/route");
      const headers = { authorization: "Bearer fictitious-local-operator-token-32-characters" };
      const url = "http://localhost/api/operaciones/auditoria/pendientes";
      const post = await POST(new Request(url, { method: "POST", headers }));
      expect(post.status).toBe(503);
      expect(await post.json()).toEqual({ error: "DRAIN_UNAVAILABLE" });
      expect((await GET(new Request(url, { headers }))).status).toBe(503);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
