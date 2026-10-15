-- Transactional pgTAP: deleting a project/organization must not discard a pending
-- trusted audit receipt via ON DELETE CASCADE. All fixtures roll back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is((select count(*)::integer from pg_trigger
  where tgrelid = 'public.projects'::regclass
    and tgname = 'projects_pending_audit_guard'
    and tgenabled = 'O'), 1, 'project deletion guard exists and is enabled');
select is((select prosecdef from pg_proc where oid =
  'private.reject_project_delete_with_pending_audit()'::regprocedure),
  true, 'guard checks private outbox as a SECURITY DEFINER');
select is((select proconfig from pg_proc where oid =
  'private.reject_project_delete_with_pending_audit()'::regprocedure),
  array['search_path=""'], 'guard has fixed empty search_path');
select ok(not has_function_privilege('authenticated',
  'private.reject_project_delete_with_pending_audit()', 'execute'),
  'JWT cannot invoke private project deletion guard');
select ok(not has_function_privilege('anon',
  'private.reject_project_delete_with_pending_audit()', 'execute'),
  'anon cannot invoke private project deletion guard');

insert into auth.users (id,email,aud,role,email_confirmed_at) values
  ('00000000-0000-4000-8000-00000000e701','s1-ret-owner@example.test','authenticated','authenticated',now());

select set_config('role','authenticated',true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-00000000e701","role":"authenticated"}', true);

insert into public.organizations(slug,name) values
  ('s1-ret-org-a','Receipt preservation A'),
  ('s1-ret-org-b','Receipt preservation B');
insert into public.projects(organization_id,slug,name)
  select id,'s1-ret-project-a','Protected A' from public.organizations where slug='s1-ret-org-a';
insert into public.projects(organization_id,slug,name)
  select id,'s1-ret-project-b','Protected B' from public.organizations where slug='s1-ret-org-b';

select set_config('role','postgres',true);
select set_config('request.jwt.claims','{}',true);

insert into private.audit_outbox
 (project_id, organization_id, actor_id, actor_role, action, target_id)
select id, organization_id, '00000000-0000-4000-8000-00000000e701'::uuid,
 'owner','member.withdraw','00000000-0000-4000-8000-00000000e701'::uuid
from public.projects where slug in ('s1-ret-project-a','s1-ret-project-b');

select throws_ok($$
  delete from public.projects where slug='s1-ret-project-a'
$$, '55000', 'Cannot delete project while audit receipts remain unsigned',
  'a direct project delete cannot cascade a pending audit receipt');

select is((select count(*)::int from private.audit_outbox where state='pending'
  and project_id=(select id from public.projects where slug='s1-ret-project-a')),
  1, 'blocked direct deletion preserved the receipt');
select is((select count(*)::int from public.projects where slug='s1-ret-project-a'),
  1, 'blocked direct deletion preserved the project');

select throws_ok($$
  delete from public.organizations where slug='s1-ret-org-b'
$$, '55000', 'Cannot delete project while audit receipts remain unsigned',
  'organization cascade cannot silently discard a pending project receipt');
select is((select count(*)::int from private.audit_outbox where state='pending'
  and project_id=(select id from public.projects where slug='s1-ret-project-b')),
  1, 'blocked organization deletion preserved the receipt');
select is((select count(*)::int from public.organizations where slug='s1-ret-org-b'),
  1, 'blocked organization deletion preserved the organization');

-- Mark receipt as completed to isolate the DELETE guard behavior. The signing
-- protocol is covered separately; this fixture does not prove an HMAC.
update private.audit_outbox set state='completed', completed_at=now(), event_seq=1
where project_id in (select id from public.projects where slug like 's1-ret-project-%');

select lives_ok($$
  delete from public.projects where slug='s1-ret-project-a'
$$, 'completed receipts do not block the existing project deletion contract');
select lives_ok($$
  delete from public.organizations where slug='s1-ret-org-b'
$$, 'completed receipts do not block organization deletion contract');

select is((select count(*)::int from public.projects where slug='s1-ret-project-a'),
  0, 'direct deletion completed after reconciliation');
select is((select count(*)::int from public.organizations where slug='s1-ret-org-b'),
  0, 'organization deletion completed after reconciliation');

select * from finish();
rollback;
