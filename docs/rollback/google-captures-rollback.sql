-- Rollback of 20261012120000_google_captures.sql (ADR 0022). Run only with a backup, then
-- `npx supabase@2.118.0 migration repair --status reverted 20261012120000`. Stored captures stay
-- in public.provider_results (signed, exportable); only the idempotency ledger and the RPC go.
-- Re-applying 20261012110000 restores the inventory function without the capture count.
drop function if exists public.google_capture(uuid, text, jsonb);
drop function if exists private.google_capture_command(uuid, text, jsonb);
drop table if exists private.google_captures;
