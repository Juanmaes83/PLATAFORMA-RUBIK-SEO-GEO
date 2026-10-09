-- OpenSEO multi-client, phase 5 (docs/adr/0007-openseo-conexion-por-proyecto.md): negative
-- matrix for jobs and connections across users, organizations, projects, audit ids and
-- connections. Synthetic rows only exercise database identity checks, never trusted HMAC.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role) values
 ('00000000-0000-4000-8000-0000000000e1','iso-owner@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-0000000000e2','iso-other@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-0000000000e3','iso-viewer@example.test','authenticated','authenticated');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),
 set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
-- One owner with two projects (p1, p2) in the same organization; another owner with q1.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1');
insert into public.organizations(slug,name) values('iso-a','A');
insert into public.projects(organization_id,slug,name,domain)
 select id,s,s,d from public.organizations, (values ('iso-p1','p1.example'),('iso-p2','p2.example')) v(s,d) where slug='iso-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e2');
insert into public.organizations(slug,name) values('iso-b','B');
insert into public.projects(organization_id,slug,name,domain)
 select id,'iso-q1','q1','q1.example' from public.organizations where slug='iso-b';
select set_config('role','postgres',true);
insert into public.organization_members(organization_id,user_id,role)
 select id,'00000000-0000-4000-8000-0000000000e3','member' from public.organizations where slug='iso-a';
insert into public.project_members(project_id,organization_id,user_id,role)
 select id,organization_id,'00000000-0000-4000-8000-0000000000e3',r
 from public.projects, (values ('iso-p1','viewer'),('iso-p2','account-manager')) v(s,r) where slug=s;
create temp table ids as select slug,id project_id,organization_id from public.projects where slug like 'iso-%';
grant select on ids to authenticated;
create temp table k(name text primary key, id uuid);
grant all on k to authenticated;
create function pg_temp.pid(s text) returns uuid language sql as $$ select project_id from ids where slug=s $$;
create function pg_temp.kid(s text) returns uuid language sql as $$ select id from k where name=s $$;
create function pg_temp.conn(p text, h text) returns jsonb language sql as $$
 select jsonb_build_object('openseoProjectId',p,'allowedHosts',jsonb_build_array(h),'consent',true) $$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1');
insert into k select 'c1',(public.openseo_connection(pg_temp.pid('iso-p1'),'connect',pg_temp.conn('oseo-p1','p1.example'))->>'connectionId')::uuid;
insert into k select 'c2',(public.openseo_connection(pg_temp.pid('iso-p2'),'connect',pg_temp.conn('oseo-p2','p2.example'))->>'connectionId')::uuid;

-- Same owner, two projects: nothing crosses from p1 to p2.
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-p2'),'acquire',null,jsonb_build_object('connectionId',pg_temp.kid('c1')))$$,
 '23514',null,'same owner cannot launch p2 with the connection of p1');
select throws_ok($$select public.openseo_connection(pg_temp.pid('iso-p2'),'connect',pg_temp.conn('oseo-x','p1.example'))$$,
 '22023',null,'p2 cannot list the domain of p1 as audit host');
insert into k select 'j1',(public.openseo_job(pg_temp.pid('iso-p1'),'acquire',null,jsonb_build_object('connectionId',pg_temp.kid('c1')))->>'jobId')::uuid;
select lives_ok($$select public.openseo_job(pg_temp.pid('iso-p1'),'bind',pg_temp.kid('j1'),'{"auditId":"aud-p1"}')$$,'p1 binds its audit');
insert into k select 'j2',(public.openseo_job(pg_temp.pid('iso-p2'),'acquire',null,jsonb_build_object('connectionId',pg_temp.kid('c2')))->>'jobId')::uuid;
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-p2'),'bind',pg_temp.kid('j2'),'{"auditId":"aud-p1"}')$$,
 '23505',null,'p2 cannot claim the audit id of p1');
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-p2'),'get',null,'{"auditId":"aud-p1"}')$$,
 '22023',null,'p2 cannot look up the audit of p1');
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-p2'),'get',pg_temp.kid('j1'))$$,
 '22023',null,'p2 cannot read the job of p1 by id');
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-p2'),'fail',pg_temp.kid('j1'))$$,
 '22023',null,'p2 cannot release the job of p1');
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-p2'),'complete',pg_temp.kid('j1'),'{}')$$,
 '22023',null,'p2 cannot complete the job of p1');

-- Rows prepared for p1 cannot be stored through p2's job, even by the same owner.
select lives_ok($$select public.openseo_job(pg_temp.pid('iso-p2'),'bind',pg_temp.kid('j2'),'{"auditId":"aud-p2"}')$$,'p2 binds its own audit');
create function pg_temp.row_for(slug text, op text, audit text) returns jsonb language sql as $$
 select jsonb_build_object('project_id',project_id,'organization_id',organization_id,'provider','openseo','operation',op,'status','OK',
 'captured_at','2026-10-09T07:00:00Z','data','[]'::jsonb,'data_hash_alg','sha256','data_hash',repeat('a',64),'key_id','test-key','signature',repeat('b',64),
 'signed_payload',jsonb_build_object('scopeVersion',1,'scope',jsonb_build_object('tenantId',organization_id,'projectId',project_id),
 'provenance',jsonb_build_object('evidence',jsonb_build_object('auditId',audit)))) from ids where ids.slug=row_for.slug $$;
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-p2'),'complete',pg_temp.kid('j2'),jsonb_build_object(
 'auditIssues',pg_temp.row_for('iso-p1','auditIssues','aud-p2'),'auditPages',pg_temp.row_for('iso-p1','auditPages','aud-p2')))$$,
 '23514','OpenSEO result identity mismatch','rows scoped to p1 refused by p2');
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-p2'),'complete',pg_temp.kid('j2'),jsonb_build_object(
 'auditIssues',pg_temp.row_for('iso-p2','auditIssues','aud-p1'),'auditPages',pg_temp.row_for('iso-p2','auditPages','aud-p1')))$$,
 '23514','OpenSEO result identity mismatch','rows carrying the audit of p1 refused by p2');
select set_config('role','postgres',true);
select is((select count(*)::int from public.provider_results),0,'nothing stored by refused completions');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1');
select lives_ok($$select public.openseo_job(pg_temp.pid('iso-p2'),'complete',pg_temp.kid('j2'),jsonb_build_object(
 'auditIssues',pg_temp.row_for('iso-p2','auditIssues','aud-p2'),'auditPages',pg_temp.row_for('iso-p2','auditPages','aud-p2')))$$,
 'control: the same rows scoped to p2 and its audit are accepted');
select set_config('role','postgres',true);
select is((select count(*)::int from public.provider_results where project_id=pg_temp.pid('iso-p2')),2,'control stored exactly two rows in p2');

-- Non-owner roles of the same organization: no command on jobs or connections.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e3');
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-p1'),'get',pg_temp.kid('j1'))$$,'42501',null,'viewer cannot read a job');
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-p2'),'acquire')$$,'42501',null,'account-manager cannot reserve');
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-p2'),'fail',pg_temp.kid('j2'))$$,'42501',null,'account-manager cannot release');
select throws_ok($$select public.openseo_connection(pg_temp.pid('iso-p2'),'get')$$,'42501',null,'account-manager cannot read the connection');
select throws_ok($$select public.openseo_connection(pg_temp.pid('iso-p1'),'connect',pg_temp.conn('oseo-v','p1.example'))$$,'42501',null,'viewer cannot connect');

-- Another organization: every command refused on A's projects, even with A's identifiers.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e2');
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-p1'),'get',null,'{"auditId":"aud-p1"}')$$,'42501',null,'other org cannot look up by audit id');
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-q1'),'get',null,'{"auditId":"aud-p1"}')$$,'22023',null,'other org cannot find A audit through its own project');
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-q1'),'acquire',null,jsonb_build_object('connectionId',pg_temp.kid('c1')))$$,
 '23514',null,'other org cannot launch with A connection');
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-q1'),'get',pg_temp.kid('j1'))$$,'22023',null,'other org cannot read A job through its project');

-- Anonymous sessions have no access at all.
select set_config('role','anon',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select public.openseo_job(pg_temp.pid('iso-p1'),'get',pg_temp.kid('j1'))$$,'42501',null,'anon cannot call job RPC');
select throws_ok($$select public.openseo_connection(pg_temp.pid('iso-p1'),'get')$$,'42501',null,'anon cannot call connection RPC');
select * from finish();
rollback;
