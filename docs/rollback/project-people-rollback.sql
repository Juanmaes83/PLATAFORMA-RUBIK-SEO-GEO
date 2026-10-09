-- Rollback of 20261012100000_project_people_and_inventory.sql (ADR 0021). Run only with a backup,
-- then `npx supabase@2.118.0 migration repair --status reverted 20261012100000`. It must run BEFORE
-- rolling back 20261012090000 (invitations), because the withdrawal revokes open invitations.
-- No data is dropped: these are functions only. Withdrawals already made stay made.
drop function if exists public.project_people(uuid, text, jsonb);
drop function if exists public.project_data_inventory(uuid);
drop function if exists private.project_people_command(uuid, text, jsonb);
drop function if exists private.project_data_inventory(uuid);
