import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { localSupabaseEnv } from "../../scripts/supabase-test-env.mjs";

// Integration support for the LOCAL Supabase stack only (the helper refuses any other host).
// Users are fictitious, with reserved `.test` addresses and a per-run suffix.
export const env: { apiUrl: string; publishableKey: string; secretKey: string; mailpitUrl: string } = localSupabaseEnv();
export const RUN = Date.now().toString(36);
// Fictitious passphrase for local test accounts only (they exist only in the local stack).
export const TEST_PASSPHRASE = "prueba-local-2026";

const options = { auth: { persistSession: false, autoRefreshToken: false } };
export const anonClient = () => createClient<Database>(env.apiUrl, env.publishableKey, options);
/** Local stack admin client: ONLY to create confirmed test users. Never used by the app. */
const admin = createClient(env.apiUrl, env.secretKey, options);

export const email = (name: string) => `${name}-${RUN}@ejemplo.test`;

export async function createConfirmedUser(name: string, userMetadata: Record<string, unknown> = {}) {
  const { data, error } = await admin.auth.admin.createUser({ email: email(name), password: TEST_PASSPHRASE, email_confirm: true, user_metadata: userMetadata });
  if (error) throw error;
  return data.user.id;
}

export async function signedIn(name: string): Promise<SupabaseClient<Database>> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email: email(name), password: TEST_PASSPHRASE });
  if (error) throw error;
  return client;
}

export async function deleteUsers(ids: string[]) {
  for (const id of ids) await admin.auth.admin.deleteUser(id);
}

export async function deleteOrganizations(slugs: string[]) {
  // The admin client bypasses RLS; cleanup of this run's fictitious rows only.
  await admin.from("organizations").delete().in("slug", slugs);
}
