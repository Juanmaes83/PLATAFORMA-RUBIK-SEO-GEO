-- Privileged offline restore runs as postgres, without a JWT, and must preserve the
-- signed export exactly. Ordinary Data API sessions still require live membership.
create or replace function private.queue_import_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare effective_role text;
begin
  if session_user = 'postgres' and auth.uid() is null then return new; end if;
  select pm.role into effective_role from public.project_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id
    where pm.project_id = new.project_id and pm.organization_id = new.organization_id and pm.user_id = auth.uid();
  if auth.uid() is null or coalesce(effective_role not in ('owner', 'account-manager', 'analyst'), true) then
    raise exception 'import audit actor is not authorized' using errcode = '42501';
  end if;
  insert into private.audit_outbox (id, project_id, organization_id, actor_id, actor_role, action, target_text, details)
    values (new.audit_receipt_id, new.project_id, new.organization_id, auth.uid(), effective_role,
      'import.file', new.file_sha256,
      jsonb_build_object('importId', new.id, 'status', new.status, 'findings', new.finding_count, 'errors', new.error_count));
  return new;
end;
$$;

create or replace function private.queue_import_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare effective_role text; receipt_id uuid;
begin
  if session_user = 'postgres' and auth.uid() is null then return old; end if;
  if not exists (select 1 from public.projects where id = old.project_id) then return old; end if;
  select pm.role into effective_role from public.project_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id
    where pm.project_id = old.project_id and pm.organization_id = old.organization_id and pm.user_id = auth.uid();
  if auth.uid() is null or effective_role is distinct from 'owner' then
    raise exception 'import erase audit actor is not authorized' using errcode = '42501';
  end if;
  insert into private.audit_outbox (project_id, organization_id, actor_id, actor_role, action, target_text, details)
    values (old.project_id, old.organization_id, auth.uid(), effective_role,
      'import.erase', old.id::text, jsonb_build_object('erased', 1)) returning id into receipt_id;
  perform set_config('rubik.import_erase_receipt', receipt_id::text, true);
  return old;
end;
$$;
