-- Manual Google captures (GSC performance, GA4 organic landing pages) through OpenSEO: the unit
-- that follows the property binding (#60), the bounded manual read (#61) and the signed source
-- (#62). This migration is local/CI only until the owner authorizes a hosted application.
--
-- A capture is reserved under an idempotency key BEFORE the provider is called and stored AFTER,
-- in one transaction that re-validates the connection and the property binding and inserts the
-- signed provider_results row. So:
--   - a retry with the same key after a stored capture returns the same result, without calling
--     the provider again;
--   - a revoked connection or binding, or a different binding, between reservation and storage
--     stores nothing;
--   - the signed source context must name the same connection and binding that were reserved.
-- Same audience as the property binding: the project owner. RPC-only; the table has RLS and no
-- privileges, like the other private ledgers.

create table private.google_captures (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  provider text not null check (provider in ('search-console', 'google-analytics')),
  connection_id uuid not null,
  property_binding_id uuid not null references private.openseo_google_properties(id) on delete cascade,
  state text not null check (state in ('RESERVED', 'STORED', 'RELEASED')),
  result_id uuid references public.provider_results(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  reserved_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (project_id, idempotency_key),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  foreign key (connection_id, project_id, organization_id)
    references private.openseo_project_connections(id, project_id, organization_id) on delete cascade,
  check ((state = 'STORED') = (result_id is not null)),
  check ((state = 'RESERVED') = (closed_at is null))
);
create index google_captures_result_idx on private.google_captures(result_id);
create index google_captures_binding_idx on private.google_captures(property_binding_id);
alter table private.google_captures enable row level security;
revoke all on private.google_captures from public, anon, authenticated;

create function private.google_capture_command(p_project_id uuid, p_command text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.projects;
  cap private.google_captures;
  conn private.openseo_project_connections;
  binding private.openseo_google_properties;
  k text := p_payload ->> 'key';
  r jsonb := p_payload -> 'row';
  new_id uuid;
begin
  select * into p from public.projects where id = p_project_id;
  if auth.uid() is null or p.id is null or not private.has_project_role(p.id, array['owner']) then
    raise exception 'Google capture access denied' using errcode = '42501';
  end if;
  if p_command is null or p_command not in ('begin', 'store', 'release') then
    raise exception 'Invalid capture command' using errcode = '22023';
  end if;
  if coalesce(k, '') !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('google_captures:' || p.id::text || ':' || k, 0));
  select * into cap from private.google_captures where project_id = p.id and idempotency_key = k for update;

  if p_command = 'release' then
    if cap.id is not null and cap.state = 'RESERVED' then
      update private.google_captures set state = 'RELEASED', closed_at = now() where id = cap.id;
    end if;
    return jsonb_build_object('state', coalesce(case when cap.state = 'RESERVED' then 'RELEASED' else cap.state end, 'NONE'));
  end if;

  if p_command = 'begin' then
    if cap.id is not null and cap.state = 'STORED' then
      return jsonb_build_object('state', 'STORED', 'resultId', cap.result_id);
    end if;
    -- A live reservation means another request with this key is running. One abandoned for
    -- more than five minutes (a crash between calls) may be taken over.
    if cap.id is not null and cap.state = 'RESERVED' and cap.reserved_at > now() - interval '5 minutes' then
      raise exception 'Capture already in progress' using errcode = '55P03';
    end if;
    if coalesce(p_payload ->> 'provider', '') not in ('search-console', 'google-analytics')
      or coalesce(p_payload ->> 'connectionId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(p_payload ->> 'propertyBindingId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid capture source' using errcode = '22023';
    end if;
    select * into conn from private.openseo_project_connections
      where id = (p_payload ->> 'connectionId')::uuid and project_id = p.id and state = 'ACTIVE';
    select * into binding from private.openseo_google_properties
      where id = (p_payload ->> 'propertyBindingId')::uuid and project_id = p.id and state = 'ACTIVE'
        and provider = p_payload ->> 'provider' and connection_id = conn.id;
    if conn.id is null or binding.id is null then
      raise exception 'Google source not active' using errcode = '55000';
    end if;
    if cap.id is null then
      insert into private.google_captures(project_id, organization_id, idempotency_key, provider, connection_id,
          property_binding_id, state, created_by)
        values (p.id, p.organization_id, k, binding.provider, conn.id, binding.id, 'RESERVED', auth.uid())
        returning * into cap;
    else
      update private.google_captures set provider = binding.provider, connection_id = conn.id,
          property_binding_id = binding.id, state = 'RESERVED', created_by = auth.uid(),
          reserved_at = now(), closed_at = null
        where id = cap.id returning * into cap;
    end if;
    return jsonb_build_object('state', 'RESERVED', 'captureId', cap.id);
  end if;

  -- store
  if cap.id is null or cap.state <> 'RESERVED' then
    raise exception 'No reserved capture for this key' using errcode = '55000';
  end if;
  select * into conn from private.openseo_project_connections where id = cap.connection_id and state = 'ACTIVE';
  select * into binding from private.openseo_google_properties
    where id = cap.property_binding_id and state = 'ACTIVE' and connection_id = cap.connection_id;
  if conn.id is null or binding.id is null then
    raise exception 'Google source changed before storage' using errcode = '55000';
  end if;
  if r is null or jsonb_typeof(r) <> 'object'
    or r ->> 'project_id' is distinct from p.id::text or r ->> 'organization_id' is distinct from p.organization_id::text
    or r ->> 'provider' is distinct from cap.provider
    or r ->> 'operation' is distinct from (case cap.provider when 'search-console' then 'searchAnalytics' else 'report' end)
    or coalesce(r ->> 'status', '') not in ('OK', 'PARTIAL', 'EMPTY')
    or r -> 'signed_payload' -> 'provenance' -> 'sourceContext' ->> 'connectionId' is distinct from cap.connection_id::text
    or r -> 'signed_payload' -> 'provenance' -> 'sourceContext' ->> 'propertyBindingId' is distinct from cap.property_binding_id::text then
    raise exception 'Capture does not match its reservation' using errcode = '22023';
  end if;
  insert into public.provider_results(project_id, organization_id, provider, operation, status, captured_at,
      signed_payload, data, data_hash_alg, data_hash, key_id, signature, created_by)
    values (p.id, p.organization_id, r ->> 'provider', r ->> 'operation', r ->> 'status',
      (r ->> 'captured_at')::timestamptz, r -> 'signed_payload', r -> 'data', r ->> 'data_hash_alg',
      r ->> 'data_hash', r ->> 'key_id', r ->> 'signature', auth.uid())
    returning id into new_id;
  update private.google_captures set state = 'STORED', result_id = new_id, closed_at = now() where id = cap.id;
  return jsonb_build_object('state', 'STORED', 'resultId', new_id);
end;
$$;

create function public.google_capture(p_project_id uuid, p_command text, p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.google_capture_command(p_project_id, p_command, p_payload);
$$;
revoke all on function private.google_capture_command(uuid, text, jsonb), public.google_capture(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function private.google_capture_command(uuid, text, jsonb), public.google_capture(uuid, text, jsonb)
  to authenticated;

-- The data inventory (ADR 0021) also counts the capture ledger.
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
    'googleCaptures', (select count(*) from private.google_captures where project_id = p.id),
    'budgets', (select count(*) from private.provider_budgets where project_id = p.id),
    'spendEntries', (select count(*) from private.provider_spend where project_id = p.id),
    'generatedAt', now()
  );
end;
$$;
