begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role) values
 ('00000000-0000-4000-8000-0000000000c1','conn-a@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-0000000000c2','conn-b@example.test','authenticated','authenticated');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),
 set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
insert into public.organizations(slug,name) values('conn-a','A');
insert into public.projects(organization_id,slug,name,domain)
 select id,'conn-a1','A1','www.client-a.example' from public.organizations where slug='conn-a';
insert into public.projects(organization_id,slug,name)
 select id,'conn-a2','A2 without domain' from public.organizations where slug='conn-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
insert into public.organizations(slug,name) values('conn-b','B');
insert into public.projects(organization_id,slug,name,domain)
 select id,'conn-b1','B1','client-b.example' from public.organizations where slug='conn-b';
select set_config('role','postgres',true);
create temp table ids as select slug,id project_id from public.projects where slug like 'conn-%';
grant select on ids to authenticated;
create function pg_temp.pid(s text) returns uuid language sql as $$ select project_id from ids where slug=s $$;
create function pg_temp.conn(p text, hosts jsonb, consent boolean default true) returns jsonb language sql as $$
 select jsonb_build_object('openseoProjectId',p,'allowedHosts',hosts,'consent',consent) $$;

select ok((select relrowsecurity from pg_class where oid='private.openseo_project_connections'::regclass),'connections have RLS');
select ok(not has_table_privilege('authenticated','private.openseo_project_connections','select,insert,update,delete'),'no direct table access');
select ok(not has_table_privilege('anon','private.openseo_project_connections','select'),'anon has no table access');
select ok(not has_function_privilege('anon','public.openseo_connection(uuid,text,jsonb)','execute'),'anon cannot execute RPC');
select ok(not exists(select 1 from information_schema.columns where table_schema='private'
 and table_name='openseo_project_connections' and column_name ~ '(key|secret|token|password)'),'no secret-like column');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select is(public.openseo_connection(pg_temp.pid('conn-a1'),'get')->>'state','NONE','no connection by default');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-a1'),'connect',pg_temp.conn('oseo-a','["www.client-a.example"]',false))$$,
 '22023',null,'consent is required');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-a1'),'connect',pg_temp.conn('oseo-a','["client-b.example"]'))$$,
 '22023',null,'host of another client refused');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-a1'),'connect',pg_temp.conn('oseo-a','["evil.client-a.example"]'))$$,
 '22023',null,'subdomain outside www/apex refused');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-a1'),'connect',pg_temp.conn('oseo-a','[null]'))$$,
 '22023',null,'null host refused');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-a1'),'connect',pg_temp.conn('bad id!','["client-a.example"]'))$$,
 '22023',null,'malformed provider project refused');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-a2'),'connect',pg_temp.conn('oseo-a2','["client-a.example"]'))$$,
 '22023',null,'project without domain cannot connect');
select is(public.openseo_connection(pg_temp.pid('conn-a1'),'connect',pg_temp.conn('oseo-a','["www.client-a.example","client-a.example"]'))->>'state',
 'ACTIVE','owner connects with consent');
select is(public.openseo_connection(pg_temp.pid('conn-a1'),'get')->'allowedHosts','["client-a.example", "www.client-a.example"]'::jsonb,'hosts normalized and sorted');
select is(public.openseo_connection(pg_temp.pid('conn-a1'),'get')->>'credentialMode','platform','platform credential, no stored secret');
select lives_ok($$select public.openseo_connection(pg_temp.pid('conn-a1'),'connect',pg_temp.conn('oseo-a','["client-a.example","www.client-a.example"]'))$$,
 'same connection is idempotent');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-a1'),'connect',pg_temp.conn('oseo-other','["client-a.example"]'))$$,
 '23514',null,'replacement requires revocation first');
select set_config('role','postgres',true);
select is((select count(*)::int from private.openseo_project_connections),1,'one row after retries');

insert into auth.users(id,email,aud,role) values
 ('00000000-0000-4000-8000-0000000000c3','conn-analyst@example.test','authenticated','authenticated');
insert into public.organization_members(organization_id,user_id,role)
 select id,'00000000-0000-4000-8000-0000000000c3','member' from public.organizations where slug='conn-a';
insert into public.project_members(project_id,organization_id,user_id,role)
 select id,organization_id,'00000000-0000-4000-8000-0000000000c3','analyst' from public.projects where slug='conn-a1';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-a1'),'get')$$,'42501',null,'analyst of the same project cannot read it');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-a1'),'revoke')$$,'42501',null,'analyst cannot revoke');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-a1'),'get')$$,'42501',null,'other client cannot read connection');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-a1'),'revoke')$$,'42501',null,'other client cannot revoke');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-a1'),'connect',pg_temp.conn('oseo-b','["client-a.example"]'))$$,
 '42501',null,'other client cannot connect foreign project');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-b1'),'connect',pg_temp.conn('oseo-a','["client-b.example"]'))$$,
 '23505',null,'OpenSEO project already owned by another Rubik project');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select lives_ok($$select public.openseo_job(pg_temp.pid('conn-a1'),'acquire')$$,'reserve a job');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-a1'),'revoke')$$,'23514',null,'revocation waits for active job');
select set_config('role','postgres',true);
update private.openseo_project_jobs set state='FAILED' where project_id=pg_temp.pid('conn-a1');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select is(public.openseo_connection(pg_temp.pid('conn-a1'),'revoke')->>'state','REVOKED','owner revokes');
select is(public.openseo_connection(pg_temp.pid('conn-a1'),'get')->>'state','NONE','revoked connection is not active');
select throws_ok($$select public.openseo_connection(pg_temp.pid('conn-a1'),'revoke')$$,'22023',null,'nothing left to revoke');
select is(public.openseo_connection(pg_temp.pid('conn-a1'),'connect',pg_temp.conn('oseo-a2','["client-a.example"]'))->>'openseoProjectId',
 'oseo-a2','reconnect after revocation');
select set_config('role','postgres',true);
select is((select count(*)::int from private.openseo_project_connections where state='REVOKED'),1,'revoked row kept as history');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select is(public.openseo_connection(pg_temp.pid('conn-b1'),'connect',pg_temp.conn('oseo-a','["client-b.example"]'))->>'state',
 'ACTIVE','released OpenSEO project can be connected elsewhere');
select * from finish();
rollback;
