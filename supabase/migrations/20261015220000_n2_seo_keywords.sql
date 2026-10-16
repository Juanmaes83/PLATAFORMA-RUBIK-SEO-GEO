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
grant update (intent, topic, target_url, updated_at) on public.seo_keywords to authenticated;
grant delete on public.seo_keywords to authenticated;
alter table public.seo_keywords enable row level security;
create policy "project members read keywords" on public.seo_keywords for select to authenticated
  using ((select private.is_project_member(project_id)));
create policy "drafting roles create keywords" on public.seo_keywords for insert to authenticated
  with check (created_by = (select auth.uid()) and (select private.has_project_role(project_id, array['owner','account-manager','analyst'])));
create policy "drafting roles edit keywords" on public.seo_keywords for update to authenticated
  using ((select private.has_project_role(project_id, array['owner','account-manager','analyst'])))
  with check ((select private.has_project_role(project_id, array['owner','account-manager','analyst'])));
create policy "drafting roles delete keywords" on public.seo_keywords for delete to authenticated
  using ((select private.has_project_role(project_id, array['owner','account-manager','analyst'])));
