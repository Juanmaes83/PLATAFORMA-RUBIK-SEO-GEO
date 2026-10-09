begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role) values
 ('00000000-0000-4000-8000-0000000000a9','jobs-a@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-0000000000b9','jobs-b@example.test','authenticated','authenticated');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),
 set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a9');
insert into public.organizations(slug,name) values('jobs-a','A');
insert into public.projects(organization_id,slug,name)
 select id,'jobs-a1','A1' from public.organizations where slug='jobs-a';
select set_config('role','postgres',true);
create temp table ids as select id project_id,organization_id from public.projects where slug='jobs-a1';
grant select on ids to authenticated;
create temp table job(id uuid);
grant all on job to authenticated;

select ok((select relrowsecurity from pg_class where oid='private.openseo_project_jobs'::regclass),'private jobs have RLS');
select ok(not has_table_privilege('authenticated','private.openseo_project_jobs','select,insert,update,delete'),'no direct ledger access');
select ok(not has_function_privilege('anon','public.openseo_job(uuid,text,uuid,jsonb)','execute'),'anon cannot execute RPC');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a9');
insert into job select (public.openseo_job(project_id,'acquire')->>'jobId')::uuid from ids;
select is((select public.openseo_job(project_id,'acquire')->>'acquired' from ids),'false','second acquisition reuses reservation');
select is((select (public.openseo_job(project_id,'acquire')->>'jobId')::uuid from ids),(select id from job),'same active job returned');
select is((select public.openseo_job(project_id,'get',job.id)->>'state' from ids,job),'STARTING','reserved before network');
select lives_ok($$select public.openseo_job(project_id,'bind',job.id,'{"auditId":"audit-a"}') from ids,job$$,'bind real identifier');
select lives_ok($$select public.openseo_job(project_id,'bind',job.id,'{"auditId":"audit-a"}') from ids,job$$,'binding retry is idempotent');
select is((select public.openseo_job(project_id,'get',null,'{"auditId":"audit-a"}')->>'auditId' from ids),'audit-a','follow lookup uses persisted project binding');
select throws_ok($$select public.openseo_job(project_id,'bind',job.id,'{"auditId":"audit-other"}') from ids,job$$,'23514',null,'bound identifier cannot change');
select throws_ok($$select public.openseo_job(project_id,'complete',job.id,'{}') from ids,job$$,'23514',null,'missing signed pair refused');
select is((select count(*)::int from public.provider_results),0,'failed completion wrote nothing');
select is((select public.openseo_job(project_id,'get',job.id)->>'state' from ids,job),'SYNCING','failure retains active lock');

-- Synthetic rows test DB atomicity/identity only; their fake HMAC is not trusted.
create function pg_temp.result_row(op text,other_project boolean default false) returns jsonb language sql as $$
 select jsonb_build_object('project_id',case when other_project then gen_random_uuid() else project_id end,
 'organization_id',organization_id,'provider','openseo','operation',op,'status','OK',
 'captured_at','2026-10-09T07:00:00Z','data','[]'::jsonb,'data_hash_alg','sha256',
 'data_hash',repeat('a',64),'key_id','test-key','signature',repeat('b',64),
 'signed_payload',jsonb_build_object('scopeVersion',1,'provider','openseo','operation',op,'status','OK',
 'dataHashAlg','sha256','dataHash',repeat('a',64),
 'scope',jsonb_build_object('tenantId',organization_id,'projectId',project_id),
 'provenance',jsonb_build_object('evidence',jsonb_build_object('auditId','audit-a')))) from ids;
$$;
select throws_ok($$select public.openseo_job(project_id,'complete',job.id,
 jsonb_build_object('auditIssues',pg_temp.result_row('auditIssues'),'auditPages',pg_temp.result_row('auditPages',true))) from ids,job$$,
 '23514',null,'second row scope mismatch rolls back first insert');
select is((select count(*)::int from public.provider_results),0,'pair rolls back atomically');
select lives_ok($$select public.openseo_job(project_id,'complete',job.id,
 jsonb_build_object('auditIssues',pg_temp.result_row('auditIssues'),'auditPages',pg_temp.result_row('auditPages'))) from ids,job$$,'store pair atomically');
select lives_ok($$select public.openseo_job(project_id,'complete',job.id,'{}') from ids,job$$,'completion retry does not insert');
select is((select count(*)::int from public.provider_results),2,'exactly two rows after retry');
select is((select public.openseo_job(project_id,'get',job.id)->>'state' from ids,job),'COMPLETED','job complete after both rows');
select throws_ok($$select public.openseo_job(project_id,'fail',job.id) from ids,job$$,'23514',null,'completed state cannot regress');
select is((select public.openseo_job(project_id,'acquire')->>'acquired' from ids),'true','completed job releases active slot');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b9');
select throws_ok($$select public.openseo_job(project_id,'get',job.id) from ids,job$$,'42501',null,'other client cannot inspect job');
select throws_ok($$select public.openseo_job(project_id,'get',null,'{"auditId":"audit-a"}') from ids$$,'42501',null,'audit lookup denies other client');
select throws_ok($$select public.openseo_job(project_id,'acquire') from ids$$,'42501',null,'other client cannot acquire');
select throws_ok($$select public.openseo_job(project_id,'fail',job.id) from ids,job$$,'42501',null,'other client cannot release lock');
select * from finish();
rollback;
