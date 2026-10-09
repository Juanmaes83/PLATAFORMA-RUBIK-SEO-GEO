-- Budget and spend ledger (migration 20261010090000): owner only, fail closed without a budget,
-- monthly cap under concurrency-safe locking, settle/release once, no cross-project references.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role) values
 ('00000000-0000-4000-8000-0000000000b1','bud-owner@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-0000000000b2','bud-other@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-0000000000b3','bud-analyst@example.test','authenticated','authenticated');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),
 set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
insert into public.organizations(slug,name) values('bud-a','A');
insert into public.projects(organization_id,slug,name,domain)
 select id,s,s,d from public.organizations, (values ('bud-p1','p1.example'),('bud-p2','p2.example')) v(s,d) where slug='bud-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
insert into public.organizations(slug,name) values('bud-b','B');
insert into public.projects(organization_id,slug,name,domain) select id,'bud-q1','q1','q1.example' from public.organizations where slug='bud-b';
select set_config('role','postgres',true);
insert into public.organization_members(organization_id,user_id,role) select id,'00000000-0000-4000-8000-0000000000b3','member' from public.organizations where slug='bud-a';
insert into public.project_members(project_id,organization_id,user_id,role)
 select id,organization_id,'00000000-0000-4000-8000-0000000000b3','analyst' from public.projects where slug='bud-p1';
create temp table ids as select slug,id project_id from public.projects where slug like 'bud-%';
grant select on ids to authenticated;
create temp table k(name text primary key, id uuid);
grant all on k to authenticated;
create function pg_temp.pid(s text) returns uuid language sql as $$ select project_id from ids where slug=s $$;
create function pg_temp.kid(s text) returns uuid language sql as $$ select id from k where name=s $$;
create function pg_temp.b(s text, cmd text, payload jsonb default '{}') returns jsonb language sql as $$
 select public.provider_budget(pg_temp.pid(s),'openseo',cmd,payload) $$;

-- Structure and privileges
select ok((select relrowsecurity from pg_class where oid='private.provider_budgets'::regclass),'budgets have RLS');
select ok((select relrowsecurity from pg_class where oid='private.provider_spend'::regclass),'spend has RLS');
select ok(not has_table_privilege('authenticated','private.provider_spend','select,insert,update,delete'),'no direct spend access');
select ok(not has_table_privilege('authenticated','private.provider_budgets','select,insert,update,delete'),'no direct budget access');
select ok(not has_function_privilege('anon','public.provider_budget(uuid,text,text,jsonb)','execute'),'anon cannot execute RPC');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select is(pg_temp.b('bud-p1','get')->>'monthlyLimit',null,'no budget by default');
select throws_ok($$select pg_temp.b('bud-p1','reserve','{"operation":"get_domain_overview","estimated":10}')$$,'23514','No budget defined for this provider','fail closed without budget');
select throws_ok($$select public.provider_budget(pg_temp.pid('bud-p1'),'dataforseo','get','{}')$$,'22023',null,'unknown provider refused');
select throws_ok($$select pg_temp.b('bud-p1','set','{"monthlyLimit":-1}')$$,'22023',null,'negative limit refused');
select throws_ok($$select pg_temp.b('bud-p1','set','{"monthlyLimit":"100"}')$$,'22023',null,'string limit refused');
select throws_ok($$select pg_temp.b('bud-p1','set','{"monthlyLimit":100000001}')$$,'22023',null,'limit above cap refused');
select is((pg_temp.b('bud-p1','set','{"monthlyLimit":300}')->>'available')::int,300,'owner sets a monthly limit');

-- Reservations inside the cap
insert into k select 'r1',(pg_temp.b('bud-p1','reserve','{"operation":"get_domain_overview","estimated":200,"reference":"example.test"}')->'spend'->>'spendId')::uuid;
select is((pg_temp.b('bud-p1','get')->>'used')::int,200,'reserved estimate counts');
select throws_ok($$select pg_temp.b('bud-p1','reserve','{"operation":"get_backlinks_overview","estimated":101}')$$,'23514','Monthly budget exceeded','over the cap refused');
select throws_ok($$select pg_temp.b('bud-p1','reserve','{"operation":"Bad Op","estimated":1}')$$,'22023',null,'malformed operation refused');
select throws_ok($$select pg_temp.b('bud-p1','reserve','{"operation":"x","estimated":0}')$$,'22023',null,'zero estimate refused');
select throws_ok($$select pg_temp.b('bud-p1','reserve','{"operation":"x","estimated":1,"reference":"bad ref;"}')$$,'22023',null,'malformed reference refused');

-- Settle records the real cost, even above the estimate, and later reservations see it
select is(pg_temp.b('bud-p1','settle',jsonb_build_object('spendId',pg_temp.kid('r1'),'actual',250))->'spend'->>'state','SETTLED','settled with real cost');
select is((pg_temp.b('bud-p1','get')->>'used')::int,250,'actual replaces estimate');
select throws_ok($$select pg_temp.b('bud-p1','settle',jsonb_build_object('spendId',pg_temp.kid('r1'),'actual',1))$$,'22023','No open reservation','settle only once');
select throws_ok($$select pg_temp.b('bud-p1','reserve','{"operation":"x","estimated":51}')$$,'23514',null,'remaining cap respected after settlement');
insert into k select 'r2',(pg_temp.b('bud-p1','reserve','{"operation":"x","estimated":50}')->'spend'->>'spendId')::uuid;
select is((pg_temp.b('bud-p1','release',jsonb_build_object('spendId',pg_temp.kid('r2')))->>'used')::int,250,'release frees the estimate');
select throws_ok($$select pg_temp.b('bud-p1','release',jsonb_build_object('spendId',pg_temp.kid('r2')))$$,'22023',null,'release only once');
select throws_ok($$select pg_temp.b('bud-p1','settle',jsonb_build_object('spendId',pg_temp.kid('r2'),'actual',5))$$,'22023',null,'released spend cannot be settled');

-- Lowering the limit below what is used blocks new reservations without erasing history
select is((pg_temp.b('bud-p1','set','{"monthlyLimit":100}')->>'available')::int,0,'available never negative');
select throws_ok($$select pg_temp.b('bud-p1','reserve','{"operation":"x","estimated":1}')$$,'23514',null,'lowered limit blocks');
select is(pg_temp.b('bud-p1','set','{"monthlyLimit":0}')->>'monthlyLimit','0','zero limit is an explicit stop');

-- Isolation: same owner, other project; other organization; analyst
select throws_ok($$select pg_temp.b('bud-p2','settle',jsonb_build_object('spendId',pg_temp.kid('r1'),'actual',1))$$,'22023',null,'spend of p1 not reachable from p2');
select is(pg_temp.b('bud-p2','get')->>'used','0','p2 has its own ledger');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b3');
select throws_ok($$select pg_temp.b('bud-p1','get')$$,'42501',null,'analyst cannot read the budget');
select throws_ok($$select pg_temp.b('bud-p1','reserve','{"operation":"x","estimated":1}')$$,'42501',null,'analyst cannot reserve');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
select throws_ok($$select pg_temp.b('bud-p1','set','{"monthlyLimit":999}')$$,'42501',null,'other organization cannot set');
select throws_ok($$select public.provider_budget(pg_temp.pid('bud-q1'),'openseo','release',jsonb_build_object('spendId',pg_temp.kid('r1')))$$,'22023',null,'foreign spend id not found through own project');

-- Only the current UTC month counts
select set_config('role','postgres',true);
update private.provider_spend set reserved_at = date_trunc('month', now()) - interval '1 day' where id = pg_temp.kid('r1');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select is(pg_temp.b('bud-p1','get')->>'used','0','previous month does not count');
select set_config('role','postgres',true);
select is((select count(*)::int from private.provider_spend),2,'history kept: settled and released rows remain');
select set_config('role','anon',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select pg_temp.b('bud-p1','get')$$,'42501',null,'anon has no access');
select * from finish();
rollback;
