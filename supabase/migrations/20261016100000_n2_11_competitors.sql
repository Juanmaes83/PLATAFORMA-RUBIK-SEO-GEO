-- N2-11 · Competitor intelligence, first increment (LOCAL stack and CI only; the hosted
-- project is the owner's manual step, docs/SETUP-SUPABASE.md).
--
-- A project keeps a list of competitor domains and dated, sourced observations about them and
-- about the project's own site. Nothing here contacts a provider: a domain is stored as text
-- and never fetched. Observations are what a person read in a named source (`observed`) or what
-- someone states (`declared`); a value that the source does not provide is stored as
-- `not-available`, never as zero. Verification is a separate human step (Core `approve-fact`).
--
-- Permissions follow the Core MATRIX through project roles:
--   read            every member                          (select)
--   draft           owner, account-manager, analyst       (add competitor, edit, add observation)
--   review-action   owner, account-manager                (archive / restore a competitor)
--   approve-fact    owner, client-approver                (mark an observation verified)
--   delete-data     owner                                 (erase a competitor or an observation)
-- Every change writes an S1 audit receipt (private.audit_outbox) in the same transaction; the
-- trusted server writer signs it. No JWT path writes audit_events and no HMAC comes from a browser.

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  domain text not null check (
    char_length(domain) between 4 and 253
    and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$'),
  name text check (name is null or char_length(name) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  relation text not null default 'direct' check (relation in ('direct', 'indirect')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((status = 'archived') = (archived_at is not null)),
  unique (project_id, domain),
  unique (id, project_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create index competitors_project_idx on public.competitors (project_id, status, domain);

create table public.competitor_observations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  -- null: an observation of the project's own site, the baseline of every comparison.
  competitor_id uuid,
  metric text not null check (metric in
    ('organic-traffic', 'organic-keywords', 'referring-domains', 'backlinks', 'authority-score', 'indexed-pages')),
  availability text not null check (availability in ('available', 'not-available')),
  value numeric check (value is null or (value >= 0 and value <= 1000000000000)),
  method text not null check (method in ('observed', 'declared')),
  source_name text not null check (char_length(source_name) between 1 and 80),
  source_reference text check (source_reference is null or char_length(source_reference) between 1 and 500),
  observed_on date not null check (observed_on >= date '2000-01-01'),
  market_country text check (market_country is null or market_country ~ '^[A-Z]{2}$'),
  market_language text check (market_language is null or market_language ~ '^[a-z]{2}$'),
  device text check (device is null or device in ('desktop', 'mobile')),
  notes text check (notes is null or char_length(notes) <= 500),
  verification text not null default 'unverified' check (verification in ('unverified', 'verified')),
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((availability = 'available') = (value is not null)),
  check (metric <> 'authority-score' or value is null or value <= 100),
  check ((verification = 'verified') = (verified_at is not null)),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  -- A competitor of ANOTHER project can never be referenced.
  foreign key (competitor_id, project_id) references public.competitors (id, project_id) on delete cascade
);
create index competitor_observations_series_idx
  on public.competitor_observations (project_id, competitor_id, metric, observed_on desc);
-- The same reading recorded twice is one observation (no artificial history).
create unique index competitor_observations_dedupe on public.competitor_observations (
  project_id, coalesce(competitor_id, '00000000-0000-0000-0000-000000000000'::uuid), metric, method,
  lower(source_name), observed_on, coalesce(market_country, ''), coalesce(market_language, ''), coalesce(device, ''));

-- ── Integrity rules the column grants cannot express ──────────────────────────────────────

create function private.competitor_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.project_id <> old.project_id or new.organization_id <> old.organization_id
      or new.domain <> old.domain or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
      raise exception 'competitor identity is immutable' using errcode = '42501';
    end if;
    if new.status <> old.status then
      -- Archive / restore is a review decision (Core `review-action`).
      if auth.uid() is not null and not private.has_project_role(new.project_id, array['owner', 'account-manager']) then
        raise exception 'archiving a competitor requires review-action' using errcode = '42501';
      end if;
      new.archived_at := case when new.status = 'archived' then now() else null end;
    else
      new.archived_at := old.archived_at;
    end if;
    new.updated_at := now();
  else
    new.status := 'active';
    new.archived_at := null;
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger competitors_before_write before insert or update on public.competitors
  for each row execute function private.competitor_before_write();

create function private.competitor_observation_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.observed_on > current_date then
      raise exception 'an observation cannot be dated in the future' using errcode = '23514';
    end if;
    if new.competitor_id is not null and exists (
      select 1 from public.competitors c where c.id = new.competitor_id and c.status = 'archived') then
      raise exception 'archived competitors take no new observations' using errcode = '23514';
    end if;
    new.verification := 'unverified';
    new.verified_by := null;
    new.verified_at := null;
    new.created_at := now();
    return new;
  end if;
  -- UPDATE: observations are immutable; the only change is a human verification.
  if (to_jsonb(new) - array['verification', 'verified_by', 'verified_at']) is distinct from
     (to_jsonb(old) - array['verification', 'verified_by', 'verified_at']) then
    raise exception 'observations are immutable; record a new one instead' using errcode = '42501';
  end if;
  if not (old.verification = 'unverified' and new.verification = 'verified') then
    raise exception 'only unverified → verified is allowed' using errcode = '42501';
  end if;
  new.verified_by := auth.uid();
  new.verified_at := now();
  return new;
end;
$$;
create trigger competitor_observations_before_write before insert or update on public.competitor_observations
  for each row execute function private.competitor_observation_before_write();

revoke all on function private.competitor_before_write(), private.competitor_observation_before_write()
  from public, anon, authenticated, rubik_audit_writer;

-- ── Privileges and RLS (least privilege, explicit grants) ────────────────────────────────

revoke all on public.competitors, public.competitor_observations from public, anon, authenticated;
grant select on public.competitors, public.competitor_observations to authenticated;
grant insert (project_id, organization_id, domain, name, notes, relation) on public.competitors to authenticated;
grant update (name, notes, relation, status) on public.competitors to authenticated;
grant delete on public.competitors to authenticated;
grant insert (project_id, organization_id, competitor_id, metric, availability, value, method, source_name,
  source_reference, observed_on, market_country, market_language, device, notes) on public.competitor_observations to authenticated;
grant update (verification) on public.competitor_observations to authenticated;
grant delete on public.competitor_observations to authenticated;

alter table public.competitors enable row level security;
alter table public.competitor_observations enable row level security;

create policy "project members read competitors" on public.competitors
  for select to authenticated using ((select private.is_project_member(project_id)));
create policy "drafting roles add competitors" on public.competitors
  for insert to authenticated
  with check (created_by = (select auth.uid())
    and (select private.has_project_role(project_id, array['owner', 'account-manager', 'analyst'])));
create policy "drafting roles edit competitors" on public.competitors
  for update to authenticated
  using ((select private.has_project_role(project_id, array['owner', 'account-manager', 'analyst'])))
  with check ((select private.has_project_role(project_id, array['owner', 'account-manager', 'analyst'])));
create policy "project owners erase competitors" on public.competitors
  for delete to authenticated using ((select private.has_project_role(project_id, array['owner'])));

create policy "project members read observations" on public.competitor_observations
  for select to authenticated using ((select private.is_project_member(project_id)));
create policy "drafting roles record observations" on public.competitor_observations
  for insert to authenticated
  with check (created_by = (select auth.uid())
    and (select private.has_project_role(project_id, array['owner', 'account-manager', 'analyst'])));
create policy "fact approvers verify observations" on public.competitor_observations
  for update to authenticated
  using ((select private.has_project_role(project_id, array['owner', 'client-approver'])))
  with check ((select private.has_project_role(project_id, array['owner', 'client-approver'])));
create policy "project owners erase observations" on public.competitor_observations
  for delete to authenticated using ((select private.has_project_role(project_id, array['owner'])));

-- ── S1 audit receipts, in the same transaction as the change ──────────────────────────────

-- Complete action list for the canonical S1 → SEO keyword → competitor migration order.
alter table private.audit_outbox drop constraint audit_outbox_action_check;
alter table private.audit_outbox add constraint audit_outbox_action_check
  check (action in ('member.withdraw', 'import.file', 'import.erase', 'provider-results.erase',
    'google.capture', 'openseo.audit.store', 'seo.keyword.add', 'seo.keyword.update', 'seo.keyword.erase',
    'competitor.add', 'competitor.update', 'competitor.archive', 'competitor.restore', 'competitor.erase',
    'competitor.observation.add', 'competitor.observation.verify', 'competitor.observation.erase'));
alter table private.audit_outbox drop constraint audit_outbox_target_check;
alter table private.audit_outbox add constraint audit_outbox_target_check
  check ((action = 'member.withdraw' and target_id is not null and target_text is null)
    or (action <> 'member.withdraw' and target_id is null and target_text is not null));

create function private.queue_competitor_receipt(p_project uuid, p_organization uuid, p_action text,
  p_target text, p_details jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare effective_role text;
begin
  -- Offline restoration as postgres without a JWT keeps data as is: no receipt.
  if session_user = 'postgres' and auth.uid() is null then return; end if;
  select pm.role into effective_role from public.project_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id
    where pm.project_id = p_project and pm.organization_id = p_organization and pm.user_id = auth.uid();
  if auth.uid() is null or effective_role is null then
    raise exception 'competitor audit actor is not a project member' using errcode = '42501';
  end if;
  insert into private.audit_outbox (project_id, organization_id, actor_id, actor_role, action, target_text, details)
    values (p_project, p_organization, auth.uid(), effective_role, p_action, p_target, p_details);
end;
$$;

create function private.competitor_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.queue_competitor_receipt(new.project_id, new.organization_id, 'competitor.add', new.domain,
      jsonb_build_object('competitorId', new.id, 'relation', new.relation));
  elsif tg_op = 'UPDATE' then
    if new.status <> old.status then
      perform private.queue_competitor_receipt(new.project_id, new.organization_id,
        case new.status when 'archived' then 'competitor.archive' else 'competitor.restore' end, new.domain,
        jsonb_build_object('competitorId', new.id));
    elsif (new.name, new.notes, new.relation) is distinct from (old.name, old.notes, old.relation) then
      perform private.queue_competitor_receipt(new.project_id, new.organization_id, 'competitor.update', new.domain,
        jsonb_build_object('competitorId', new.id, 'relation', new.relation));
    end if;
  else
    -- A project cascade must not create an orphan receipt.
    if not exists (select 1 from public.projects where id = old.project_id) then return old; end if;
    perform private.queue_competitor_receipt(old.project_id, old.organization_id, 'competitor.erase', old.domain,
      jsonb_build_object('competitorId', old.id));
  end if;
  return coalesce(new, old);
end;
$$;
create trigger competitors_audit after insert or update or delete on public.competitors
  for each row execute function private.competitor_after_write();

create function private.competitor_observation_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.queue_competitor_receipt(new.project_id, new.organization_id, 'competitor.observation.add', new.id::text,
      jsonb_build_object('subject', coalesce(new.competitor_id::text, 'project'), 'metric', new.metric,
        'availability', new.availability, 'method', new.method, 'source', new.source_name, 'observedOn', new.observed_on));
  elsif tg_op = 'UPDATE' then
    perform private.queue_competitor_receipt(new.project_id, new.organization_id, 'competitor.observation.verify', new.id::text,
      jsonb_build_object('metric', new.metric, 'observedOn', new.observed_on));
  else
    -- Cascades (project or competitor erased) are covered by the parent's receipt.
    if not exists (select 1 from public.projects where id = old.project_id)
      or (old.competitor_id is not null and not exists (select 1 from public.competitors where id = old.competitor_id)) then
      return old;
    end if;
    perform private.queue_competitor_receipt(old.project_id, old.organization_id, 'competitor.observation.erase', old.id::text,
      jsonb_build_object('metric', old.metric, 'observedOn', old.observed_on));
  end if;
  return coalesce(new, old);
end;
$$;
create trigger competitor_observations_audit after insert or update or delete on public.competitor_observations
  for each row execute function private.competitor_observation_after_write();

revoke all on function private.queue_competitor_receipt(uuid, uuid, text, text, jsonb),
  private.competitor_after_write(), private.competitor_observation_after_write()
  from public, anon, authenticated, rubik_audit_writer;

comment on table public.competitors is 'N2-11: competitor domains of a project; stored as text, never fetched';
comment on table public.competitor_observations is
  'N2-11: dated, sourced observations (observed/declared, available/not-available); never provider-measured by Rubik';
