-- Recovery of the Google state of a project (ROADMAP «1 · Recuperación del piloto», closes the gap
-- that export v2 declared in operations.notIncluded since #69). The export reads, for the project
-- owner only, every OpenSEO connection (revoked history included), every Google property binding
-- (revoked included) and every STORED capture of the ledger. Nothing here is secret: connections
-- hold the OpenSEO project id and allowed hosts, never a key (credential_mode = 'platform').
-- Read-only; the restore plan writes these rows back only when they agree with the signed results.

create function private.google_recovery_state(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  p public.projects;
begin
  select * into p from public.projects where id = p_project_id;
  if auth.uid() is null or p.id is null or not private.has_project_role(p.id, array['owner']) then
    raise exception 'Google recovery state access denied' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'connections', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'project_id', c.project_id, 'organization_id', c.organization_id, 'state', c.state,
        'credential_mode', c.credential_mode, 'openseo_project_id', c.openseo_project_id, 'allowed_hosts', c.allowed_hosts,
        'granted_by', c.granted_by, 'granted_at', c.granted_at, 'revoked_by', c.revoked_by, 'revoked_at', c.revoked_at)
        order by c.granted_at, c.id)
      from private.openseo_project_connections c where c.project_id = p.id), '[]'::jsonb),
    'bindings', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'project_id', g.project_id, 'organization_id', g.organization_id, 'connection_id', g.connection_id,
        'provider', g.provider, 'external_property_id', g.external_property_id, 'state', g.state, 'source', g.source,
        'granted_by', g.granted_by, 'granted_at', g.granted_at, 'revoked_by', g.revoked_by, 'revoked_at', g.revoked_at)
        order by g.granted_at, g.id)
      from private.openseo_google_properties g where g.project_id = p.id), '[]'::jsonb),
    -- Only stored captures: a reserved or released key holds no result and is safe to lose.
    'captures', coalesce((select jsonb_agg(jsonb_build_object(
        'id', k.id, 'project_id', k.project_id, 'organization_id', k.organization_id, 'idempotency_key', k.idempotency_key,
        'provider', k.provider, 'connection_id', k.connection_id, 'property_binding_id', k.property_binding_id,
        'state', k.state, 'result_id', k.result_id, 'created_by', k.created_by, 'created_at', k.created_at,
        'reserved_at', k.reserved_at, 'closed_at', k.closed_at)
        order by k.created_at, k.id)
      from private.google_captures k where k.project_id = p.id and k.state = 'STORED'), '[]'::jsonb)
  );
end;
$$;

create function public.google_recovery_state(p_project_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.google_recovery_state(p_project_id);
$$;
revoke all on function private.google_recovery_state(uuid), public.google_recovery_state(uuid) from public, anon, authenticated;
grant execute on function private.google_recovery_state(uuid), public.google_recovery_state(uuid) to authenticated;
