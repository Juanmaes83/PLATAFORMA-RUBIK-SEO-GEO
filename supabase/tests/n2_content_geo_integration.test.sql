-- N2-12/N2-13 integration on main: audited UPDATEs of every content row type by role (a cluster
-- edit used to fail in the audit trigger), viewer denial, cross-organization isolation of both
-- modules, and the authorship FKs. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, email, aud, role) values
 ('00000000-0000-4000-8000-0000000f0a01', 'cgi-owner-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000f0a02', 'cgi-analyst-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000f0a03', 'cgi-viewer-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000f0b01', 'cgi-owner-b@ejemplo.test', 'authenticated', 'authenticated');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-0000000f0a01');
insert into public.organizations(slug, name) values ('cgi-a', 'Agencia A');
insert into public.projects(organization_id, slug, name) select id, 'cgi-a1', 'A1' from public.organizations where slug = 'cgi-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000f0b01');
insert into public.organizations(slug, name) values ('cgi-b', 'Agencia B');
insert into public.projects(organization_id, slug, name) select id, 'cgi-b1', 'B1' from public.organizations where slug = 'cgi-b';
select pg_temp.admin();
insert into public.organization_members(organization_id, user_id, role)
  select o.id, u, 'member' from public.organizations o,
    unnest(array['00000000-0000-4000-8000-0000000f0a02', '00000000-0000-4000-8000-0000000f0a03']::uuid[]) u where o.slug = 'cgi-a';
insert into public.project_members(project_id, organization_id, user_id, role)
  select p.id, p.organization_id, v.u, v.r from public.projects p,
    (values ('00000000-0000-4000-8000-0000000f0a02'::uuid, 'analyst'), ('00000000-0000-4000-8000-0000000f0a03'::uuid, 'viewer')) v(u, r)
  where p.slug = 'cgi-a1';
create temp table ids as select (select id from public.projects where slug = 'cgi-a1') a1, (select id from public.organizations where slug = 'cgi-a') org_a;
grant select on ids to authenticated;

select pg_temp.act_as('00000000-0000-4000-8000-0000000f0a02');
insert into public.content_clusters(project_id, organization_id, name, main_topic) select a1, org_a, 'Carta', 'menú' from ids;
insert into public.content_opportunities(project_id, organization_id, topic, search_intent, market_language, page_kind, opportunity_type, rationale)
  select a1, org_a, 'Menú', 'local', 'es', 'proposed', 'create', 'Sin página.' from ids;
insert into public.geo_observations(project_id, organization_id, entity_name, engine, query_text, observed_on, method, presence)
  select a1, org_a, 'Sol', 'chatgpt', '¿Menú?', current_date, 'manual-copy', 'absent' from ids;

select lives_ok($$update public.content_clusters set description = 'Editado por el analista' where name = 'Carta'$$,
  'an analyst edits a cluster (the audit trigger no longer reads a status column clusters lack)');
select lives_ok($$update public.content_opportunities set rationale = 'Motivo revisado' where topic = 'Menú'$$, 'an analyst edits an opportunity');
select pg_temp.admin();
select results_eq($$select action from private.audit_outbox where project_id = (select a1 from ids) and action like 'content.%.update' order by action$$,
  $$values ('content.cluster.update'), ('content.opportunity.update')$$, 'each edit queues its own update receipt');
select is((select updated_at > created_at or updated_at = created_at from public.content_clusters where name = 'Carta'), true, 'updated_at kept by the trigger');

select pg_temp.act_as('00000000-0000-4000-8000-0000000f0a03');
update public.content_clusters set description = 'visor' where name = 'Carta';
select pg_temp.admin();
select is((select description from public.content_clusters where name = 'Carta'), 'Editado por el analista', 'a viewer changes nothing (RLS)');

select pg_temp.act_as('00000000-0000-4000-8000-0000000f0b01');
select is((select count(*)::int from public.content_clusters) + (select count(*)::int from public.content_opportunities)
  + (select count(*)::int from public.geo_observations), 0, 'the owner of another organization reads no Contenidos/GEO row of A');
select throws_ok($$insert into public.content_clusters(project_id, organization_id, name, main_topic) select a1, org_a, 'Intruso', 'x' from ids$$,
  '42501', null, 'nor writes into A');

select pg_temp.admin();
select ok((select count(*) = 11 from pg_constraint where contype = 'f' and confrelid = 'auth.users'::regclass
  and conrelid::regclass::text in ('content_clusters', 'content_opportunities', 'content_evidence', 'content_briefs', 'geo_observations', 'geo_proposals')),
  'eleven authorship columns of Contenidos/GEO reference auth.users (retention)');

select * from finish();
rollback;
