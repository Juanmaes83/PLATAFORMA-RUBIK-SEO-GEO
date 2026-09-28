-- CORE-9.1 · RLS and tenant isolation (pgTAP). Run with `supabase test db` against the LOCAL
-- stack only. Everything happens inside a transaction that is rolled back: fictitious users
-- with reserved `.test` e-mail domains, no real data.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ── Fictitious users ────────────────────────────────────────────────────────────────────
-- a: owner of agencia-a · b: owner of agencia-b · c: analyst in a1 · e: client-approver in a1
-- d: authenticated but without any membership.
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'a@ejemplo.test', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-4000-8000-00000000000b', 'b@ejemplo.test', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-4000-8000-00000000000c', 'c@ejemplo.test', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-4000-8000-00000000000d', 'd@ejemplo.test', 'authenticated', 'authenticated', '{"role":"owner","organization":"agencia-a"}'),
  ('00000000-0000-4000-8000-00000000000e', 'e@ejemplo.test', 'authenticated', 'authenticated', '{}');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.act_as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

-- ── Structure ───────────────────────────────────────────────────────────────────────────
select ok(bool_and(c.relrowsecurity), 'RLS is enabled on every CORE-9.1 table')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('organizations', 'organization_members', 'projects', 'project_members');
select is(count(*)::int, 0, 'every table in public has RLS enabled')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
select ok(not has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete'), 'anon has no privilege on ' || t)
  from unnest(array['organizations', 'organization_members', 'projects', 'project_members']) t;
select ok(not has_function_privilege('anon', 'private.is_org_member(uuid)', 'execute'), 'anon cannot run private helpers');
select is(count(*)::int, 0, 'every UPDATE policy has a WITH CHECK clause')
  from pg_policies where schemaname = 'public' and cmd = 'UPDATE' and (with_check is null or qual is null);
select is(count(*)::int, 0, 'no policy mentions user_metadata')
  from pg_policies where schemaname = 'public'
  and (coalesce(qual, '') || coalesce(with_check, '')) ~* '(user_metadata|raw_user_meta_data)';
select is(count(*)::int, 0, 'no policy is granted to anon or public')
  from pg_policies where schemaname = 'public' and not (roles = array['authenticated']::name[]);

-- ── Organization and project creation through RLS ───────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-00000000000a');
select lives_ok($$insert into public.organizations (slug, name) values ('agencia-a', 'Agencia A')$$, 'a creates agencia-a');
select is((select role from public.organization_members where user_id = auth.uid()), 'owner', 'the creator becomes owner');
select lives_ok($$insert into public.projects (organization_id, slug, name, domain)
  select id, 'proyecto-a1', 'Proyecto A1', 'a1.ejemplo.test' from public.organizations where slug = 'agencia-a'$$, 'a creates proyecto-a1');
select is((select role from public.project_members where user_id = auth.uid()), 'owner', 'the project creator becomes its owner');

select pg_temp.act_as('00000000-0000-4000-8000-00000000000b');
select lives_ok($$insert into public.organizations (slug, name) values ('agencia-b', 'Agencia B')$$, 'b creates agencia-b');
select lives_ok($$insert into public.projects (organization_id, slug, name)
  select id, 'proyecto-b1', 'Proyecto B1' from public.organizations where slug = 'agencia-b'$$, 'b creates proyecto-b1');
select throws_ok($$insert into public.organizations (slug, name, created_by)
  values ('suplantada', 'X', '00000000-0000-4000-8000-00000000000a')$$, '42501', null, 'created_by cannot be chosen by the client');

-- ── Cross-tenant reads ──────────────────────────────────────────────────────────────────
select results_eq($$select slug from public.projects order by slug$$, array['proyecto-b1'], 'b only sees its own project');
select results_eq($$select slug from public.organizations$$, array['agencia-b'], 'b only sees its own organization');
select is_empty($$select 1 from public.projects where slug = 'proyecto-a1'$$, 'b cannot read proyecto-a1 even by slug');
select is_empty($$select 1 from public.organization_members where user_id = '00000000-0000-4000-8000-00000000000a'$$, 'b cannot read memberships of agencia-a');

-- ── Cross-tenant writes and ID manipulation ─────────────────────────────────────────────
select pg_temp.act_as_admin();
create temp table ids on commit drop as
  select (select id from public.organizations where slug = 'agencia-a') org_a,
         (select id from public.organizations where slug = 'agencia-b') org_b,
         (select id from public.projects where slug = 'proyecto-a1') a1,
         (select id from public.projects where slug = 'proyecto-b1') b1;
grant select on ids to authenticated;

select pg_temp.act_as('00000000-0000-4000-8000-00000000000b');
select throws_ok($$insert into public.projects (organization_id, slug, name) select org_a, 'intrusa', 'X' from ids$$,
  '42501', null, 'b cannot create a project in agencia-a');
select throws_ok($$insert into public.organization_members (organization_id, user_id, role)
  select org_a, '00000000-0000-4000-8000-00000000000b', 'owner' from ids$$, '42501', null, 'b cannot join agencia-a as owner');
select throws_ok($$insert into public.project_members (project_id, organization_id, user_id, role)
  select a1, org_a, '00000000-0000-4000-8000-00000000000b', 'owner' from ids$$, '42501', null, 'b cannot add itself to proyecto-a1');
select throws_ok($$insert into public.project_members (project_id, organization_id, user_id, role)
  select a1, org_b, '00000000-0000-4000-8000-00000000000b', 'owner' from ids$$, '23503', null,
  'a project id from agencia-a paired with agencia-b is rejected by the composite foreign key');
select is_empty($$update public.projects set name = 'Hackeado' where id = (select a1 from ids) returning 1$$, 'b cannot update proyecto-a1');
select is_empty($$update public.organizations set name = 'Hackeada' where id = (select org_a from ids) returning 1$$, 'b cannot rename agencia-a');
select is_empty($$delete from public.project_members where project_id = (select a1 from ids) returning 1$$, 'b cannot delete memberships of proyecto-a1');
select throws_ok($$update public.projects set organization_id = (select org_a from ids) where id = (select b1 from ids)$$,
  '42501', null, 'a project cannot be moved to another organization');
select throws_ok($$update public.project_members set organization_id = (select org_a from ids)$$,
  '42501', null, 'a membership cannot be moved to another organization');

-- ── A user without membership, even with forged user_metadata ───────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-00000000000d');
select is_empty($$select 1 from public.organizations$$, 'd (no membership, user_metadata says owner) sees no organization');
select is_empty($$select 1 from public.projects$$, 'd sees no project');
select is_empty($$select 1 from public.organization_members$$, 'd sees no membership');
select throws_ok($$insert into public.projects (organization_id, slug, name) select org_a, 'intrusa', 'X' from ids$$,
  '42501', null, 'd cannot create projects in agencia-a');

-- ── Roles inside one tenant ─────────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-00000000000a');
select lives_ok($$insert into public.organization_members (organization_id, user_id, role) select org_a, u, 'member' from ids,
  unnest(array['00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-00000000000e']::uuid[]) u$$, 'the owner adds c and e to agencia-a');
select lives_ok($$insert into public.project_members (project_id, organization_id, user_id, role) select a1, org_a, u, r from ids,
  (values ('00000000-0000-4000-8000-00000000000c'::uuid, 'analyst'), ('00000000-0000-4000-8000-00000000000e'::uuid, 'client-approver')) v(u, r)$$,
  'the owner gives c the analyst role and e the client-approver role in proyecto-a1');
select throws_ok($$insert into public.project_members (project_id, organization_id, user_id, role)
  select a1, org_a, '00000000-0000-4000-8000-00000000000d', 'viewer' from ids$$, '23503', null,
  'a project role requires membership of the same organization');
select throws_ok($$insert into public.project_members (project_id, organization_id, user_id, role)
  select a1, org_a, '00000000-0000-4000-8000-00000000000c', 'ai' from ids$$, '23514', null, 'non-human Core roles cannot be assigned to people');

select pg_temp.act_as('00000000-0000-4000-8000-00000000000c');
select results_eq($$select slug from public.projects$$, array['proyecto-a1'], 'the analyst sees proyecto-a1');
select results_eq($$select role from public.project_members$$, array['analyst'], 'the analyst only sees its own role');
select is_empty($$update public.projects set name = 'Cambio' where slug = 'proyecto-a1' returning 1$$, 'the analyst cannot edit the project');
select is_empty($$update public.project_members set role = 'owner' where user_id = auth.uid() returning 1$$, 'the analyst cannot promote itself');
select throws_ok($$insert into public.projects (organization_id, slug, name) select org_a, 'nuevo', 'X' from ids$$,
  '42501', null, 'the analyst cannot create projects');
select throws_ok($$insert into public.organizations (slug, name) values ('agencia-a', 'Duplicada')$$, '23505', null, 'tenant slugs are unique');

select pg_temp.act_as('00000000-0000-4000-8000-00000000000a');
select is((select count(*)::int from public.project_members where project_id = (select a1 from ids)), 3, 'the org owner sees all project roles');
select isnt_empty($$update public.projects set name = 'Proyecto A1 (editado)' where slug = 'proyecto-a1' returning 1$$, 'the project owner edits the project');
select throws_ok($$delete from public.organization_members where user_id = auth.uid()$$, 'P0001', null, 'the last owner cannot leave');
select throws_ok($$update public.organization_members set role = 'member' where user_id = auth.uid()$$, 'P0001', null, 'the last owner cannot be demoted');
select lives_ok($$update public.organization_members set role = 'owner' where user_id = '00000000-0000-4000-8000-00000000000c'$$, 'a second owner can be named');
select lives_ok($$update public.organization_members set role = 'member' where user_id = auth.uid()$$, 'then the first owner can step down');

select pg_temp.act_as_admin();
select is((select name from public.projects where slug = 'proyecto-a1'), 'Proyecto A1 (editado)', 'only the permitted update changed proyecto-a1');
select is((select name from public.organizations where slug = 'agencia-a'), 'Agencia A', 'agencia-a keeps its name');

select * from finish();
rollback;
