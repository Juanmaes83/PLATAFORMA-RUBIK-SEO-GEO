import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { execFileSync } from "node:child_process";
import { localDatabaseContainer, localSupabaseEnv } from "../../scripts/supabase-test-env.mjs";

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
  if (!slugs.length) return;
  // S1 (#106): a pending audit receipt blocks deleting its project, as it must for real data.
  // Some tests leave receipts pending on purpose (simulated signing failures). This run's own
  // fixture projects are destroyed with everything they hold, so their pending receipts go
  // first; receipts of any other project are never touched. psql runs inside the selected
  // LOCAL stack's database container only (scripts/supabase-test-env.mjs).
  const list = slugs.map((s) => `'${s.replace(/'/g, "''")}'`).join(",");
  execFileSync("docker", ["exec", "-i", localDatabaseContainer(), "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], {
    input: `delete from private.audit_outbox where state = 'pending' and project_id in
      (select p.id from public.projects p join public.organizations o on o.id = p.organization_id where o.slug in (${list}));`,
    stdio: ["pipe", "ignore", "pipe"],
  });
  // The admin client bypasses RLS; cleanup of this run's fictitious rows only. A failure is
  // reported instead of silently leaving fixtures behind.
  const { error } = await admin.from("organizations").delete().in("slug", slugs);
  if (error) throw new Error(`fixture cleanup failed: ${error.message}`);
}
