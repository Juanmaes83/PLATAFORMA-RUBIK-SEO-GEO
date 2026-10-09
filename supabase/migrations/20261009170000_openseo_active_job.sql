-- Reconciliation of an uncertain launch (docs/adr/0008-reconciliacion-openseo.md): a read-only
-- view of the project's active job, so its owner can see a STARTING reservation and either
-- bind the audit id shown in OpenSEO or release it. `acquire` cannot serve as a read because
-- it creates a reservation when none exists. Same guard as private.openseo_job: owner only.
create function private.openseo_active_job(p_project_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  j private.openseo_project_jobs;
begin
  if auth.uid() is null or not private.has_project_role(p_project_id, array['owner']) then
    raise exception 'OpenSEO project access denied' using errcode = '42501';
  end if;
  select * into j from private.openseo_project_jobs
    where project_id = p_project_id and state in ('STARTING', 'SYNCING');
  if not found then
    return jsonb_build_object('state', 'NONE');
  end if;
  return jsonb_build_object('jobId', j.id, 'auditId', j.audit_id, 'state', j.state, 'acquired', false,
    'connectionId', j.connection_id, 'issuesResultId', j.issues_result_id, 'pagesResultId', j.pages_result_id,
    'createdAt', j.created_at);
end;
$$;

create function public.openseo_active_job(p_project_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.openseo_active_job(p_project_id);
$$;
revoke all on function private.openseo_active_job(uuid), public.openseo_active_job(uuid) from public, anon, authenticated;
grant execute on function private.openseo_active_job(uuid), public.openseo_active_job(uuid) to authenticated;

-- Release only a reservation that is still STARTING without an audit id, under the same
-- per-project lock as private.openseo_job: if another session bound it meanwhile, nothing is
-- released (a live crawl is never discarded by a stale page). The owner attests that OpenSEO
-- created no crawl; this function cannot check the provider.
create function private.openseo_release_starting_job(p_project_id uuid, p_job_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  j private.openseo_project_jobs;
begin
  if auth.uid() is null or not private.has_project_role(p_project_id, array['owner']) then
    raise exception 'OpenSEO project access denied' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('openseo_job:' || p_project_id::text, 0));
  update private.openseo_project_jobs set state = 'FAILED', updated_at = now()
    where id = p_job_id and project_id = p_project_id and state = 'STARTING' and audit_id is null
    returning * into j;
  if not found then
    raise exception 'No uncertain OpenSEO reservation to release' using errcode = '23514';
  end if;
  return jsonb_build_object('jobId', j.id, 'auditId', j.audit_id, 'state', j.state, 'acquired', false,
    'connectionId', j.connection_id, 'issuesResultId', j.issues_result_id, 'pagesResultId', j.pages_result_id);
end;
$$;

create function public.openseo_release_starting_job(p_project_id uuid, p_job_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.openseo_release_starting_job(p_project_id, p_job_id);
$$;
revoke all on function private.openseo_release_starting_job(uuid, uuid), public.openseo_release_starting_job(uuid, uuid) from public, anon, authenticated;
grant execute on function private.openseo_release_starting_job(uuid, uuid), public.openseo_release_starting_job(uuid, uuid) to authenticated;
