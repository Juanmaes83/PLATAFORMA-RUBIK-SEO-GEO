-- TEST FIXTURE, not a migration. It reproduces LOCALLY the state that Supabase Studio leaves in
-- a hosted project when "automatically enable RLS" is chosen: at project creation
-- (ProjectCreationForm, enableRlsEventTrigger) or from the notice in the dashboard. Both run
-- the same template, AUTO_ENABLE_RLS_EVENT_TRIGGER_SQL, copied verbatim below from
-- supabase/supabase apps/studio/components/interfaces/Database/Triggers/EventTriggersList/
-- EventTriggers.constants.ts (commit c569a29c26d03b084e8162f1c393d18bd9a17734, 28/09/2026).
-- The template creates the function in `public` as SECURITY DEFINER and revokes nothing, so
-- PUBLIC (and, through the schema's default privileges, anon and authenticated) can execute it.
--
-- Used by CI (and locally) to check that migration 20260928150000 fixes that state:
--   docker exec -i supabase_db_plataforma-rubik-seo-geo psql -U postgres -v ON_ERROR_STOP=1 < this file
-- followed by re-running that migration and the pgTAP suite. Never run it against the hosted project.

-- Event trigger: ensure_rls
CREATE OR REPLACE FUNCTION rls_auto_enable()
RETURNS EVENT_TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
EXECUTE FUNCTION rls_auto_enable();
