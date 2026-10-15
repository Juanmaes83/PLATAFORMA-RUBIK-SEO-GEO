import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { consentedMembership } from "../fixtures/consented-membership";
import { RUN, createConfirmedUser, deleteOrganizations, deleteUsers, email, signedIn } from "./support";

type Client = SupabaseClient<Database>;
const slug = `s2-${RUN}`, users: string[] = [];
let owner: Client, recipient: Client, stranger: Client, org: string;
const projects: string[] = [];
let invitation: { token: string; invitationId: string };
const must = <T extends { error: unknown }>(r: T) => { expect(r.error).toBeNull(); return r; };

beforeAll(async () => {
  for (const name of ["s2-owner", "s2-recipient", "s2-stranger"]) users.push(await createConfirmedUser(name));
  [owner, recipient, stranger] = await Promise.all(["s2-owner", "s2-recipient", "s2-stranger"].map(signedIn));
  must(await owner.from("organizations").insert({ slug, name: "S2 consent" }));
  org = must(await owner.from("organizations").select("id").eq("slug", slug).single()).data!.id;
  for (const project of ["first", "second"]) {
    must(await owner.from("projects").insert({ organization_id: org, slug: project, name: project }));
    projects.push(must(await owner.from("projects").select("id").eq("organization_id", org).eq("slug", project).single()).data!.id);
  }
}, 60_000);
afterAll(async () => { await deleteOrganizations([slug]); await deleteUsers(users); });

it("creator triggers still grant ownership without a membership INSERT privilege", async () => {
  expect(must(await owner.from("organization_members").select("role").eq("organization_id", org)).data).toEqual([{ role: "owner" }]);
  expect(must(await owner.from("project_members").select("role").eq("organization_id", org)).data).toEqual([{ role: "owner" }, { role: "owner" }]);
});

it("an owner cannot enroll an existing identity by INSERT or UPSERT in either table", async () => {
  const om = { organization_id: org, user_id: users[1], role: "member" };
  const pm = { project_id: projects[0], organization_id: org, user_id: users[1], role: "analyst" };
  for (const result of [await owner.from("organization_members").insert(om), await owner.from("organization_members").upsert(om),
    await owner.from("project_members").insert(pm), await owner.from("project_members").upsert(pm)]) expect(result.error?.code).toBe("42501");
  expect(must(await recipient.from("organization_members").select("user_id")).data).toEqual([]);
  expect(must(await recipient.from("projects").select("id")).data).toEqual([]);
});

it("a pending invitation grants nothing and another confirmed address cannot accept it", async () => {
  invitation = must(await owner.rpc("project_invitations", { p_project_id: projects[0], p_command: "create",
    p_payload: { email: email("s2-recipient"), role: "analyst" } })).data as typeof invitation;
  expect(must(await recipient.from("organization_members").select("user_id")).data).toEqual([]);
  expect((await stranger.rpc("accept_project_invitation", { p_token: invitation.token })).error?.code).toBe("P0002");
  expect(must(await stranger.from("projects").select("id")).data).toEqual([]);
  expect(must(await recipient.from("projects").select("id")).data).toEqual([]);
});

it("two recipient sessions accepting concurrently create exactly one consented membership", async () => {
  const second = await signedIn("s2-recipient");
  const results = await Promise.all([recipient, second].map(actor => actor.rpc("accept_project_invitation", { p_token: invitation.token })));
  expect(results.filter(r => !r.error)).toHaveLength(1);
  expect(results.find(r => r.error)?.error?.code).toBe("P0002");
  expect(results.find(r => !r.error)?.data).toEqual({ tenantId: slug, projectId: "first", role: "analyst" });
  expect(must(await recipient.from("organization_members").select("role")).data).toEqual([{ role: "member" }]);
  expect(must(await recipient.from("project_members").select("project_id,role")).data).toEqual([{ project_id: projects[0], role: "analyst" }]);
});

it("existing organization membership cannot bypass consent for a second project", async () => {
  expect((await owner.from("project_members").insert({ project_id: projects[1], organization_id: org, user_id: users[1], role: "owner" })).error?.code).toBe("42501");
  expect(must(await recipient.from("projects").select("id").eq("id", projects[1])).data).toEqual([]);
  await consentedMembership(owner, recipient, projects[1], "viewer");
  expect(must(await recipient.from("project_members").select("role").eq("project_id", projects[1])).data).toEqual([{ role: "viewer" }]);
  expect(must(await recipient.from("organization_members").select("role")).data).toEqual([{ role: "member" }]);
});

it("withdrawal takes effect and neither a used token nor direct INSERT restores access", async () => {
  must(await owner.from("project_members").delete().eq("project_id", projects[0]).eq("user_id", users[1]));
  expect(must(await recipient.from("projects").select("id").eq("id", projects[0])).data).toEqual([]);
  expect((await recipient.rpc("accept_project_invitation", { p_token: invitation.token })).error?.code).toBe("P0002");
  expect((await owner.from("project_members").insert({ project_id: projects[0], organization_id: org, user_id: users[1], role: "analyst" })).error?.code).toBe("42501");
});
