-- Organization erasure (docs/RETENCION-Y-BORRADO.md §3, decision D1: at the end of a contract the
-- project is exported and erased). An administrator deleting an organization must leave no row
-- of it in any of the 15 tables of the data inventory, must not touch another organization, and
-- must keep the Auth accounts (D3: people are never deleted with a client). Rows are written as
-- the superuser, as the administrator's deletion is, so every table is populated even where the
-- app only writes through RPCs.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role,email_confirmed_at) values
 ('00000000-0000-4000-8000-0000000000e1','era-owner@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-0000000000e2','era-member@example.test','authenticated','authenticated',now()),
 ('00000000-0000-4000-8000-0000000000e3','era-other@example.test','authenticated','authenticated',now());

-- Two organizations with the same shape: A is erased, B must survive untouched.
create temp table fx(name text primary key, org uuid, prj uuid, owner uuid);
insert into fx values
 ('a', gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-0000000000e1'),
 ('b', gen_random_uuid(), gen_random_uuid(), '00000000-0000-4000-8000-0000000000e3');

insert into public.organizations(id,slug,name,created_by) select org, 'era-'||name, upper(name), owner from fx;
insert into public.projects(id,organization_id,slug,name) select prj, org, 'era-p-'||name, 'P' from fx;
insert into public.organization_members(organization_id,user_id,role)
 select org,'00000000-0000-4000-8000-0000000000e2','member' from fx where name='a';
insert into public.project_members(project_id,organization_id,user_id,role)
 select prj,org,owner,'owner' from fx
 union all select prj,org,'00000000-0000-4000-8000-0000000000e2','viewer' from fx where name='a';
insert into public.audit_events(project_id,organization_id,seq,at,actor_role,actor_id,action,outcome,hash,key_id,signature)
 select prj,org,1,now(),'owner',owner,'era.test','allowed',repeat('a',64),'k-test',repeat('b',64) from fx;
insert into public.provider_results(project_id,organization_id,provider,operation,status,signed_payload,data_hash_alg,data_hash,key_id,signature,created_by)
 select prj,org,'search-console','searchAnalytics','OK',
  jsonb_build_object('provider','search-console','operation','searchAnalytics','status','OK','dataHash',repeat('c',64),'dataHashAlg','sha256'),
  'sha256',repeat('c',64),'k-test',repeat('d',64),owner from fx;
insert into public.imports(project_id,organization_id,format,source_kind,source_label,captured_at,status,finding_count,error_count,findings,errors,file_sha256,file_bytes,created_by)
 select prj,org,'rubik-import-v1','audit','Prueba',now(),'empty',0,0,'[]','[]',md5(name)||md5(name),10,owner from fx;
insert into private.openseo_project_connections(project_id,organization_id,state,openseo_project_id,allowed_hosts,granted_by)
 select prj,org,'ACTIVE','era-'||name,array['era-'||name||'.test'],owner from fx;
-- A job pointing at the connection: that foreign key has no ON DELETE action, so the cascade
-- must remove both in the same statement.
insert into private.openseo_project_jobs(project_id,organization_id,created_by,state,connection_id)
 select f.prj,f.org,f.owner,'STARTING',c.id from fx f join private.openseo_project_connections c on c.project_id=f.prj;
insert into private.webmaster_properties(project_id,organization_id,provider,site_url,state,granted_by)
 select prj,org,'search-console','sc-domain:era-'||name||'.test','ACTIVE',owner from fx;
insert into private.openseo_google_properties(project_id,organization_id,connection_id,provider,external_property_id,state,granted_by)
 select f.prj,f.org,c.id,'google-analytics','properties/123','ACTIVE',f.owner from fx f join private.openseo_project_connections c on c.project_id=f.prj;
insert into private.google_captures(project_id,organization_id,idempotency_key,provider,connection_id,property_binding_id,state,created_by)
 select f.prj,f.org,'era-capture-key-'||f.name,'google-analytics',c.id,g.id,'RESERVED',f.owner
 from fx f join private.openseo_project_connections c on c.project_id=f.prj join private.openseo_google_properties g on g.project_id=f.prj;
insert into private.provider_budgets(project_id,organization_id,provider,monthly_limit,set_by)
 select prj,org,'openseo',1000,owner from fx;
insert into private.provider_spend(project_id,organization_id,provider,operation,estimated,state,reserved_by)
 select prj,org,'openseo','get_domain_overview',10,'RESERVED',owner from fx;
insert into private.project_invitations(project_id,organization_id,email,role,token_hash,created_by,expires_at)
 select prj,org,'invitada-'||name||'@example.test','viewer',md5('t'||name)||md5('u'||name),owner,now()+interval '7 days' from fx;

-- Rows of one organization in each of the 15 tables.
create function pg_temp.counts(o uuid) returns table(t text, n bigint) language sql as $$
  select 'organizations', count(*) from public.organizations where id=o
  union all select 'organization_members', count(*) from public.organization_members where organization_id=o
  union all select 'projects', count(*) from public.projects where organization_id=o
  union all select 'project_members', count(*) from public.project_members where organization_id=o
  union all select 'audit_events', count(*) from public.audit_events where organization_id=o
  union all select 'provider_results', count(*) from public.provider_results where organization_id=o
  union all select 'imports', count(*) from public.imports where organization_id=o
  union all select 'openseo_project_connections', count(*) from private.openseo_project_connections where organization_id=o
  union all select 'openseo_project_jobs', count(*) from private.openseo_project_jobs where organization_id=o
  union all select 'webmaster_properties', count(*) from private.webmaster_properties where organization_id=o
  union all select 'openseo_google_properties', count(*) from private.openseo_google_properties where organization_id=o
  union all select 'google_captures', count(*) from private.google_captures where organization_id=o
  union all select 'provider_budgets', count(*) from private.provider_budgets where organization_id=o
  union all select 'provider_spend', count(*) from private.provider_spend where organization_id=o
  union all select 'project_invitations', count(*) from private.project_invitations where organization_id=o
$$;
create temp table before_b as select * from pg_temp.counts((select org from fx where name='b'));

select is((select count(*)::int from pg_temp.counts((select org from fx where name='a'))), 15, 'the inventory covers 15 tables');
select is((select count(*)::int from pg_temp.counts((select org from fx where name='a')) where n = 0), 0, 'organization A has rows in every table before the erasure');

-- The administrator's erasure: no user session, like a deletion from the Supabase dashboard.
select set_config('request.jwt.claims','{}',true);
select lives_ok($$delete from public.organizations where id=(select org from fx where name='a')$$, 'deleting the organization succeeds in one statement');

select is((select string_agg(t||'='||n, ', ' order by t) from pg_temp.counts((select org from fx where name='a')) where n > 0), null, 'no row of organization A is left in any table');
select results_eq($$select t, n from pg_temp.counts((select org from fx where name='b')) order by t$$,
 $$select t, n from before_b order by t$$, 'organization B keeps every row');
select is((select count(*)::int from auth.users where id in ('00000000-0000-4000-8000-0000000000e1','00000000-0000-4000-8000-0000000000e2')), 2, 'the accounts of A''s people are kept (D3)');
select ok(not exists(select 1 from public.organization_members where user_id='00000000-0000-4000-8000-0000000000e2'), 'the member of A keeps no membership anywhere');

select * from finish();
rollback;
