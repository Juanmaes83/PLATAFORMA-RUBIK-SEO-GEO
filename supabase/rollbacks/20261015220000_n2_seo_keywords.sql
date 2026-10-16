-- N2-09 containment rollback. Preserve rows, relationships, and pending signed-audit receipts.
-- Run in a transaction only with an authorized change window. Re-enable only after schema review.
begin;
revoke all on public.seo_keywords from public, anon, authenticated;
drop policy if exists "project members read keywords" on public.seo_keywords;
drop policy if exists "drafting roles create keywords" on public.seo_keywords;
drop policy if exists "drafting roles edit keywords" on public.seo_keywords;
drop policy if exists "project owners erase keywords" on public.seo_keywords;
-- Keep table, trigger, rows and the widened outbox constraints. RLS with no policies denies API access.
commit;
