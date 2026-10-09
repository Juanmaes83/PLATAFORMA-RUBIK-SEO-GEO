-- Rollback of 20261012100000_project_people_and_inventory.sql (ADR 0021). Run only with a backup,
-- then `npx supabase@2.118.0 migration repair --status reverted 20261012100000`. It must run BEFORE
-- rolling back 20261012090000 (invitations), because the withdrawal revokes open invitations.
-- 20261012110000 only replaces private.project_data_inventory, so these drops also undo it; mark both
-- reverted (20261012110000 first). No data is dropped: these are functions only. Withdrawals already made stay made.
drop function if exists public.project_people(uuid, text, jsonb);
drop function if exists public.project_data_inventory(uuid);
drop function if exists private.project_people_command(uuid, text, jsonb);
drop function if exists private.project_data_inventory(uuid);
