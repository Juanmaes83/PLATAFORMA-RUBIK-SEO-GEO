-- OpenSEO multi-client, phase 1 (docs/OPENSEO-MULTITENANT.md): which OpenSEO project and
-- audit hosts belong to one Rubik project, with the owner's explicit consent and revocation.
-- No secret is stored here. `credential_mode = 'platform'` means the server-side
-- OPENSEO_API_KEY of the Rubik account is used; per-client keys are a later phase that
-- needs a decided secret store and will extend this check through a new migration.
-- Nothing reads this table yet: run/follow keep the global configuration until phase 4.
create table private.openseo_project_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  state text not null check (state in ('ACTIVE', 'REVOKED')),
  credential_mode text not null default 'platform' check (credential_mode in ('platform')),
  openseo_project_id text not null check (openseo_project_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  allowed_hosts text[] not null check (cardinality(allowed_hosts) between 1 and 2),
  granted_by uuid not null references auth.users(id),
  granted_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  check ((state = 'REVOKED') = (revoked_at is not null and revoked_by is not null))
);
-- One active connection per Rubik project, and one Rubik project per OpenSEO project:
-- with a shared platform key, two clients mapped to the same OpenSEO project would see
-- each other's audits. Revoked rows stay as history.
create unique index openseo_one_active_connection on private.openseo_project_connections(project_id)
  where state = 'ACTIVE';
create unique index openseo_provider_project_single_owner on private.openseo_project_connections(openseo_project_id)
  where state = 'ACTIVE';
alter table private.openseo_project_connections enable row level security;
revoke all on private.openseo_project_connections from public, anon, authenticated;

-- Same pattern as private.openseo_job: DEFINER in the unexposed schema, empty search_path,
-- project owner checked before any lookup. Errors carry no stored values.
create function private.openseo_connection(
  p_project_id uuid, p_command text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c private.openseo_project_connections;
  p public.projects;
  hosts text[];
  host text;
  apex text;
begin
  if auth.uid() is null or not private.has_project_role(p_project_id, array['owner']) then
    raise exception 'OpenSEO project access denied' using errcode = '42501';
  end if;
  if p_command is null or p_command not in ('get', 'connect', 'revoke') then
    raise exception 'Invalid OpenSEO connection command' using errcode = '22023';
  end if;
  -- Serializes connect/revoke with each other and with private.openseo_job for this project.
  perform pg_advisory_xact_lock(hashtextextended('openseo_job:' || p_project_id::text, 0));
  select * into c from private.openseo_project_connections
    where project_id = p_project_id and state = 'ACTIVE';

  if p_command = 'connect' then
    if (p_payload ->> 'consent') is distinct from 'true' then
      raise exception 'Explicit owner consent is required' using errcode = '22023';
    end if;
    if jsonb_typeof(p_payload -> 'allowedHosts') is distinct from 'array'
      or coalesce(p_payload ->> 'openseoProjectId', '') !~ '^[A-Za-z0-9_-]{1,100}$' then
      raise exception 'Invalid OpenSEO connection' using errcode = '22023';
    end if;
    select * into strict p from public.projects where id = p_project_id;
    if p.domain is null then
      raise exception 'Project domain is required before connecting OpenSEO' using errcode = '22023';
    end if;
    -- Only the project's own domain and its www/apex companion may be audited.
    apex := regexp_replace(p.domain, '^www\.', '');
    select array_agg(distinct v order by v) into hosts
      from jsonb_array_elements_text(p_payload -> 'allowedHosts') as v;
    if hosts is null or cardinality(hosts) > 2 then
      raise exception 'Invalid OpenSEO connection' using errcode = '22023';
    end if;
    foreach host in array hosts loop
      if host is null or host not in (apex, 'www.' || apex) then
        raise exception 'Audit host outside the project domain' using errcode = '22023';
      end if;
    end loop;
    if c.id is not null then
      if c.openseo_project_id = p_payload ->> 'openseoProjectId' and c.allowed_hosts = hosts then
        null; -- Repeating the same connection is idempotent.
      else
        raise exception 'Revoke the active OpenSEO connection before replacing it' using errcode = '23514';
      end if;
    else
      begin
        insert into private.openseo_project_connections(project_id, organization_id, state,
          openseo_project_id, allowed_hosts, granted_by)
        values(p.id, p.organization_id, 'ACTIVE', p_payload ->> 'openseoProjectId', hosts, auth.uid())
        returning * into c;
      exception when unique_violation then
        raise exception 'OpenSEO project already connected to another Rubik project' using errcode = '23505';
      end;
    end if;
  elsif p_command = 'revoke' then
    if c.id is null then
      raise exception 'No active OpenSEO connection' using errcode = '22023';
    end if;
    -- A running crawl must be reconciled first, or its results could never be followed.
    if exists (select 1 from private.openseo_project_jobs
        where project_id = p_project_id and state in ('STARTING', 'SYNCING')) then
      raise exception 'An OpenSEO job is still active in this project' using errcode = '23514';
    end if;
    update private.openseo_project_connections set state = 'REVOKED', revoked_at = now(),
      revoked_by = auth.uid() where id = c.id returning * into c;
  end if;

  if c.id is null then
    return jsonb_build_object('state', 'NONE');
  end if;
  return jsonb_build_object('connectionId', c.id, 'state', c.state, 'credentialMode', c.credential_mode,
    'openseoProjectId', c.openseo_project_id, 'allowedHosts', to_jsonb(c.allowed_hosts),
    'grantedAt', c.granted_at, 'revokedAt', c.revoked_at);
end;
$$;

create function public.openseo_connection(
  p_project_id uuid, p_command text, p_payload jsonb default '{}'::jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.openseo_connection(p_project_id, p_command, p_payload);
$$;
revoke all on function private.openseo_connection(uuid,text,jsonb),
  public.openseo_connection(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function private.openseo_connection(uuid,text,jsonb),
  public.openseo_connection(uuid,text,jsonb) to authenticated;
