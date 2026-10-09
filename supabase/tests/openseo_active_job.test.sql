begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role) values
 ('00000000-0000-4000-8000-0000000000f1','aj-a@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-0000000000f2','aj-b@example.test','authenticated','authenticated');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),
 set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
insert into public.organizations(slug,name) values('aj-a','A');
insert into public.projects(organization_id,slug,name) select id,'aj-a1','A1' from public.organizations where slug='aj-a';
select set_config('role','postgres',true);
create temp table ids as select id project_id from public.projects where slug='aj-a1';
grant select on ids to authenticated;

select ok(not has_function_privilege('anon','public.openseo_active_job(uuid)','execute'),'anon cannot read the active job');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select is((select public.openseo_active_job(project_id)->>'state' from ids),'NONE','no active job by default');
select set_config('role','postgres',true);
select is((select count(*)::int from private.openseo_project_jobs),0,'reading creates no reservation');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select lives_ok($$select public.openseo_job(project_id,'acquire') from ids$$,'reserve');
select is((select public.openseo_active_job(project_id)->>'state' from ids),'STARTING','uncertain reservation visible');
select ok((select (public.openseo_active_job(project_id)->>'createdAt') is not null from ids),'reservation shows its age');
create temp table job as select (public.openseo_active_job(project_id)->>'jobId')::uuid id from ids;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
select throws_ok($$select public.openseo_release_starting_job(project_id,job.id) from ids,job$$,'42501',null,'other client cannot release');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select lives_ok($$select public.openseo_job(project_id,'bind',job.id,'{"auditId":"aud-seen"}') from ids,job$$,
 'owner binds the audit id seen in OpenSEO');
select is((select public.openseo_active_job(project_id)->>'auditId' from ids),'aud-seen','bound job now follows that audit');
select throws_ok($$select public.openseo_release_starting_job(project_id,job.id) from ids,job$$,'23514',
 'No uncertain OpenSEO reservation to release','a stale release never discards a bound crawl');
select is((select public.openseo_active_job(project_id)->>'state' from ids),'SYNCING','bound job still active');
select set_config('role','postgres',true);
update private.openseo_project_jobs set state='FAILED';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
create temp table job2 as select (public.openseo_job(project_id,'acquire')->>'jobId')::uuid id from ids;
select is((select public.openseo_release_starting_job(project_id,job2.id)->>'state' from ids,job2),'FAILED','owner releases an uncertain reservation');
select is((select public.openseo_active_job(project_id)->>'state' from ids),'NONE','released: nothing active');
select throws_ok($$select public.openseo_release_starting_job(project_id,job2.id) from ids,job2$$,'23514',null,'releasing twice is refused');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
select throws_ok($$select public.openseo_active_job(project_id) from ids$$,'42501',null,'other client cannot read the active job');
select * from finish();
rollback;
