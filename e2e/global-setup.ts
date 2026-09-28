import { createClient } from "@supabase/supabase-js";
import { localSupabaseEnv } from "../scripts/supabase-test-env.mjs";
import { OTHER_PROJECT, OTHER_TENANT, TEST_PASSPHRASE, PROJECT, TENANT, USERS } from "./support";

// Prepares fictitious accounts on the LOCAL stack (the helper refuses any other host). The
// admin client (local secret key) only deletes leftovers of earlier runs and creates confirmed
// users; organizations, projects and roles are created by the users themselves through RLS.
export default async function globalSetup() {
  const env = localSupabaseEnv();
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(env.apiUrl, env.secretKey, options);

  await admin.from("organizations").delete().in("slug", [TENANT, OTHER_TENANT]);
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of existing?.users ?? []) if (u.email?.endsWith("@ejemplo.test")) await admin.auth.admin.deleteUser(u.id);

  const ids: Record<string, string> = {};
  for (const [key, email] of Object.entries(USERS)) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: TEST_PASSPHRASE, email_confirm: true });
    if (error) throw error;
    ids[key] = data.user.id;
  }

  const as = async (email: string) => {
    const client = createClient(env.apiUrl, env.publishableKey, options);
    const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSPHRASE });
    if (error) throw error;
    return client;
  };
  const must = <T extends { error: unknown }>(result: T) => {
    if (result.error) throw result.error;
    return result;
  };

  const owner = await as(USERS.owner);
  must(await owner.from("organizations").insert({ slug: TENANT, name: "Agencia de ejemplo" }));
  const orgId = must(await owner.from("organizations").select("id").eq("slug", TENANT).single()).data!.id;
  must(await owner.from("projects").insert({ organization_id: orgId, slug: PROJECT, name: "Restaurante de ejemplo", domain: "restaurante.ejemplo.test" }));
  const projectId = must(await owner.from("projects").select("id").eq("slug", PROJECT).single()).data!.id;
  for (const [key, role] of [["analyst", "analyst"], ["client", "client-approver"]] as const) {
    must(await owner.from("organization_members").insert({ organization_id: orgId, user_id: ids[key], role: "member" }));
    must(await owner.from("project_members").insert({ project_id: projectId, organization_id: orgId, user_id: ids[key], role }));
  }

  const outsider = await as(USERS.outsider);
  must(await outsider.from("organizations").insert({ slug: OTHER_TENANT, name: "Otra agencia" }));
  const otherOrg = must(await outsider.from("organizations").select("id").eq("slug", OTHER_TENANT).single()).data!.id;
  must(await outsider.from("projects").insert({ organization_id: otherOrg, slug: OTHER_PROJECT, name: "Despacho de ejemplo" }));
}
