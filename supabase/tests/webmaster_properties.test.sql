begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role) values
 ('00000000-0000-4000-8000-0000000000a1','wm-a@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-0000000000a2','wm-b@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-0000000000a3','wm-viewer@example.test','authenticated','authenticated');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),
 set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
insert into public.organizations(slug,name) values('wm-a','A');
insert into public.projects(organization_id,slug,name,domain)
 select id,s,s,d from public.organizations, (values ('wm-a1','www.cliente-a.example'),('wm-a2','otro-a.example')) v(s,d) where slug='wm-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
insert into public.organizations(slug,name) values('wm-b','B');
insert into public.projects(organization_id,slug,name,domain) select id,'wm-b1','B1','cliente-b.example' from public.organizations where slug='wm-b';
select set_config('role','postgres',true);
insert into public.organization_members(organization_id,user_id,role)
 select id,'00000000-0000-4000-8000-0000000000a3','member' from public.organizations where slug='wm-a';
insert into public.project_members(project_id,organization_id,user_id,role)
 select id,organization_id,'00000000-0000-4000-8000-0000000000a3','viewer' from public.projects where slug='wm-a1';
create temp table ids as select slug,id project_id from public.projects where slug like 'wm-%';
grant select on ids to authenticated;
create function pg_temp.pid(s text) returns uuid language sql as $$ select project_id from ids where slug=s $$;
create function pg_temp.site(u text, consent boolean default true) returns jsonb language sql as $$ select jsonb_build_object('siteUrl',u,'consent',consent) $$;

select ok((select relrowsecurity from pg_class where oid='private.webmaster_properties'::regclass),'properties have RLS');
select ok(not has_table_privilege('authenticated','private.webmaster_properties','select,insert,update,delete'),'no direct table access');
select ok(not has_function_privilege('anon','public.webmaster_property(uuid,text,text,jsonb)','execute'),'anon cannot execute RPC');
select ok(not exists(select 1 from information_schema.columns where table_schema='private' and table_name='webmaster_properties'
 and column_name ~ '(key|secret|token|password|credential)'),'no credential-like column');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select is(public.webmaster_property(pg_temp.pid('wm-a1'),'search-console','get')->>'state','NONE','nothing by default');
select throws_ok($$select public.webmaster_property(pg_temp.pid('wm-a1'),'search-console','connect',pg_temp.site('sc-domain:cliente-a.example',false))$$,'22023',null,'consent required');
select throws_ok($$select public.webmaster_property(pg_temp.pid('wm-a1'),'search-console','connect',pg_temp.site('sc-domain:cliente-b.example'))$$,'22023',null,'another client domain refused');
select throws_ok($$select public.webmaster_property(pg_temp.pid('wm-a1'),'search-console','connect',pg_temp.site('http://cliente-a.example/'))$$,'22023',null,'http refused');
select throws_ok($$select public.webmaster_property(pg_temp.pid('wm-a1'),'search-console','connect',pg_temp.site('https://blog.cliente-a.example/'))$$,'22023',null,'other subdomain refused');
select throws_ok($$select public.webmaster_property(pg_temp.pid('wm-a1'),'bing-webmaster','connect',pg_temp.site('sc-domain:cliente-a.example'))$$,'22023',null,'Bing has no Domain property form');
select throws_ok($$select public.webmaster_property(pg_temp.pid('wm-a1'),'ga4','get')$$,'22023',null,'unknown provider refused');
select is(public.webmaster_property(pg_temp.pid('wm-a1'),'search-console','connect',pg_temp.site('sc-domain:cliente-a.example'))->>'state','ACTIVE','owner connects Search Console');
select is(public.webmaster_property(pg_temp.pid('wm-a1'),'bing-webmaster','connect',pg_temp.site('https://www.cliente-a.example/'))->>'state','ACTIVE','owner connects Bing independently');
select lives_ok($$select public.webmaster_property(pg_temp.pid('wm-a1'),'search-console','connect',pg_temp.site('sc-domain:cliente-a.example'))$$,'idempotent');
select throws_ok($$select public.webmaster_property(pg_temp.pid('wm-a1'),'search-console','connect',pg_temp.site('https://cliente-a.example/'))$$,'23514',null,'replacement requires revocation');
select throws_ok($$select public.webmaster_property(pg_temp.pid('wm-a2'),'search-console','connect',pg_temp.site('sc-domain:cliente-a.example'))$$,'22023',null,'same owner cannot attach another project domain');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3');
select throws_ok($$select public.webmaster_property(pg_temp.pid('wm-a1'),'search-console','get')$$,'42501',null,'viewer cannot read');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
insert into public.projects(organization_id,slug,name,domain) select id,'wm-b2','B2 same domain as A1','cliente-a.example' from public.organizations where slug='wm-b';
select set_config('role','postgres',true);
insert into ids select slug,id from public.projects where slug='wm-b2';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select throws_ok($$select public.webmaster_property(pg_temp.pid('wm-b2'),'search-console','connect',pg_temp.site('sc-domain:cliente-a.example'))$$,
 '23505',null,'a project of another org with the same domain cannot take an active property');
select throws_ok($$select public.webmaster_property(pg_temp.pid('wm-a1'),'search-console','get')$$,'42501',null,'other org cannot read');
select throws_ok($$select public.webmaster_property(pg_temp.pid('wm-a1'),'search-console','revoke')$$,'42501',null,'other org cannot revoke');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select is(public.webmaster_property(pg_temp.pid('wm-a1'),'search-console','revoke')->>'state','REVOKED','owner revokes');
select is(public.webmaster_property(pg_temp.pid('wm-a1'),'search-console','get')->>'state','NONE','revoked is not active');
select is(public.webmaster_property(pg_temp.pid('wm-a1'),'bing-webmaster','get')->>'state','ACTIVE','revoking one provider keeps the other');
select throws_ok($$select public.webmaster_property(pg_temp.pid('wm-a1'),'search-console','revoke')$$,'22023',null,'nothing left to revoke');
select set_config('role','postgres',true);
select is((select count(*)::int from private.webmaster_properties where state='REVOKED'),1,'revocation kept as history');
select * from finish();
rollback;
