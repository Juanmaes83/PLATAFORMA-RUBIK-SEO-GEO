import { afterAll, beforeAll, expect, it } from "vitest";
import { connectWebmasterProperty, getWebmasterProperty, revokeWebmasterProperty } from "@/lib/webmaster/properties";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, signedIn } from "./support";

// ADR 0009, phase C, through the Data API of the local stack: properties never cross clients.
const slugs = [`wm-a-${RUN}`, `wm-b-${RUN}`];
const users: string[] = [];
const projects: Record<string, string> = {};

async function createProject(user: string, slug: string, domain: string) {
  const client = await signedIn(user);
  expect((await client.from("organizations").insert({ slug, name: "Webmaster fixture" })).error).toBeNull();
  const org = await client.from("organizations").select("id").eq("slug", slug).single();
  expect((await client.from("projects").insert({ organization_id: org.data!.id, slug: "site", name: "Site", domain })).error).toBeNull();
  return (await client.from("projects").select("id").eq("organization_id", org.data!.id).single()).data!.id;
}

beforeAll(async () => {
  users.push(await createConfirmedUser("wm-a"), await createConfirmedUser("wm-b"));
  projects.a = await createProject("wm-a", slugs[0], `wa-${RUN}.example`);
  projects.b = await createProject("wm-b", slugs[1], `wb-${RUN}.example`);
}, 60_000);

afterAll(async () => {
  await deleteOrganizations(slugs);
  await deleteUsers(users);
});

it("isolates Search Console and Bing properties between clients", async () => {
  const a = await signedIn("wm-a");
  const b = await signedIn("wm-b");
  expect(await connectWebmasterProperty(a, projects.a, "search-console", { siteUrl: `sc-domain:wa-${RUN}.example`, consent: true }))
    .toMatchObject({ ok: true, property: { state: "ACTIVE", provider: "search-console" } });
  expect(await getWebmasterProperty(b, projects.a, "search-console")).toEqual({ ok: false, error: "PROPERTY_FORBIDDEN" });
  expect(await revokeWebmasterProperty(b, projects.a, "search-console")).toEqual({ ok: false, error: "PROPERTY_FORBIDDEN" });
  expect(await connectWebmasterProperty(b, projects.b, "search-console", { siteUrl: `sc-domain:wa-${RUN}.example`, consent: true }))
    .toEqual({ ok: false, error: "PROPERTY_INVALID" });
  expect(await revokeWebmasterProperty(a, projects.a, "search-console")).toMatchObject({ ok: true, property: { state: "REVOKED" } });
  expect(await getWebmasterProperty(a, projects.a, "search-console")).toEqual({ ok: true, property: null });
}, 60_000);
