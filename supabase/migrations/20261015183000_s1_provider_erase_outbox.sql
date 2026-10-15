-- A result erasure and its audit receipt are one transaction, including direct RLS DELETE.
alter table private.audit_outbox drop constraint audit_outbox_action_check;
alter table private.audit_outbox add constraint audit_outbox_action_check
  check (action in ('member.withdraw', 'import.file', 'import.erase', 'provider-results.erase'));
alter table private.audit_outbox drop constraint audit_outbox_target_check;
alter table private.audit_outbox add constraint audit_outbox_target_check
  check ((action = 'member.withdraw' and target_id is not null and target_text is null)
    or (action in ('import.file', 'import.erase', 'provider-results.erase') and target_id is null and target_text is not null));

create function private.queue_provider_result_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
declare effective_role text;
begin
  if session_user = 'postgres' and auth.uid() is null then return old; end if;
  if not exists (select 1 from public.projects where id = old.project_id) then return old; end if;
  select pm.role into effective_role from public.project_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id
    where pm.project_id = old.project_id and pm.organization_id = old.organization_id and pm.user_id = auth.uid();
  if auth.uid() is null or effective_role is distinct from 'owner' then
    raise exception 'provider result erase audit actor is not authorized' using errcode = '42501';
  end if;
  insert into private.audit_outbox (id, project_id, organization_id, actor_id, actor_role, action, target_text, details)
    values (old.id, old.project_id, old.organization_id, auth.uid(), effective_role,
      'provider-results.erase', old.id::text, jsonb_build_object('erased', 1));
  return old;
end;
$$;
revoke all on function private.queue_provider_result_delete() from public, anon, authenticated, rubik_audit_writer;
create trigger provider_results_audit_delete after delete on public.provider_results
  for each row execute function private.queue_provider_result_delete();
