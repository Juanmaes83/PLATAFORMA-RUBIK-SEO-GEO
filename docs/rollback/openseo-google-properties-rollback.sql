-- Rollback of 20261010160000_openseo_google_properties.sql.
-- Run only after a backup and only after every dependent migration has been undone:
-- 20261012120000 (google_captures), 20261012110000 (inventory replacement) and
-- 20261012100000 (project inventory), in that reverse-order rollback sequence.
-- This removes the owner-declared GSC/GA4 associations and their history; it never removes
-- signed provider_results. Afterwards run:
-- npx --yes supabase@2.118.0 migration repair --status reverted 20261010160000
begin;
drop function if exists public.openseo_google_property(uuid, text, text, jsonb);
drop function if exists private.openseo_google_property(uuid, text, text, jsonb);
drop table if exists private.openseo_google_properties;
drop function if exists private.guard_openseo_google_property_history();
drop index if exists private.openseo_connection_scope_identity;
commit;
