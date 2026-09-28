-- Least privilege for the automatic-RLS event trigger function public.rls_auto_enable().
--
-- Origin: the function and its event trigger `ensure_rls` are NOT created by this repository.
-- Supabase Studio creates them when "automatically enable RLS" is chosen at project creation
-- or from the dashboard notice, using the template AUTO_ENABLE_RLS_EVENT_TRIGGER_SQL
-- (supabase/fixtures/studio-rls-auto-enable.sql reproduces it verbatim).
-- That template:
--   * creates the function in `public` as SECURITY DEFINER, owned by `postgres`;
--   * revokes nothing, so PUBLIC and, through the schema's default privileges, anon,
--     authenticated and service_role can EXECUTE it.
-- The hosted project's security advisor flags this. Nobody needs to call the function: it runs
-- only as an event trigger, and firing an event trigger does not check EXECUTE on its
-- function (supabase/tests/rls_auto_enable.test.sql proves it for a role without EXECUTE).
--
-- What this migration does:
--   1. Keeps an existing function and event trigger exactly as they are (hosted project).
--   2. Creates them, with the same Studio template, only where they do not exist, so the
--      local stack and CI behave like the hosted project.
--   3. Revokes EXECUTE from PUBLIC, anon and authenticated. The owner (postgres) keeps it.
--
-- Idempotent: it can be applied again without changing anything. Applied to the hosted
-- project only by the owner, with the versioned CLI flow (docs/SETUP-SUPABASE.md §5).

do $migration$
begin
  if to_regprocedure('public.rls_auto_enable()') is null then
    -- Same body as the Studio template (errors are logged, not raised).
    create function public.rls_auto_enable()
    returns event_trigger
    language plpgsql
    security definer
    set search_path = pg_catalog
    as $fn$
    declare
      cmd record;
    begin
      for cmd in
        select *
        from pg_event_trigger_ddl_commands()
        where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
          and object_type in ('table', 'partitioned table')
      loop
        if cmd.schema_name is not null and cmd.schema_name in ('public') and cmd.schema_name not in ('pg_catalog', 'information_schema') and cmd.schema_name not like 'pg_toast%' and cmd.schema_name not like 'pg_temp%' then
          begin
            execute format('alter table if exists %s enable row level security', cmd.object_identity);
            raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
          exception
            when others then
              raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
          end;
        else
          raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
        end if;
      end loop;
    end;
    $fn$;
  end if;

  if not exists (select 1 from pg_catalog.pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls
      on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  end if;
end
$migration$;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
