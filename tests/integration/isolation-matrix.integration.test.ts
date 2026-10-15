import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { consentedMembership } from "../fixtures/consented-membership";
import { RUN, anonClient, createConfirmedUser, deleteOrganizations, deleteUsers, env, signedIn } from "./support";

// Group 3 · multi-tenant isolation matrix on the LOCAL Supabase stack (npm run test:integration).
// tenancy.integration.test.ts covers owners, one analyst and an outsider. This file adds the
// identities it lacks (account-manager, viewer, client-approver, a member of A2 only, anonymous),
// every RPC exposed in `public`, and the error shape a stranger observes, so that a real UUID of
// another client is indistinguishable from one that does not exist.
//
// RPC probes never change data: the owner-only check runs before any command is parsed, so the
// probes use a command that does not exist (the owner then gets a validation error instead of
// 42501) or a read-only function. Nothing here calls a provider.
type Client = SupabaseClient<Database>;
type Ids = { orgA: string; orgB: string; a1: string; a2: string; b1: string };
const orgA = `matriz-a-${RUN}`;
const orgB = `matriz-b-${RUN}`;
const users: Record<string, string> = {};
const clients: Record<string, Client> = {};
let ids: Ids;

const PROBE = "sonda-no-existe";
// Every function the Data API exposes to `authenticated` (checked against pg_proc by
// supabase/tests/tenancy_surface.test.sql), with side-effect-free arguments for a project.
const RPCS: Record<string, (project: string) => Record<string, unknown>> = {
  project_invitations: (p) => ({ p_project_id: p, p_command: PROBE, p_payload: {} }),
  project_people: (p) => ({ p_project_id: p, p_command: PROBE, p_payload: {} }),
  project_data_inventory: (p) => ({ p_project_id: p }),
  openseo_connection: (p) => ({ p_project_id: p, p_command: PROBE, p_payload: {} }),
  openseo_job: (p) => ({ p_project_id: p, p_command: PROBE, p_job_id: null, p_payload: {} }),
  openseo_active_job: (p) => ({ p_project_id: p }),
  openseo_release_starting_job: (p) => ({ p_project_id: p, p_job_id: randomUUID() }),
  openseo_google_property: (p) => ({ p_project_id: p, p_provider: "search-console", p_command: PROBE, p_payload: {} }),
  webmaster_property: (p) => ({ p_project_id: p, p_provider: "search-console", p_command: PROBE, p_payload: {} }),
  provider_budget: (p) => ({ p_project_id: p, p_provider: "openseo", p_command: PROBE, p_payload: {} }),
  google_capture: (p) => ({ p_project_id: p, p_command: PROBE, p_payload: {} }),
  google_recovery_state: (p) => ({ p_project_id: p }),
};

const call = (client: Client, fn: string, args: Record<string, unknown>) => client.rpc(fn as never, args as never);
const shape = (error: { code?: string; message?: string; details?: string | null; hint?: string | null } | null) =>
  error && { code: error.code, message: error.message, details: error.details ?? null, hint: error.hint ?? null };

function importRow(project: string, organization: string, label: string): Database["public"]["Tables"]["imports"]["Insert"] {
  return {
    project_id: project, organization_id: organization, format: "rubik-import-v1", source_kind: "manual-review",
    source_label: label, captured_at: new Date().toISOString(), status: "empty", finding_count: 0, error_count: 0,
    findings: [], errors: [], file_sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"), file_bytes: 2,
  };
}

beforeAll(async () => {
  // ownerA: owner of orgA (A1, A2) · ownerB: owner of orgB (B1) · am/an/vw/ca: account-manager,
  // analyst, viewer and client-approver in A1 only · a2v: viewer in A2 only · out: no membership
  // and forged metadata claiming to own A.
  for (const name of ["ownerA", "ownerB", "am", "an", "vw", "ca", "a2v"]) users[name] = await createConfirmedUser(`m-${name}`);
  users.out = await createConfirmedUser("m-out", { role: "owner", organization_id: orgA, tenantId: orgA, project_role: "owner" });
  for (const name of Object.keys(users)) clients[name] = await signedIn(`m-${name}`);
  const { ownerA, ownerB } = clients;

  expect((await ownerA.from("organizations").insert({ slug: orgA, name: "Matriz A" })).error).toBeNull();
  expect((await ownerB.from("organizations").insert({ slug: orgB, name: "Matriz B" })).error).toBeNull();
  const oa = (await ownerA.from("organizations").select("id").eq("slug", orgA).single()).data!.id;
  const ob = (await ownerB.from("organizations").select("id").eq("slug", orgB).single()).data!.id;
  for (const slug of ["matriz-a1", "matriz-a2"]) {
    expect((await ownerA.from("projects").insert({ organization_id: oa, slug, name: slug })).error).toBeNull();
  }
  expect((await ownerB.from("projects").insert({ organization_id: ob, slug: "matriz-b1", name: "matriz-b1" })).error).toBeNull();
  const project = async (client: Client, slug: string) => (await client.from("projects").select("id").eq("slug", slug).single()).data!.id;
  ids = { orgA: oa, orgB: ob, a1: await project(ownerA, "matriz-a1"), a2: await project(ownerA, "matriz-a2"), b1: await project(ownerB, "matriz-b1") };

  for (const [name, project, role] of [
    ["am", ids.a1, "account-manager"], ["an", ids.a1, "analyst"], ["vw", ids.a1, "viewer"],
    ["ca", ids.a1, "client-approver"], ["a2v", ids.a2, "viewer"],
  ] as const) {
    await consentedMembership(ownerA, clients[name], project, role);
  }
}, 90_000);

afterAll(async () => {
  await deleteOrganizations([orgA, orgB]);
  await deleteUsers(Object.values(users));
});

describe("Group 3 · every exposed RPC against the identity matrix", () => {
  it("an anonymous request cannot execute any RPC, whatever the project id", async () => {
    const anon = anonClient();
    for (const [fn, args] of Object.entries(RPCS)) {
      for (const project of [ids.a1, randomUUID()]) {
        const { data, error } = await call(anon, fn, args(project));
        expect(data, fn).toBeNull();
        expect(shape(error), fn).toEqual({ code: "42501", message: `permission denied for function ${fn}`, details: null, hint: null });
      }
    }
    const accept = await call(anon, "accept_project_invitation", { p_token: "0".repeat(64) });
    expect(accept.error?.code).toBe("42501");
  });

  it("the owner of A1 passes the authorization check of every RPC; nobody else in or outside A does", async () => {
    for (const [fn, args] of Object.entries(RPCS)) {
      const owner = await call(clients.ownerA, fn, args(ids.a1));
      expect(owner.error?.code, `${fn} owner`).not.toBe("42501");
      for (const actor of ["ownerB", "am", "an", "vw", "ca", "a2v", "out"]) {
        const denied = await call(clients[actor], fn, args(ids.a1));
        expect(denied.data, `${fn} ${actor}`).toBeNull();
        expect(denied.error?.code, `${fn} ${actor}`).toBe("42501");
      }
    }
  });

  it("membership of A1 grants nothing on A2 or B1, and owning A grants nothing on B1", async () => {
    for (const [fn, args] of Object.entries(RPCS)) {
      for (const actor of ["am", "an", "vw", "ca"]) {
        expect((await call(clients[actor], fn, args(ids.a2))).error?.code, `${fn} ${actor} → A2`).toBe("42501");
      }
      expect((await call(clients.ownerA, fn, args(ids.b1))).error?.code, `${fn} ownerA → B1`).toBe("42501");
      expect((await call(clients.ownerB, fn, args(ids.a2))).error?.code, `${fn} ownerB → A2`).toBe("42501");
    }
  });

  it("a stranger cannot tell a real project of another client from a UUID that does not exist", async () => {
    for (const [fn, args] of Object.entries(RPCS)) {
      for (const actor of ["ownerB", "out", "vw"]) {
        const real = await call(clients[actor], fn, args(actor === "vw" ? ids.a2 : ids.a1));
        const missing = await call(clients[actor], fn, args(randomUUID()));
        expect(shape(real.error), `${fn} ${actor}`).toEqual(shape(missing.error));
        expect(real.error?.code, `${fn} ${actor}`).toBe("42501");
      }
    }
  });

  it("an invitation token that does not exist and one that is malformed give the same answer", async () => {
    const malformed = await call(clients.out, "accept_project_invitation", { p_token: "x" });
    const unknown = await call(clients.out, "accept_project_invitation", { p_token: "a".repeat(64) });
    expect(shape(malformed.error)).toEqual(shape(unknown.error));
    expect((await clients.out.from("project_members").select("project_id")).data).toEqual([]);
  });
});

describe("Group 3 · forged identity claims", () => {
  it("a user who rewrites their own user_metadata to claim ownership gains nothing", async () => {
    const forger = clients.out;
    const updated = await forger.auth.updateUser({ data: { role: "owner", organization_id: ids.orgA, project_id: ids.a1, project_role: "owner" } });
    expect(updated.error).toBeNull();
    const { data: refreshed, error } = await forger.auth.refreshSession();
    expect(error).toBeNull();
    // The forged claims really are inside the JWT the Data API receives…
    const claims = JSON.parse(Buffer.from(refreshed.session!.access_token.split(".")[1], "base64url").toString());
    expect(claims.user_metadata).toMatchObject({ role: "owner", project_id: ids.a1 });
    // …and nothing reads them.
    for (const table of ["organizations", "projects", "project_members", "imports", "audit_events", "provider_results"] as const) {
      expect((await forger.from(table).select("*")).data, table).toEqual([]);
    }
    for (const [fn, args] of Object.entries(RPCS)) {
      expect((await call(forger, fn, args(ids.a1))).error?.code, fn).toBe("42501");
    }
    expect((await forger.from("project_members").insert({ project_id: ids.a1, organization_id: ids.orgA, user_id: users.out, role: "owner" })).error).not.toBeNull();
  });
});

describe("Group 3 · project roles on the Data API tables", () => {
  let draftId: string;

  it("an account-manager drafts an import in A1 but cannot erase it, administer people or edit the project", async () => {
    const am = clients.am;
    const inserted = await am.from("imports").insert(importRow(ids.a1, ids.orgA, "Borrador AM")).select("id").single();
    expect(inserted.error).toBeNull();
    draftId = inserted.data!.id;
    expect((await am.from("imports").delete().eq("id", draftId).select("id")).data ?? []).toEqual([]);
    expect((await am.from("project_members").update({ role: "owner" }).eq("project_id", ids.a1).eq("user_id", users.am).select()).data ?? []).toEqual([]);
    expect((await am.from("project_members").insert({ project_id: ids.a1, organization_id: ids.orgA, user_id: users.a2v, role: "analyst" })).error).not.toBeNull();
    expect((await am.from("project_members").delete().eq("project_id", ids.a1).eq("user_id", users.vw).select()).data ?? []).toEqual([]);
    expect((await am.from("organization_members").update({ role: "owner" }).eq("user_id", users.am).select()).data ?? []).toEqual([]);
    expect((await am.from("projects").update({ name: "Cambio AM" }).eq("id", ids.a1).select()).data ?? []).toEqual([]);
    expect((await clients.ownerA.from("project_members").select("role").eq("project_id", ids.a1).eq("user_id", users.am).single()).data?.role).toBe("account-manager");
  });

  it("an account-manager cannot write into A2 or B1, nor relabel A1 rows with another organization", async () => {
    const am = clients.am;
    expect((await am.from("imports").insert(importRow(ids.a2, ids.orgA, "Fuera de alcance"))).error?.code).toBe("42501");
    expect((await am.from("imports").insert(importRow(ids.b1, ids.orgB, "Otro cliente"))).error?.code).toBe("42501");
    expect((await am.from("imports").insert(importRow(ids.a1, ids.orgB, "Organización cambiada"))).error).not.toBeNull();
    expect((await am.from("imports").insert(importRow(ids.b1, ids.orgA, "Proyecto cambiado"))).error).not.toBeNull();
  });

  it("viewer and client-approver read A1 but write, erase and administer nothing", async () => {
    for (const actor of ["vw", "ca"]) {
      const client = clients[actor];
      expect((await client.from("imports").select("id").eq("id", draftId)).data, actor).toEqual([{ id: draftId }]);
      expect((await client.from("imports").insert(importRow(ids.a1, ids.orgA, "Escritura no permitida"))).error?.code, actor).toBe("42501");
      expect((await client.from("imports").delete().eq("id", draftId).select("id")).data ?? [], actor).toEqual([]);
      expect((await client.from("provider_results").delete().eq("project_id", ids.a1).select("id")).data ?? [], actor).toEqual([]);
      expect((await client.from("projects").update({ name: "Cambio" }).eq("id", ids.a1).select()).data ?? [], actor).toEqual([]);
      expect((await client.from("project_members").update({ role: "owner" }).eq("user_id", users[actor]).select()).data ?? [], actor).toEqual([]);
    }
    expect((await clients.ownerA.from("imports").select("id").eq("id", draftId)).data).toEqual([{ id: draftId }]);
  });

  it("rows of A1 are invisible from A2, B and outside, even when queried by their exact UUID", async () => {
    for (const actor of ["a2v", "ownerB", "out"]) {
      const client = clients[actor];
      expect((await client.from("imports").select("id").eq("id", draftId)).data, actor).toEqual([]);
      for (const table of ["imports", "audit_events", "provider_results", "project_members"] as const) {
        expect((await client.from(table).select("project_id").eq("project_id", ids.a1)).data, `${actor} ${table}`).toEqual([]);
      }
      expect((await client.from("imports").delete().eq("id", draftId).select("id")).data ?? [], actor).toEqual([]);
    }
    // The owner of A2 is the owner of A; a viewer of A2 only sees A2.
    expect((await clients.a2v.from("projects").select("slug")).data).toEqual([{ slug: "matriz-a2" }]);
  });

  it("only the owner erases the draft", async () => {
    for (const actor of ["am", "vw", "a2v", "ownerB", "out"] as const) {
      const denied = await clients[actor].rpc("delete_import_with_receipt", { p_project: ids.a1, p_import: draftId });
      expect(denied.error).toBeNull();
      expect(denied.data).toEqual({ erased: 0 });
    }
    expect((await clients.ownerA.from("imports").delete().eq("id", draftId).select("id")).data).toEqual([{ id: draftId }]);
  });
});

describe("Group 3 · raw HTTP against the Data API", () => {
  const rest = (path: string, token: string, init: RequestInit = {}) =>
    fetch(`${env.apiUrl}${path}`, { ...init, headers: { apikey: env.publishableKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers } });
  const token = async (client: Client) => (await client.auth.getSession()).data.session!.access_token;

  it("the private schema is not reachable with profile headers, even for an owner", async () => {
    const owner = await token(clients.ownerA);
    for (const table of ["project_invitations", "openseo_project_connections", "provider_budgets", "google_captures"]) {
      const response = await rest(`/rest/v1/${table}?select=*`, owner, { headers: { "Accept-Profile": "private" } });
      expect(response.status, table).toBe(406);
      expect((await response.json()).code, table).toBe("PGRST106");
    }
    const rpc = await rest("/rest/v1/rpc/is_org_owner", owner, { method: "POST", headers: { "Content-Profile": "private" }, body: JSON.stringify({ org: ids.orgA }) });
    expect((await rpc.json()).code).toBe("PGRST106");
  });

  it("a forged or unsigned bearer token is rejected instead of being treated as a user", async () => {
    const real = await token(clients.out);
    const [header, , signature] = real.split(".");
    const forgedClaims = Buffer.from(JSON.stringify({ sub: users.ownerA, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
    for (const bad of [`${header}.${forgedClaims}.${signature}`, `${header}.${forgedClaims}.`]) {
      const response = await rest(`/rest/v1/projects?select=slug&id=eq.${ids.a1}`, bad);
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain("matriz-a1");
    }
  });

  it("GraphQL returns nothing of tenant A to an anonymous caller or an outsider", async () => {
    for (const bearer of [env.publishableKey, await token(clients.out)]) {
      const response = await rest("/graphql/v1", bearer, { method: "POST", body: JSON.stringify({ query: "{ projectsCollection { edges { node { id slug } } } organizationsCollection { edges { node { slug } } } }" }) });
      const body = await response.text();
      expect(body).not.toContain("matriz-a");
      expect(body).not.toContain(ids.a1);
    }
  });
});
