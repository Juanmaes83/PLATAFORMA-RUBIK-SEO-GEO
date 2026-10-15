-- S1 (U01 §5): durable link between a paid provider result and its signed audit event.
-- Storing a Google capture (google_captures → STORED) or completing an OpenSEO job
-- (openseo_project_jobs → COMPLETED) writes an outbox receipt in the SAME transaction as the
-- provider_results rows. If the answer is lost, the server crashes or signing fails after
-- the commit, the trusted signer completes the receipt later; the provider is never called
-- again to repair the audit trail. Receipt id = capture id / job id (never a result id, which
-- the erasure receipt of provider_results already uses).
-- Local-only until the owner explicitly authorizes a hosted migration.

alter table private.audit_outbox drop constraint audit_outbox_action_check;
alter table private.audit_outbox add constraint audit_outbox_action_check
  check (action in ('member.withdraw', 'import.file', 'import.erase', 'provider-results.erase',
    'google.capture', 'openseo.audit.store'));
alter table private.audit_outbox drop constraint audit_outbox_target_check;
alter table private.audit_outbox add constraint audit_outbox_target_check
  check ((action = 'member.withdraw' and target_id is not null and target_text is null)
    or (action in ('import.file', 'import.erase', 'provider-results.erase', 'google.capture', 'openseo.audit.store')
      and target_id is null and target_text is not null));

-- The live role of the authenticated actor in the project; only owners store provider results.
create function private.provider_receipt_owner(p_project uuid, p_organization uuid) returns text
language sql stable security definer set search_path = '' as $$
  select pm.role from public.project_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id
    where pm.project_id = p_project and pm.organization_id = p_organization and pm.user_id = auth.uid();
$$;
revoke all on function private.provider_receipt_owner(uuid, uuid) from public, anon, authenticated, rubik_audit_writer;

create function private.queue_google_capture_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare effective_role text; result_status text;
begin
  if new.state <> 'STORED' or old.state = 'STORED' then return new; end if;
  -- Offline restoration as postgres without a JWT keeps signed data as is: no new receipt.
  if session_user = 'postgres' and auth.uid() is null then return new; end if;
  effective_role := private.provider_receipt_owner(new.project_id, new.organization_id);
  if auth.uid() is null or effective_role is distinct from 'owner' then
    raise exception 'provider capture audit actor is not authorized' using errcode = '42501';
  end if;
  select status into result_status from public.provider_results where id = new.result_id;
  insert into private.audit_outbox (id, project_id, organization_id, actor_id, actor_role, action, target_text, details)
    values (new.id, new.project_id, new.organization_id, auth.uid(), effective_role, 'google.capture',
      new.result_id::text, jsonb_build_object('provider', new.provider, 'status', result_status));
  return new;
end;
$$;
revoke all on function private.queue_google_capture_receipt() from public, anon, authenticated, rubik_audit_writer;
create trigger google_captures_audit_stored after update of state on private.google_captures
  for each row execute function private.queue_google_capture_receipt();

create function private.queue_openseo_job_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare effective_role text;
begin
  if new.state <> 'COMPLETED' or old.state = 'COMPLETED' then return new; end if;
  if session_user = 'postgres' and auth.uid() is null then return new; end if;
  effective_role := private.provider_receipt_owner(new.project_id, new.organization_id);
  if auth.uid() is null or effective_role is distinct from 'owner' then
    raise exception 'provider job audit actor is not authorized' using errcode = '42501';
  end if;
  insert into private.audit_outbox (id, project_id, organization_id, actor_id, actor_role, action, target_text, details)
    values (new.id, new.project_id, new.organization_id, auth.uid(), effective_role, 'openseo.audit.store',
      coalesce(new.audit_id, new.id::text),
      jsonb_build_object('jobId', new.id, 'issuesResultId', new.issues_result_id, 'pagesResultId', new.pages_result_id));
  return new;
end;
$$;
revoke all on function private.queue_openseo_job_receipt() from public, anon, authenticated, rubik_audit_writer;
create trigger openseo_jobs_audit_completed after update of state on private.openseo_project_jobs
  for each row execute function private.queue_openseo_job_receipt();

comment on trigger google_captures_audit_stored on private.google_captures is
  'S1: a stored capture and its audit receipt commit together; the signer completes it without a new provider call';
comment on trigger openseo_jobs_audit_completed on private.openseo_project_jobs is
  'S1: a completed OpenSEO job and its audit receipt commit together; the signer completes it without a new provider call';
