-- CORE-9.2 · Append-only audit chain and signed provider results (ADR 0004).
--
-- Versioned in the repository and applied ONLY to the local Supabase stack and CI. Applying it
-- to the hosted project is a manual, owner-approved step (docs/SETUP-SUPABASE.md).
--
-- What the database guarantees (the application cannot bypass it with the publishable key):
-- * Every row belongs to one project and its organization (composite foreign key).
-- * Only members of the project read its rows; `anon` gets nothing.
-- * Rows are immutable: no UPDATE privilege or policy, and a trigger refuses UPDATE for every
--   role. Audit rows are deleted only by cascade when an administrator removes the project or
--   the organization (retention "while the tenant exists", PLATFORM-SPEC §4.3).
-- * The audit chain is linked here: seq = previous + 1, prev_hash = previous hash, time never
--   goes backwards. A per-project advisory lock serialises concurrent appends.
-- * The actor of an audit row is the signed-in user with their real project role.
-- * Provider results store only the production digest (sha256) and its HMAC signature.
--
-- What the database does NOT do: it does not compute the SHA-256 chain hash or the HMAC. The
-- server computes them with the Core (canonicalJson + sha256) and signs with a key that never
-- reaches the database; reading code verifies them (src/lib/provenance). A row forged through
-- the Data API with a self-made hash fails that verification (bad HMAC).

-- ── Audit events ───────────────────────────────────────────────────────────────────────

create table public.audit_events (
  project_id uuid not null,
  organization_id uuid not null,
  seq integer not null check (seq >= 1),
  at timestamptz not null,
  actor_role text not null check (actor_role in ('owner', 'account-manager', 'analyst', 'client-approver', 'viewer')),
  actor_id uuid not null default auth.uid(),
  action text not null check (char_length(action) between 1 and 80),
  target text check (target is null or char_length(target) <= 300),
  outcome text not null check (outcome in ('allowed', 'denied', 'error')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  prev_hash text check (prev_hash is null or prev_hash ~ '^[0-9a-f]{64}$'),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  key_id text not null check (key_id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  signature text not null check (signature ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (project_id, seq),
  check ((seq = 1) = (prev_hash is null)),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);

-- ── Provider results with signed provenance ────────────────────────────────────────────

create table public.provider_results (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  provider text not null check (char_length(provider) between 1 and 60),
  operation text not null check (char_length(operation) between 1 and 80),
  status text not null check (char_length(status) between 1 and 40),
  captured_at timestamptz,
  signed_payload jsonb not null check (jsonb_typeof(signed_payload) = 'object'),
  data jsonb,
  data_hash_alg text not null check (data_hash_alg = 'sha256'),
  data_hash text not null check (data_hash ~ '^[0-9a-f]{64}$'),
  key_id text not null check (key_id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  signature text not null check (signature ~ '^[0-9a-f]{64}$'),
  created_by uuid not null default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- The searchable columns must repeat what was signed.
  check (signed_payload ->> 'provider' = provider and signed_payload ->> 'operation' = operation
    and signed_payload ->> 'status' = status and signed_payload ->> 'dataHash' = data_hash
    and signed_payload ->> 'dataHashAlg' = data_hash_alg),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create index provider_results_project_idx on public.provider_results (project_id, created_at desc);

-- ── Triggers ────────────────────────────────────────────────────────────────────────────

-- Links each audit row to the previous one of the same project. SECURITY DEFINER so it sees
-- the true last row regardless of the caller's policies; it only reads the project's chain.
create function private.link_audit_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  last_row record;
begin
  -- Runs before RLS WITH CHECK: never reveal anything about a chain to a non-member.
  if (select auth.uid()) is not null and not private.is_project_member(new.project_id) then
    raise exception 'permission denied for table audit_events' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('audit_events:' || new.project_id::text, 0));
  select seq, hash, at into last_row from public.audit_events
    where project_id = new.project_id order by seq desc limit 1;
  if last_row is null then
    if new.seq <> 1 or new.prev_hash is not null then
      raise exception 'audit chain: the first event must have seq 1 and no prev_hash' using errcode = '23514';
    end if;
  else
    if new.seq <> last_row.seq + 1 then
      raise exception 'audit chain: seq does not follow the previous event' using errcode = '23514';
    end if;
    if new.prev_hash is distinct from last_row.hash then
      raise exception 'audit chain: prev_hash does not match the previous event' using errcode = '23514';
    end if;
    if new.at < last_row.at then
      raise exception 'audit chain: event before the previous one' using errcode = '23514';
    end if;
  end if;
  new.created_at := now();
  return new;
end;
$$;
create trigger audit_events_link before insert on public.audit_events
  for each row execute function private.link_audit_event();

-- Immutable rows: UPDATE is refused for every role, including administrators. DELETE is only
-- allowed without a user session (cascade from an administrator removing the project); for
-- provider_results the project owner may delete through the policy below (erasure request).
create function private.refuse_audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    raise exception '% is append-only', tg_table_name using errcode = '42501';
  end if;
  if (select auth.uid()) is not null then
    raise exception '% rows are only removed with their project', tg_table_name using errcode = '42501';
  end if;
  return old;
end;
$$;
create trigger audit_events_immutable before update or delete on public.audit_events
  for each row execute function private.refuse_audit_change();

create function private.refuse_result_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'provider_results rows are immutable' using errcode = '42501';
end;
$$;
create trigger provider_results_immutable before update on public.provider_results
  for each row execute function private.refuse_result_update();

revoke all on function private.link_audit_event(), private.refuse_audit_change(), private.refuse_result_update()
  from public, anon, authenticated;

-- ── Privileges (explicit, least privilege) ──────────────────────────────────────────────

revoke all on public.audit_events, public.provider_results from public, anon, authenticated;

grant select on public.audit_events to authenticated;
grant insert (project_id, organization_id, seq, at, actor_role, action, target, outcome, details, prev_hash, hash, key_id, signature)
  on public.audit_events to authenticated;

grant select on public.provider_results to authenticated;
grant insert (project_id, organization_id, provider, operation, status, captured_at, signed_payload, data, data_hash_alg, data_hash, key_id, signature)
  on public.provider_results to authenticated;
grant delete on public.provider_results to authenticated;

-- ── Row level security ──────────────────────────────────────────────────────────────────

alter table public.audit_events enable row level security;
alter table public.provider_results enable row level security;

create policy "project members read the audit trail" on public.audit_events
  for select to authenticated using ((select private.is_project_member(project_id)));
-- A member appends as themselves and with the role they really hold in that project.
create policy "members append audit events as themselves" on public.audit_events
  for insert to authenticated
  with check (actor_id = (select auth.uid()) and (select private.has_project_role(project_id, array[actor_role])));

create policy "project members read provider results" on public.provider_results
  for select to authenticated using ((select private.is_project_member(project_id)));
-- Roles that may draft or propose in the Core MATRIX store results.
create policy "drafting roles store provider results" on public.provider_results
  for insert to authenticated
  with check (created_by = (select auth.uid())
    and (select private.has_project_role(project_id, array['owner', 'account-manager', 'analyst'])));
-- Erasure on request: only `owner` holds `delete-data` in the Core MATRIX.
create policy "project owners delete provider results" on public.provider_results
  for delete to authenticated using ((select private.has_project_role(project_id, array['owner'])));
