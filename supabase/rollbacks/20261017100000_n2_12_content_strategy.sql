-- Containment rollback for 20261017100000_n2_12_content_strategy (local; hosted only with explicit owner approval).
-- Closes the content strategy module to every API role and keeps all data (opportunities,
-- evidence, clusters, briefs with their approvals) and their audit receipts; pending receipts
-- stay drainable by the trusted writer. The widened audit_outbox constraints are kept on
-- purpose: rows with content.* actions may exist and narrowing the check would fail or force
-- deleting evidence. Dropping the tables is NOT part of this rollback (needs signed receipts,
-- an export and an owner decision; see docs/N2-12-CONTENIDOS.md).
-- Deploy together with an application version without the /contenidos section.
begin;
revoke all on public.content_clusters, public.content_opportunities, public.content_evidence, public.content_briefs
  from anon, authenticated;
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
      and tablename in ('content_clusters', 'content_opportunities', 'content_evidence', 'content_briefs') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
-- RLS stays enabled with no policy: deny by default even if a grant were re-added by mistake.
commit;
