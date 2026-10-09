-- Project people and data inventory (Entrega E4, decision D3 of docs/RETENCION-Y-BORRADO.md).
--
-- D3: a person leaves by losing access, never by deleting their account. Organization owners list
-- the people of a project and withdraw one: their project membership goes, their organization
-- membership goes too when it was their last project there, and the open invitations for their
-- address in this project are revoked. Owners cannot be withdrawn here (no lockout, no change of
-- ownership); the Auth account and every row they authored stay as they are.
--
-- Inventory: read-only counts of what the project holds in each table, for an access request.
--
-- Both are RPC-only for organization owners: the same people the tenancy policies already allow to
-- remove members. Errors carry no stored values.

create function private.project_people_command(p_project_id uuid, p_command text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.projects;
  target_role text;
  target_org_role text;
  target_email text;
  left_org boolean := false;
  revoked integer := 0;
begin
  select * into p from public.projects where id = p_project_id;
  if auth.uid() is null or p.id is null or not private.is_org_owner(p.organization_id) then
    raise exception 'Project people access denied' using errcode = '42501';
  end if;
  if p_command is null or p_command not in ('list', 'remove') then
    raise exception 'Invalid people command' using errcode = '22023';
  end if;

  if p_command = 'remove' then
    if coalesce(p_payload ->> 'userId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid person reference' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('project_people:' || p.organization_id::text, 0));
    select pm.role, om.role into target_role, target_org_role
      from public.project_members pm
      join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id
      where pm.project_id = p.id and pm.user_id = (p_payload ->> 'userId')::uuid;
    if target_role is null then
      raise exception 'Not a member of this project' using errcode = 'P0002';
    end if;
    -- Owners (of the project or the organization) are never withdrawn here.
    if target_role = 'owner' or target_org_role = 'owner' then
      raise exception 'Owners cannot be withdrawn' using errcode = '23514';
    end if;
    delete from public.project_members where project_id = p.id and user_id = (p_payload ->> 'userId')::uuid;
    if not exists (select 1 from public.project_members
        where organization_id = p.organization_id and user_id = (p_payload ->> 'userId')::uuid) then
      delete from public.organization_members
        where organization_id = p.organization_id and user_id = (p_payload ->> 'userId')::uuid and role = 'member';
      left_org := found;
    end if;
    select lower(u.email) into target_email from auth.users u where u.id = (p_payload ->> 'userId')::uuid;
    if target_email is not null then
      update private.project_invitations set revoked_at = now()
        where project_id = p.id and email = target_email and accepted_at is null and revoked_at is null;
      get diagnostics revoked = row_count;
    end if;
    return jsonb_build_object('removed', true, 'leftOrganization', left_org, 'revokedInvitations', revoked);
  end if;

  -- list: everyone in the project, owners first; the address only for the organization's owners.
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'userId', pm.user_id, 'email', u.email, 'role', pm.role, 'organizationRole', om.role,
      'since', pm.created_at, 'isSelf', pm.user_id = auth.uid())
      order by (pm.role = 'owner') desc, pm.created_at, pm.user_id)
    from public.project_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id
    left join auth.users u on u.id = pm.user_id
    where pm.project_id = p.id
  ), '[]'::jsonb);
end;
$$;

create function private.project_data_inventory(p_project_id uuid)
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
    'budgets', (select count(*) from private.provider_budgets where project_id = p.id),
    'spendEntries', (select count(*) from private.provider_spend where project_id = p.id),
    'generatedAt', now()
  );
end;
$$;

create function public.project_people(p_project_id uuid, p_command text, p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.project_people_command(p_project_id, p_command, p_payload);
$$;
create function public.project_data_inventory(p_project_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.project_data_inventory(p_project_id);
$$;
revoke all on function private.project_people_command(uuid, text, jsonb), public.project_people(uuid, text, jsonb),
  private.project_data_inventory(uuid), public.project_data_inventory(uuid) from public, anon, authenticated;
grant execute on function private.project_people_command(uuid, text, jsonb), public.project_people(uuid, text, jsonb),
  private.project_data_inventory(uuid), public.project_data_inventory(uuid) to authenticated;
