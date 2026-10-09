-- Rollback of 20261010090000_provider_budget_ledger.sql. Run only with a backup, then
-- `npx supabase@2.118.0 migration repair --status reverted 20261010090000`.
-- Drops the budgets and the spend history of every project.
drop function if exists public.provider_budget(uuid, text, text, jsonb);
drop function if exists private.provider_budget(uuid, text, text, jsonb);
drop table if exists private.provider_spend;
drop table if exists private.provider_budgets;
