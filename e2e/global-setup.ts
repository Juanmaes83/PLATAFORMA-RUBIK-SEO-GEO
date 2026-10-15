import { OTHER_PROJECT, OTHER_TENANT, TEST_PASSPHRASE, PROJECT, TENANT, USERS } from "./support";
import { fixtureScope } from "./fixture-scope";
import { cleanupFixtures, fixtureClients, initializeLedger, recordFixture } from "./fixtures";
import { consentedMembership } from "../tests/fixtures/consented-membership";

// No startup deletion or adoption. Successful creation responses are the receipts.
export default async function globalSetup() {
  const { admin, client } = fixtureClients();
  initializeLedger();
  const must = <T extends { error: unknown }>(result: T) => {
    if (result.error) throw result.error;
    return result;
  };
  try {
    for (const email of Object.values(USERS)) {
      const { data } = must(await admin.auth.admin.createUser({ email, password: TEST_PASSPHRASE, email_confirm: true,
        app_metadata: { rubik_e2e_run: fixtureScope().run } }));
      recordFixture({ kind: "user", value: { id: data.user!.id, email } });
    }
    for (const [key, slug, name, projectSlug, projectName] of [
      ["owner", TENANT, "Agencia de ejemplo", PROJECT, "Restaurante de ejemplo"],
      ["outsider", OTHER_TENANT, "Otra agencia", OTHER_PROJECT, "Despacho de ejemplo"],
    ]) {
      const actor = client();
      must(await actor.auth.signInWithPassword({ email: USERS[key as keyof typeof USERS], password: TEST_PASSPHRASE }));
      // SELECT policies depend on the creator trigger's membership, visible after INSERT.
      // A successful INSERT into a unique, fresh slug is the creation receipt; read its id
      // separately instead of weakening RLS to support INSERT ... RETURNING.
      must(await actor.from("organizations").insert({ slug, name }));
      const org = must(await actor.from("organizations").select("id,slug,created_by").eq("slug", slug).single()).data!;
      recordFixture({ kind: "organization", value: org });
      must(await actor.from("projects").insert({ organization_id: org.id, slug: projectSlug, name: projectName,
        ...(key === "owner" ? { domain: "restaurante.ejemplo.test" } : {}) }));
      const project = must(await actor.from("projects").select("id,slug,organization_id").eq("organization_id", org.id).eq("slug", projectSlug).single()).data!;
      recordFixture({ kind: "project", value: project });
      if (key === "owner") for (const [member, role] of [["analyst", "analyst"], ["client", "client-approver"]] as const) {
        const recipient = client();
        must(await recipient.auth.signInWithPassword({ email: USERS[member], password: TEST_PASSPHRASE }));
        await consentedMembership(actor, recipient, project.id, role);
      }
    }
  } catch (error) {
    await cleanupFixtures();
    throw error;
  }
  return cleanupFixtures;
}
