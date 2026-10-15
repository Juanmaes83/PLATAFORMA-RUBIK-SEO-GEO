import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { consentedMembership } from "../fixtures/consented-membership";
import { TEST_PASSPHRASE, RUN, anonClient, createConfirmedUser, deleteOrganizations, deleteUsers, email, env, signedIn } from "./support";

// Runs against the LOCAL Supabase stack through the same Data API and publishable key the
// app uses (npm run test:integration). Every request is made as a signed-in fictitious user,
// so what passes or fails here is decided by Supabase Auth and Postgres RLS.
type Client = SupabaseClient<Database>;
const orgA = `agencia-a-${RUN}`;
const orgB = `agencia-b-${RUN}`;
const users: string[] = [];
let a: Client, b: Client, c: Client, d: Client;
let ids: { orgA: string; orgB: string; a1: string; b1: string };

beforeAll(async () => {
  // a: owner of orgA · b: owner of orgB · c: analyst in a1 · d: no membership, forged metadata.
  users.push(await createConfirmedUser("a"), await createConfirmedUser("b"), await createConfirmedUser("c"));
  users.push(await createConfirmedUser("d", { role: "owner", organization: orgA, tenantId: orgA }));
  [a, b, c, d] = await Promise.all(["a", "b", "c", "d"].map(signedIn));

  expect((await a.from("organizations").insert({ slug: orgA, name: "Agencia A" })).error).toBeNull();
  expect((await b.from("organizations").insert({ slug: orgB, name: "Agencia B" })).error).toBeNull();
  const oa = (await a.from("organizations").select("id").eq("slug", orgA).single()).data!.id;
  const ob = (await b.from("organizations").select("id").eq("slug", orgB).single()).data!.id;
  expect((await a.from("projects").insert({ organization_id: oa, slug: "proyecto-a1", name: "Proyecto A1" })).error).toBeNull();
  expect((await b.from("projects").insert({ organization_id: ob, slug: "proyecto-b1", name: "Proyecto B1" })).error).toBeNull();
  const a1 = (await a.from("projects").select("id").eq("slug", "proyecto-a1").single()).data!.id;
  const b1 = (await b.from("projects").select("id").eq("slug", "proyecto-b1").single()).data!.id;
  ids = { orgA: oa, orgB: ob, a1, b1 };

  await consentedMembership(a, c, a1, "analyst");
}, 60_000);

afterAll(async () => {
  await deleteOrganizations([orgA, orgB]);
  await deleteUsers(users);
});

describe("Supabase Auth with e-mail and password (local stack)", () => {
  it("signs up, requires e-mail confirmation, then signs in and out", async () => {
    const client = anonClient();
    const address = email("registro");
    const signUp = await client.auth.signUp({ email: address, password: TEST_PASSPHRASE });
    expect(signUp.error).toBeNull();
    expect(signUp.data.session).toBeNull(); // confirmation required, as on hosted projects
    if (signUp.data.user) users.push(signUp.data.user.id);

    const early = await client.auth.signInWithPassword({ email: address, password: TEST_PASSPHRASE });
    expect(early.error?.code).toBe("email_not_confirmed");

    // Follow the confirmation link from the local mail catcher (Mailpit).
    const list = await (await fetch(`${env.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)).json();
    const message = await (await fetch(`${env.mailpitUrl}/api/v1/message/${list.messages[0].ID}`)).json();
    const tokenHash = /token_hash=([^&"\s]+)/.exec(message.HTML)?.[1];
    expect(tokenHash).toBeTruthy();
    const verified = await client.auth.verifyOtp({ type: "email", token_hash: tokenHash! });
    expect(verified.error).toBeNull();
    expect(verified.data.session).not.toBeNull();

    const refreshToken = verified.data.session!.refresh_token;
    expect((await client.auth.signOut()).error).toBeNull();
    // After sign-out the refresh token is revoked: the session cannot be revived.
    const revived = await anonClient().auth.refreshSession({ refresh_token: refreshToken });
    expect(revived.data.session).toBeNull();
  });

  it("rejects wrong passwords and weak passwords", async () => {
    const wrong = await anonClient().auth.signInWithPassword({ email: email("a"), password: "otra-clave-9999" });
    expect(wrong.error?.code).toBe("invalid_credentials");
    const weak = await anonClient().auth.signUp({ email: email("debil"), password: "corta" });
    expect(weak.error).not.toBeNull();
  });
});

describe("tenant isolation through the Data API", () => {
  it("an anonymous request reads and writes nothing", async () => {
    const anon = anonClient();
    for (const table of ["organizations", "organization_members", "projects", "project_members"] as const) {
      const { data, error } = await anon.from(table).select("*");
      expect(error?.code ?? (data?.length === 0 ? "empty" : "rows"), table).not.toBe("rows");
    }
    expect((await anon.from("organizations").insert({ slug: `anon-${RUN}`, name: "X" })).error).not.toBeNull();
  });

  it("each owner only reads their own tenant", async () => {
    expect((await a.from("projects").select("slug")).data).toEqual([{ slug: "proyecto-a1" }]);
    expect((await b.from("projects").select("slug")).data).toEqual([{ slug: "proyecto-b1" }]);
    expect((await b.from("organizations").select("slug")).data).toEqual([{ slug: orgB }]);
  });

  it("ID manipulation returns nothing: another tenant's ids and slugs are invisible", async () => {
    expect((await b.from("projects").select("*").eq("id", ids.a1)).data).toEqual([]);
    expect((await b.from("projects").select("*").eq("organization_id", ids.orgA)).data).toEqual([]);
    expect((await b.from("organizations").select("*").eq("id", ids.orgA)).data).toEqual([]);
    expect((await b.from("project_members").select("*").eq("project_id", ids.a1)).data).toEqual([]);
    expect((await b.from("organization_members").select("*").eq("organization_id", ids.orgA)).data).toEqual([]);
    // The same embedded query the app uses for /proyectos/<tenant>/<project>.
    const embedded = await b
      .from("project_members")
      .select("role, projects!inner(slug, organizations!inner(slug))")
      .eq("projects.slug", "proyecto-a1")
      .eq("projects.organizations.slug", orgA);
    expect(embedded.data).toEqual([]);
  });

  it("cross-tenant writes fail", async () => {
    const insertProject = await b.from("projects").insert({ organization_id: ids.orgA, slug: "intrusa", name: "X" });
    expect(insertProject.error?.code).toBe("42501");
    const joinOrg = await b.from("organization_members").insert({ organization_id: ids.orgA, user_id: users[1], role: "owner" });
    expect(joinOrg.error?.code).toBe("42501");
    const joinProject = await b.from("project_members").insert({ project_id: ids.a1, organization_id: ids.orgB, user_id: users[1], role: "owner" });
    expect(joinProject.error).not.toBeNull();
    const update = await b.from("projects").update({ name: "Hackeado" }).eq("id", ids.a1).select();
    expect(update.data ?? []).toEqual([]);
    const rename = await b.from("organizations").update({ name: "Hackeada" }).eq("id", ids.orgA).select();
    expect(rename.data ?? []).toEqual([]);
    const remove = await b.from("project_members").delete().eq("project_id", ids.a1).select();
    expect(remove.data ?? []).toEqual([]);
    const move = await b.from("projects").update({ organization_id: ids.orgA } as never).eq("id", ids.b1);
    expect(move.error).not.toBeNull();
    // Nothing changed for agencia A.
    expect((await a.from("projects").select("name").eq("id", ids.a1).single()).data?.name).toBe("Proyecto A1");
    expect((await a.from("project_members").select("user_id").eq("project_id", ids.a1)).data).toHaveLength(2);
  });

  it("a signed-in user without membership sees nothing, whatever user_metadata says", async () => {
    for (const table of ["organizations", "organization_members", "projects", "project_members"] as const) {
      expect((await d.from(table).select("*")).data, table).toEqual([]);
    }
    expect((await d.from("projects").insert({ organization_id: ids.orgA, slug: "intrusa", name: "X" })).error?.code).toBe("42501");
  });

  it("roles inside a tenant: the analyst reads but cannot administer", async () => {
    expect((await c.from("projects").select("slug")).data).toEqual([{ slug: "proyecto-a1" }]);
    expect((await c.from("project_members").select("role")).data).toEqual([{ role: "analyst" }]);
    expect((await c.from("projects").update({ name: "Cambio" }).eq("id", ids.a1).select()).data ?? []).toEqual([]);
    expect((await c.from("project_members").update({ role: "owner" }).eq("user_id", users[2]).select()).data ?? []).toEqual([]);
    expect((await c.from("projects").insert({ organization_id: ids.orgA, slug: "nuevo", name: "X" })).error?.code).toBe("42501");
    expect((await a.from("projects").update({ name: "Proyecto A1" }).eq("id", ids.a1).select()).data).toHaveLength(1);
  });

  it("an owner and an explicitly invited member see only their actual organizational memberships", async () => {
    const ownerA = await a.from("organization_members").select("organization_id, user_id, role");
    const ownerB = await b.from("organization_members").select("organization_id, user_id, role");
    const memberC = await c.from("organization_members").select("organization_id, user_id, role");
    const outsiderD = await d.from("organization_members").select("organization_id, user_id, role");

    for (const response of [ownerA, ownerB, memberC, outsiderD]) {
      expect(response.error).toBeNull();
    }
    expect(ownerA.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ organization_id: ids.orgA, user_id: users[0], role: "owner" }),
      expect.objectContaining({ organization_id: ids.orgA, user_id: users[2], role: "member" }),
    ]));
    expect(ownerA.data?.every(row => row.organization_id === ids.orgA)).toBe(true);
    expect(ownerB.data).toEqual([
      expect.objectContaining({ organization_id: ids.orgB, user_id: users[1], role: "owner" }),
    ]);
    expect(memberC.data).toEqual([
      expect.objectContaining({ organization_id: ids.orgA, user_id: users[2], role: "member" }),
    ]);
    expect(outsiderD.data).toEqual([]);

    const projectC = await c.from("project_members").select("project_id, organization_id, user_id, role");
    expect(projectC.error).toBeNull();
    expect(projectC.data).toEqual([
      expect.objectContaining({ project_id: ids.a1, organization_id: ids.orgA, user_id: users[2], role: "analyst" }),
    ]);
    expect((await c.from("projects").select("id").eq("id", ids.b1)).data).toEqual([]);
  });

  it("a member cannot administer organization membership or promote their own role", async () => {
    const promote = await c.from("organization_members").update({ role: "owner" }).eq("organization_id", ids.orgA).eq("user_id", users[2]).select();
    expect(promote.data ?? []).toEqual([]);
    const addOwner = await c.from("organization_members").insert({ organization_id: ids.orgA, user_id: users[3], role: "owner" });
    expect(addOwner.error).not.toBeNull();
    const removeOwner = await c.from("organization_members").delete().eq("organization_id", ids.orgA).eq("user_id", users[0]).select();
    expect(removeOwner.data ?? []).toEqual([]);
    expect((await a.from("organization_members").select("role").eq("user_id", users[0]).single()).data?.role).toBe("owner");
    expect((await c.from("organization_members").select("role").eq("user_id", users[2]).single()).data?.role).toBe("member");
  });

  it("a project analyst cannot grant or revoke access even inside their own organization", async () => {
    const grant = await c.from("project_members").insert({
      project_id: ids.a1, organization_id: ids.orgA, user_id: users[3], role: "owner",
    });
    expect(grant.error).not.toBeNull();
    const revoke = await c.from("project_members").delete().eq("project_id", ids.a1).eq("user_id", users[0]).select();
    expect(revoke.data ?? []).toEqual([]);
    const promote = await c.from("project_members").update({ role: "owner" }).eq("project_id", ids.a1).eq("user_id", users[2]).select();
    expect(promote.data ?? []).toEqual([]);
    expect((await a.from("project_members").select("role").eq("project_id", ids.a1).eq("user_id", users[0]).single()).data?.role).toBe("owner");
    expect((await c.from("project_members").select("role").eq("project_id", ids.a1).eq("user_id", users[2]).single()).data?.role).toBe("analyst");
  });

  it("membership in one project does not grant access to another project of the same organization", async () => {
    const slug = "proyecto-a2";
    expect((await a.from("projects").insert({ organization_id: ids.orgA, slug, name: "Proyecto A2" })).error).toBeNull();
    const a2 = (await a.from("projects").select("id").eq("slug", slug).single()).data!.id;
    expect((await a.from("project_members").select("role").eq("project_id", a2).eq("user_id", users[0]).single()).data?.role).toBe("owner");
    expect((await c.from("projects").select("id").eq("id", a2)).data).toEqual([]);
    expect((await c.from("project_members").select("project_id").eq("project_id", a2)).data).toEqual([]);
    expect((await c.from("projects").update({ name: "Escalada" }).eq("id", a2).select()).data ?? []).toEqual([]);
    expect((await b.from("projects").select("id").eq("id", a2)).data).toEqual([]);
    expect((await a.from("projects").select("name").eq("id", a2).single()).data?.name).toBe("Proyecto A2");
  });

  it("management RPCs deny an analyst and an external owner even with a real project UUID", async () => {
    for (const [command, args] of [
      ["project_invitations", { p_project_id: ids.a1, p_command: "list", p_payload: {} }],
      ["project_people", { p_project_id: ids.a1, p_command: "list", p_payload: {} }],
    ] as const) {
      const own = await a.rpc(command, args as never);
      expect(own.error, command).toBeNull();
      const analyst = await c.rpc(command, args as never);
      expect(analyst.error?.code, command).toBe("42501");
      const otherTenant = await b.rpc(command, args as never);
      expect(otherTenant.error, command).not.toBeNull();
    }
  });

  it("a project analyst cannot access connector management or another tenant's connection", async () => {
    const owner = await a.rpc("openseo_connection", { p_project_id: ids.a1, p_command: "get" });
    expect(owner.error).toBeNull();
    const analyst = await c.rpc("openseo_connection", { p_project_id: ids.a1, p_command: "get" });
    expect(analyst.error?.code).toBe("42501");
    const foreign = await b.rpc("openseo_connection", { p_project_id: ids.a1, p_command: "get" });
    expect(foreign.error?.code).toBe("42501");
    const outsider = await d.rpc("openseo_connection", { p_project_id: ids.a1, p_command: "get" });
    expect(outsider.error?.code).toBe("42501");
  });

  it("budget control rejects non-owners, outsiders and cross-tenant callers", async () => {
    const args = { p_project_id: ids.a1, p_provider: "openseo", p_command: "get", p_payload: {} };
    const owner = await a.rpc("provider_budget", args);
    expect(owner.error).toBeNull();
    for (const actor of [c, b, d]) {
      const result = await actor.rpc("provider_budget", args);
      expect(result.error?.code).toBe("42501");
    }
    const tampered = await a.rpc("provider_budget", { ...args, p_project_id: ids.b1 });
    expect(tampered.error?.code).toBe("42501");
  });

  it("imports reject foreign project writes and hide foreign project rows", async () => {
    for (const actor of [b, d]) {
      const own = await actor.from("imports").select("id").eq("project_id", ids.a1);
      expect(own.data).toEqual([]);
    }
    const invalidUpload = await c.from("imports").insert({
      project_id: ids.b1, organization_id: ids.orgB, format: "rubik-import-v1",
      source_kind: "audit", source_label: "No autorizado", captured_at: new Date().toISOString(),
      status: "empty", finding_count: 0, error_count: 0, findings: [], errors: [],
      file_sha256: "1".repeat(64), file_bytes: 2,
    });
    expect(invalidUpload.error).not.toBeNull();
    const crossDelete = await c.from("imports").delete().eq("project_id", ids.b1).select("id");
    expect(crossDelete.data ?? []).toEqual([]);
  });

  it("the private helper schema is not exposed through the Data API", async () => {
    const { error } = await a.schema("private" as never).rpc("is_org_member" as never, { org: ids.orgA } as never);
    expect(error).not.toBeNull();
  });
});
