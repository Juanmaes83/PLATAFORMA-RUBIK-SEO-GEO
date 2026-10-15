-- Containment rollback for 20261016100000 (local; hosted only with explicit owner approval).
-- Closes the competitor module to every API role and keeps all data: competitors,
-- observations and their audit receipts (pending receipts stay drainable by the writer).
-- The widened audit_outbox constraints are kept on purpose: rows with competitor.* actions may
-- already exist and narrowing the check would fail or force deleting evidence.
-- Dropping the tables is NOT part of this rollback: it requires every competitor receipt to be
-- signed, an export of the data and an explicit owner decision (see docs/N2-11-COMPETIDORES.md).
-- Deploy together with an application version without the /competidores section.
begin;
revoke all on public.competitors, public.competitor_observations from anon, authenticated;
drop policy if exists "project members read competitors" on public.competitors;
drop policy if exists "drafting roles add competitors" on public.competitors;
drop policy if exists "drafting roles edit competitors" on public.competitors;
drop policy if exists "project owners erase competitors" on public.competitors;
drop policy if exists "project members read observations" on public.competitor_observations;
drop policy if exists "drafting roles record observations" on public.competitor_observations;
drop policy if exists "fact approvers verify observations" on public.competitor_observations;
drop policy if exists "project owners erase observations" on public.competitor_observations;
-- RLS stays enabled with no policy: deny by default even if a grant were re-added by mistake.
commit;
