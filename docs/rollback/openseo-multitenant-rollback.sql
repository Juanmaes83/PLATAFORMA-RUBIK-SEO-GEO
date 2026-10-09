-- Rollback of the OpenSEO multi-client and reconciliation migrations (ADR 0007/0008), in
-- reverse order: 20261009170000, 20261009150000, 20261009120000. NOT a migration: the owner
-- runs it only if those migrations must be undone on the hosted project, after a backup and
-- with no STARTING/SYNCING job. It restores private.openseo_job exactly as created by
-- 20261009071705 (public wrapper and grants are untouched by CREATE OR REPLACE). Tested on a
-- local supabase/postgres container: after it, supabase/tests/openseo_jobs.test.sql passes.
-- Afterwards, remove the three versions from supabase_migrations.schema_migrations with
-- `supabase migration repair --status reverted <version>` so history matches the database.
begin;

-- 20261009170000_openseo_active_job
drop function public.openseo_release_starting_job(uuid, uuid);
drop function private.openseo_release_starting_job(uuid, uuid);
drop function public.openseo_active_job(uuid);
drop function private.openseo_active_job(uuid);

-- 20261009150000_openseo_job_connection: original function first, then the column.
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
begin
  if auth.uid() is null or not private.has_project_role(p_project_id, array['owner']) then
    raise exception 'OpenSEO project access denied' using errcode = '42501';
  end if;
  if p_command is null or p_command not in ('acquire', 'get', 'bind', 'fail', 'complete') then
    raise exception 'Invalid OpenSEO job command' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('openseo_job:' || p_project_id::text, 0));
  if p_command = 'acquire' then
    select * into j from private.openseo_project_jobs
      where project_id = p_project_id and state in ('STARTING', 'SYNCING');
    if not found then
      select organization_id into strict org from public.projects where id = p_project_id;
      insert into private.openseo_project_jobs(project_id, organization_id, created_by, state)
        values(p_project_id, org, auth.uid(), 'STARTING') returning * into j;
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
    'acquired', acquired, 'issuesResultId', j.issues_result_id, 'pagesResultId', j.pages_result_id);
end;
$$;

alter table private.openseo_project_jobs drop column connection_id;

-- 20261009120000_openseo_project_connections
drop function public.openseo_connection(uuid, text, jsonb);
drop function private.openseo_connection(uuid, text, jsonb);
drop table private.openseo_project_connections;

commit;
