-- Automatic RLS event trigger: resulting privileges and behaviour (pgTAP).
-- Migration 20260928150000 leaves public.rls_auto_enable() executable only by its owner, and
-- the `ensure_rls` event trigger still enables RLS on new tables in `public`. Everything
-- runs in a transaction that is rolled back. LOCAL stack only (supabase test db).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ── The function and its event trigger are kept ────────────────────────────────────────
select ok(to_regprocedure('public.rls_auto_enable()') is not null, 'public.rls_auto_enable() exists');
select is((select prosecdef from pg_proc where oid = 'public.rls_auto_enable()'::regprocedure), true,
  'it is still SECURITY DEFINER (it must be able to alter tables created by other roles)');
select is((select pg_get_userbyid(proowner) from pg_proc where oid = 'public.rls_auto_enable()'::regprocedure), 'postgres',
  'it is owned by postgres');
select is((select evtenabled::text from pg_event_trigger where evtname = 'ensure_rls'), 'O', 'the ensure_rls event trigger is enabled');
select is((select evtfoid from pg_event_trigger where evtname = 'ensure_rls'), 'public.rls_auto_enable()'::regprocedure::oid,
  'ensure_rls calls public.rls_auto_enable()');
select is((select evtevent::text from pg_event_trigger where evtname = 'ensure_rls'), 'ddl_command_end', 'ensure_rls fires on ddl_command_end');
select ok((select evttags @> array['CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO'] from pg_event_trigger where evtname = 'ensure_rls'),
  'ensure_rls covers CREATE TABLE, CREATE TABLE AS and SELECT INTO');

-- ── Resulting privileges ────────────────────────────────────────────────────────────────
-- A NULL ACL would mean the default privileges, which include EXECUTE for PUBLIC.
select ok((select proacl is not null from pg_proc where oid = 'public.rls_auto_enable()'::regprocedure), 'the function has an explicit ACL');
select ok(not exists (
  select 1 from pg_proc p, aclexplode(p.proacl) a
  where p.oid = 'public.rls_auto_enable()'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'
), 'PUBLIC cannot execute it');
select ok(not has_function_privilege('anon', 'public.rls_auto_enable()', 'execute'), 'anon cannot execute it');
select ok(not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute'), 'authenticated cannot execute it');
select ok(has_function_privilege('postgres', 'public.rls_auto_enable()', 'execute'), 'the owner keeps EXECUTE');

set local role authenticated;
select throws_ok('select public.rls_auto_enable()', '42501', null, 'authenticated gets permission denied when calling it');
reset role;
set local role anon;
select throws_ok('select public.rls_auto_enable()', '42501', null, 'anon gets permission denied when calling it');
reset role;

-- ── Automatic RLS keeps working ─────────────────────────────────────────────────────────
create table public.rls_probe_plain (id int);
select is((select relrowsecurity from pg_class where oid = 'public.rls_probe_plain'::regclass), true, 'CREATE TABLE in public gets RLS');
create table public.rls_probe_as as select 1 as id;
select is((select relrowsecurity from pg_class where oid = 'public.rls_probe_as'::regclass), true, 'CREATE TABLE AS in public gets RLS');
select 1 as id into public.rls_probe_into;
select is((select relrowsecurity from pg_class where oid = 'public.rls_probe_into'::regclass), true, 'SELECT INTO in public gets RLS');
create table public.rls_probe_parted (id int) partition by range (id);
select is((select relrowsecurity from pg_class where oid = 'public.rls_probe_parted'::regclass), true, 'a partitioned table in public gets RLS');

-- A role that has CREATE on public but no EXECUTE on the function: firing the event trigger
-- does not need EXECUTE, so the revocation does not break automatic RLS for other roles.
create role rls_probe_ddl nologin;
grant usage, create on schema public to rls_probe_ddl;
grant rls_probe_ddl to current_user; -- PG 16+: needed to SET ROLE to a role you created
select ok(not has_function_privilege('rls_probe_ddl', 'public.rls_auto_enable()', 'execute'), 'the probe role has no EXECUTE on the function');
set local role rls_probe_ddl;
create table public.rls_probe_by_other_role (id int);
reset role;
select is((select relrowsecurity from pg_class where oid = 'public.rls_probe_by_other_role'::regclass), true,
  'a table created by a role without EXECUTE still gets RLS');
select is((select pg_get_userbyid(relowner) from pg_class where oid = 'public.rls_probe_by_other_role'::regclass), 'rls_probe_ddl',
  'and that table belongs to the other role');

-- Scope is unchanged: the template only enforces the public schema.
create schema rls_probe_other;
create table rls_probe_other.t (id int);
select is((select relrowsecurity from pg_class where oid = 'rls_probe_other.t'::regclass), false, 'tables outside public are not touched (template scope)');

select * from finish();
rollback;
