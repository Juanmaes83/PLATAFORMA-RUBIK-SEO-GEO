begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role) values
 ('00000000-0000-4000-8000-0000000000d1','google-a@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-0000000000d2','google-b@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-0000000000d3','google-viewer@example.test','authenticated','authenticated');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),
 set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
insert into public.organizations(slug,name) values('google-a','A');
insert into public.projects(organization_id,slug,name,domain)
 select id,s,s,d from public.organizations,
 (values ('google-a1','www.sarah.example'),('google-a2','otro.example'),('google-a3','no-connection.example')) v(s,d)
 where slug='google-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d2');
insert into public.organizations(slug,name) values('google-b','B');
insert into public.projects(organization_id,slug,name,domain)
 select id,'google-b1','B1','www.sarah.example' from public.organizations where slug='google-b';
select set_config('role','postgres',true);
insert into public.organization_members(organization_id,user_id,role)
 select id,'00000000-0000-4000-8000-0000000000d3','member' from public.organizations where slug='google-a';
insert into public.project_members(project_id,organization_id,user_id,role)
 select id,organization_id,'00000000-0000-4000-8000-0000000000d3','viewer' from public.projects where slug='google-a1';
create temp table ids as select slug,id project_id from public.projects where slug like 'google-%';
grant select on ids to authenticated;
create function pg_temp.pid(s text) returns uuid language sql as $$ select project_id from ids where slug=s $$;
create function pg_temp.conn(p text, host text) returns jsonb language sql as $$
 select jsonb_build_object('openseoProjectId',p,'allowedHosts',jsonb_build_array(host),'consent',true) $$;
create function pg_temp.prop(p text, consent boolean default true) returns jsonb language sql as $$
 select jsonb_build_object('externalPropertyId',p,'consent',consent) $$;

select ok((select relrowsecurity from pg_class where oid='private.openseo_google_properties'::regclass),'property table has RLS');
select ok(not has_table_privilege('authenticated','private.openseo_google_properties','select,insert,update,delete'),'no direct table access');
select ok(not has_function_privilege('anon','public.openseo_google_property(uuid,text,text,jsonb)','execute'),'anon cannot call RPC');
select ok(not exists(select 1 from information_schema.columns where table_schema='private' and table_name='openseo_google_properties'
 and column_name ~ '(key|secret|token|password)'),'no credential stored');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
select is(public.openseo_google_property(pg_temp.pid('google-a1'),'search-console','get')->>'state','NONE','nothing bound by default');
select throws_ok($$select public.openseo_google_property(pg_temp.pid('google-a3'),'search-console','connect',pg_temp.prop('https://sarah.es/'))$$,
 '23514',null,'active connection required');
select is(public.openseo_connection(pg_temp.pid('google-a1'),'connect',pg_temp.conn('oseo-google-a1','sarah.example'))->>'state','ACTIVE','A1 connection');
select is(public.openseo_connection(pg_temp.pid('google-a2'),'connect',pg_temp.conn('oseo-google-a2','otro.example'))->>'state','ACTIVE','A2 connection');
select throws_ok($$select public.openseo_google_property(pg_temp.pid('google-a1'),'search-console','connect',pg_temp.prop('https://sarah.es/',false))$$,
 '22023',null,'owner consent required');
select throws_ok($$select public.openseo_google_property(pg_temp.pid('google-a1'),'search-console','connect',pg_temp.prop('http://sarah.es/'))$$,
 '22023',null,'insecure property refused');
select throws_ok($$select public.openseo_google_property(pg_temp.pid('google-a1'),'google-analytics','connect',pg_temp.prop('properties/not-a-number'))$$,
 '22023',null,'invalid GA4 property refused');
select throws_ok($$select public.openseo_google_property(pg_temp.pid('google-a1'),'unknown','get')$$,
 '22023',null,'unknown provider refused');
select is(public.openseo_google_property(pg_temp.pid('google-a1'),'search-console','connect',pg_temp.prop('https://sarah.es/'))->>'state',
 'ACTIVE','.es GSC explicitly bound to .example crawl project');
select is(public.openseo_google_property(pg_temp.pid('google-a1'),'google-analytics','connect',pg_temp.prop('properties/123'))->>'state',
 'ACTIVE','GA4 property independently bound');
select is(public.openseo_google_property(pg_temp.pid('google-a2'),'search-console','get')->>'state','NONE','same owner other project has no association');
select throws_ok($$select public.openseo_google_property(pg_temp.pid('google-a1'),'search-console','connect',pg_temp.prop('https://other.es/'))$$,
 '23514',null,'changing property requires revocation');
select lives_ok($$select public.openseo_google_property(pg_temp.pid('google-a1'),'search-console','connect',pg_temp.prop('https://sarah.es/'))$$,
 'same association is idempotent');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000d3');
select throws_ok($$select public.openseo_google_property(pg_temp.pid('google-a1'),'search-console','get')$$,
 '42501',null,'viewer cannot read owner binding');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d2');
select throws_ok($$select public.openseo_google_property(pg_temp.pid('google-a1'),'search-console','get')$$,
 '42501',null,'other organization cannot read');
select throws_ok($$select public.openseo_google_property(pg_temp.pid('google-a1'),'google-analytics','revoke')$$,
 '42501',null,'other organization cannot revoke');
select is(public.openseo_connection(pg_temp.pid('google-b1'),'connect',pg_temp.conn('oseo-google-b1','sarah.example'))->>'state',
 'ACTIVE','B can connect a distinct OpenSEO project with same crawl domain');
select is(public.openseo_google_property(pg_temp.pid('google-b1'),'search-console','connect',pg_temp.prop('https://sarah.es/'))->>'state',
 'ACTIVE','same external property identifier may be independently consented, not globally assigned');
select set_config('role','postgres',true);
select isnt((select connection_id from private.openseo_google_properties where project_id=pg_temp.pid('google-a1') and provider='search-console' and state='ACTIVE'),
 (select connection_id from private.openseo_google_properties where project_id=pg_temp.pid('google-b1') and provider='search-console' and state='ACTIVE'),
 'two organizations have separate connection identities');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
select is(public.openseo_google_property(pg_temp.pid('google-a1'),'search-console','revoke')->>'state','REVOKED','owner revokes association');
select is(public.openseo_google_property(pg_temp.pid('google-a1'),'search-console','get')->>'state','NONE','revoked binding unavailable');
select is(public.openseo_google_property(pg_temp.pid('google-a1'),'google-analytics','get')->>'state','ACTIVE','other provider unaffected');
select set_config('role','postgres',true);
select is((select count(*)::int from private.openseo_google_properties where state='REVOKED'),1,'revoked history retained');
select throws_ok($$update private.openseo_google_properties set external_property_id='properties/999'
 where project_id=pg_temp.pid('google-a1') and provider='google-analytics'$$,
 '42501',null,'stored property identity cannot be rewritten');
select * from finish();
rollback;
