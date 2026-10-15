-- S1: an authenticated JWT cannot write arbitrary HMACs to the audit chain.
-- The dedicated NOLOGIN role is activated with a server-only credential by the owner.
-- No hosted credential or migration is authorized by this file's presence.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'rubik_audit_writer') then
    create role rubik_audit_writer nologin noinherit nobypassrls nocreaterole nocreatedb;
  end if;
end $$;

revoke insert on public.audit_events from public, anon, authenticated;
revoke insert (project_id, organization_id, seq, at, actor_role, actor_id, action, target,
  outcome, details, prev_hash, hash, key_id, signature, created_at)
  on public.audit_events from public, anon, authenticated;
drop policy if exists "members append audit events as themselves" on public.audit_events;

grant usage on schema public, private to rubik_audit_writer;
grant select, insert on public.audit_events to rubik_audit_writer;
create policy "dedicated writer reads audit" on public.audit_events
  for select to rubik_audit_writer using (true);
create policy "dedicated writer appends audit" on public.audit_events
  for insert to rubik_audit_writer with check (true);

-- Resolves and locks the current membership for the duration of the writer transaction.
-- The role cannot query membership/Auth tables directly or choose a role in the event.
create function private.audit_writer_actor(p_project uuid, p_actor uuid)
returns table(organization_id uuid, actor_role text, tenant_slug text, project_slug text)
language sql security definer set search_path = '' as $$
  select p.organization_id, pm.role, o.slug, p.slug
  from public.projects p
  join public.organizations o on o.id = p.organization_id
  join public.project_members pm on pm.project_id = p.id and pm.organization_id = p.organization_id
  join public.organization_members om on om.organization_id = p.organization_id and om.user_id = pm.user_id
  join auth.users u on u.id = pm.user_id
  where p.id = p_project and pm.user_id = p_actor
  for share of pm, om;
$$;
revoke all on function private.audit_writer_actor(uuid, uuid) from public, anon, authenticated;
grant execute on function private.audit_writer_actor(uuid, uuid) to rubik_audit_writer;

create function private.audit_writer_project(p_project uuid)
returns table(organization_id uuid, tenant_slug text, project_slug text)
language sql stable security definer set search_path = '' as $$
  select p.organization_id, o.slug, p.slug from public.projects p
    join public.organizations o on o.id = p.organization_id where p.id = p_project;
$$;
revoke all on function private.audit_writer_project(uuid) from public, anon, authenticated;
grant execute on function private.audit_writer_project(uuid) to rubik_audit_writer;

-- Receipt of a completed append; repeat calls with the same operation id return its event.
create table private.audit_idempotency (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid not null,
  action text not null,
  event_seq integer not null,
  created_at timestamptz not null default now(),
  unique (project_id, event_seq)
);
alter table private.audit_idempotency enable row level security;
revoke all on private.audit_idempotency from public, anon, authenticated;
grant select, insert on private.audit_idempotency to rubik_audit_writer;
create policy "writer reads receipts" on private.audit_idempotency for select to rubik_audit_writer using (true);
create policy "writer creates receipts" on private.audit_idempotency for insert to rubik_audit_writer with check (true);

-- A project-member withdrawal writes this receipt inside the same DELETE transaction.
-- The user loses access even when signing is temporarily unavailable.
create table private.audit_outbox (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null,
  actor_id uuid not null,
  actor_role text not null,
  target_id uuid not null,
  state text not null default 'pending' check (state in ('pending', 'completed')),
  event_seq integer,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index audit_outbox_pending on private.audit_outbox (created_at, id) where state = 'pending';
alter table private.audit_outbox enable row level security;
revoke all on private.audit_outbox from public, anon, authenticated;
grant select, update (state, event_seq, attempts, last_error, completed_at) on private.audit_outbox to rubik_audit_writer;
create policy "writer reads outbox" on private.audit_outbox for select to rubik_audit_writer using (true);
create policy "writer updates outbox" on private.audit_outbox for update to rubik_audit_writer
  using (true) with check (true);

create function private.queue_membership_withdrawal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare effective_role text; receipt_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.projects where id = old.project_id)
    or not private.is_org_owner(old.organization_id) then
    return old;
  end if;
  select pm.role into effective_role from public.project_members pm
    where pm.project_id = old.project_id and pm.user_id = auth.uid();
  if effective_role is null then
    raise exception 'audit withdrawal actor is not a project member' using errcode = '42501';
  end if;
  insert into private.audit_outbox (project_id, organization_id, actor_id, actor_role, target_id)
    values (old.project_id, old.organization_id, auth.uid(), effective_role, old.user_id)
    returning id into receipt_id;
  perform set_config('rubik.withdrawal_receipt', receipt_id::text, true);
  return old;
end;
$$;
revoke all on function private.queue_membership_withdrawal() from public, anon, authenticated, rubik_audit_writer;
create trigger project_members_audit_withdrawal after delete on public.project_members
  for each row execute function private.queue_membership_withdrawal();

-- The trigger's receipt id is returned by the existing authorized RPC, not chosen by the client.
create or replace function public.project_people(p_project_id uuid, p_command text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  result := private.project_people_command(p_project_id, p_command, p_payload);
  if p_command = 'remove' then
    return result || jsonb_build_object('auditReceiptId', current_setting('rubik.withdrawal_receipt', true));
  end if;
  return result;
end;
$$;
