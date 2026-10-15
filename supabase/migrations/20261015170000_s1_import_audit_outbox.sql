-- S1: an import effect and its audit receipt commit or roll back together.
alter table private.audit_outbox alter column target_id drop not null;
alter table private.audit_outbox add column action text not null default 'member.withdraw';
alter table private.audit_outbox add column target_text text;
alter table private.audit_outbox add column details jsonb not null default '{}'::jsonb;
alter table private.audit_outbox add constraint audit_outbox_action_check
  check (action in ('member.withdraw', 'import.file', 'import.erase'));
alter table private.audit_outbox add constraint audit_outbox_target_check
  check ((action = 'member.withdraw' and target_id is not null and target_text is null)
    or (action in ('import.file', 'import.erase') and target_id is null and target_text is not null));

alter table public.imports add column audit_receipt_id uuid not null default gen_random_uuid();

create function private.queue_import_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare effective_role text;
begin
  select pm.role into effective_role from public.project_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id
    where pm.project_id = new.project_id and pm.organization_id = new.organization_id and pm.user_id = auth.uid();
  if auth.uid() is null or effective_role not in ('owner', 'account-manager', 'analyst') then
    raise exception 'import audit actor is not authorized' using errcode = '42501';
  end if;
  insert into private.audit_outbox (id, project_id, organization_id, actor_id, actor_role, action, target_text, details)
    values (new.audit_receipt_id, new.project_id, new.organization_id, auth.uid(), effective_role,
      'import.file', new.file_sha256,
      jsonb_build_object('importId', new.id, 'status', new.status, 'findings', new.finding_count, 'errors', new.error_count));
  return new;
end;
$$;
revoke all on function private.queue_import_insert() from public, anon, authenticated, rubik_audit_writer;
create trigger imports_audit_insert before insert on public.imports
  for each row execute function private.queue_import_insert();

create function private.queue_import_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare effective_role text; receipt_id uuid;
begin
  -- A project cascade must not create an orphan receipt.
  if not exists (select 1 from public.projects where id = old.project_id) then return old; end if;
  select pm.role into effective_role from public.project_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id
    where pm.project_id = old.project_id and pm.organization_id = old.organization_id and pm.user_id = auth.uid();
  if auth.uid() is null or effective_role <> 'owner' then
    raise exception 'import erase audit actor is not authorized' using errcode = '42501';
  end if;
  insert into private.audit_outbox (project_id, organization_id, actor_id, actor_role, action, target_text, details)
    values (old.project_id, old.organization_id, auth.uid(), effective_role,
      'import.erase', old.id::text, jsonb_build_object('erased', 1)) returning id into receipt_id;
  perform set_config('rubik.import_erase_receipt', receipt_id::text, true);
  return old;
end;
$$;
revoke all on function private.queue_import_delete() from public, anon, authenticated, rubik_audit_writer;
create trigger imports_audit_delete after delete on public.imports
  for each row execute function private.queue_import_delete();

create function public.delete_import_with_receipt(p_project uuid, p_import uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare deleted_id uuid;
begin
  perform set_config('rubik.import_erase_receipt', '', true);
  delete from public.imports where project_id = p_project and id = p_import returning id into deleted_id;
  if deleted_id is null then return jsonb_build_object('erased', 0); end if;
  return jsonb_build_object('erased', 1, 'auditReceiptId', current_setting('rubik.import_erase_receipt', true));
end;
$$;
revoke all on function public.delete_import_with_receipt(uuid, uuid) from public, anon;
grant execute on function public.delete_import_with_receipt(uuid, uuid) to authenticated;
