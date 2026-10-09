import { afterAll, beforeAll, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { connectProject, getProjectConnection, revokeProjectConnection } from "@/lib/openseo/connections";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

const slugs = [`conn-a-${RUN}`, `conn-b-${RUN}`];
const users: string[] = [];
const projects: Record<string, string> = {};

async function createProject(user: string, slug: string, domain: string) {
  const client = await signedIn(user);
  expect((await client.from("organizations").insert({ slug, name: "Connection fixture" })).error).toBeNull();
  const org = await client.from("organizations").select("id").eq("slug", slug).single();
  expect(org.error).toBeNull();
  expect((await client.from("projects").insert({ organization_id: org.data!.id, slug: "site", name: "Site", domain })).error).toBeNull();
  const project = await client.from("projects").select("id").eq("organization_id", org.data!.id).single();
  expect(project.error).toBeNull();
  return project.data!.id;
}

beforeAll(async () => {
  users.push(await createConfirmedUser("conn-a"), await createConfirmedUser("conn-b"));
  projects.a = await createProject("conn-a", slugs[0], `a-${RUN}.example`);
  projects.b = await createProject("conn-b", slugs[1], `b-${RUN}.example`);
}, 60_000);

afterAll(async () => {
  await deleteOrganizations(slugs);
  await deleteUsers(users);
});

it("isolates connections between clients through the Data API", async () => {
  const a = await signedIn("conn-a");
  const b = await signedIn("conn-b");
  const provider = `oseo-${RUN}`;
  const connected = await connectProject(a, projects.a, { openseoProjectId: provider, allowedHosts: [`a-${RUN}.example`], consent: true });
  expect(connected).toMatchObject({ ok: true, connection: { state: "ACTIVE", openseoProjectId: provider, credentialMode: "platform" } });

  // The private table is not reachable through PostgREST, and client B cannot use the RPC on A.
  expect((await (b as unknown as SupabaseClient).schema("private").from("openseo_project_connections").select("*")).error).not.toBeNull();
  expect(await getProjectConnection(b, projects.a)).toEqual({ ok: false, error: "CONNECTION_FORBIDDEN" });
  expect(await revokeProjectConnection(b, projects.a)).toEqual({ ok: false, error: "CONNECTION_FORBIDDEN" });
  expect(await connectProject(b, projects.b, { openseoProjectId: provider, allowedHosts: [`b-${RUN}.example`], consent: true }))
    .toEqual({ ok: false, error: "CONNECTION_TAKEN" });
  expect(await connectProject(b, projects.b, { openseoProjectId: `other-${RUN}`, allowedHosts: [`a-${RUN}.example`], consent: true }))
    .toEqual({ ok: false, error: "CONNECTION_INVALID" });

  expect(await revokeProjectConnection(a, projects.a)).toMatchObject({ ok: true, connection: { state: "REVOKED" } });
  expect(await getProjectConnection(a, projects.a)).toEqual({ ok: true, connection: null });
}, 60_000);
