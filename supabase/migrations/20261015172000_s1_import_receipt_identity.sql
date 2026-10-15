-- An import's immutable UUID is the idempotency identity of its insert receipt.
-- Avoid adding a column to signed exports and older restore plans.
alter table public.imports drop column audit_receipt_id;

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
    values (new.id, new.project_id, new.organization_id, auth.uid(), effective_role,
      'import.file', new.file_sha256,
      jsonb_build_object('importId', new.id, 'status', new.status, 'findings', new.finding_count, 'errors', new.error_count));
  return new;
end;
$$;
