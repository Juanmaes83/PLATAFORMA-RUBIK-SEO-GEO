-- Rollback of 20261012130000_google_recovery_state.sql. Run only with a backup, then
-- `npx supabase@2.118.0 migration repair --status reverted 20261012130000`. Functions only: no
-- data is dropped. Exports made afterwards report operations.google as unavailable and the
-- restore plan restores no Google state from them.
drop function if exists public.google_recovery_state(uuid);
drop function if exists private.google_recovery_state(uuid);
