import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, expect, it } from "vitest";
import { SUPABASE_CLI } from "../../scripts/supabase-test-env.mjs";
import { consentedMembership } from "../fixtures/consented-membership";
import { fixtureScope } from "../../e2e/fixture-scope";
import { cleanupFixtures, createOwnedConfirmedAccount, fixtureClients, fixtureSnapshot, initializeLedger, readLedger, reconcileRunMarkedUser, recordFixture, reserveBrowserAccount, type Snapshot } from "../../e2e/fixtures";

// Two isolated runs are deliberately treated as strangers. Only this test's successful
// creation receipts may be cleaned; the original shared stack is compared before/after.
const a = randomBytes(16).toString("hex"), b = randomBytes(16).toString("hex");
let baseline: Snapshot;
const previousRun = process.env.RUBIK_E2E_RUN_ID;
const password = randomBytes(24).toString("hex");
const activate = (run: string) => { process.env.RUBIK_E2E_RUN_ID = run; };
const initialized = new Set<string>();
const must = <T extends { error: unknown }>(r: T) => { if (r.error) throw r.error; return r; };

async function createRun(run: string) {
  activate(run);
  initializeLedger();
  initialized.add(run);
  const scope = fixtureScope();
  const { admin, client } = fixtureClients();
  const user = must(await admin.auth.admin.createUser({ email: scope.users.owner, password, email_confirm: true,
    app_metadata: { rubik_e2e_run: run } })).data.user!;
  recordFixture({ kind: "user", value: { id: user.id, email: user.email! } });
  const actor = client();
  must(await actor.auth.signInWithPassword({ email: user.email!, password }));
  must(await actor.from("organizations").insert({ slug: scope.tenant, name: "Foreign to the other run" }));
  const org = must(await actor.from("organizations").select("id,slug,created_by").eq("slug", scope.tenant).single()).data!;
  recordFixture({ kind: "organization", value: org });
  must(await actor.from("projects").insert({ organization_id: org.id, slug: "preexisting", name: "Preserve me" }));
  const project = must(await actor.from("projects").select("id,slug,organization_id").eq("organization_id", org.id).eq("slug", "preexisting").single()).data!;
  recordFixture({ kind: "project", value: project });
  return { actor, user, org, project };
}

let foreign: Awaited<ReturnType<typeof createRun>>, own: Awaited<ReturnType<typeof createRun>>;
beforeAll(async () => {
  baseline = await fixtureSnapshot();
  foreign = await createRun(b);
  own = await createRun(a);
}, 60_000);

afterAll(async () => {
  for (const run of [a, b]) {
    if (!initialized.has(run)) continue;
    activate(run);
    await cleanupFixtures();
  }
  const after = await fixtureSnapshot();
  for (const key of ["users", "organizations", "projects", "organizationMembers", "projectMembers"] as const) {
    expect(baseline[key].every((before) => after[key].some((row) => JSON.stringify(row) === JSON.stringify(before))), `preserved original ${key}`).toBe(true);
  }
  if (previousRun === undefined) delete process.env.RUBIK_E2E_RUN_ID;
  else process.env.RUBIK_E2E_RUN_ID = previousRun;
}, 60_000);

it("refuses preexisting users and organizations instead of adopting email or slug collisions", async () => {
  activate(b);
  await expect(reserveBrowserAccount(foreign.user.email!)).rejects.toThrow("Preexisting");
  const { error } = await fixtureClients().admin.auth.admin.createUser({ email: foreign.user.email!, password, email_confirm: true });
  expect(error).not.toBeNull();
  expect((await own.actor.from("organizations").insert({ slug: foreign.org.slug, name: "Collision must preserve existing org" })).error?.code).toBe("23505");
  expect(readLedger().users).toHaveLength(1);
});

it("blocks all deletion when another run has attached a membership", async () => {
  activate(a);
  const invitationId = await consentedMembership(foreign.actor, own.actor, foreign.project.id, "viewer");
  try {
    await expect(cleanupFixtures()).rejects.toThrow("Ambiguous");
    const after = await fixtureSnapshot();
    expect(after.users.some((u) => u.id === own.user.id)).toBe(true);
    expect(after.organizations.some((o) => o.id === own.org.id)).toBe(true);
    expect(after.projects.some((p) => p.id === own.project.id)).toBe(true);
  } finally {
    // Exact relationship created above by this regression, not a discovered membership.
    must(await foreign.actor.from("organization_members").delete().eq("organization_id", foreign.org.id).eq("user_id", own.user.id));
    deleteRegressionInvitation(invitationId);
  }
});

it("atomically preserves a private invitation even after its foreign membership is withdrawn", async () => {
  activate(a);
  const invite = must(await foreign.actor.rpc("project_invitations", { p_project_id: foreign.project.id, p_command: "create",
    p_payload: { email: own.user.email, role: "viewer" } })).data as { invitationId: string; token: string };
  must(await own.actor.rpc("accept_project_invitation", { p_token: invite.token }));
  must(await foreign.actor.from("organization_members").delete().eq("organization_id", foreign.org.id).eq("user_id", own.user.id));
  try {
    // The public membership preflight now passes. The locked SQL must detect accepted_by
    // in the private schema and roll back BOTH root deletes, including our organization.
    await expect(cleanupFixtures()).rejects.toThrow("Atomic E2E cleanup refused: foreign dependency");
    const after = await fixtureSnapshot();
    expect(after.users.some((u) => u.id === own.user.id)).toBe(true);
    expect(after.organizations).toContainEqual(own.org);
    const listed = must(await foreign.actor.rpc("project_invitations", { p_project_id: foreign.project.id, p_command: "list" })).data;
    expect(listed).toEqual([expect.objectContaining({ invitationId: invite.invitationId, state: "ACCEPTED" })]);
  } finally {
    // Delete only the exact relationship whose creation id was returned above. Both
    // roots belong to this regression; no discovered invitation is adopted or erased.
    deleteRegressionInvitation(invite.invitationId);
  }
}, 60_000);

it("records a confirmed recovery account before browser actions and removes it by run receipt", async () => {
  activate(a);
  const email = `${fixtureScope().prefix}-recovery@ejemplo.test`;
  await reserveBrowserAccount(email);
  await createOwnedConfirmedAccount(email, password);
  const receipt = readLedger().users.find((user) => user.email === email);
  expect(receipt?.id).toBeTruthy();
  expect((await fixtureSnapshot()).users).toContainEqual({ ...receipt, run: a });
  const signed = await fixtureClients().client().auth.signInWithPassword({ email, password });
  expect(signed.error).toBeNull();
}, 60_000);

it("reconciles a lost local Auth create response only with the exact run marker", async () => {
  activate(a);
  const email = `${fixtureScope().prefix}-lost-response@ejemplo.test`;
  await reserveBrowserAccount(email);
  const created = must(await fixtureClients().admin.auth.admin.createUser({
    email, password, email_confirm: true, app_metadata: { rubik_e2e_run: a },
  })).data.user!;
  const receipt = reconcileRunMarkedUser(readLedger(), await fixtureSnapshot(), email);
  expect(receipt.id).toBe(created.id);
  recordFixture({ kind: "user", value: receipt });
}, 60_000);

function deleteRegressionInvitation(invitationId: string) {
  for (const id of [invitationId, foreign.project.id, own.user.id]) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid regression receipt");
  }
  execSync(`${SUPABASE_CLI} db query --local "delete from private.project_invitations where id='${invitationId}' and project_id='${foreign.project.id}' and accepted_by='${own.user.id}'"`, { stdio: "pipe" });
}

it("cleans only its receipts, repeats without accumulation and preserves the other run", async () => {
  activate(a);
  await cleanupFixtures();
  await cleanupFixtures();
  const after = await fixtureSnapshot();
  expect(after.users.some((u) => u.id === own.user.id)).toBe(false);
  expect(after.organizations.some((o) => o.id === own.org.id)).toBe(false);
  expect(after.projects.some((p) => p.id === own.project.id)).toBe(false);
  expect(after.users.some((u) => u.id === foreign.user.id && u.email.endsWith("@ejemplo.test"))).toBe(true);
  expect(after.organizations).toContainEqual(foreign.org);
  expect(after.projects).toContainEqual(foreign.project);
}, 60_000);
