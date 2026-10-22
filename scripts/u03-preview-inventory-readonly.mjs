import { runPreviewReadOnlySql } from './u03-preview-b4-orchestrator.mjs';

// Independent counts-only diagnostic. The ref is fixed in the imported runner;
// this query intentionally returns no fixture IDs, user data, or credentials.
const INVENTORY_SQL = `select
  (select environment='preview' and project_ref='rhnnplewqsekrnaousyl' from private.environment_identity limit 1) as exact_preview_identity,
  (select count(*)::int from supabase_migrations.schema_migrations) as migration_count,
  (select max(version)::text from supabase_migrations.schema_migrations) as latest_migration,
  (select count(*)::int from auth.users) as auth_users,
  (select count(*)::int from public.organizations) as organizations,
  (select count(*)::int from public.projects) as projects,
  (select count(*)::int from public.organization_members) as organization_members,
  (select count(*)::int from public.project_members) as project_members,
  (select count(*)::int from private.project_invitations) as invitations,
  (select count(*)::int from public.audit_events) as audit_events,
  (select count(*)::int from public.provider_results) as provider_results,
  (select count(*)::int from public.imports) as imports,
  (select count(*)::int from private.audit_idempotency) as audit_idempotency,
  (select count(*)::int from private.audit_outbox) as outbox_total,
  (select count(*)::int from private.audit_outbox where state='pending') as pending_outbox,
  (select count(*)::int from private.openseo_project_jobs) as openseo_project_jobs,
  (select count(*)::int from private.openseo_project_connections) as openseo_project_connections,
  (select count(*)::int from private.webmaster_properties) as webmaster_properties,
  (select count(*)::int from private.provider_budgets) as provider_budgets,
  (select count(*)::int from private.provider_spend) as provider_spend,
  (select count(*)::int from private.openseo_google_properties) as openseo_google_properties,
  (select count(*)::int from private.google_captures) as google_captures,
  (select not rolsuper and not rolcanlogin and not rolbypassrls from pg_roles where rolname='rubik_audit_writer') as writer_locked,
  (select exists(select 1 from pg_roles where rolname='rubik_preview_u03_writer')) as window_writer_present,
  (select count(*)::int from pg_policies where policyname like 'u03_preflight_writer_%') as window_policy_residue,
  (select count(*)::int from pg_stat_activity where usename in ('rubik_audit_writer','rubik_preview_u03_writer')) as writer_sessions,
  (select exists(select 1 from pg_roles where rolname='rubik_preview_receipt_writer')) as receipt_writer_present`;
const COUNT_FIELDS = [
  'migration_count', 'auth_users', 'organizations', 'projects', 'organization_members', 'project_members',
  'invitations', 'audit_events', 'provider_results', 'imports', 'audit_idempotency', 'outbox_total',
  'pending_outbox', 'openseo_project_jobs', 'openseo_project_connections', 'webmaster_properties',
  'provider_budgets', 'provider_spend', 'openseo_google_properties', 'google_captures', 'window_policy_residue',
  'writer_sessions',
];

try {
  const row = await runPreviewReadOnlySql(INVENTORY_SQL, { cli: process.env.U03_SUPABASE_CLI ?? 'npx.cmd' });
  if (!row || COUNT_FIELDS.some(field => !Number.isSafeInteger(row[field]) || row[field] < 0) ||
      typeof row.exact_preview_identity !== 'boolean' || typeof row.writer_locked !== 'boolean' ||
      typeof row.window_writer_present !== 'boolean' || typeof row.receipt_writer_present !== 'boolean') {
    process.stdout.write('PREVIEW_INVENTORY_RESULT_INVALID\n');
    process.exitCode = 2;
  } else {
    const output = Object.fromEntries([...COUNT_FIELDS, 'latest_migration', 'exact_preview_identity', 'writer_locked',
      'window_writer_present', 'receipt_writer_present'].map(field => [field, row[field]]));
    process.stdout.write(`${JSON.stringify(output)}\n`);
    if (row.exact_preview_identity !== true || row.migration_count !== 27 || row.latest_migration !== '20261015210000' ||
        row.writer_locked !== true || row.window_writer_present || row.window_policy_residue !== 0 || row.writer_sessions !== 0 ||
        COUNT_FIELDS.some(field => field !== 'migration_count' && row[field] !== 0)) process.exitCode = 3;
  }
} catch (error) {
  const category = /DNS|TLS|TIMEOUT|JSON|PROJECT_REF_REJECTED|READ_ONLY_SQL_REJECTED/.exec(error?.message ?? '')?.[0] ?? 'QUERY_FAILED';
  process.stdout.write(`PREVIEW_INVENTORY_QUERY_${category}\n`);
  process.exitCode = 4;
}
