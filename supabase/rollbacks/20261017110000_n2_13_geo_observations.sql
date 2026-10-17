-- Containment rollback for 20261017110000_n2_13_geo_observations (local; hosted only with explicit owner approval).
-- Closes the GEO module to every API role and keeps all data (observations, verifications,
-- proposals and their reviews) and their audit receipts; pending receipts stay drainable. The
-- widened audit_outbox constraints are kept on purpose (rows with geo.* actions may exist).
-- Dropping the tables is NOT part of this rollback (signed receipts, an export and an owner
-- decision first; see docs/N2-13-GEO.md). Deploy with an application version without /geo.
begin;
revoke all on public.geo_observations, public.geo_proposals from anon, authenticated;
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
      and tablename in ('geo_observations', 'geo_proposals') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
-- RLS stays enabled with no policy: deny by default even if a grant were re-added by mistake.
commit;
