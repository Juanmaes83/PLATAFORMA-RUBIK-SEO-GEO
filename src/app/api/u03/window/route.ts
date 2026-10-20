import { NextResponse } from "next/server";
import { writerPool } from "@/lib/provenance/writer";
import { withPreviewWriterCapability } from "@/lib/provenance/preview-writer-capability";
import { SUPABASE_ROOT_2021_CA } from "@/lib/provenance/supabase-root-ca";
import type { ConnectionOptions, TLSSocket } from "node:tls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLE = "rubik_preview_u03_writer";
const WRITER = "rubik_audit_writer";
const ALLOWLIST = ["private.audit_writer_actor(uuid, uuid)", "private.audit_writer_project(uuid)"];

/** Read-only check of the actual deployment's Session-pooler client before any fixtures. */
export async function GET(request: Request) {
  const runId = request.headers.get("x-rubik-u03-run-id") ?? "";
  const namespace = `u03-${runId.replaceAll("-", "").slice(0, 12)}`;
  const response = await withPreviewWriterCapability(request, `${namespace}-a`, "a1", async () => {
    const pool = writerPool();
    if (!pool) return null;
    let client;
    try {
      client = await pool.connect();
      const parsed = new URL(process.env.RUBIK_AUDIT_DATABASE_URL ?? "");
      const ssl = pool.options.ssl;
      const tlsOptions = ssl && typeof ssl === "object" ? ssl as ConnectionOptions : null;
      const socket = client.connection.stream as TLSSocket;
      const tls = pool.options.host === "aws-1-eu-west-3.pooler.supabase.com" && pool.options.port === 5432 &&
        parsed.hostname === "aws-1-eu-west-3.pooler.supabase.com" && parsed.port === "5432" &&
        tlsOptions?.rejectUnauthorized === true && tlsOptions.servername === parsed.hostname &&
        tlsOptions.ca === SUPABASE_ROOT_2021_CA && socket.encrypted === true && socket.authorized === true &&
        !socket.authorizationError;
      if (!tls) return null;
      const identity = (await client.query(`select current_database()='postgres' as database_ok,
        session_user::text as session_user,current_user::text as current_user,
        has_table_privilege(current_user,'public.audit_events','insert') as audit_insert,
        has_table_privilege(current_user,'public.audit_events','select') as audit_select,
        has_table_privilege(current_user,'public.provider_results','insert') as results_insert,
        has_table_privilege(current_user,'public.provider_results','select') as results_select,
        has_table_privilege(current_user,'private.audit_idempotency','insert') as idempotency_insert,
        has_table_privilege(current_user,'private.audit_outbox','select') as outbox_select,
        has_column_privilege(current_user,'private.audit_outbox','state','update') as outbox_state_update,
        has_schema_privilege(current_user,'auth','usage') as auth_schema,
        has_table_privilege(current_user,'public.imports','insert') as import_insert,
        has_table_privilege(current_user,'public.imports','select') as import_select,
        has_table_privilege(current_user,'public.project_members','select') as membership_select,
        has_table_privilege(current_user,'public.organizations','select') as organizations_select,
        has_table_privilege(current_user,'public.projects','select') as projects_select,
        has_table_privilege(current_user,'public.audit_events','delete') as audit_delete,
        has_table_privilege(current_user,'private.audit_outbox','delete') as outbox_delete,
        has_schema_privilege(current_user,'public','create') as public_create,
        has_schema_privilege(current_user,'private','create') as private_create`)).rows[0];
      if (!identity.database_ok || identity.session_user !== ROLE || identity.current_user !== WRITER ||
        !identity.audit_insert || !identity.audit_select || !identity.results_insert || !identity.results_select ||
        !identity.idempotency_insert || !identity.outbox_select || !identity.outbox_state_update || identity.auth_schema ||
        identity.import_insert || identity.import_select || identity.membership_select || identity.organizations_select ||
        identity.projects_select || identity.audit_delete || identity.outbox_delete || identity.public_create || identity.private_create) return null;
      const functions = (await client.query(`select coalesce(array_agg(format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) order by 1)
        filter (where p.prosecdef),array[]::text[]) as definers from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where p.prokind in ('f','p') and has_schema_privilege(current_user,n.oid,'USAGE') and has_function_privilege(current_user,p.oid,'EXECUTE')`)).rows[0]?.definers;
      if (JSON.stringify(functions) !== JSON.stringify(ALLOWLIST)) return null;
      const rls = (await client.query(`select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where (n.nspname,c.relname) in (('public','audit_events'),('public','provider_results'),('private','audit_idempotency'),('private','audit_outbox')) and c.relrowsecurity`)).rows[0]?.n;
      if (rls !== 4) return null;
      const empty = (await client.query(`select (select count(*)=0 from public.audit_events) and
        (select count(*)=0 from public.provider_results) and (select count(*)=0 from private.audit_idempotency) and
        (select count(*)=0 from private.audit_outbox) as empty`)).rows[0]?.empty;
      if (empty !== true) return null;
      return NextResponse.json({ ok: true, checks: ["CLIENT_TLS", "SESSION_USER", "SET_ROLE", "PRIVILEGES", "SECURITY_DEFINER_ALLOWLIST", "RLS", "EMPTY_INITIAL_STATE"] },
        { headers: { "Cache-Control": "no-store" } });
    } catch {
      return null;
    } finally { client?.release(); }
  });
  return response ?? NextResponse.json({ ok: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
