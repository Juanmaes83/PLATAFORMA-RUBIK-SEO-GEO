-- Project invitations by single-use link (ADR 0011). The platform sends no email: the organization
-- owner copies the link and delivers it by their own means. Each invitation is bound to one email
-- address, one project and one non-owner role, expires after seven days and works once. Only the
-- SHA-256 of the token is stored; the token itself is returned once, at creation. RPC-only: the
-- table has RLS and no privileges, like the other private ledgers.
create table private.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  email text not null check (email = lower(email) and email ~ '^[^@\s]{1,64}@[^@\s]{1,255}$'),
  role text not null check (role in ('account-manager', 'analyst', 'client-approver', 'viewer')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null),
  check (accepted_by is null or accepted_at is not null)
);
-- One open invitation per address and project: a second one must wait for revocation or expiry.
create unique index project_invitations_open on private.project_invitations(project_id, email)
  where accepted_at is null and revoked_at is null;
alter table private.project_invitations enable row level security;
revoke all on private.project_invitations from public, anon, authenticated;

-- Organization owners manage the invitations of their projects: the same people the tenancy
-- policies allow to add project members. Errors carry no stored values.
create function private.project_invitation_command(p_project_id uuid, p_command text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.projects;
  inv private.project_invitations;
  token text;
  open_count integer;
begin
  select * into p from public.projects where id = p_project_id;
  if auth.uid() is null or p.id is null or not private.is_org_owner(p.organization_id) then
    raise exception 'Project invitations access denied' using errcode = '42501';
  end if;
  if p_command is null or p_command not in ('list', 'create', 'revoke') then
    raise exception 'Invalid invitation command' using errcode = '22023';
  end if;

  if p_command = 'create' then
    if coalesce(p_payload ->> 'email', '') !~ '^[^@\s]{1,64}@[^@\s]{1,255}$'
      or coalesce(p_payload ->> 'role', '') not in ('account-manager', 'analyst', 'client-approver', 'viewer') then
      raise exception 'Invalid invitation' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('project_invitations:' || p.id::text, 0));
    select count(*) into open_count from private.project_invitations
      where project_id = p.id and accepted_at is null and revoked_at is null and expires_at > now();
    if open_count >= 50 then
      raise exception 'Too many open invitations' using errcode = '23514';
    end if;
    -- Expired open invitations for the same address no longer block a new one.
    update private.project_invitations set revoked_at = now()
      where project_id = p.id and email = lower(p_payload ->> 'email')
        and accepted_at is null and revoked_at is null and expires_at <= now();
    -- 244 random bits from two v4 UUIDs (core PostgreSQL, no extension).
    token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    begin
      insert into private.project_invitations(project_id, organization_id, email, role, token_hash, created_by, expires_at)
        values (p.id, p.organization_id, lower(p_payload ->> 'email'), p_payload ->> 'role',
          encode(sha256(convert_to(token, 'UTF8')), 'hex'), auth.uid(), now() + interval '7 days')
        returning * into inv;
    exception when unique_violation then
      raise exception 'An open invitation already exists for this address' using errcode = '23505';
    end;
    return jsonb_build_object('invitationId', inv.id, 'token', token, 'expiresAt', inv.expires_at);

  elsif p_command = 'revoke' then
    if coalesce(p_payload ->> 'invitationId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid invitation reference' using errcode = '22023';
    end if;
    update private.project_invitations set revoked_at = now()
      where id = (p_payload ->> 'invitationId')::uuid and project_id = p.id and accepted_at is null and revoked_at is null
      returning * into inv;
    if inv.id is null then
      raise exception 'No open invitation' using errcode = '22023';
    end if;
    return jsonb_build_object('invitationId', inv.id, 'revokedAt', inv.revoked_at);
  end if;

  -- list: the latest 100, never the hash.
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'invitationId', i.id, 'email', i.email, 'role', i.role, 'createdAt', i.created_at, 'expiresAt', i.expires_at,
      'state', case when i.accepted_at is not null then 'ACCEPTED' when i.revoked_at is not null then 'REVOKED'
        when i.expires_at <= now() then 'EXPIRED' else 'OPEN' end,
      'acceptedAt', i.accepted_at) order by i.created_at desc, i.id)
    from (select * from private.project_invitations where project_id = p.id order by created_at desc, id limit 100) i
  ), '[]'::jsonb);
end;
$$;

-- Any signed-in person can try a token, but it only works for the confirmed address it was issued
-- to. Unknown, expired, revoked, used and other-address tokens fail with the same error, so the
-- endpoint reveals nothing about which invitations exist.
create function private.accept_project_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  inv private.project_invitations;
  me auth.users;
  p public.projects;
  o public.organizations;
begin
  if auth.uid() is null then
    raise exception 'Sign in to accept an invitation' using errcode = '42501';
  end if;
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation' using errcode = 'P0002';
  end if;
  select * into inv from private.project_invitations
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  select * into me from auth.users where id = auth.uid();
  if inv.id is null or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at <= now()
    or me.id is null or me.email_confirmed_at is null or lower(me.email) <> inv.email then
    raise exception 'Invalid invitation' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.project_members where project_id = inv.project_id and user_id = me.id) then
    raise exception 'Already a member of this project' using errcode = '23505';
  end if;
  insert into public.organization_members(organization_id, user_id, role)
    values (inv.organization_id, me.id, 'member') on conflict (organization_id, user_id) do nothing;
  insert into public.project_members(project_id, organization_id, user_id, role)
    values (inv.project_id, inv.organization_id, me.id, inv.role);
  update private.project_invitations set accepted_at = now(), accepted_by = me.id where id = inv.id;
  select * into p from public.projects where id = inv.project_id;
  select * into o from public.organizations where id = inv.organization_id;
  return jsonb_build_object('tenantId', o.slug, 'projectId', p.slug, 'role', inv.role);
end;
$$;

create function public.project_invitations(p_project_id uuid, p_command text, p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.project_invitation_command(p_project_id, p_command, p_payload);
$$;
create function public.accept_project_invitation(p_token text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.accept_project_invitation(p_token);
$$;
revoke all on function private.project_invitation_command(uuid, text, jsonb), public.project_invitations(uuid, text, jsonb),
  private.accept_project_invitation(text), public.accept_project_invitation(text) from public, anon, authenticated;
grant execute on function private.project_invitation_command(uuid, text, jsonb), public.project_invitations(uuid, text, jsonb),
  private.accept_project_invitation(text), public.accept_project_invitation(text) to authenticated;
