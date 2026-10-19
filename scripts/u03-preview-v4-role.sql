-- Operator-only setup for Supabase ref rhnnplewqsekrnaousyl. Do not add to migrations.
-- Confirm private.environment_identity = preview/rhnnplewqsekrnaousyl before applying.
-- This file never enables LOGIN or contains a password. Juanma separately activates
-- the role with a short validity period and a unique Preview-only password.
begin;
do $$ begin
  if (select environment = 'preview' and project_ref = 'rhnnplewqsekrnaousyl'
      from private.environment_identity limit 1) is distinct from true then
    raise exception 'V4_PREVIEW_IDENTITY_REJECTED';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'rubik_preview_receipt_writer') then
    create role rubik_preview_receipt_writer nologin noinherit nobypassrls nosuperuser nocreaterole nocreatedb;
  end if;
end $$;
alter role rubik_preview_receipt_writer nologin noinherit nobypassrls nosuperuser nocreaterole nocreatedb;

grant usage on schema public, private to rubik_preview_receipt_writer;
grant select, insert on public.audit_events to rubik_preview_receipt_writer;
grant select, update (state, event_seq, attempts, last_error, completed_at)
  on private.audit_outbox to rubik_preview_receipt_writer;
grant execute on function private.audit_writer_project(uuid) to rubik_preview_receipt_writer;
grant execute on function public.preview_environment_identity() to rubik_preview_receipt_writer;

drop policy if exists "u03 preview receipt reads audit" on public.audit_events;
create policy "u03 preview receipt reads audit" on public.audit_events
  for select to rubik_preview_receipt_writer using (true);
drop policy if exists "u03 preview receipt appends audit" on public.audit_events;
create policy "u03 preview receipt appends audit" on public.audit_events
  for insert to rubik_preview_receipt_writer with check (
    action = 'member.withdraw' and outcome = 'allowed' and details ? 'receiptId'
    and exists (select 1 from private.audit_outbox o
      where o.id::text = details ->> 'receiptId' and o.project_id = audit_events.project_id
        and o.state = 'pending' and o.action = 'member.withdraw')
  );
drop policy if exists "u03 preview receipt reads outbox" on private.audit_outbox;
create policy "u03 preview receipt reads outbox" on private.audit_outbox
  for select to rubik_preview_receipt_writer using (true);
drop policy if exists "u03 preview receipt updates outbox" on private.audit_outbox;
create policy "u03 preview receipt updates outbox" on private.audit_outbox
  for update to rubik_preview_receipt_writer
  using (action = 'member.withdraw') with check (action = 'member.withdraw');
commit;
