-- N2-09: user-declared keyword research. Local/CI only until hosted authorization.
-- No provider measurement or signed observation is stored in this table.
create table public.seo_keywords (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  phrase text not null check (char_length(phrase) between 2 and 160),
  language_code text not null check (language_code ~ '^[a-z]{2}(-[a-z]{2})?$'),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  intent text not null default 'unknown' check (intent in ('unknown','informational','navigational','commercial','transactional')),
  topic text not null default '' check (char_length(topic) <= 80),
  target_url text check (target_url is null or (char_length(target_url) <= 2048 and target_url ~ '^https://')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade
);
create index seo_keywords_project_idx on public.seo_keywords(project_id, created_at desc);
create unique index seo_keywords_declared_unique on public.seo_keywords
  (project_id, lower(phrase), language_code, country_code, coalesce(target_url, ''));
revoke all on public.seo_keywords from public, anon, authenticated;
grant select on public.seo_keywords to authenticated;
grant insert (project_id, organization_id, phrase, language_code, country_code, intent, topic, target_url) on public.seo_keywords to authenticated;
grant update (intent, topic, target_url) on public.seo_keywords to authenticated;
grant delete on public.seo_keywords to authenticated;
alter table public.seo_keywords enable row level security;
create policy "project members read keywords" on public.seo_keywords for select to authenticated
  using ((select private.is_project_member(project_id)));
create policy "drafting roles create keywords" on public.seo_keywords for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.has_project_role(project_id, array['owner','account-manager','analyst'])));
create policy "drafting roles edit keywords" on public.seo_keywords for update to authenticated
  using ((select private.has_project_role(project_id, array['owner','account-manager','analyst'])))
  with check ((select private.has_project_role(project_id, array['owner','account-manager','analyst'])));
-- Deletion follows the Core `delete-data` action (owner only); draft permission is insufficient.
create policy "project owners erase keywords" on public.seo_keywords for delete to authenticated
  using ((select private.has_project_role(project_id, array['owner'])));

create function private.seo_keyword_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger seo_keywords_touch_updated_at before update on public.seo_keywords
  for each row execute function private.seo_keyword_touch_updated_at();
revoke all on function private.seo_keyword_touch_updated_at() from public, anon, authenticated;

-- Keep the complete S1 action set and add N2 actions explicitly. Avoid converting a text[]
-- through dynamic SQL: PostgreSQL renders that array as a scalar string, which nests the
-- earlier action list and makes valid receipts fail the constraint.
alter table private.audit_outbox drop constraint audit_outbox_action_check;
alter table private.audit_outbox add constraint audit_outbox_action_check
  check (action in ('member.withdraw', 'import.file', 'import.erase', 'provider-results.erase',
    'google.capture', 'openseo.audit.store', 'seo.keyword.add', 'seo.keyword.update', 'seo.keyword.erase'));
alter table private.audit_outbox drop constraint audit_outbox_target_check;
alter table private.audit_outbox add constraint audit_outbox_target_check
  check ((action = 'member.withdraw' and target_id is not null and target_text is null)
    or (action <> 'member.withdraw' and target_id is null and target_text is not null));

create function private.queue_seo_keyword_receipt(p_project uuid, p_organization uuid, p_action text,
  p_target text, p_details jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare effective_role text;
begin
  if session_user = 'postgres' and auth.uid() is null then return; end if;
  select pm.role into effective_role from public.project_members pm
    join public.organization_members om on om.organization_id = pm.organization_id and om.user_id = pm.user_id
    where pm.project_id = p_project and pm.organization_id = p_organization and pm.user_id = auth.uid();
  if auth.uid() is null or effective_role is null then
    raise exception 'keyword audit actor is not a project member' using errcode = '42501';
  end if;
  insert into private.audit_outbox (project_id, organization_id, actor_id, actor_role, action, target_text, details)
    values (p_project, p_organization, auth.uid(), effective_role, p_action, p_target, p_details);
end;
$$;

create function private.seo_keyword_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.queue_seo_keyword_receipt(new.project_id, new.organization_id, 'seo.keyword.add', new.phrase,
      jsonb_build_object('keywordId', new.id, 'language', new.language_code, 'country', new.country_code));
    return new;
  elsif tg_op = 'UPDATE' then
    if (new.intent, new.topic, new.target_url) is distinct from (old.intent, old.topic, old.target_url) then
      perform private.queue_seo_keyword_receipt(new.project_id, new.organization_id, 'seo.keyword.update', new.phrase,
        jsonb_build_object('keywordId', new.id, 'language', new.language_code, 'country', new.country_code));
    end if;
    return new;
  end if;
  if exists (select 1 from public.projects where id = old.project_id) then
    perform private.queue_seo_keyword_receipt(old.project_id, old.organization_id, 'seo.keyword.erase', old.phrase,
      jsonb_build_object('keywordId', old.id, 'language', old.language_code, 'country', old.country_code));
  end if;
  return old;
end;
$$;
create trigger seo_keywords_audit after insert or update or delete on public.seo_keywords
  for each row execute function private.seo_keyword_after_write();
revoke all on function private.queue_seo_keyword_receipt(uuid, uuid, text, text, jsonb),
  private.seo_keyword_after_write() from public, anon, authenticated, rubik_audit_writer;
