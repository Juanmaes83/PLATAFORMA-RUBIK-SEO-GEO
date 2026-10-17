-- N2-13 GEO with evidence (first increment): manual observations of how a brand/entity appears
-- in answers of generative engines, and reviewable proposals derived from them. Nothing here
-- queries an engine, fetches a URL or calls a provider: answers and cited URLs are stored as
-- text exactly as the user declares them. A manual observation is DECLARED until a person with
-- approve-fact verifies it; the database records who and when.
-- Roles (Core matrix): read = members; record observations and proposals = draft
-- (owner/account-manager/analyst); verify an observation = approve-fact (owner/client-approver);
-- accept/reject/close a proposal = review-action (owner/account-manager); erase = delete-data
-- (owner). Every change queues an S1 audit receipt in the same transaction.

create table public.geo_observations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  entity_name text not null check (char_length(btrim(entity_name)) between 1 and 120),
  engine text not null check (engine in ('chatgpt', 'claude', 'gemini', 'perplexity', 'ai-overviews', 'copilot', 'other')),
  engine_detail text check (engine_detail is null or char_length(engine_detail) <= 80),
  query_text text not null check (char_length(btrim(query_text)) between 1 and 500),
  observed_on date not null check (observed_on >= date '2023-01-01'),
  market_language text check (market_language ~ '^[a-z]{2}$'),
  market_country text check (market_country ~ '^[A-Z]{2}$'),
  method text not null check (method in ('manual-copy', 'screenshot', 'shared-link', 'export', 'other')),
  presence text not null check (presence in ('cited', 'mentioned', 'absent', 'unclear')),
  answer_excerpt text check (answer_excerpt is null or char_length(answer_excerpt) <= 4000),
  -- [{"url": "https://…", "title": "…"}], at most 20; stored as text, never fetched.
  cited_sources jsonb not null default '[]'::jsonb,
  -- Other entities named in the answer (competitors or third parties), at most 20.
  mentioned_entities jsonb not null default '[]'::jsonb,
  evidence_reference text check (evidence_reference is null or char_length(evidence_reference) <= 500),
  notes text check (notes is null or char_length(notes) <= 1000),
  -- A correction is a new observation that supersedes the old one (history is kept).
  supersedes_id uuid,
  verification text not null default 'declared' check (verification in ('declared', 'verified')),
  verified_by uuid,
  verified_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  unique (id, project_id),
  foreign key (supersedes_id, project_id) references public.geo_observations (id, project_id) on delete set null (supersedes_id),
  check (jsonb_typeof(cited_sources) = 'array' and jsonb_array_length(cited_sources) <= 20),
  check (jsonb_typeof(mentioned_entities) = 'array' and jsonb_array_length(mentioned_entities) <= 20),
  -- "cited" means at least one cited source was declared; an absent brand is not "cited".
  check (presence <> 'cited' or jsonb_array_length(cited_sources) > 0),
  check ((verification = 'verified') = (verified_by is not null and verified_at is not null))
);
-- Idempotent registration: the same reading (entity, engine, query, date, market, method) once.
create unique index geo_observations_dedupe on public.geo_observations
  (project_id, lower(btrim(entity_name)), engine, lower(btrim(query_text)), observed_on, coalesce(market_language, ''),
   coalesce(market_country, ''), method, coalesce(engine_detail, ''));
create index geo_observations_project_idx on public.geo_observations (project_id, observed_on desc);

create table public.geo_proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  rule text not null check (rule in ('answer-gap', 'mentioned-not-cited', 'competitor-cited', 'volatile', 'repeat-measurement', 'keep-cited', 'manual')),
  query_text text not null check (char_length(btrim(query_text)) between 1 and 500),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  problem text not null check (char_length(btrim(problem)) between 1 and 1000),
  hypothesis text not null check (char_length(btrim(hypothesis)) between 1 and 1000),
  suggested_action text not null check (char_length(btrim(suggested_action)) between 1 and 1000),
  limitations text check (limitations is null or char_length(limitations) <= 1000),
  priority text not null check (priority in ('high', 'medium', 'low')),
  priority_reason text not null check (char_length(btrim(priority_reason)) between 1 and 500),
  -- Observations behind the proposal; the trigger checks each belongs to this project.
  evidence_ids uuid[] not null default '{}' check (cardinality(evidence_ids) <= 50),
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected', 'done')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  unique (id, project_id),
  check (status = 'proposed' or (reviewed_by is not null and reviewed_at is not null))
);
-- The same rule for the same query is proposed once while it is open or accepted.
create unique index geo_proposals_open on public.geo_proposals (project_id, rule, lower(btrim(query_text)))
  where status in ('proposed', 'accepted');

-- ── Authorship retention (same rule as seo_keywords.created_by in main) ─────────────────
alter table public.geo_observations add foreign key (created_by) references auth.users (id),
  add foreign key (verified_by) references auth.users (id);
alter table public.geo_proposals add foreign key (created_by) references auth.users (id),
  add foreign key (reviewed_by) references auth.users (id);

-- ── Integrity rules the grants cannot express ────────────────────────────────────────────

create function private.geo_json_ok(sources jsonb, entities jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  -- Type first (SQL AND does not guarantee order: a scalar would fail inside jsonb_array_elements).
  if jsonb_typeof(sources) <> 'array' or jsonb_typeof(entities) <> 'array' then return false; end if;
  return not exists (select 1 from jsonb_array_elements(sources) s
      where jsonb_typeof(s) <> 'object' or jsonb_typeof(s->'url') <> 'string' or char_length(s->>'url') > 2048
        or (s->>'url') !~ '^https?://[^\s/]+(/\S*)?$' or char_length(coalesce(s->>'title', '')) > 200
        or (s ? 'title' and jsonb_typeof(s->'title') <> 'string'))
    and not exists (select 1 from jsonb_array_elements(entities) e
      where jsonb_typeof(e) <> 'string' or char_length(btrim(e #>> '{}')) not between 1 and 120);
end;
$$;

create function private.geo_observation_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.observed_on > current_date then
      raise exception 'an observation cannot be dated in the future' using errcode = '23514';
    end if;
    if not private.geo_json_ok(new.cited_sources, new.mentioned_entities) then
      raise exception 'cited sources or mentioned entities are malformed' using errcode = '23514';
    end if;
    new.verification := 'declared';
    new.verified_by := null;
    new.verified_at := null;
    new.created_at := now();
    return new;
  end if;
  -- UPDATE: observations are immutable; the only changes are a human verification and the
  -- referential action that clears a superseded link when that observation is erased.
  if (to_jsonb(new) - array['verification', 'verified_by', 'verified_at', 'supersedes_id'])
      is distinct from (to_jsonb(old) - array['verification', 'verified_by', 'verified_at', 'supersedes_id'])
    or (new.supersedes_id is not null and new.supersedes_id is distinct from old.supersedes_id) then
    raise exception 'observations are immutable; record a correction instead' using errcode = '42501';
  end if;
  if new.verification is distinct from old.verification then
    if not (old.verification = 'declared' and new.verification = 'verified') then
      raise exception 'only declared → verified is allowed' using errcode = '42501';
    end if;
    new.verified_by := auth.uid();
    new.verified_at := now();
  else
    new.verified_by := old.verified_by;
    new.verified_at := old.verified_at;
  end if;
  return new;
end;
$$;
create trigger geo_observations_before_write before insert or update on public.geo_observations
  for each row execute function private.geo_observation_before_write();

create function private.geo_proposal_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- Checked when the proposal is written; evidence_ids is not updatable. An observation erased
    -- later leaves its id behind and the interface shows it as "observación borrada".
    if exists (select 1 from unnest(new.evidence_ids) e
        where not exists (select 1 from public.geo_observations o where o.id = e and o.project_id = new.project_id)) then
      raise exception 'evidence must be observations of this project' using errcode = '23503';
    end if;
    new.status := 'proposed';
    new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
    new.created_at := now(); new.updated_at := now();
    return new;
  end if;
  if new.id <> old.id or new.project_id <> old.project_id or new.organization_id <> old.organization_id
    or new.created_by <> old.created_by or new.created_at <> old.created_at or new.rule <> old.rule then
    raise exception 'identity columns are immutable' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if (old.status, new.status) not in (('proposed', 'accepted'), ('proposed', 'rejected'), ('accepted', 'done'), ('accepted', 'rejected'),
        ('rejected', 'proposed')) then
      raise exception 'proposal transition % → % is not allowed', old.status, new.status using errcode = '23514';
    end if;
    if not private.has_project_role(new.project_id, array['owner', 'account-manager']) then
      raise exception 'reviewing a proposal requires review-action' using errcode = '42501';
    end if;
    new.reviewed_by := auth.uid(); new.reviewed_at := now();
    if new.status = 'proposed' then new.reviewed_by := null; new.reviewed_at := null; end if;
  else
    new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at;
    if new.review_note is distinct from old.review_note then
      raise exception 'a review note is only written with a review step' using errcode = '42501';
    end if;
    if old.status <> 'proposed' then
      raise exception 'only a proposal awaiting review can be edited' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger geo_proposals_before_write before insert or update on public.geo_proposals
  for each row execute function private.geo_proposal_before_write();

revoke all on function private.geo_json_ok(jsonb, jsonb), private.geo_observation_before_write(), private.geo_proposal_before_write()
  from public, anon, authenticated;

-- ── Privileges and RLS (least privilege, explicit grants) ────────────────────────────────

revoke all on public.geo_observations, public.geo_proposals from public, anon, authenticated;
grant select, delete on public.geo_observations, public.geo_proposals to authenticated;
grant insert (project_id, organization_id, entity_name, engine, engine_detail, query_text, observed_on, market_language, market_country,
  method, presence, answer_excerpt, cited_sources, mentioned_entities, evidence_reference, notes, supersedes_id)
  on public.geo_observations to authenticated;
grant update (verification) on public.geo_observations to authenticated;
grant insert (project_id, organization_id, rule, query_text, title, problem, hypothesis, suggested_action, limitations, priority,
  priority_reason, evidence_ids) on public.geo_proposals to authenticated;
grant update (title, problem, hypothesis, suggested_action, limitations, priority, priority_reason, status, review_note)
  on public.geo_proposals to authenticated;

alter table public.geo_observations enable row level security;
alter table public.geo_proposals enable row level security;

create policy "project members read geo observations" on public.geo_observations for select to authenticated
  using (private.is_project_member(project_id));
create policy "drafting roles record geo observations" on public.geo_observations for insert to authenticated
  with check (created_by = auth.uid() and private.has_project_role(project_id, array['owner', 'account-manager', 'analyst']));
create policy "fact approvers verify geo observations" on public.geo_observations for update to authenticated
  using (private.has_project_role(project_id, array['owner', 'client-approver']))
  with check (private.has_project_role(project_id, array['owner', 'client-approver']));
create policy "project owners erase geo observations" on public.geo_observations for delete to authenticated
  using (private.has_project_role(project_id, array['owner']));

create policy "project members read geo proposals" on public.geo_proposals for select to authenticated
  using (private.is_project_member(project_id));
create policy "drafting roles add geo proposals" on public.geo_proposals for insert to authenticated
  with check (created_by = auth.uid() and private.has_project_role(project_id, array['owner', 'account-manager', 'analyst']));
create policy "drafting roles edit geo proposals" on public.geo_proposals for update to authenticated
  using (private.has_project_role(project_id, array['owner', 'account-manager', 'analyst']))
  with check (private.has_project_role(project_id, array['owner', 'account-manager', 'analyst']));
create policy "project owners erase geo proposals" on public.geo_proposals for delete to authenticated
  using (private.has_project_role(project_id, array['owner']));

-- ── S1 audit receipts ────────────────────────────────────────────────────────────────────
-- Audit actions of this module.
-- Full cumulative allowlist in canonical order (S1 → SEO keywords → competitors → content → GEO), as the
-- N2-09/N2-11 migrations do since #120: no dynamic rebuild. A later module must restate the
-- whole list; applying modules out of order is not supported.
alter table private.audit_outbox drop constraint audit_outbox_action_check;
alter table private.audit_outbox add constraint audit_outbox_action_check
  check (action in ('member.withdraw', 'import.file', 'import.erase', 'provider-results.erase',
    'google.capture', 'openseo.audit.store',
    'seo.keyword.add', 'seo.keyword.update', 'seo.keyword.erase',
    'competitor.add', 'competitor.update', 'competitor.archive', 'competitor.restore', 'competitor.erase',
    'competitor.observation.add', 'competitor.observation.verify', 'competitor.observation.erase',
    'content.cluster.add', 'content.cluster.update', 'content.cluster.erase',
    'content.opportunity.add', 'content.opportunity.update', 'content.opportunity.erase',
    'content.evidence.add', 'content.evidence.erase',
    'content.brief.add', 'content.brief.update', 'content.brief.submit', 'content.brief.return',
    'content.brief.approve', 'content.brief.archive', 'content.brief.restore', 'content.brief.erase',
    'geo.observation.add', 'geo.observation.verify', 'geo.observation.erase',
    'geo.proposal.add', 'geo.proposal.update', 'geo.proposal.accept', 'geo.proposal.reject', 'geo.proposal.done',
    'geo.proposal.reopen', 'geo.proposal.erase'));
alter table private.audit_outbox drop constraint audit_outbox_target_check;
alter table private.audit_outbox add constraint audit_outbox_target_check
  check ((action = 'member.withdraw' and target_id is not null and target_text is null)
    or (action <> 'member.withdraw' and target_id is null and target_text is not null));

create function private.queue_geo_receipt(p_project uuid, p_organization uuid, p_action text, p_target text, p_details jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare effective_role text;
begin
  if session_user = 'postgres' and auth.uid() is null then return; end if;
  select pm.role into effective_role from public.project_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id
    where pm.project_id = p_project and pm.organization_id = p_organization and pm.user_id = auth.uid();
  if auth.uid() is null or effective_role is null then
    raise exception 'geo audit actor is not a project member' using errcode = '42501';
  end if;
  insert into private.audit_outbox (project_id, organization_id, actor_id, actor_role, action, target_text, details)
    values (p_project, p_organization, auth.uid(), effective_role, p_action, p_target, p_details);
end;
$$;

create function private.geo_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare kind text := case tg_table_name when 'geo_observations' then 'observation' else 'proposal' end;
  r record; act text;
begin
  r := coalesce(new, old);
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.projects where id = old.project_id) then return old; end if;
    act := 'erase';
  elsif tg_op = 'INSERT' then
    act := 'add';
  elsif kind = 'observation' then
    if (to_jsonb(new)->>'verification') is not distinct from (to_jsonb(old)->>'verification') then
      return new; -- only the referential action clearing a superseded link reaches here
    end if;
    act := 'verify';
  elsif (to_jsonb(new)->>'status') is distinct from (to_jsonb(old)->>'status') then
    act := case to_jsonb(new)->>'status' when 'accepted' then 'accept' when 'rejected' then 'reject' when 'done' then 'done' else 'reopen' end;
  else
    act := 'update';
  end if;
  perform private.queue_geo_receipt(r.project_id, r.organization_id, 'geo.' || kind || '.' || act, r.id::text,
    jsonb_build_object('id', r.id) || case kind
      when 'observation' then jsonb_build_object('engine', to_jsonb(r)->>'engine', 'presence', to_jsonb(r)->>'presence',
        'observedOn', to_jsonb(r)->>'observed_on', 'verification', to_jsonb(r)->>'verification')
      else jsonb_build_object('rule', to_jsonb(r)->>'rule', 'status', to_jsonb(r)->>'status', 'priority', to_jsonb(r)->>'priority') end);
  return r;
end;
$$;
create trigger geo_observations_audit after insert or update or delete on public.geo_observations
  for each row execute function private.geo_after_write();
create trigger geo_proposals_audit after insert or update or delete on public.geo_proposals
  for each row execute function private.geo_after_write();

revoke all on function private.queue_geo_receipt(uuid, uuid, text, text, jsonb), private.geo_after_write()
  from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rubik_audit_writer') then
    revoke all on function private.queue_geo_receipt(uuid, uuid, text, text, jsonb), private.geo_after_write(),
      private.geo_json_ok(jsonb, jsonb), private.geo_observation_before_write(), private.geo_proposal_before_write() from rubik_audit_writer;
  end if;
end $$;

comment on table public.geo_observations is 'N2-13: manual observations of generative-engine answers; declared until verified; text only, never fetched';
comment on table public.geo_proposals is 'N2-13: reviewable GEO proposals derived from observations; no guarantee of appearing in AI answers';
