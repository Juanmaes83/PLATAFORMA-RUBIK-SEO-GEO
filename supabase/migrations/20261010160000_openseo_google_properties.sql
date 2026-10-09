-- Explicit OpenSEO Google property binding, independent of the crawl destination mode.
-- Existing webmaster_properties remains unchanged: it represents a domain-matched
-- direct GSC/Bing mapping and cannot represent GA4 or an owner-authorized .es/.com pair.
-- This migration is local/CI only until the owner authorizes a hosted application.
create unique index openseo_connection_scope_identity
  on private.openseo_project_connections(id, project_id, organization_id);

create table private.openseo_google_properties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  connection_id uuid not null,
  provider text not null check (provider in ('search-console', 'google-analytics')),
  external_property_id text not null check (char_length(external_property_id) between 1 and 300),
  state text not null check (state in ('ACTIVE', 'REVOKED')),
  source text not null default 'OWNER_DECLARED' check (source = 'OWNER_DECLARED'),
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  foreign key (connection_id, project_id, organization_id)
    references private.openseo_project_connections(id, project_id, organization_id) on delete cascade,
  check ((state = 'REVOKED') = (revoked_by is not null and revoked_at is not null)),
  check (
    (provider = 'google-analytics' and external_property_id ~ '^properties/[0-9]{1,20}$')
    or (provider = 'search-console' and
      (external_property_id ~ '^sc-domain:[a-z0-9.-]+$'
       or external_property_id ~ '^https://[a-z0-9.-]+/$'))
  )
);
create unique index openseo_google_one_active_property
  on private.openseo_google_properties(project_id, provider) where state = 'ACTIVE';
create index openseo_google_connection_idx on private.openseo_google_properties(connection_id);
alter table private.openseo_google_properties enable row level security;
revoke all on private.openseo_google_properties from public, anon, authenticated;

create function private.guard_openseo_google_property_history() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(old.id, old.project_id, old.organization_id, old.connection_id, old.provider,
         old.external_property_id, old.source, old.granted_by, old.granted_at)
     is distinct from
     row(new.id, new.project_id, new.organization_id, new.connection_id, new.provider,
         new.external_property_id, new.source, new.granted_by, new.granted_at)
     or old.state <> 'ACTIVE' or new.state <> 'REVOKED' then
    raise exception 'Google property history is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger openseo_google_property_history before update on private.openseo_google_properties
  for each row execute function private.guard_openseo_google_property_history();
revoke execute on function private.guard_openseo_google_property_history() from public, anon, authenticated;

create function private.openseo_google_property(
  p_project_id uuid, p_provider text, p_command text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  binding private.openseo_google_properties;
  conn private.openseo_project_connections;
  external_id text;
begin
  if auth.uid() is null or not private.has_project_role(p_project_id, array['owner']) then
    raise exception 'Google property access denied' using errcode = '42501';
  end if;
  if p_provider is null or p_provider not in ('search-console', 'google-analytics')
    or p_command is null or p_command not in ('get', 'connect', 'revoke') then
    raise exception 'Invalid Google property command' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('openseo-google:' || p_project_id::text || ':' || p_provider, 0));
  select * into binding from private.openseo_google_properties
    where project_id = p_project_id and provider = p_provider and state = 'ACTIVE';

  if p_command = 'connect' then
    if (p_payload ->> 'consent') is distinct from 'true' then
      raise exception 'Explicit owner consent is required' using errcode = '22023';
    end if;
    select * into conn from private.openseo_project_connections
      where project_id = p_project_id and state = 'ACTIVE';
    if conn.id is null then
      raise exception 'Active OpenSEO connection required' using errcode = '23514';
    end if;
    external_id := p_payload ->> 'externalPropertyId';
    if external_id is null or not (
      (p_provider = 'google-analytics' and external_id ~ '^properties/[0-9]{1,20}$')
      or (p_provider = 'search-console' and
        (external_id ~ '^sc-domain:[a-z0-9.-]+$' or external_id ~ '^https://[a-z0-9.-]+/$'))
    ) then
      raise exception 'Invalid external property' using errcode = '22023';
    end if;
    if binding.id is not null then
      if binding.external_property_id <> external_id or binding.connection_id <> conn.id then
        raise exception 'Revoke the active property before replacing it' using errcode = '23514';
      end if;
    else
      insert into private.openseo_google_properties(project_id, organization_id, connection_id,
        provider, external_property_id, state, granted_by)
      values(p_project_id, conn.organization_id, conn.id, p_provider, external_id, 'ACTIVE', auth.uid())
      returning * into binding;
    end if;
  elsif p_command = 'revoke' then
    if binding.id is null then
      raise exception 'No active Google property' using errcode = '22023';
    end if;
    update private.openseo_google_properties set state = 'REVOKED', revoked_by = auth.uid(), revoked_at = now()
      where id = binding.id returning * into binding;
  end if;

  if binding.id is null then
    return jsonb_build_object('state', 'NONE', 'provider', p_provider);
  end if;
  return jsonb_build_object('propertyId', binding.id, 'provider', binding.provider,
    'externalPropertyId', binding.external_property_id, 'connectionId', binding.connection_id,
    'state', binding.state, 'source', binding.source,
    'grantedAt', binding.granted_at, 'revokedAt', binding.revoked_at);
end;
$$;

create function public.openseo_google_property(
  p_project_id uuid, p_provider text, p_command text, p_payload jsonb default '{}'::jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.openseo_google_property(p_project_id, p_provider, p_command, p_payload);
$$;
revoke all on function private.openseo_google_property(uuid,text,text,jsonb),
  public.openseo_google_property(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function private.openseo_google_property(uuid,text,text,jsonb),
  public.openseo_google_property(uuid,text,text,jsonb) to authenticated;
