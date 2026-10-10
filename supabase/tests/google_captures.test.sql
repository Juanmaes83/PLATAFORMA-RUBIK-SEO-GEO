-- Manual Google captures (migration 20261012120000): project owners only; reserve under an
-- idempotency key, store atomically after re-validating connection and binding, replay without a
-- second provider call, no storage after a revocation, the signed source must match the
-- reservation, and a released or abandoned key can be reused.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role,email_confirmed_at) values
 ('00000000-0000-4000-8000-0000000000f1','cap-owner@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-0000000000f2','cap-analyst@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-0000000000f3','cap-other@example.test','authenticated','authenticated',now());
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role','authenticated',true),
 set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
insert into public.organizations(slug,name) values('cap-a','A');
insert into public.projects(organization_id,slug,name) select id,'cap-p1','P1' from public.organizations where slug='cap-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f3');
insert into public.organizations(slug,name) values('cap-b','B');
insert into public.projects(organization_id,slug,name) select id,'cap-q1','Q1' from public.organizations where slug='cap-b';
select set_config('role','postgres',true);
select set_config('request.jwt.claims','{}',true);
insert into public.organization_members(organization_id,user_id,role)
 select id,'00000000-0000-4000-8000-0000000000f2','member' from public.organizations where slug='cap-a';
insert into public.project_members(project_id,organization_id,user_id,role)
 select id,organization_id,'00000000-0000-4000-8000-0000000000f2','analyst' from public.projects where slug='cap-p1';
create temp table fx as select p.id prj, p.organization_id org from public.projects p where p.slug='cap-p1';
insert into private.openseo_project_connections(project_id,organization_id,state,openseo_project_id,allowed_hosts,granted_by)
 select prj,org,'ACTIVE','client-project',array['cap.test'],'00000000-0000-4000-8000-0000000000f1' from fx;
insert into private.openseo_google_properties(project_id,organization_id,connection_id,provider,external_property_id,state,granted_by)
 select f.prj,f.org,c.id,'search-console','sc-domain:cap.test','ACTIVE','00000000-0000-4000-8000-0000000000f1'
 from fx f join private.openseo_project_connections c on c.project_id=f.prj;
create temp table ids as select f.prj, f.org, c.id conn, g.id bind from fx f
 join private.openseo_project_connections c on c.project_id=f.prj join private.openseo_google_properties g on g.project_id=f.prj;
grant select on ids to authenticated;

create function pg_temp.cap(cmd text, payload jsonb) returns jsonb language sql as $$
 select public.google_capture((select prj from ids), cmd, payload) $$;
create function pg_temp.begin(k text) returns jsonb language sql as $$
 select pg_temp.cap('begin', jsonb_build_object('key',k,'provider','search-console','connectionId',(select conn from ids),'propertyBindingId',(select bind from ids))) $$;
-- A sealed row as the server would send it (the database cannot check the HMAC; the app does).
create function pg_temp.row(status text default 'OK', conn uuid default null, bind uuid default null, prj uuid default null) returns jsonb language sql as $$
 select jsonb_build_object('project_id',coalesce(prj,(select prj from ids)),'organization_id',(select org from ids),
  'provider','search-console','operation','searchAnalytics','status',status,'captured_at','2026-10-10T10:00:00Z',
  'signed_payload',jsonb_build_object('provider','search-console','operation','searchAnalytics','status',status,
    'dataHash',repeat('c',64),'dataHashAlg','sha256',
    'provenance',jsonb_build_object('sourceContext',jsonb_build_object('connectionId',coalesce(conn,(select conn from ids)),'propertyBindingId',coalesce(bind,(select bind from ids))))),
  'data','[]'::jsonb,'data_hash_alg','sha256','data_hash',repeat('c',64),'key_id','k-test','signature',repeat('d',64)) $$;
create function pg_temp.store(k text, r jsonb) returns jsonb language sql as $$
 select pg_temp.cap('store', jsonb_build_object('key',k,'row',r)) $$;

-- Structure and privileges
select ok((select relrowsecurity from pg_class where oid='private.google_captures'::regclass),'captures have RLS');
select ok(not has_table_privilege('authenticated','private.google_captures','select,insert,update,delete'),'no direct access');
select ok(not has_function_privilege('anon','public.google_capture(uuid,text,jsonb)','execute'),'anon cannot capture');
select is((select prosecdef from pg_proc where oid='public.google_capture(uuid,text,jsonb)'::regprocedure),false,'public wrapper is SECURITY INVOKER');
select is((select proconfig from pg_proc where oid='private.google_capture_command(uuid,text,jsonb)'::regprocedure),array['search_path=""'],'empty search_path');

-- Who may capture
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
select throws_ok($$select pg_temp.begin('analyst-key-0000001')$$,'42501',null,'an analyst cannot capture');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f3');
select throws_ok($$select pg_temp.begin('other-key-00000001')$$,'42501',null,'another organization''s owner cannot capture');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select throws_ok($$select pg_temp.cap('delete','{"key":"owner-key-00000001"}')$$,'22023',null,'unknown command');
select throws_ok($$select pg_temp.begin('short')$$,'22023',null,'malformed idempotency key');
select throws_ok($$select pg_temp.cap('begin', jsonb_build_object('key','owner-key-00000001','provider','search-console','connectionId',(select conn from ids),'propertyBindingId',gen_random_uuid()))$$,
 '55000',null,'a binding that is not this project''s active one is refused');
select throws_ok($$select pg_temp.cap('begin', jsonb_build_object('key','owner-key-00000001','provider','google-analytics','connectionId',(select conn from ids),'propertyBindingId',(select bind from ids)))$$,
 '55000',null,'a binding for another provider is refused');

-- Reserve, refuse a mismatched capture, store, replay
select is(pg_temp.begin('owner-key-00000001')->>'state','RESERVED','reserved before the provider is called');
select throws_ok($$select pg_temp.begin('owner-key-00000001')$$,'55P03',null,'the same key cannot run twice at once');
select throws_ok($$select pg_temp.store('owner-key-00000001', pg_temp.row('OK', gen_random_uuid()))$$,'22023',null,'a signed source naming another connection is refused');
select throws_ok($$select pg_temp.store('owner-key-00000001', pg_temp.row('ERROR'))$$,'22023',null,'an error result is not stored');
select throws_ok($$select pg_temp.store('owner-key-00000001', pg_temp.row('OK', null, null, gen_random_uuid()))$$,'22023',null,'a row for another project is refused');
create temp table k(name text primary key, v text);
grant all on k to authenticated;
insert into k select 'r1', pg_temp.store('owner-key-00000001', pg_temp.row('PARTIAL'))->>'resultId';
select ok((select v from k where name='r1') ~ '^[0-9a-f-]{36}$','stored, with the result id');
select is(pg_temp.begin('owner-key-00000001'),jsonb_build_object('state','STORED','resultId',(select v from k where name='r1')),'a retry returns the same result without a new reservation');
select throws_ok($$select pg_temp.store('owner-key-00000001', pg_temp.row())$$,'55000',null,'a stored key cannot store twice');
select is(pg_temp.cap('release','{"key":"owner-key-00000001"}')->>'state','STORED','releasing a stored key changes nothing (a lost answer cannot undo a committed capture)');
select is((select count(*)::int from public.provider_results where project_id=(select prj from ids)),1,'exactly one result');
select is((select created_by from public.provider_results where id=(select v::uuid from k where name='r1')),'00000000-0000-4000-8000-0000000000f1'::uuid,'authored by the owner');

-- Release and reuse; abandoned reservations can be taken over
select is(pg_temp.begin('owner-key-00000002')->>'state','RESERVED','a second key reserves');
select is(pg_temp.cap('release','{"key":"owner-key-00000002"}')->>'state','RELEASED','released after a provider failure');
select is(pg_temp.begin('owner-key-00000002')->>'state','RESERVED','a released key can be reserved again');
select set_config('role','postgres',true);
update private.google_captures set reserved_at=now()-interval '10 minutes' where idempotency_key='owner-key-00000002';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select is(pg_temp.begin('owner-key-00000002')->>'state','RESERVED','an abandoned reservation can be taken over');

-- Revocation between reservation and storage stores nothing
select set_config('role','postgres',true);
update private.openseo_google_properties set state='REVOKED',revoked_at=now(),revoked_by='00000000-0000-4000-8000-0000000000f1' where id=(select bind from ids);
select pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
select throws_ok($$select pg_temp.store('owner-key-00000002', pg_temp.row())$$,'55000',null,'a revoked binding stores nothing');
select is((select count(*)::int from public.provider_results where project_id=(select prj from ids)),1,'still exactly one result');
select throws_ok($$select pg_temp.begin('owner-key-00000003')$$,'55000',null,'and no new capture can start');

-- Inventory and erasure
select is((public.project_data_inventory((select prj from ids))->>'googleCaptures')::int,2,'the inventory counts the capture ledger');
select set_config('role','postgres',true);
delete from public.provider_results where id=(select v::uuid from k where name='r1');
select is((select count(*)::int from private.google_captures where project_id=(select prj from ids) and result_id is not null),0,'erasing the result removes its capture record');

select * from finish();
rollback;
