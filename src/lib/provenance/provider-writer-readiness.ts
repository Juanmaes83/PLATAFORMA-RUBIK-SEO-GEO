import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueryConfig } from "pg";
import type { Database } from "@/lib/supabase/database.types";
import type { ProjectRef } from "./audit";
import { writerPool } from "./writer";
import { previewLocked } from "@/lib/auth/mode";

/** A bounded, read-only probe. Completion still rechecks the actor inside its transaction. */
export async function providerWriterReady(
  client: SupabaseClient<Database>, project: ProjectRef, kind: "google" | "openseo",
): Promise<boolean> {
  try {
    if (previewLocked(process.env)) return false;
    const pool = writerPool();
    if (!pool) return false;
    const auth = await client.auth.getUser();
    const actorId = auth.data.user?.id;
    if (auth.error || !actorId) return false;
    const checked = await pool.query<{
      role_ok: boolean; actor_ok: boolean; schema_ok: boolean; receipt_ok: boolean;
    }>({ text: `select
      current_user = 'rubik_audit_writer' as role_ok,
      exists (select 1 from private.audit_writer_actor($1::uuid, $2::uuid) a
        where a.organization_id = $3::uuid and a.actor_role = 'owner'
          and a.tenant_slug = $4 and a.project_slug = $5) as actor_ok,
      to_regclass('private.audit_outbox') is not null
        and to_regclass('public.provider_results') is not null
        and has_table_privilege(current_user, 'private.audit_outbox', 'SELECT')
        and has_table_privilege(current_user, 'public.provider_results', 'INSERT')
        and to_regclass(case when $6 = 'google' then 'private.google_captures'
                             else 'private.openseo_project_jobs' end) is not null
        and has_function_privilege(current_user, 'private.audit_writer_actor(uuid,uuid)', 'EXECUTE')
        and has_function_privilege(current_user,
          case when $6 = 'google' then 'private.google_capture_command(uuid,text,jsonb)'
               else 'private.openseo_job(uuid,text,uuid,jsonb)' end, 'EXECUTE') as schema_ok,
      exists (select 1 from pg_trigger t
        where t.tgrelid = to_regclass(case when $6 = 'google' then 'private.google_captures'
                                           else 'private.openseo_project_jobs' end)
          and t.tgname = case when $6 = 'google' then 'google_captures_audit_stored'
                              else 'openseo_jobs_audit_completed' end
          and t.tgenabled in ('O', 'A')) as receipt_ok`,
      values: [project.projectId, actorId, project.organizationId, project.scope.tenantId, project.scope.projectId, kind],
      query_timeout: 3000 } as QueryConfig & { query_timeout: number });
    const row = checked.rows[0];
    return !!(row?.role_ok && row.actor_ok && row.schema_ok && row.receipt_ok);
  } catch {
    // Covers malformed configuration, failed connection, absent schema/function and timeouts.
    return false;
  }
}
