begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role) values
 ('00000000-0000-4000-8000-0000000000d1','jc-a@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-0000000000d2','jc-b@example.test','authenticated','authenticated');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),
 set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
insert into public.organizations(slug,name) values('jc-a','A');
insert into public.projects(organization_id,slug,name,domain)
 select id,'jc-a1','A1','client-a.example' from public.organizations where slug='jc-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d2');
insert into public.organizations(slug,name) values('jc-b','B');
insert into public.projects(organization_id,slug,name,domain)
 select id,'jc-b1','B1','client-b.example' from public.organizations where slug='jc-b';
select set_config('role','postgres',true);
create temp table ids as select slug,id project_id from public.projects where slug like 'jc-%';
grant select on ids to authenticated;
create temp table conn(slug text, id uuid);
grant all on conn to authenticated;
create function pg_temp.pid(s text) returns uuid language sql as $$ select project_id from ids where slug=s $$;
create function pg_temp.cid(s text) returns uuid language sql as $$ select id from conn where slug=s $$;

select ok(exists(select 1 from information_schema.columns where table_schema='private'
 and table_name='openseo_project_jobs' and column_name='connection_id'),'jobs record their connection');
select ok(not has_function_privilege('anon','public.openseo_job(uuid,text,uuid,jsonb)','execute'),'anon still cannot execute job RPC');
select ok(has_function_privilege('authenticated','public.openseo_job(uuid,text,uuid,jsonb)','execute'),'grants kept after replacing the function');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000d2');
insert into conn select 'b',(public.openseo_connection(pg_temp.pid('jc-b1'),'connect',
 '{"openseoProjectId":"oseo-b","allowedHosts":["client-b.example"],"consent":true}')->>'connectionId')::uuid;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
insert into conn select 'a',(public.openseo_connection(pg_temp.pid('jc-a1'),'connect',
 '{"openseoProjectId":"oseo-a","allowedHosts":["client-a.example"],"consent":true}')->>'connectionId')::uuid;

select throws_ok($$select public.openseo_job(pg_temp.pid('jc-a1'),'acquire',null,jsonb_build_object('connectionId',pg_temp.cid('b')))$$,
 '23514',null,'connection of another client is refused');
select throws_ok($$select public.openseo_job(pg_temp.pid('jc-a1'),'acquire',null,'{"connectionId":"not-a-uuid"}')$$,
 '22023',null,'malformed connection refused');
select throws_ok($$select public.openseo_job(pg_temp.pid('jc-a1'),'acquire',null,'{"connectionId":"00000000-0000-4000-8000-000000000999"}')$$,
 '23514',null,'unknown connection refused');
select set_config('role','postgres',true);
select is((select count(*)::int from private.openseo_project_jobs),0,'refused acquisitions reserve nothing');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
select is((public.openseo_job(pg_temp.pid('jc-a1'),'acquire',null,jsonb_build_object('connectionId',pg_temp.cid('a')))->>'connectionId')::uuid,
 pg_temp.cid('a'),'job stores the active connection');
select is((public.openseo_job(pg_temp.pid('jc-a1'),'acquire')->>'connectionId')::uuid,pg_temp.cid('a'),
 'a second acquisition returns the existing job and its connection');
select throws_ok($$select public.openseo_connection(pg_temp.pid('jc-a1'),'revoke')$$,'23514',null,'connection cannot be revoked under an active job');
select set_config('role','postgres',true);
update private.openseo_project_jobs set state='FAILED' where project_id=pg_temp.pid('jc-a1');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
select lives_ok($$select public.openseo_connection(pg_temp.pid('jc-a1'),'revoke')$$,'revoke after the job ends');
select throws_ok($$select public.openseo_job(pg_temp.pid('jc-a1'),'acquire',null,jsonb_build_object('connectionId',pg_temp.cid('a')))$$,
 '23514',null,'revoked connection cannot launch');
select ok((public.openseo_job(pg_temp.pid('jc-a1'),'acquire')->>'connectionId') is null,'legacy acquisition keeps a null connection');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000d2');
select throws_ok($$select public.openseo_job(pg_temp.pid('jc-a1'),'acquire',null,jsonb_build_object('connectionId',pg_temp.cid('b')))$$,
 '42501',null,'other client cannot acquire with its own connection');
select * from finish();
rollback;
