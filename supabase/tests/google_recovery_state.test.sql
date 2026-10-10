-- Google recovery state (migration 20261012130000): project owners only, read-only, every
-- connection and binding (revoked history included), only STORED captures, never another project.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role,email_confirmed_at) values
 ('00000000-0000-4000-8000-0000000000a1','rec-owner@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-0000000000a2','rec-analyst@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-0000000000a3','rec-other@example.test','authenticated','authenticated',now());
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),
 set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
insert into public.organizations(slug,name) values('rec-a','A');
insert into public.projects(organization_id,slug,name) select id,s,s from public.organizations, (values ('rec-p1'),('rec-p2')) v(s) where slug='rec-a';
select set_config('role','postgres',true);
select set_config('request.jwt.claims','{}',true);
insert into public.organization_members(organization_id,user_id,role) select id,'00000000-0000-4000-8000-0000000000a2','member' from public.organizations where slug='rec-a';
insert into public.project_members(project_id,organization_id,user_id,role) select id,organization_id,'00000000-0000-4000-8000-0000000000a2','analyst' from public.projects where slug='rec-p1';
create temp table fx as select slug, id prj, organization_id org from public.projects where slug like 'rec-p%';
grant select on fx to authenticated;
-- p1: a revoked connection and an active one; a revoked and an active binding; captures in every state.
insert into private.openseo_project_connections(project_id,organization_id,state,openseo_project_id,allowed_hosts,granted_by,revoked_by,revoked_at)
 select prj,org,'REVOKED','rec-old',array['rec.test'],'00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a1',now() from fx where slug='rec-p1';
insert into private.openseo_project_connections(project_id,organization_id,state,openseo_project_id,allowed_hosts,granted_by)
 select prj,org,'ACTIVE',slug,array[slug||'.test'],'00000000-0000-4000-8000-0000000000a1' from fx;
insert into private.openseo_google_properties(project_id,organization_id,connection_id,provider,external_property_id,state,granted_by,revoked_by,revoked_at)
 select f.prj,f.org,c.id,'search-console','sc-domain:old.test','REVOKED','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a1',now()
 from fx f join private.openseo_project_connections c on c.project_id=f.prj and c.state='ACTIVE' where f.slug='rec-p1';
insert into private.openseo_google_properties(project_id,organization_id,connection_id,provider,external_property_id,state,granted_by)
 select f.prj,f.org,c.id,'search-console','sc-domain:'||f.slug||'.test','ACTIVE','00000000-0000-4000-8000-0000000000a1'
 from fx f join private.openseo_project_connections c on c.project_id=f.prj and c.state='ACTIVE';
insert into public.provider_results(project_id,organization_id,provider,operation,status,signed_payload,data_hash_alg,data_hash,key_id,signature,created_by)
 select prj,org,'search-console','searchAnalytics','OK',
  jsonb_build_object('provider','search-console','operation','searchAnalytics','status','OK','dataHash',repeat('c',64),'dataHashAlg','sha256'),
  'sha256',repeat('c',64),'k-test',repeat('d',64),'00000000-0000-4000-8000-0000000000a1' from fx;
insert into private.google_captures(project_id,organization_id,idempotency_key,provider,connection_id,property_binding_id,state,result_id,created_by,closed_at)
 select f.prj,f.org,'stored-key-'||f.slug||'-000',g.provider,g.connection_id,g.id,'STORED',r.id,'00000000-0000-4000-8000-0000000000a1',now()
 from fx f join private.openseo_google_properties g on g.project_id=f.prj and g.state='ACTIVE' join public.provider_results r on r.project_id=f.prj;
insert into private.google_captures(project_id,organization_id,idempotency_key,provider,connection_id,property_binding_id,state,created_by)
 select f.prj,f.org,'reserved-key-'||f.slug||'-00',g.provider,g.connection_id,g.id,'RESERVED','00000000-0000-4000-8000-0000000000a1'
 from fx f join private.openseo_google_properties g on g.project_id=f.prj and g.state='ACTIVE' where f.slug='rec-p1';
insert into private.google_captures(project_id,organization_id,idempotency_key,provider,connection_id,property_binding_id,state,created_by,closed_at)
 select f.prj,f.org,'released-key-'||f.slug||'-0',g.provider,g.connection_id,g.id,'RELEASED','00000000-0000-4000-8000-0000000000a1',now()
 from fx f join private.openseo_google_properties g on g.project_id=f.prj and g.state='ACTIVE' where f.slug='rec-p1';
create function pg_temp.st(s text) returns jsonb language sql as $$ select public.google_recovery_state((select prj from fx where slug=s)) $$;

select ok(not has_function_privilege('anon','public.google_recovery_state(uuid)','execute'),'anon cannot read');
select is((select prosecdef from pg_proc where oid='public.google_recovery_state(uuid)'::regprocedure),false,'public wrapper is SECURITY INVOKER');
select is((select proconfig from pg_proc where oid='private.google_recovery_state(uuid)'::regprocedure),array['search_path=""'],'empty search_path');
select is((select provolatile from pg_proc where oid='private.google_recovery_state(uuid)'::regprocedure),'s'::"char",'declared read-only (stable)');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select throws_ok($$select pg_temp.st('rec-p1')$$,'42501',null,'an analyst cannot read it');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3');
select throws_ok($$select pg_temp.st('rec-p1')$$,'42501',null,'another account cannot read it');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select is(jsonb_array_length(pg_temp.st('rec-p1')->'connections'),2,'both connections, the revoked one included');
select is(jsonb_array_length(pg_temp.st('rec-p1')->'bindings'),2,'both bindings, the revoked one included');
select is(jsonb_array_length(pg_temp.st('rec-p1')->'captures'),1,'only the stored capture');
select is(pg_temp.st('rec-p1')->'captures'->0->>'state','STORED','its state is STORED');
select ok((pg_temp.st('rec-p1')->'captures'->0->>'result_id') is not null,'with its result');
select ok(not (pg_temp.st('rec-p1')::text ~ 'rec-p2'),'nothing from the other project');
select is((select count(*)::int from jsonb_array_elements(pg_temp.st('rec-p1')->'connections') c where c ? 'credential_mode' and c->>'credential_mode'='platform'),2,'connections carry no secret, only the platform mode');

select * from finish();
rollback;
