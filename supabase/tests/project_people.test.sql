-- Project people and data inventory (migration 20261012100000, decision D3): only organization owners
-- list and withdraw people; owners are never withdrawn; withdrawal removes project access, the
-- organization membership when it was the last project there and open invitations, but never the
-- account; the inventory counts only the caller's own project.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role,email_confirmed_at) values
 ('00000000-0000-4000-8000-0000000000d1','ppl-owner@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-0000000000d2','ppl-other@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-0000000000d3','ppl-viewer@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-0000000000d4','ppl-analyst@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-0000000000d5','ppl-coowner@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-0000000000d6','ppl-prjowner@example.test','authenticated','authenticated',now());
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),
 set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
insert into public.organizations(slug,name) values('ppl-a','A');
insert into public.projects(organization_id,slug,name)
 select id,s,s from public.organizations, (values ('ppl-p1'),('ppl-p2')) v(s) where slug='ppl-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d2');
insert into public.organizations(slug,name) values('ppl-b','B');
insert into public.projects(organization_id,slug,name) select id,'ppl-q1','q1' from public.organizations where slug='ppl-b';
select set_config('role','postgres',true);
-- viewer: only p1 · analyst: p1 and p2 · co-owner: organization owner, analyst in p1 ·
-- project owner: organization member who owns p1.
insert into public.organization_members(organization_id,user_id,role)
 select o.id,u.id,u.r from public.organizations o,
 (values ('00000000-0000-4000-8000-0000000000d3'::uuid,'member'),('00000000-0000-4000-8000-0000000000d4'::uuid,'member'),
  ('00000000-0000-4000-8000-0000000000d5'::uuid,'owner'),('00000000-0000-4000-8000-0000000000d6'::uuid,'member')) u(id,r)
 where o.slug='ppl-a';
insert into public.project_members(project_id,organization_id,user_id,role)
 select p.id,p.organization_id,m.u,m.r from public.projects p join (values
  ('ppl-p1','00000000-0000-4000-8000-0000000000d3'::uuid,'viewer'),('ppl-p1','00000000-0000-4000-8000-0000000000d4'::uuid,'analyst'),
  ('ppl-p2','00000000-0000-4000-8000-0000000000d4'::uuid,'analyst'),('ppl-p1','00000000-0000-4000-8000-0000000000d5'::uuid,'analyst'),
  ('ppl-p1','00000000-0000-4000-8000-0000000000d6'::uuid,'owner')) m(s,u,r) on p.slug=m.s;
create temp table ids as select slug,id project_id,organization_id from public.projects where slug like 'ppl-%';
grant select on ids to authenticated;
create temp table k(name text primary key, v text);
grant all on k to authenticated;
create function pg_temp.pid(s text) returns uuid language sql as $$ select project_id from ids where slug=s $$;
create function pg_temp.ppl(s text, cmd text, payload jsonb default '{}') returns jsonb language sql as $$
 select public.project_people(pg_temp.pid(s),cmd,payload) $$;
create function pg_temp.rm(s text, uid text) returns jsonb language sql as $$
 select public.project_people(pg_temp.pid(s),'remove',jsonb_build_object('userId',uid)) $$;

-- Structure and privileges
select ok(not has_function_privilege('anon','public.project_people(uuid,text,jsonb)','execute'),'anon cannot list or withdraw');
select ok(not has_function_privilege('anon','public.project_data_inventory(uuid)','execute'),'anon cannot read the inventory');
select ok(has_function_privilege('authenticated','public.project_people(uuid,text,jsonb)','execute'),'signed-in callers reach the RPC');
select is((select prosecdef from pg_proc where oid='public.project_people(uuid,text,jsonb)'::regprocedure),false,'public wrapper is SECURITY INVOKER');
select is((select prosecdef from pg_proc where oid='private.project_people_command(uuid,text,jsonb)'::regprocedure),true,'private command is SECURITY DEFINER');
select is((select proconfig from pg_proc where oid='private.project_people_command(uuid,text,jsonb)'::regprocedure),array['search_path=""'],'empty search_path');
select is((select proconfig from pg_proc where oid='private.project_data_inventory(uuid)'::regprocedure),array['search_path=""'],'inventory has empty search_path');

-- Who may list
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
select is(jsonb_array_length(pg_temp.ppl('ppl-p1','list')),5,'organization owner lists the five people of p1');
select is(pg_temp.ppl('ppl-p1','list')->0->>'role','owner','owners come first');
select ok(exists(select 1 from jsonb_array_elements(pg_temp.ppl('ppl-p1','list')) e where e->>'email'='ppl-viewer@example.test' and e->>'organizationRole'='member'),'addresses and organization roles are listed');
select is((select count(*)::int from jsonb_array_elements(pg_temp.ppl('ppl-p1','list')) e where (e->>'isSelf')::boolean),1,'the caller is marked once');
select throws_ok($$select pg_temp.ppl('ppl-q1','list')$$,'42501',null,'another organization''s project is refused');
select throws_ok($$select pg_temp.ppl('ppl-p1','grant')$$,'22023',null,'unknown commands are refused');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d4');
select throws_ok($$select pg_temp.ppl('ppl-p1','list')$$,'42501',null,'an analyst cannot list');
select throws_ok($$select public.project_data_inventory(pg_temp.pid('ppl-p1'))$$,'42501',null,'an analyst cannot read the inventory');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d6');
select throws_ok($$select pg_temp.ppl('ppl-p1','list')$$,'42501',null,'a project owner who is not an organization owner cannot list');
select throws_ok($$select pg_temp.rm('ppl-p1','00000000-0000-4000-8000-0000000000d3')$$,'42501',null,'nor withdraw');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d2');
select throws_ok($$select pg_temp.rm('ppl-p1','00000000-0000-4000-8000-0000000000d3')$$,'42501',null,'another organization''s owner cannot withdraw');
select throws_ok($$select public.project_data_inventory(pg_temp.pid('ppl-p1'))$$,'42501',null,'nor read the inventory');
select set_config('role','postgres',true);
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select private.project_people_command(pg_temp.pid('ppl-p1'),'list','{}')$$,'42501',null,'no session, no access');

-- Owners are never withdrawn; bad references fail closed
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
select throws_ok($$select pg_temp.rm('ppl-p1','00000000-0000-4000-8000-0000000000d6')$$,'23514',null,'a project owner cannot be withdrawn');
select throws_ok($$select pg_temp.rm('ppl-p1','00000000-0000-4000-8000-0000000000d5')$$,'23514',null,'an organization owner cannot be withdrawn, whatever their project role');
select throws_ok($$select pg_temp.rm('ppl-p1','00000000-0000-4000-8000-0000000000d1')$$,'23514',null,'the caller cannot withdraw themselves');
select throws_ok($$select pg_temp.rm('ppl-p1','00000000-0000-4000-8000-0000000000d2')$$,'P0002',null,'someone outside the project');
select throws_ok($$select pg_temp.rm('ppl-p1','nope')$$,'22023',null,'malformed reference');

-- Inventory before
select is((public.project_data_inventory(pg_temp.pid('ppl-p1'))->>'projectMembers')::int,5,'inventory counts project members');
select is((public.project_data_inventory(pg_temp.pid('ppl-p1'))->>'organizationMembers')::int,5,'and organization members');
select is((public.project_data_inventory(pg_temp.pid('ppl-p1'))->'providerResults'->>'count')::int,0,'and results');
select is((public.project_data_inventory(pg_temp.pid('ppl-p1'))->>'googleProperties')::int,0,'and OpenSEO Google property bindings (20261012110000)');
select ok(public.project_data_inventory(pg_temp.pid('ppl-p1')) ?& array['auditEvents','imports','invitations','openseoJobs','openseoConnections','webmasterProperties','googleProperties','googleCaptures','budgets','spendEntries','generatedAt'],'every table is reported');

-- Withdraw the viewer (only in p1): an open invitation for their address goes too
insert into k select 'tok', public.project_invitations(pg_temp.pid('ppl-p1'),'create','{"email":"PPL-Viewer@example.test","role":"analyst"}')->>'token';
select is((public.project_data_inventory(pg_temp.pid('ppl-p1'))->'invitations'->>'open')::int,1,'one open invitation before');
select is(pg_temp.rm('ppl-p1','00000000-0000-4000-8000-0000000000d3'),'{"removed": true, "revokedInvitations": 1, "leftOrganization": true}'::jsonb,'viewer withdrawn, organization left, invitation revoked');
select is((public.project_data_inventory(pg_temp.pid('ppl-p1'))->'invitations'->>'closed')::int,1,'the invitation is closed');
select set_config('role','postgres',true);
select ok(not exists(select 1 from public.project_members where user_id='00000000-0000-4000-8000-0000000000d3'),'no project membership left');
select ok(not exists(select 1 from public.organization_members where user_id='00000000-0000-4000-8000-0000000000d3'),'no organization membership left');
select ok(exists(select 1 from auth.users where id='00000000-0000-4000-8000-0000000000d3'),'the account is kept (D3)');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d3');
select throws_ok($$select public.accept_project_invitation((select v from k where name='tok'))$$,'P0002',null,'the revoked invitation cannot bring them back');
select is((select count(*)::int from public.projects),0,'the withdrawn person sees no project');

-- Withdraw the analyst from p1 only: still in p2 and in the organization
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
select is(pg_temp.rm('ppl-p1','00000000-0000-4000-8000-0000000000d4'),'{"removed": true, "revokedInvitations": 0, "leftOrganization": false}'::jsonb,'analyst withdrawn from p1 only');
select throws_ok($$select pg_temp.rm('ppl-p1','00000000-0000-4000-8000-0000000000d4')$$,'P0002',null,'withdrawing twice finds nobody');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d4');
select is((select array_agg(slug order by slug) from public.projects),array['ppl-p2']::text[],'the analyst keeps p2 only');
select set_config('role','postgres',true);
select is((select role from public.organization_members o join public.organizations g on g.id=o.organization_id
  where g.slug='ppl-a' and o.user_id='00000000-0000-4000-8000-0000000000d4'),'member','and stays an organization member');
select is((select count(*)::int from public.organization_members o join public.organizations g on g.id=o.organization_id
  where g.slug='ppl-a' and o.role='owner'),2,'organization owners are untouched');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
select is((public.project_data_inventory(pg_temp.pid('ppl-p1'))->>'projectMembers')::int,3,'inventory reflects the withdrawals');

select * from finish();
rollback;
