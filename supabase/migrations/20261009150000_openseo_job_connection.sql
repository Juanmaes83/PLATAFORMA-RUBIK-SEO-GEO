-- OpenSEO multi-client, phase 4 (docs/adr/0007-openseo-conexion-por-proyecto.md): every job
-- records the per-project connection that launched it, so follow/save can refuse a job whose
-- connection was revoked or replaced. NULL means a legacy job launched with the global
-- OPENSEO_PROJECT_ID; project mode never follows those. Only private.openseo_job changes:
-- the public wrapper, its grants and every other command keep their behaviour.
alter table private.openseo_project_jobs
  add column connection_id uuid references private.openseo_project_connections(id);

-- DEFINER lives in the unexposed private schema, uses no caller search_path and
-- checks the authenticated project owner before any ledger lookup or mutation.
create or replace function private.openseo_job(
  p_project_id uuid, p_command text, p_job_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j private.openseo_project_jobs;
  acquired boolean := false;
  org uuid;
  r jsonb;
  operation_name text;
  result_id uuid;
  conn uuid;
begin
  if auth.uid() is null or not private.has_project_role(p_project_id, array['owner']) then
    raise exception 'OpenSEO project access denied' using errcode = '42501';
  end if;
  if p_command is null or p_command not in ('acquire', 'get', 'bind', 'fail', 'complete') then
    raise exception 'Invalid OpenSEO job command' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('openseo_job:' || p_project_id::text, 0));
  if p_command = 'acquire' then
    -- Project mode passes the ACTIVE connection it resolved; legacy mode passes none.
    if coalesce(p_payload ->> 'connectionId', '') <> '' then
      if (p_payload ->> 'connectionId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Invalid OpenSEO connection' using errcode = '22023';
      end if;
      conn := (p_payload ->> 'connectionId')::uuid;
      if not exists (select 1 from private.openseo_project_connections
          where id = conn and project_id = p_project_id and state = 'ACTIVE') then
        raise exception 'OpenSEO connection is not active in this project' using errcode = '23514';
      end if;
    end if;
    select * into j from private.openseo_project_jobs
      where project_id = p_project_id and state in ('STARTING', 'SYNCING');
    if not found then
      select organization_id into strict org from public.projects where id = p_project_id;
      insert into private.openseo_project_jobs(project_id, organization_id, created_by, state, connection_id)
        values(p_project_id, org, auth.uid(), 'STARTING', conn) returning * into j;
      acquired := true;
    end if;
  else
    select * into j from private.openseo_project_jobs
      where project_id = p_project_id and (id = p_job_id or
        (p_command = 'get' and p_job_id is null and audit_id = p_payload ->> 'auditId')) for update;
    if not found then
      raise exception 'OpenSEO job not found in project' using errcode = '22023';
    end if;
    if p_command = 'bind' then
      if p_payload ->> 'auditId' is null or (p_payload ->> 'auditId') !~ '^[A-Za-z0-9_-]{1,64}$' then
        raise exception 'Invalid audit identifier' using errcode = '22023';
      end if;
      if j.state = 'SYNCING' and j.audit_id = p_payload ->> 'auditId' then
        null; -- Repeating the successful binding is idempotent.
      elsif j.state = 'STARTING' and j.audit_id is null then
        update private.openseo_project_jobs set audit_id = p_payload ->> 'auditId',
          state = 'SYNCING', updated_at = now() where id = j.id returning * into j;
      else
        raise exception 'OpenSEO job cannot be rebound' using errcode = '23514';
      end if;
    elsif p_command = 'fail' then
      -- Used only after a definitive refusal/failed provider state, never timeout.
      if j.state = 'COMPLETED' then
        raise exception 'Completed OpenSEO job is immutable' using errcode = '23514';
      end if;
      update private.openseo_project_jobs set state = 'FAILED', updated_at = now()
        where id = j.id returning * into j;
    elsif p_command = 'complete' then
      if j.state = 'COMPLETED' then
        null; -- No duplicate provider rows on retries.
      elsif j.state <> 'SYNCING' then
        raise exception 'Only a bound OpenSEO job can complete' using errcode = '23514';
      else
        -- Two prepared server-signed rows are inserted in this one transaction.
        -- DB validates identity/shape; HMAC and data digest are verified by Core
        -- when reading. A self-made signature is never considered trusted.
        foreach operation_name in array array['auditIssues', 'auditPages'] loop
          r := p_payload -> operation_name;
          if jsonb_typeof(r) is distinct from 'object'
            or r ->> 'project_id' is distinct from j.project_id::text
            or r ->> 'organization_id' is distinct from j.organization_id::text
            or r ->> 'provider' is distinct from 'openseo'
            or r ->> 'operation' is distinct from operation_name
            or r ->> 'status' is null or r ->> 'status' not in ('OK', 'PARTIAL', 'EMPTY')
            or r #>> '{signed_payload,scopeVersion}' is distinct from '1'
            or r #>> '{signed_payload,scope,tenantId}' is distinct from j.organization_id::text
            or r #>> '{signed_payload,scope,projectId}' is distinct from j.project_id::text
            or r #>> '{signed_payload,provenance,evidence,auditId}' is distinct from j.audit_id then
            raise exception 'OpenSEO result identity mismatch' using errcode = '23514';
          end if;
          insert into public.provider_results(project_id, organization_id, provider, operation,
            status, captured_at, signed_payload, data, data_hash_alg, data_hash, key_id, signature)
          values(j.project_id, j.organization_id, r ->> 'provider', operation_name,
            r ->> 'status', (r ->> 'captured_at')::timestamptz, r -> 'signed_payload',
            r -> 'data', r ->> 'data_hash_alg', r ->> 'data_hash', r ->> 'key_id', r ->> 'signature')
          returning id into result_id;
          if operation_name = 'auditIssues' then j.issues_result_id := result_id;
          else j.pages_result_id := result_id; end if;
        end loop;
        update private.openseo_project_jobs set state = 'COMPLETED', updated_at = now(),
          issues_result_id = j.issues_result_id, pages_result_id = j.pages_result_id
          where id = j.id returning * into j;
      end if;
    end if;
  end if;
  return jsonb_build_object('jobId', j.id, 'auditId', j.audit_id, 'state', j.state,
    'acquired', acquired, 'connectionId', j.connection_id, 'issuesResultId', j.issues_result_id, 'pagesResultId', j.pages_result_id);
end;
$$;
