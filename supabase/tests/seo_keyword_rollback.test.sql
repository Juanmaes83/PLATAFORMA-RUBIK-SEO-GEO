-- N2-09 containment rollback: access is revoked while rows and audit structures survive.
-- The transaction recreates the rollback effects and always rolls back its fictitious fixture.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,aud,role,email_confirmed_at) values
 ('00000000-0000-4000-8000-000000000926','seo-rollback@example.test','authenticated','authenticated',now());
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000926","role":"authenticated"}',true);
insert into public.organizations(slug,name) values('seo-rollback','Rollback fixture');
insert into public.projects(organization_id,slug,name) select id,'rollback','Rollback' from public.organizations where slug='seo-rollback';
insert into public.seo_keywords(project_id,organization_id,phrase,language_code,country_code)
 select p.id,p.organization_id,'preservada','es','ES' from public.projects p join public.organizations o on o.id=p.organization_id
 where o.slug='seo-rollback';

revoke all on public.seo_keywords from public, anon, authenticated;
drop policy if exists "project members read keywords" on public.seo_keywords;
drop policy if exists "drafting roles create keywords" on public.seo_keywords;
drop policy if exists "drafting roles edit keywords" on public.seo_keywords;
drop policy if exists "project owners erase keywords" on public.seo_keywords;

select ok(to_regclass('public.seo_keywords') is not null,'rollback keeps the table');
select ok((select relrowsecurity from pg_class where oid='public.seo_keywords'::regclass),'rollback keeps RLS enabled');
select ok(not has_table_privilege('authenticated','public.seo_keywords','select,insert,update,delete'),
  'rollback revokes API privileges');
select is((select count(*)::int from public.seo_keywords where phrase='preservada'),1,
  'rollback preserves existing keyword rows');
select ok((select bool_and(exists (select 1 from pg_trigger t where t.tgrelid='public.seo_keywords'::regclass
  and not t.tgisinternal and t.tgname=n)) from unnest(array['seo_keywords_touch_updated_at','seo_keywords_audit','seo_keywords_target_guard']) n),
  'rollback preserves timestamp, audit and target guard triggers');
select is((select count(*)::int from pg_constraint where conrelid='private.audit_outbox'::regclass
  and conname in ('audit_outbox_action_check','audit_outbox_target_check')),2,
  'rollback preserves audit receipt constraints');
select * from finish();
rollback;
