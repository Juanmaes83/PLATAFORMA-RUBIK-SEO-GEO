import { NextResponse } from "next/server";
import { writerPool } from "@/lib/provenance/writer";
import { previewWriterCapabilityRejection, withPreviewWriterCapability } from "@/lib/provenance/preview-writer-capability";
import { SUPABASE_ROOT_2021_CA } from "@/lib/provenance/supabase-root-ca";
import type { ConnectionOptions, TLSSocket } from "node:tls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLE = "rubik_preview_u03_writer";
const ALLOWLIST = ["private.audit_writer_actor(uuid, uuid)", "private.audit_writer_project(uuid)"];
const SQLSTATES = new Set(["42501", "28P01", "28000", "57P01", "0A000", "42704", "42710"]);
type Phase = "POOL_CONNECT" | "TLS" | "IDENTITY" | "DEFINERS" | "PROVIDER_RPC" | "RLS" | "INVENTORY";

function recordFailure(runId: string, code: string, error?: unknown) {
  const sqlstate = typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string" && SQLSTATES.has(error.code) ? error.code : undefined;
  // The run ID is the only identifier: no SQL, row, URL, exception message or secret is logged.
  console.info(JSON.stringify({ event: "U03_WINDOW_RUNTIME_PREFLIGHT", runId, code, ...(sqlstate ? { sqlstate } : {}) }));
}

function blocked(runId: string, code: string, error?: unknown) {
  recordFailure(runId, code, error);
  // Only reached after the signed run capability passes. Public 404 body/status remain generic.
  return NextResponse.json({ ok: false }, { status: 404,
    headers: { "Cache-Control": "no-store", "x-rubik-u03-diagnostic": code } });
}

/** Read-only check of the actual deployment's Session-pooler client before any fixtures. */
export async function GET(request: Request) {
  const runId = request.headers.get("x-rubik-u03-run-id") ?? "";
  const namespace = `u03-${runId.replaceAll("-", "").slice(0, 12)}`;
  const rejected = previewWriterCapabilityRejection(request, `${namespace}-a`, "a1");
  if (rejected) {
    recordFailure(/^[0-9a-f-]{36}$/i.test(runId) ? runId : "INVALID_RUN", rejected);
    return NextResponse.json({ ok: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const response = await withPreviewWriterCapability(request, `${namespace}-a`, "a1", async () => {
    const pool = writerPool();
    if (!pool) return blocked(runId, "RUNTIME_WRITER_POOL_UNAVAILABLE");
    let client;
    let phase: Phase = "POOL_CONNECT";
    try {
      client = await pool.connect();
      phase = "TLS";
      const parsed = new URL(process.env.RUBIK_AUDIT_DATABASE_URL ?? "");
      const ssl = pool.options.ssl;
      const tlsOptions = ssl && typeof ssl === "object" ? ssl as ConnectionOptions : null;
      const socket = client.connection.stream as TLSSocket;
      const connectionParameters = (client as typeof client & {
        connectionParameters: { host?: string; port?: number };
      }).connectionParameters;
      // pg.Pool keeps connectionString in options; the parsed host/port live on the client.
      const tls = connectionParameters?.host === "aws-1-eu-west-3.pooler.supabase.com" &&
        connectionParameters?.port === 5432 &&
        parsed.hostname === "aws-1-eu-west-3.pooler.supabase.com" && parsed.port === "5432" &&
        tlsOptions?.rejectUnauthorized === true && tlsOptions.servername === parsed.hostname &&
        tlsOptions.ca === SUPABASE_ROOT_2021_CA && socket.encrypted === true && socket.authorized === true &&
        !socket.authorizationError;
      if (!tls) return blocked(runId, "RUNTIME_CLIENT_TLS_REJECTED");
      phase = "IDENTITY";
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
      if (!identity?.database_ok || identity.session_user !== ROLE || identity.current_user !== ROLE)
        return blocked(runId, "RUNTIME_PRINCIPAL_REJECTED");
      if (
        !identity.audit_insert || !identity.audit_select || !identity.results_insert || !identity.results_select ||
        !identity.idempotency_insert || !identity.outbox_select || !identity.outbox_state_update || identity.auth_schema ||
        identity.import_insert || identity.import_select || identity.membership_select || identity.organizations_select ||
        identity.projects_select || identity.audit_delete || identity.outbox_delete || identity.public_create || identity.private_create)
        return blocked(runId, "RUNTIME_PRIVILEGES_REJECTED");
      phase = "DEFINERS";
      const functions = (await client.query(`select coalesce(array_agg(format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)) order by 1)
        filter (where p.prosecdef),array[]::text[]) as definers from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where p.prokind in ('f','p') and has_schema_privilege(current_user,n.oid,'USAGE') and has_function_privilege(current_user,p.oid,'EXECUTE')`)).rows[0]?.definers;
      if (JSON.stringify(functions) !== JSON.stringify(ALLOWLIST)) return blocked(runId, "RUNTIME_DEFINERS_REJECTED");
      phase = "PROVIDER_RPC";
      const rpc = (await client.query(`select
        has_function_privilege(current_user,'private.google_capture_command(uuid,text,jsonb)','EXECUTE') as google,
        has_function_privilege(current_user,'private.openseo_job(uuid,text,uuid,jsonb)','EXECUTE') as openseo,
        pg_has_role(current_user,'rubik_audit_writer','MEMBER') as writer_member`)).rows[0];
      if (!rpc || rpc.google || rpc.openseo || rpc.writer_member) return blocked(runId, "RUNTIME_PROVIDER_RPC_REJECTED");
      phase = "RLS";
      const rls = (await client.query(`select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where (n.nspname,c.relname) in (('public','audit_events'),('public','provider_results'),('private','audit_idempotency'),('private','audit_outbox')) and c.relrowsecurity`)).rows[0]?.n;
      if (rls !== 4) return blocked(runId, "RUNTIME_RLS_REJECTED");
      phase = "INVENTORY";
      const empty = (await client.query(`select (select count(*)=0 from public.audit_events) and
        (select count(*)=0 from public.provider_results) and (select count(*)=0 from private.audit_idempotency) and
        (select count(*)=0 from private.audit_outbox) as empty`)).rows[0]?.empty;
      if (empty !== true) return blocked(runId, "RUNTIME_INVENTORY_REJECTED");
      return NextResponse.json({ ok: true, checks: ["CLIENT_TLS", "DIRECT_PRINCIPAL", "PRIVILEGES", "PROVIDER_RPC_DENIED", "SECURITY_DEFINER_ALLOWLIST", "RLS", "EMPTY_INITIAL_STATE"] },
        { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return blocked(runId, `RUNTIME_${phase}_QUERY_FAILED`, error);
    } finally { client?.release(); }
  });
  return response ?? NextResponse.json({ ok: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
