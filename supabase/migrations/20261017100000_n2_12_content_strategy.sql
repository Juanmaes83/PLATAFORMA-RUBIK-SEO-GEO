-- N2-12 content strategy (first increment): content opportunities with linked evidence, topic
-- clusters and editorial briefs with a human review flow (draft → in-review → approved →
-- archived). Nothing here publishes, fetches or calls a provider: URLs are stored as text.
-- Roles follow the Core matrix: read = members; draft = owner/account-manager/analyst;
-- propose-action (submit) = same; review-action (return/approve/archive/restore) =
-- owner/account-manager; delete-data = owner. Every change queues an S1 audit receipt in the
-- same transaction; the trusted writer signs it afterwards.

-- ── Clusters ─────────────────────────────────────────────────────────────────────────────
create table public.content_clusters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  main_topic text not null check (char_length(btrim(main_topic)) between 1 and 160),
  description text check (description is null or char_length(description) <= 1000),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  unique (id, project_id)
);
create unique index content_clusters_name on public.content_clusters (project_id, lower(btrim(name)));

-- ── Opportunities ────────────────────────────────────────────────────────────────────────
create table public.content_opportunities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  cluster_id uuid,
  cluster_role text check (cluster_role in ('pillar', 'support')),
  topic text not null check (char_length(btrim(topic)) between 1 and 160),
  search_intent text not null check (search_intent in ('informational', 'commercial', 'transactional', 'navigational', 'local', 'unknown')),
  market_language text not null check (market_language ~ '^[a-z]{2}$'),
  market_country text check (market_country ~ '^[A-Z]{2}$'),
  page_kind text not null check (page_kind in ('existing', 'proposed')),
  page_url text check (page_url is null or (char_length(page_url) <= 2048 and page_url ~ '^https?://[^\s/]+(/\S*)?$')),
  opportunity_type text not null check (opportunity_type in ('create', 'improve', 'update', 'consolidate', 'research')),
  rationale text not null check (char_length(btrim(rationale)) between 1 and 2000),
  priority text not null default 'unset' check (priority in ('high', 'medium', 'low', 'unset')),
  priority_reason text check (priority_reason is null or char_length(priority_reason) <= 500),
  status text not null default 'open' check (status in ('open', 'planned', 'done', 'discarded')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  -- Removing a cluster keeps its opportunities (only cluster_id is cleared).
  foreign key (cluster_id, project_id) references public.content_clusters (id, project_id) on delete set null (cluster_id),
  unique (id, project_id),
  check (page_kind = 'proposed' or page_url is not null),
  check (opportunity_type not in ('improve', 'update') or page_kind = 'existing'),
  check (opportunity_type <> 'create' or page_kind = 'proposed'),
  check (priority = 'unset' or char_length(btrim(coalesce(priority_reason, ''))) > 0),
  check (cluster_role is null or cluster_id is not null)
);
create unique index content_opportunities_dedupe on public.content_opportunities
  (project_id, lower(btrim(topic)), market_language, coalesce(market_country, ''), coalesce(lower(page_url), ''));
create index content_opportunities_project_idx on public.content_opportunities (project_id, status, priority);

-- ── Evidence ─────────────────────────────────────────────────────────────────────────────
create table public.content_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  opportunity_id uuid not null,
  kind text not null check (kind in ('provider-result', 'import-finding', 'manual-source', 'analyst-proposal')),
  -- Stored sources: plain FKs; the trigger checks they belong to the same project. If the source
  -- is erased later the link is cleared and the snapshot below stays ("fuente borrada").
  provider_result_id uuid references public.provider_results (id) on delete set null,
  import_id uuid references public.imports (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  detail text check (detail is null or char_length(detail) <= 2000),
  source_url text check (source_url is null or (char_length(source_url) <= 2048 and source_url ~ '^https?://\S+$')),
  source_date date check (source_date is null or source_date >= date '2000-01-01'),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (opportunity_id, project_id) references public.content_opportunities (id, project_id) on delete cascade,
  check (kind = 'provider-result' or provider_result_id is null),
  check (kind = 'import-finding' or import_id is null),
  check (kind <> 'manual-source' or source_date is not null),
  check (kind <> 'analyst-proposal' or (source_url is null and source_date is null))
);
create index content_evidence_opportunity_idx on public.content_evidence (opportunity_id, created_at);

-- ── Briefs ───────────────────────────────────────────────────────────────────────────────
create table public.content_briefs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  opportunity_id uuid not null unique,
  objective text check (objective is null or char_length(objective) <= 1000),
  audience text check (audience is null or char_length(audience) <= 500),
  market_language text not null check (market_language ~ '^[a-z]{2}$'),
  market_country text check (market_country ~ '^[A-Z]{2}$'),
  search_intent text not null check (search_intent in ('informational', 'commercial', 'transactional', 'navigational', 'local', 'unknown')),
  main_topic text not null check (char_length(btrim(main_topic)) between 1 and 160),
  target_url text check (target_url is null or (char_length(target_url) <= 2048 and target_url ~ '^https?://[^\s/]+(/\S*)?$')),
  outline jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  internal_links jsonb not null default '[]'::jsonb,
  sources_consulted text check (sources_consulted is null or char_length(sources_consulted) <= 2000),
  original_data text check (original_data is null or char_length(original_data) <= 2000),
  risks text check (risks is null or char_length(risks) <= 2000),
  cta text check (cta is null or char_length(cta) <= 300),
  assignee text check (assignee is null or char_length(assignee) <= 120),
  status text not null default 'draft' check (status in ('draft', 'in-review', 'approved', 'archived')),
  version integer not null default 1,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  submitted_by uuid,
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (opportunity_id, project_id) references public.content_opportunities (id, project_id) on delete cascade,
  unique (id, project_id),
  check (jsonb_typeof(outline) = 'array' and jsonb_array_length(outline) <= 60),
  check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 30),
  check (jsonb_typeof(internal_links) = 'array' and jsonb_array_length(internal_links) <= 30),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null)),
  -- An archived brief keeps who approved it; a draft or a brief under review has no approval.
  check (status not in ('draft', 'in-review') or (approved_by is null and approved_at is null))
);

-- ── Authorship retention (same rule as seo_keywords.created_by in main) ─────────────────
-- Every person recorded on a row must keep existing: deleting an account with authored rows
-- fails, and a restore never replaces an author with the operator (src/lib/restore/plan.ts).
alter table public.content_clusters add foreign key (created_by) references auth.users (id);
alter table public.content_opportunities add foreign key (created_by) references auth.users (id);
alter table public.content_evidence add foreign key (created_by) references auth.users (id);
alter table public.content_briefs add foreign key (created_by) references auth.users (id),
  add foreign key (submitted_by) references auth.users (id), add foreign key (reviewed_by) references auth.users (id),
  add foreign key (approved_by) references auth.users (id);

-- ── Integrity rules the grants cannot express ────────────────────────────────────────────

create function private.content_touch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.project_id <> old.project_id or new.organization_id <> old.organization_id
      or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'identity columns are immutable' using errcode = '42501';
    end if;
  else
    new.created_at := now();
  end if;
  if tg_table_name = 'content_opportunities' then
    -- Erasing a cluster clears cluster_id (FK set null); its role goes with it.
    if new.cluster_id is null then new.cluster_role := null; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger content_clusters_touch before insert or update on public.content_clusters
  for each row execute function private.content_touch();
create trigger content_opportunities_touch before insert or update on public.content_opportunities
  for each row execute function private.content_touch();

create function private.content_evidence_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare label text; captured timestamptz;
begin
  if tg_op = 'UPDATE' then
    -- Only the referential action that clears an erased source is allowed.
    if (to_jsonb(new) - array['provider_result_id', 'import_id']) is distinct from (to_jsonb(old) - array['provider_result_id', 'import_id'])
      or (new.provider_result_id is not null and new.provider_result_id is distinct from old.provider_result_id)
      or (new.import_id is not null and new.import_id is distinct from old.import_id) then
      raise exception 'evidence is immutable; add a new one instead' using errcode = '42501';
    end if;
    return new;
  end if;
  new.created_at := now();
  if new.kind = 'provider-result' then
    select r.provider || ' · ' || r.operation, coalesce(r.captured_at, r.created_at) into label, captured
      from public.provider_results r where r.id = new.provider_result_id and r.project_id = new.project_id;
    if label is null then raise exception 'provider result not found in this project' using errcode = '23503'; end if;
    new.title := label;
    new.source_date := captured::date;
    new.source_url := null;
  elsif new.kind = 'import-finding' then
    select i.source_label, i.captured_at into label, captured
      from public.imports i where i.id = new.import_id and i.project_id = new.project_id;
    if label is null then raise exception 'import not found in this project' using errcode = '23503'; end if;
    new.title := left(label, 200);
    new.source_date := captured::date;
    new.source_url := null;
  elsif new.source_date is not null and new.source_date > current_date then
    raise exception 'a source cannot be dated in the future' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger content_evidence_before_write before insert or update on public.content_evidence
  for each row execute function private.content_evidence_before_insert();

-- Brief structure: outline [{level 1..3, text}], questions [text], internal_links [{url, anchor}].
create function private.content_brief_shape_ok(outline jsonb, questions jsonb, links jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select
    not exists (select 1 from jsonb_array_elements(outline) e
      where jsonb_typeof(e) <> 'object' or (e->>'level') not in ('1', '2', '3')
        or jsonb_typeof(e->'text') <> 'string' or char_length(btrim(e->>'text')) not between 1 and 200)
    and (select count(*) from jsonb_array_elements(outline) e where e->>'level' = '1') <= 1
    and not exists (select 1 from jsonb_array_elements(questions) q
      where jsonb_typeof(q) <> 'string' or char_length(btrim(q #>> '{}')) not between 1 and 300)
    and not exists (select 1 from jsonb_array_elements(links) l
      where jsonb_typeof(l) <> 'object' or jsonb_typeof(l->'url') <> 'string'
        or (l->>'url') !~ '^(https?://\S+|/\S*)$' or char_length(l->>'url') > 2048
        or char_length(btrim(coalesce(l->>'anchor', ''))) > 120);
$$;

create function private.content_brief_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare content_changed boolean;
begin
  if not private.content_brief_shape_ok(new.outline, new.questions, new.internal_links) then
    raise exception 'brief outline, questions or internal links are malformed' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.version := 1;
    new.submitted_by := null; new.submitted_at := null; new.reviewed_by := null; new.reviewed_at := null;
    new.approved_by := null; new.approved_at := null; new.archived_at := null; new.review_note := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if new.id <> old.id or new.project_id <> old.project_id or new.organization_id <> old.organization_id
    or new.opportunity_id <> old.opportunity_id or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'identity columns are immutable' using errcode = '42501';
  end if;
  content_changed := (to_jsonb(new) - array['status', 'review_note', 'version', 'submitted_by', 'submitted_at', 'reviewed_by',
      'reviewed_at', 'approved_by', 'approved_at', 'archived_at', 'updated_at'])
    is distinct from (to_jsonb(old) - array['status', 'review_note', 'version', 'submitted_by', 'submitted_at', 'reviewed_by',
      'reviewed_at', 'approved_by', 'approved_at', 'archived_at', 'updated_at']);
  -- Review metadata is written only here, never by the client.
  new.version := old.version; new.submitted_by := old.submitted_by; new.submitted_at := old.submitted_at;
  new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at; new.approved_by := old.approved_by;
  new.approved_at := old.approved_at; new.archived_at := old.archived_at;
  if content_changed then
    if old.status <> 'draft' or new.status <> 'draft' then
      raise exception 'only a draft brief can be edited' using errcode = '42501';
    end if;
    new.version := old.version + 1;
    new.review_note := old.review_note;
  elsif new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'in-review' then
      if not private.has_project_role(new.project_id, array['owner', 'account-manager', 'analyst']) then
        raise exception 'submitting a brief requires propose-action' using errcode = '42501';
      end if;
      if char_length(btrim(coalesce(new.objective, ''))) = 0 or char_length(btrim(coalesce(new.audience, ''))) = 0
        or jsonb_array_length(new.outline) = 0 then
        raise exception 'a brief needs objective, audience and an outline before review' using errcode = '23514';
      end if;
      new.submitted_by := auth.uid(); new.submitted_at := now(); new.review_note := null;
    elsif (old.status, new.status) in (('in-review', 'draft'), ('in-review', 'approved'), ('draft', 'archived'),
        ('in-review', 'archived'), ('approved', 'archived'), ('archived', 'draft')) then
      if not private.has_project_role(new.project_id, array['owner', 'account-manager']) then
        raise exception 'this review step requires review-action' using errcode = '42501';
      end if;
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
      if new.status = 'approved' then
        new.approved_by := auth.uid(); new.approved_at := now();
      elsif new.status = 'archived' then
        new.archived_at := now();
      else
        -- Back to draft (returned or restored): the previous approval no longer applies.
        new.approved_by := null; new.approved_at := null; new.archived_at := null;
      end if;
    else
      raise exception 'brief transition % → % is not allowed', old.status, new.status using errcode = '23514';
    end if;
  elsif new.review_note is distinct from old.review_note then
    raise exception 'a review note is only written with a review step' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger content_briefs_before_write before insert or update on public.content_briefs
  for each row execute function private.content_brief_before_write();

revoke all on function private.content_touch(), private.content_evidence_before_insert(),
  private.content_brief_shape_ok(jsonb, jsonb, jsonb), private.content_brief_before_write()
  from public, anon, authenticated;

-- ── Privileges and RLS (least privilege, explicit grants) ────────────────────────────────

revoke all on public.content_clusters, public.content_opportunities, public.content_evidence, public.content_briefs
  from public, anon, authenticated;
grant select, delete on public.content_clusters, public.content_opportunities, public.content_evidence, public.content_briefs
  to authenticated;
grant insert (project_id, organization_id, name, main_topic, description) on public.content_clusters to authenticated;
grant update (name, main_topic, description) on public.content_clusters to authenticated;
grant insert (project_id, organization_id, cluster_id, cluster_role, topic, search_intent, market_language, market_country,
  page_kind, page_url, opportunity_type, rationale, priority, priority_reason) on public.content_opportunities to authenticated;
grant update (cluster_id, cluster_role, topic, search_intent, market_language, market_country, page_kind, page_url,
  opportunity_type, rationale, priority, priority_reason, status) on public.content_opportunities to authenticated;
grant insert (project_id, organization_id, opportunity_id, kind, provider_result_id, import_id, title, detail, source_url, source_date)
  on public.content_evidence to authenticated;
grant insert (project_id, organization_id, opportunity_id, objective, audience, market_language, market_country, search_intent,
  main_topic, target_url, outline, questions, internal_links, sources_consulted, original_data, risks, cta, assignee)
  on public.content_briefs to authenticated;
grant update (objective, audience, market_language, market_country, search_intent, main_topic, target_url, outline, questions,
  internal_links, sources_consulted, original_data, risks, cta, assignee, status, review_note) on public.content_briefs to authenticated;

alter table public.content_clusters enable row level security;
alter table public.content_opportunities enable row level security;
alter table public.content_evidence enable row level security;
alter table public.content_briefs enable row level security;

create policy "project members read clusters" on public.content_clusters for select to authenticated
  using (private.is_project_member(project_id));
create policy "drafting roles add clusters" on public.content_clusters for insert to authenticated
  with check (created_by = auth.uid() and private.has_project_role(project_id, array['owner', 'account-manager', 'analyst']));
create policy "drafting roles edit clusters" on public.content_clusters for update to authenticated
  using (private.has_project_role(project_id, array['owner', 'account-manager', 'analyst']))
  with check (private.has_project_role(project_id, array['owner', 'account-manager', 'analyst']));
create policy "project owners erase clusters" on public.content_clusters for delete to authenticated
  using (private.has_project_role(project_id, array['owner']));

create policy "project members read opportunities" on public.content_opportunities for select to authenticated
  using (private.is_project_member(project_id));
create policy "drafting roles add opportunities" on public.content_opportunities for insert to authenticated
  with check (created_by = auth.uid() and private.has_project_role(project_id, array['owner', 'account-manager', 'analyst']));
create policy "drafting roles edit opportunities" on public.content_opportunities for update to authenticated
  using (private.has_project_role(project_id, array['owner', 'account-manager', 'analyst']))
  with check (private.has_project_role(project_id, array['owner', 'account-manager', 'analyst']));
create policy "project owners erase opportunities" on public.content_opportunities for delete to authenticated
  using (private.has_project_role(project_id, array['owner']));

create policy "project members read evidence" on public.content_evidence for select to authenticated
  using (private.is_project_member(project_id));
create policy "drafting roles add evidence" on public.content_evidence for insert to authenticated
  with check (created_by = auth.uid() and private.has_project_role(project_id, array['owner', 'account-manager', 'analyst']));
create policy "project owners erase evidence" on public.content_evidence for delete to authenticated
  using (private.has_project_role(project_id, array['owner']));

create policy "project members read briefs" on public.content_briefs for select to authenticated
  using (private.is_project_member(project_id));
create policy "drafting roles add briefs" on public.content_briefs for insert to authenticated
  with check (created_by = auth.uid() and private.has_project_role(project_id, array['owner', 'account-manager', 'analyst']));
-- Finer rules (who may submit, return, approve, archive) live in the BEFORE trigger.
create policy "drafting roles edit briefs" on public.content_briefs for update to authenticated
  using (private.has_project_role(project_id, array['owner', 'account-manager', 'analyst']))
  with check (private.has_project_role(project_id, array['owner', 'account-manager', 'analyst']));
create policy "project owners erase briefs" on public.content_briefs for delete to authenticated
  using (private.has_project_role(project_id, array['owner']));

-- ── S1 audit receipts ────────────────────────────────────────────────────────────────────
-- Audit actions of this module.
-- Full cumulative allowlist in canonical order (S1 → SEO keywords → competitors → content), as the
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
    'content.brief.approve', 'content.brief.archive', 'content.brief.restore', 'content.brief.erase'));
-- Same generalised target rule as N2-11 (identical text: either order converges).
alter table private.audit_outbox drop constraint audit_outbox_target_check;
alter table private.audit_outbox add constraint audit_outbox_target_check
  check ((action = 'member.withdraw' and target_id is not null and target_text is null)
    or (action <> 'member.withdraw' and target_id is null and target_text is not null));

create function private.queue_content_receipt(p_project uuid, p_organization uuid, p_action text, p_target text, p_details jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare effective_role text;
begin
  -- Offline restoration as postgres without a JWT keeps data as is: no receipt.
  if session_user = 'postgres' and auth.uid() is null then return; end if;
  select pm.role into effective_role from public.project_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id
    where pm.project_id = p_project and pm.organization_id = p_organization and pm.user_id = auth.uid();
  if auth.uid() is null or effective_role is null then
    raise exception 'content audit actor is not a project member' using errcode = '42501';
  end if;
  insert into private.audit_outbox (project_id, organization_id, actor_id, actor_role, action, target_text, details)
    values (p_project, p_organization, auth.uid(), effective_role, p_action, p_target, p_details);
end;
$$;

-- True when the row disappears because its project (or a parent row) is being deleted.
create function private.content_cascading(p_project uuid, p_opportunity uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.projects where id = p_project)
    or (p_opportunity is not null and not exists (select 1 from public.content_opportunities where id = p_opportunity));
$$;

create function private.content_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare kind text := case tg_table_name when 'content_clusters' then 'cluster' when 'content_opportunities' then 'opportunity'
  when 'content_evidence' then 'evidence' else 'brief' end;
  r record; act text; details jsonb;
begin
  r := coalesce(new, old);
  if tg_op = 'DELETE' then
    if private.content_cascading(old.project_id, case when kind in ('evidence', 'brief') then (to_jsonb(old)->>'opportunity_id')::uuid end) then
      return old;
    end if;
    act := 'erase';
  elsif tg_op = 'INSERT' then
    act := 'add';
  elsif kind = 'evidence' then
    return new; -- only the referential action clearing an erased source reaches here
  -- to_jsonb: a record field that the row type lacks fails even inside a false AND (clusters,
  -- opportunities and evidence have no status column in the same sense).
  elsif kind = 'brief' and (to_jsonb(new)->>'status') is distinct from (to_jsonb(old)->>'status') then
    act := case when to_jsonb(new)->>'status' = 'in-review' then 'submit' when to_jsonb(new)->>'status' = 'approved' then 'approve'
      when to_jsonb(new)->>'status' = 'archived' then 'archive' when to_jsonb(old)->>'status' = 'archived' then 'restore' else 'return' end;
  else
    act := 'update';
    -- (separate IFs: a record field is resolved even inside a false AND)
    if kind = 'opportunity' then
      if (to_jsonb(old)->>'cluster_id') is not null and (to_jsonb(new)->>'cluster_id') is null
        and not exists (select 1 from public.content_clusters where id = (to_jsonb(old)->>'cluster_id')::uuid) then
        return new; -- cleared by the cluster erase, which has its own receipt
      end if;
    end if;
  end if;
  details := jsonb_build_object('id', r.id) || case kind
    when 'brief' then jsonb_build_object('opportunityId', (to_jsonb(r)->>'opportunity_id'), 'status', (to_jsonb(r)->>'status'), 'version', (to_jsonb(r)->>'version')::int)
    when 'opportunity' then jsonb_build_object('type', (to_jsonb(r)->>'opportunity_type'), 'status', (to_jsonb(r)->>'status'), 'priority', (to_jsonb(r)->>'priority'))
    when 'evidence' then jsonb_build_object('opportunityId', (to_jsonb(r)->>'opportunity_id'), 'kind', (to_jsonb(r)->>'kind'))
    else '{}'::jsonb end;
  perform private.queue_content_receipt(r.project_id, r.organization_id, 'content.' || kind || '.' || act, r.id::text, details);
  return r;
end;
$$;
create trigger content_clusters_audit after insert or update or delete on public.content_clusters
  for each row execute function private.content_after_write();
create trigger content_opportunities_audit after insert or update or delete on public.content_opportunities
  for each row execute function private.content_after_write();
create trigger content_evidence_audit after insert or update or delete on public.content_evidence
  for each row execute function private.content_after_write();
create trigger content_briefs_audit after insert or update or delete on public.content_briefs
  for each row execute function private.content_after_write();

revoke all on function private.queue_content_receipt(uuid, uuid, text, text, jsonb), private.content_cascading(uuid, uuid),
  private.content_after_write() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rubik_audit_writer') then
    revoke all on function private.queue_content_receipt(uuid, uuid, text, text, jsonb), private.content_cascading(uuid, uuid),
      private.content_after_write(), private.content_touch(), private.content_evidence_before_insert(),
      private.content_brief_shape_ok(jsonb, jsonb, jsonb), private.content_brief_before_write() from rubik_audit_writer;
  end if;
end $$;

comment on table public.content_opportunities is 'N2-12: content opportunities with declared intent, market and priority reason; proposals, never measurements';
comment on table public.content_evidence is 'N2-12: evidence behind an opportunity; stored sources are verified in the same project, URLs are never fetched';
comment on table public.content_briefs is 'N2-12: editorial briefs; draft → in-review → approved → archived; approval attributed by the database';
