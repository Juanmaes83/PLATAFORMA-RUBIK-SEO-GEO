-- CORE-9.1 · Organizations (tenants), projects, memberships and row level security.
--
-- Versioned in the repository and applied ONLY to the local Supabase stack (supabase start /
-- supabase db reset) and in CI. It has NOT been applied to the hosted project: that is a manual,
-- owner-approved step (docs/SETUP-SUPABASE.md). Model and role mapping: docs/adr/0003.
--
-- Principles:
-- * Every table in the exposed `public` schema has RLS enabled and explicit least-privilege
--   policies for the `authenticated` role only. `anon` gets nothing.
-- * Privileges are granted explicitly (the hosted project has automatic table exposure
--   disabled), per column where a row may be updated.
-- * Authorization never reads user_metadata: it depends only on auth.uid() and membership rows.
-- * Every UPDATE policy has both USING and WITH CHECK.
-- * Tenant consistency is enforced by composite foreign keys, not only by policies.
-- * Helper functions are SECURITY DEFINER with an empty search_path and live in the `private`
--   schema, which is not exposed through the Data API.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ── Tables ──────────────────────────────────────────────────────────────────────────────

-- A tenant. `slug` is the Core scope's tenantId (same format as platform-contracts' scope()).
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Membership of a user in an organization. `owner` administers the organization (projects and
-- members); `member` only belongs to it. Permissions on project data come from project_members.
create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- A project inside one organization. `slug` is the Core scope's projectId.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  domain text check (domain is null or domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  vertical text check (vertical is null or char_length(vertical) <= 60),
  created_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (id, organization_id)
);

-- Human role of a user in one project, using the Core's human roles (platform-contracts ROLES
-- minus `system` and `ai`, which are never people). The composite foreign keys guarantee that
-- the project belongs to organization_id and that the user is a member of that organization.
create table public.project_members (
  project_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('owner', 'account-manager', 'analyst', 'client-approver', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  foreign key (organization_id, user_id) references public.organization_members (organization_id, user_id) on delete cascade
);
create index project_members_user_idx on public.project_members (user_id);
create index project_members_org_idx on public.project_members (organization_id, user_id);

-- ── Helper functions (not exposed) ─────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can check memberships without recursive RLS evaluation. They
-- only ever answer about the calling user (auth.uid()).

create function private.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = (select auth.uid())
  );
$$;

create function private.is_org_owner(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

create function private.is_project_member(project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = project and m.user_id = (select auth.uid())
  );
$$;

create function private.has_project_role(project uuid, roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = project and m.user_id = (select auth.uid()) and m.role = any (roles)
  );
$$;

revoke all on function private.is_org_member(uuid), private.is_org_owner(uuid),
  private.is_project_member(uuid), private.has_project_role(uuid, text[]) from public, anon;
grant execute on function private.is_org_member(uuid), private.is_org_owner(uuid),
  private.is_project_member(uuid), private.has_project_role(uuid, text[]) to authenticated;

-- ── Triggers ────────────────────────────────────────────────────────────────────────────

-- The creator of an organization becomes its first owner.
create function private.add_creator_as_org_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.organization_members (organization_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return null;
end;
$$;
create trigger organizations_add_owner after insert on public.organizations
  for each row execute function private.add_creator_as_org_owner();

-- The creator of a project (an organization owner, see the insert policy) becomes its owner.
-- Inserts without a user session (local seeding or tests as a superuser) add no member.
create function private.add_creator_as_project_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    insert into public.project_members (project_id, organization_id, user_id, role)
    values (new.id, new.organization_id, (select auth.uid()), 'owner');
  end if;
  return null;
end;
$$;
create trigger projects_add_owner after insert on public.projects
  for each row execute function private.add_creator_as_project_owner();

-- An organization always keeps at least one owner while users operate it. Cascading deletes
-- (organization or auth user removed by an administrator) are not blocked.
create function private.keep_last_org_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') and not exists (
    select 1 from public.organization_members m
    where m.organization_id = old.organization_id and m.role = 'owner' and m.user_id <> old.user_id
  ) then
    raise exception 'La organización debe conservar al menos una persona titular.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger organization_members_keep_owner before update or delete on public.organization_members
  for each row execute function private.keep_last_org_owner();

revoke all on function private.add_creator_as_org_owner(), private.add_creator_as_project_owner(),
  private.keep_last_org_owner() from public, anon, authenticated;

-- ── Privileges (explicit, least privilege) ──────────────────────────────────────────────

revoke all on public.organizations, public.organization_members, public.projects, public.project_members
  from public, anon, authenticated;

grant select on public.organizations to authenticated;
grant insert (slug, name) on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;

grant select on public.organization_members to authenticated;
grant insert (organization_id, user_id, role) on public.organization_members to authenticated;
grant update (role) on public.organization_members to authenticated;
grant delete on public.organization_members to authenticated;

grant select on public.projects to authenticated;
grant insert (organization_id, slug, name, domain, vertical) on public.projects to authenticated;
grant update (name, domain, vertical) on public.projects to authenticated;

grant select on public.project_members to authenticated;
grant insert (project_id, organization_id, user_id, role) on public.project_members to authenticated;
grant update (role) on public.project_members to authenticated;
grant delete on public.project_members to authenticated;

-- ── Row level security ──────────────────────────────────────────────────────────────────

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;

-- organizations
create policy "members read their organizations" on public.organizations
  for select to authenticated using ((select private.is_org_member(id)));
create policy "users create organizations as themselves" on public.organizations
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "owners rename their organization" on public.organizations
  for update to authenticated
  using ((select private.is_org_owner(id)))
  with check ((select private.is_org_owner(id)));

-- organization_members: a user sees their own memberships; owners see and manage all of theirs.
create policy "read own or administered org memberships" on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_org_owner(organization_id)));
create policy "owners add org members" on public.organization_members
  for insert to authenticated with check ((select private.is_org_owner(organization_id)));
create policy "owners change org roles" on public.organization_members
  for update to authenticated
  using ((select private.is_org_owner(organization_id)))
  with check ((select private.is_org_owner(organization_id)));
create policy "owners remove org members" on public.organization_members
  for delete to authenticated using ((select private.is_org_owner(organization_id)));

-- projects: only project members read a project; organization owners create projects; the
-- project owner (Core role `owner`) edits its descriptive fields.
create policy "project members read the project" on public.projects
  for select to authenticated using ((select private.is_project_member(id)));
create policy "org owners create projects" on public.projects
  for insert to authenticated with check ((select private.is_org_owner(organization_id)));
create policy "project owners edit the project" on public.projects
  for update to authenticated
  using ((select private.has_project_role(id, array['owner'])))
  with check ((select private.has_project_role(id, array['owner'])));

-- project_members: a user sees their own role; organization owners manage project roles.
create policy "read own or administered project memberships" on public.project_members
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_org_owner(organization_id)));
create policy "org owners add project members" on public.project_members
  for insert to authenticated with check ((select private.is_org_owner(organization_id)));
create policy "org owners change project roles" on public.project_members
  for update to authenticated
  using ((select private.is_org_owner(organization_id)))
  with check ((select private.is_org_owner(organization_id)));
create policy "org owners remove project members" on public.project_members
  for delete to authenticated using ((select private.is_org_owner(organization_id)));
