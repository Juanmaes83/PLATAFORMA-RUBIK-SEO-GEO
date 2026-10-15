-- Group 3 · catalog-wide invariants of the multi-tenant surface (pgTAP).
-- The per-feature suites check the objects each migration creates. This one checks the whole
-- catalog, so a future table or function that forgets the pattern (RLS on, explicit grants,
-- nothing for anon, DEFINER only behind an empty search_path) fails here even if its own suite
-- does not look. It also pins the list of RPCs the Data API exposes: adding one means adding
-- it to tests/integration/isolation-matrix.integration.test.ts too.
-- Read-only; runs in a transaction that is rolled back. LOCAL stack only (supabase test db).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Functions and tables that belong to this application (extension members excluded).
create temp view app_functions as
  select p.oid, n.nspname, p.proname, p.prosecdef, p.proconfig, p.proacl, p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');
create temp view app_tables as
  select c.oid, n.nspname, c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind in ('r', 'p');

-- ── Functions ───────────────────────────────────────────────────────────────────────────
select is(
  (select coalesce(array_agg(nspname || '.' || proname order by nspname || '.' || proname), '{}') from app_functions
    where has_function_privilege('anon', oid, 'EXECUTE')),
  '{}'::text[], 'anon cannot execute any application function');
select is(
  (select coalesce(array_agg(f.nspname || '.' || f.proname order by f.nspname || '.' || f.proname), '{}') from app_functions f,
    lateral aclexplode(coalesce(f.proacl, acldefault('f', (select proowner from pg_proc where oid = f.oid)))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  '{}'::text[], 'no application function keeps the default EXECUTE for PUBLIC');
select is(
  (select coalesce(array_agg(nspname || '.' || proname order by nspname || '.' || proname), '{}') from app_functions
    where prosecdef and not (proconfig @> array['search_path=""'])
      and not (nspname = 'public' and proname = 'rls_auto_enable')),
  '{}'::text[], 'every SECURITY DEFINER function pins an empty search_path (rls_auto_enable is the owner-only Studio template)');
select is(
  (select coalesce(array_agg(proname::text order by proname::text), '{}') from app_functions
    where nspname = 'public' and prosecdef and has_function_privilege('authenticated', oid, 'EXECUTE')),
  '{}'::text[], 'every RPC exposed in public is a SECURITY INVOKER wrapper');
select is(
  (select array_agg(proname::text order by proname::text) from app_functions
    where nspname = 'public' and has_function_privilege('authenticated', oid, 'EXECUTE')),
  array['accept_project_invitation', 'delete_import_with_receipt', 'google_capture', 'google_recovery_state', 'openseo_active_job',
    'openseo_connection', 'openseo_google_property', 'openseo_job', 'openseo_release_starting_job',
    'project_data_inventory', 'project_invitations', 'project_people', 'provider_budget', 'webmaster_property'],
  'the RPCs exposed to authenticated are exactly the ones covered by the isolation matrix');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon has no USAGE on schema private');

-- ── Tables ──────────────────────────────────────────────────────────────────────────────
select is(
  (select coalesce(array_agg(nspname || '.' || relname order by nspname || '.' || relname), '{}') from app_tables where not relrowsecurity),
  '{}'::text[], 'every application table has row level security enabled');
select is(
  (select coalesce(array_agg(nspname || '.' || relname order by nspname || '.' || relname), '{}') from app_tables
    where has_table_privilege('anon', oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or has_any_column_privilege('anon', oid, 'SELECT, INSERT, UPDATE, REFERENCES')),
  '{}'::text[], 'anon holds no privilege on any application table or column');
select is(
  (select coalesce(array_agg(relname::text order by relname::text), '{}') from app_tables
    where nspname = 'private'
      and (has_table_privilege('authenticated', oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
        or has_any_column_privilege('authenticated', oid, 'SELECT, INSERT, UPDATE, REFERENCES'))),
  '{}'::text[], 'authenticated reaches private tables only through the RPCs');
select is(
  (select coalesce(array_agg(relname::text order by relname::text), '{}') from app_tables
    where nspname = 'public' and has_table_privilege('authenticated', oid, 'TRUNCATE, REFERENCES, TRIGGER')),
  '{}'::text[], 'authenticated has no TRUNCATE, REFERENCES or TRIGGER on public tables');

-- ── Policies ────────────────────────────────────────────────────────────────────────────
select is(
  (select coalesce(array_agg(tablename || ': ' || policyname order by tablename || ': ' || policyname), '{}') from pg_policies
    where schemaname in ('public', 'private') and roles <> array['authenticated']::name[] and roles <> array['rubik_audit_writer']::name[]),
  '{}'::text[], 'every policy applies to authenticated only (never anon or public)');
select is(
  (select coalesce(array_agg(tablename || ': ' || policyname order by tablename || ': ' || policyname), '{}') from pg_policies
    where schemaname in ('public', 'private') and cmd in ('UPDATE', 'ALL') and with_check is null),
  '{}'::text[], 'every UPDATE policy carries an explicit WITH CHECK');
select is(
  (select coalesce(array_agg(tablename || ': ' || policyname order by tablename || ': ' || policyname), '{}') from pg_policies
    where schemaname in ('public', 'private') and (coalesce(qual, '') ~* 'user_metadata|raw_user_meta_data'
      or coalesce(with_check, '') ~* 'user_metadata|raw_user_meta_data')),
  '{}'::text[], 'no policy reads user_metadata');
select is(
  (select coalesce(array_agg(nspname || '.' || proname order by nspname || '.' || proname), '{}') from app_functions f
    where f.prosrc ~* 'user_metadata|raw_user_meta_data'),
  '{}'::text[], 'no application function reads user_metadata');

select * from finish();
rollback;
