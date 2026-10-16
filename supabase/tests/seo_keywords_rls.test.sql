-- N2-09: local-only fictitious fixtures; every change rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role,email_confirmed_at) values
 ('00000000-0000-4000-8000-000000000921','seo-owner-a@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-000000000922','seo-owner-b@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-000000000923','seo-analyst@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-000000000924','seo-viewer@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-000000000925','seo-outsider@example.test','authenticated','authenticated',now());
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true), set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-000000000921');
insert into public.organizations(slug,name) values('seo-org-a','SEO A');
insert into public.projects(organization_id,slug,name,domain) select id,'seo-a1','A1','a.example.test' from public.organizations where slug='seo-org-a';
insert into public.projects(organization_id,slug,name,domain) select id,'seo-a2','A2','a2.example.test' from public.organizations where slug='seo-org-a';
select pg_temp.act_as('00000000-0000-4000-8000-000000000922');
insert into public.organizations(slug,name) values('seo-org-b','SEO B');
insert into public.projects(organization_id,slug,name,domain) select id,'seo-b1','B1','b.example.test' from public.organizations where slug='seo-org-b';
select set_config('role','postgres',true);
insert into public.organization_members(organization_id,user_id,role)
 select id, u, 'member' from public.organizations cross join unnest(array['00000000-0000-4000-8000-000000000923','00000000-0000-4000-8000-000000000924']::uuid[]) u where slug='seo-org-a';
insert into public.project_members(project_id,organization_id,user_id,role)
 select id,organization_id,'00000000-0000-4000-8000-000000000923','analyst' from public.projects where slug='seo-a1';
insert into public.project_members(project_id,organization_id,user_id,role)
 select id,organization_id,'00000000-0000-4000-8000-000000000924','viewer' from public.projects where slug='seo-a1';
create temp table seo_ids as select slug,id,organization_id from public.projects where slug in ('seo-a1','seo-a2','seo-b1');
grant select on seo_ids to authenticated;
select ok((select relrowsecurity from pg_class where oid='public.seo_keywords'::regclass),'keyword RLS enabled');
select ok(not has_table_privilege('anon','public.seo_keywords','select,insert,update,delete'),'anon has no table privilege');
select ok(not has_column_privilege('authenticated','public.seo_keywords','project_id','update'),'scope cannot be updated');
select ok(not has_column_privilege('authenticated','public.seo_keywords','created_by','insert'),'actor cannot be forged');

select pg_temp.act_as('00000000-0000-4000-8000-000000000921');
select lives_ok($$insert into public.seo_keywords(project_id,organization_id,phrase,language_code,country_code)
 select id,organization_id,'consulta a','es','ES' from seo_ids where slug='seo-a1'$$,'A can declare keyword in A1');
select lives_ok($$insert into public.seo_keywords(project_id,organization_id,phrase,language_code,country_code,target_url)
 select id,organization_id,'consulta propia','es','ES','https://a.example.test/pagina' from seo_ids where slug='seo-a1'$$,'same-project HTTPS target is accepted');
select throws_ok($$insert into public.seo_keywords(project_id,organization_id,phrase,language_code,country_code,target_url)
 select id,organization_id,'consulta externa','es','ES','https://evil.example.test/pagina' from seo_ids where slug='seo-a1'$$,'23514',null,'direct Data API insert cannot target another host');
select throws_ok($$update public.seo_keywords set target_url='https://a.example.test@evil.test/' where phrase='consulta a'$$,
 '23514',null,'direct Data API update cannot use a userinfo host confusion');
select lives_ok($$insert into public.seo_keywords(project_id,organization_id,phrase,language_code,country_code)
 select id,organization_id,'consulta a2','es','ES' from seo_ids where slug='seo-a2'$$,'A can declare keyword in A2');
select throws_ok($$insert into public.seo_keywords(project_id,organization_id,phrase,language_code,country_code)
 select id,organization_id,'intrusa','es','ES' from seo_ids where slug='seo-b1'$$,'42501',null,'A cannot insert into B');
select pg_temp.act_as('00000000-0000-4000-8000-000000000922');
select lives_ok($$insert into public.seo_keywords(project_id,organization_id,phrase,language_code,country_code)
 select id,organization_id,'consulta b','es','ES' from seo_ids where slug='seo-b1'$$,'B can declare keyword in B1');
select results_eq($$select phrase from public.seo_keywords order by phrase$$,array['consulta b'],'B sees only B keywords');
select is_empty($$update public.seo_keywords set topic='robado' where phrase='consulta a' returning 1$$,'B cannot edit A keyword');
select is_empty($$delete from public.seo_keywords where phrase='consulta a' returning 1$$,'B cannot delete A keyword');
select pg_temp.act_as('00000000-0000-4000-8000-000000000923');
select results_eq($$select phrase from public.seo_keywords order by phrase$$,array['consulta a','consulta propia'],'analyst sees only assigned A1');
select lives_ok($$insert into public.seo_keywords(project_id,organization_id,phrase,language_code,country_code)
 select id,organization_id,'analista','es','ES' from seo_ids where slug='seo-a1'$$,'analyst can add in A1');
select throws_ok($$insert into public.seo_keywords(project_id,organization_id,phrase,language_code,country_code)
 select id,organization_id,'sin acceso','es','ES' from seo_ids where slug='seo-a2'$$,'42501',null,'analyst cannot add to A2');
select pg_temp.act_as('00000000-0000-4000-8000-000000000924');
select results_eq($$select phrase from public.seo_keywords order by phrase$$,array['analista','consulta a','consulta propia'],'viewer can read A1');
select throws_ok($$insert into public.seo_keywords(project_id,organization_id,phrase,language_code,country_code)
 select id,organization_id,'viewer write','es','ES' from seo_ids where slug='seo-a1'$$,'42501',null,'viewer cannot add');
select is_empty($$update public.seo_keywords set topic='changed' returning 1$$,'viewer cannot edit');
select is_empty($$delete from public.seo_keywords returning 1$$,'viewer cannot delete');
select pg_temp.act_as('00000000-0000-4000-8000-000000000925');
select is_empty($$select 1 from public.seo_keywords$$,'outsider sees nothing');
select throws_ok($$insert into public.seo_keywords(project_id,organization_id,phrase,language_code,country_code)
 select id,organization_id,'outside','es','ES' from seo_ids where slug='seo-a1'$$,'42501',null,'outsider cannot add');
select * from finish();
rollback;
