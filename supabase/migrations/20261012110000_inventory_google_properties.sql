-- Inventory follow-up (ADR 0021): also count the OpenSEO Google property bindings that
-- 20261010160000 added (private.openseo_google_properties) after the inventory was written.
-- Same signature and privileges; CREATE OR REPLACE keeps the existing grants.
create or replace function private.project_data_inventory(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  p public.projects;
begin
  select * into p from public.projects where id = p_project_id;
  if auth.uid() is null or p.id is null or not private.is_org_owner(p.organization_id) then
    raise exception 'Project inventory access denied' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'auditEvents', jsonb_build_object('count', (select count(*) from public.audit_events where project_id = p.id),
      'first', (select min(at) from public.audit_events where project_id = p.id),
      'last', (select max(at) from public.audit_events where project_id = p.id)),
    'providerResults', jsonb_build_object('count', (select count(*) from public.provider_results where project_id = p.id),
      'first', (select min(created_at) from public.provider_results where project_id = p.id),
      'last', (select max(created_at) from public.provider_results where project_id = p.id)),
    'imports', jsonb_build_object('count', (select count(*) from public.imports where project_id = p.id),
      'first', (select min(created_at) from public.imports where project_id = p.id),
      'last', (select max(created_at) from public.imports where project_id = p.id)),
    'projectMembers', (select count(*) from public.project_members where project_id = p.id),
    'organizationMembers', (select count(*) from public.organization_members where organization_id = p.organization_id),
    'invitations', jsonb_build_object(
      'open', (select count(*) from private.project_invitations where project_id = p.id
        and accepted_at is null and revoked_at is null and expires_at > now()),
      'closed', (select count(*) from private.project_invitations where project_id = p.id
        and (accepted_at is not null or revoked_at is not null or expires_at <= now()))),
    'openseoJobs', (select count(*) from private.openseo_project_jobs where project_id = p.id),
    'openseoConnections', (select count(*) from private.openseo_project_connections where project_id = p.id),
    'webmasterProperties', (select count(*) from private.webmaster_properties where project_id = p.id),
    'googleProperties', (select count(*) from private.openseo_google_properties where project_id = p.id),
    'budgets', (select count(*) from private.provider_budgets where project_id = p.id),
    'spendEntries', (select count(*) from private.provider_spend where project_id = p.id),
    'generatedAt', now()
  );
end;
$$;
