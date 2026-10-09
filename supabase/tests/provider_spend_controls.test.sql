-- Spend controls (migration 20261010150000): idempotent retries never charge twice, an overrun of
-- the reserved maximum blocks the provider until the owner sets the limit again, the stored
-- conversion is returned, and the monthly summary is per project and owner-only.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role) values
 ('00000000-0000-4000-8000-0000000000d1','ctl-owner@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-0000000000d2','ctl-other@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-0000000000d3','ctl-analyst@example.test','authenticated','authenticated');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),
 set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
insert into public.organizations(slug,name) values('ctl-a','A');
insert into public.projects(organization_id,slug,name)
 select id,s,s from public.organizations, (values ('ctl-p1'),('ctl-p2')) v(s) where slug='ctl-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d2');
insert into public.organizations(slug,name) values('ctl-b','B');
insert into public.projects(organization_id,slug,name) select id,'ctl-q1','q1' from public.organizations where slug='ctl-b';
select set_config('role','postgres',true);
insert into public.organization_members(organization_id,user_id,role) select id,'00000000-0000-4000-8000-0000000000d3','member' from public.organizations where slug='ctl-a';
insert into public.project_members(project_id,organization_id,user_id,role)
 select id,organization_id,'00000000-0000-4000-8000-0000000000d3','analyst' from public.projects where slug='ctl-p1';
create temp table ids as select slug,id project_id from public.projects where slug like 'ctl-%';
grant select on ids to authenticated;
create temp table k(name text primary key, v jsonb);
grant all on k to authenticated;
create function pg_temp.pid(s text) returns uuid language sql as $$ select project_id from ids where slug=s $$;
create function pg_temp.kv(s text) returns jsonb language sql as $$ select v from k where name=s $$;
create function pg_temp.b(s text, cmd text, payload jsonb default '{}') returns jsonb language sql as $$
 select public.provider_budget(pg_temp.pid(s),'openseo',cmd,payload) $$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
-- The limit stores the documented conversion it came from
select is(pg_temp.b('ctl-p1','set','{"monthlyLimit":1000,"conversion":{"ceilingEur":10,"source":"test"}}')->>'monthlyLimit','1000','limit set with conversion');
select is(pg_temp.b('ctl-p1','summary')->'conversion'->>'ceilingEur','10','conversion returned by the summary');
select throws_ok($$select pg_temp.b('ctl-p1','set','{"monthlyLimit":1000,"conversion":"10 EUR"}')$$,'22023',null,'conversion must be an object');

-- Idempotent retries
insert into k select 'a', pg_temp.b('ctl-p1','reserve','{"operation":"get_domain_overview","estimated":300,"idempotencyKey":"call-0001"}');
select is((pg_temp.kv('a')->>'used')::int,300,'first reservation counts');
insert into k select 'a2', pg_temp.b('ctl-p1','reserve','{"operation":"get_domain_overview","estimated":300,"idempotencyKey":"call-0001"}');
select is(pg_temp.kv('a2')->'spend'->>'spendId',pg_temp.kv('a')->'spend'->>'spendId','retry returns the same reservation');
select is(pg_temp.kv('a2')->'spend'->>'replayed','true','retry flagged as replayed');
select is((pg_temp.kv('a2')->>'used')::int,300,'retry does not charge twice');
select throws_ok($$select pg_temp.b('ctl-p1','reserve','{"operation":"get_domain_overview","estimated":301,"idempotencyKey":"call-0001"}')$$,'22023',null,'same key with another amount refused');
select throws_ok($$select pg_temp.b('ctl-p1','reserve','{"operation":"x","estimated":1,"idempotencyKey":"short"}')$$,'22023',null,'malformed key refused');
select is(pg_temp.b('ctl-p1','settle',jsonb_build_object('spendId',pg_temp.kv('a')->'spend'->>'spendId','actual',250))->'spend'->>'overrun','false','settled under the maximum');
select is(pg_temp.b('ctl-p1','reserve','{"operation":"get_domain_overview","estimated":300,"idempotencyKey":"call-0001"}')->'spend'->>'state','SETTLED','retry after settlement returns the settled call, no new charge');
select is((pg_temp.b('ctl-p1','get')->>'used')::int,250,'still one charge');
-- A released reservation (nothing spent) can be retried with the same key
insert into k select 'r', pg_temp.b('ctl-p1','reserve','{"operation":"x","estimated":10,"idempotencyKey":"call-0002"}');
select lives_ok(format($$select pg_temp.b('ctl-p1','release',jsonb_build_object('spendId',%L))$$,pg_temp.kv('r')->'spend'->>'spendId'),'released');
select isnt(pg_temp.b('ctl-p1','reserve','{"operation":"x","estimated":10,"idempotencyKey":"call-0002"}')->'spend'->>'spendId',pg_temp.kv('r')->'spend'->>'spendId','released key can reserve again');
-- Keys are per project: the same key in another project is a different call
select is((pg_temp.b('ctl-p2','set','{"monthlyLimit":100}')->>'available')::int,100,'p2 budget');
select is(pg_temp.b('ctl-p2','reserve','{"operation":"get_domain_overview","estimated":50,"idempotencyKey":"call-0001"}')->'spend'->>'replayed','false','same key in another project is not a replay');

-- Overrun of the reserved maximum blocks the provider for the project
insert into k select 'o', pg_temp.b('ctl-p1','reserve','{"operation":"run_rank_tracker","estimated":100,"reference":"result:demo"}');
insert into k select 'o2', pg_temp.b('ctl-p1','settle',jsonb_build_object('spendId',pg_temp.kv('o')->'spend'->>'spendId','actual',140));
select is(pg_temp.kv('o2')->'spend'->>'overrun','true','overrun flagged');
select is((pg_temp.kv('o2')->'spend'->>'actual')::int,140,'real cost recorded as reported');
select is(pg_temp.kv('o2')->>'blocked','true','provider blocked');
select throws_ok($$select pg_temp.b('ctl-p1','reserve','{"operation":"x","estimated":1}')$$,'23514','Provider blocked for this project','no new reservation while blocked');
select is(pg_temp.b('ctl-p2','get')->>'blocked','false','the block is per project');
select is(pg_temp.b('ctl-p1','set','{"monthlyLimit":1000}')->>'blocked','false','owner sets the limit again: unblocked');
select lives_ok($$select pg_temp.b('ctl-p1','reserve','{"operation":"x","estimated":1}')$$,'reservations resume after review');

-- Monthly summary
insert into k select 's', pg_temp.b('ctl-p1','summary');
select is((select (o->>'credits')::int from jsonb_array_elements(pg_temp.kv('s')->'operations') o where o->>'operation'='get_domain_overview'),250,'credits per operation');
select is((select (o->>'overruns')::int from jsonb_array_elements(pg_temp.kv('s')->'operations') o where o->>'operation'='run_rank_tracker'),1,'overruns counted');
select is((select o->'references' from jsonb_array_elements(pg_temp.kv('s')->'operations') o where o->>'operation'='run_rank_tracker'),'["result:demo"]'::jsonb,'settled references listed');
select is((select (o->>'released')::int from jsonb_array_elements(pg_temp.kv('s')->'operations') o where o->>'operation'='x'),1,'released calls counted, at no cost');
select is(jsonb_array_length(pg_temp.b('ctl-p1','summary','{"month":"2020-01"}')->'operations'),0,'another month is empty');
select throws_ok($$select pg_temp.b('ctl-p1','summary','{"month":"2026-13"}')$$,'22023',null,'invalid month refused');
select is((select count(*)::int from jsonb_array_elements(pg_temp.b('ctl-p2','summary')->'operations')),1,'p2 summary only has p2 calls');

-- Access
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d3');
select throws_ok($$select pg_temp.b('ctl-p1','summary')$$,'42501',null,'analyst cannot read the summary');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d2');
select throws_ok($$select pg_temp.b('ctl-p1','summary')$$,'42501',null,'other organization cannot read the summary');
select set_config('role','postgres',true);
select ok(not has_table_privilege('authenticated','private.provider_spend','select'),'still no direct access');
select * from finish();
rollback;
