import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
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

  expect((await a.from("organization_members").insert({ organization_id: oa, user_id: users[2], role: "member" })).error).toBeNull();
  expect((await a.from("project_members").insert({ project_id: a1, organization_id: oa, user_id: users[2], role: "analyst" })).error).toBeNull();
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

  it("the private helper schema is not exposed through the Data API", async () => {
    const { error } = await a.schema("private" as never).rpc("is_org_member" as never, { org: ids.orgA } as never);
    expect(error).not.toBeNull();
  });
});
