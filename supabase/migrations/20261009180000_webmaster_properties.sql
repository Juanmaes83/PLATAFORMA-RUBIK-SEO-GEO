-- Search Console and Bing, read only, phase C (docs/adr/0009-search-console-bing-lectura.md):
-- which Search Console / Bing property belongs to one Rubik project, with the owner's explicit
-- consent (`provider-connection`) and revocation. No credential is stored here: OAuth tokens
-- and keys are phase B and need a decided secret store. Nothing reads this table yet.
create table private.webmaster_properties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  provider text not null check (provider in ('search-console', 'bing-webmaster')),
  site_url text not null check (char_length(site_url) between 1 and 300),
  state text not null check (state in ('ACTIVE', 'REVOKED')),
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  check ((state = 'REVOKED') = (revoked_at is not null and revoked_by is not null))
);
-- One active property per project and provider; one Rubik project per active property, so
-- two clients never read the same property's data through the platform.
create unique index webmaster_one_active_property on private.webmaster_properties(project_id, provider)
  where state = 'ACTIVE';
create unique index webmaster_property_single_owner on private.webmaster_properties(provider, site_url)
  where state = 'ACTIVE';
alter table private.webmaster_properties enable row level security;
revoke all on private.webmaster_properties from public, anon, authenticated;

create function private.webmaster_property(
  p_project_id uuid, p_provider text, p_command text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w private.webmaster_properties;
  p public.projects;
  apex text;
  site text;
begin
  if auth.uid() is null or not private.has_project_role(p_project_id, array['owner']) then
    raise exception 'Webmaster property access denied' using errcode = '42501';
  end if;
  if p_provider is null or p_provider not in ('search-console', 'bing-webmaster')
    or p_command is null or p_command not in ('get', 'connect', 'revoke') then
    raise exception 'Invalid webmaster property command' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('webmaster:' || p_project_id::text || ':' || p_provider, 0));
  select * into w from private.webmaster_properties
    where project_id = p_project_id and provider = p_provider and state = 'ACTIVE';

  if p_command = 'connect' then
    if (p_payload ->> 'consent') is distinct from 'true' then
      raise exception 'Explicit owner consent is required' using errcode = '22023';
    end if;
    select * into strict p from public.projects where id = p_project_id;
    if p.domain is null then
      raise exception 'Project domain is required' using errcode = '22023';
    end if;
    apex := regexp_replace(p.domain, '^www\.', '');
    site := p_payload ->> 'siteUrl';
    -- Search Console: Domain property or https URL-prefix of the domain; Bing: https site root.
    if site is null or not (site in ('https://' || apex || '/', 'https://www.' || apex || '/')
        or (p_provider = 'search-console' and site = 'sc-domain:' || apex)) then
      raise exception 'Property outside the project domain' using errcode = '22023';
    end if;
    if w.id is not null then
      if w.site_url = site then
        null; -- Repeating the same property is idempotent.
      else
        raise exception 'Revoke the active property before replacing it' using errcode = '23514';
      end if;
    else
      begin
        insert into private.webmaster_properties(project_id, organization_id, provider, site_url, state, granted_by)
        values(p.id, p.organization_id, p_provider, site, 'ACTIVE', auth.uid()) returning * into w;
      exception when unique_violation then
        raise exception 'Property already connected to another Rubik project' using errcode = '23505';
      end;
    end if;
  elsif p_command = 'revoke' then
    if w.id is null then
      raise exception 'No active property' using errcode = '22023';
    end if;
    update private.webmaster_properties set state = 'REVOKED', revoked_at = now(), revoked_by = auth.uid()
      where id = w.id returning * into w;
  end if;

  if w.id is null then
    return jsonb_build_object('state', 'NONE', 'provider', p_provider);
  end if;
  return jsonb_build_object('propertyId', w.id, 'provider', w.provider, 'state', w.state, 'siteUrl', w.site_url,
    'grantedAt', w.granted_at, 'revokedAt', w.revoked_at);
end;
$$;

create function public.webmaster_property(
  p_project_id uuid, p_provider text, p_command text, p_payload jsonb default '{}'::jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.webmaster_property(p_project_id, p_provider, p_command, p_payload);
$$;
revoke all on function private.webmaster_property(uuid,text,text,jsonb), public.webmaster_property(uuid,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function private.webmaster_property(uuid,text,text,jsonb), public.webmaster_property(uuid,text,text,jsonb)
  to authenticated;
