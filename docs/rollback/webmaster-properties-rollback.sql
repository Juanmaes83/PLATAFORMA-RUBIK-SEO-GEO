-- Rollback of 20261009180000_webmaster_properties (ADR 0009, phase C). NOT a migration: the
-- owner runs it only if that migration must be undone on the hosted project, after a backup.
-- It removes stored property mappings (no credentials ever lived there). Afterwards run
-- `supabase migration repair --status reverted 20261009180000`. Tested on a local
-- supabase/postgres container: every other pgTAP suite still passes afterwards.
begin;
drop function public.webmaster_property(uuid, text, text, jsonb);
drop function private.webmaster_property(uuid, text, text, jsonb);
drop table private.webmaster_properties;
commit;
