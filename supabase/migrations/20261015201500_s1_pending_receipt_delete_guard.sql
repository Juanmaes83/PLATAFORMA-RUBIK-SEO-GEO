-- S1 hardening: a project deletion must not silently cascade unsigned audit receipts.
-- Applies to direct administrative project deletion and organization cascades.
-- Conservative policy: completed receipts follow the project's existing retention/
-- deletion contract; a pending receipt blocks deletion until signed or reconciled.
-- Local-only until an owner explicitly authorizes any hosted migration.
create function private.reject_project_delete_with_pending_audit()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from private.audit_outbox
    where project_id = old.id and state = 'pending'
  ) then
    raise exception 'Cannot delete project while audit receipts remain unsigned'
      using errcode = '55000';
  end if;
  return old;
end;
$$;

revoke all on function private.reject_project_delete_with_pending_audit()
  from public, anon, authenticated, rubik_audit_writer;

create trigger projects_pending_audit_guard
  before delete on public.projects
  for each row execute function private.reject_project_delete_with_pending_audit();

comment on trigger projects_pending_audit_guard on public.projects is
  'S1: block project and organization-cascade deletion while unsigned audit outbox receipts exist';
