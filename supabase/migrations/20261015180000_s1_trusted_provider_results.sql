-- S1: JWT users may read/erase by RLS, but cannot persist arbitrary HMACs.
revoke insert on public.provider_results from public, anon, authenticated;
revoke insert (id, project_id, organization_id, provider, operation, status, captured_at,
  signed_payload, data, data_hash_alg, data_hash, key_id, signature, created_by, created_at)
  on public.provider_results from public, anon, authenticated;
drop policy if exists "drafting roles store provider results" on public.provider_results;

grant select, insert on public.provider_results to rubik_audit_writer;
create policy "dedicated writer reads provider results" on public.provider_results
  for select to rubik_audit_writer using (true);
create policy "dedicated writer stores provider results" on public.provider_results
  for insert to rubik_audit_writer with check (true);
