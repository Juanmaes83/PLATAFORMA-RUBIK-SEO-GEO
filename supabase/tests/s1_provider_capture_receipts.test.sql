-- S1 (20261015210000): provider results and their audit receipts commit together.
-- Synthetic rows exercise database identity and atomicity only; their fake HMAC is never trusted.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Surface: triggers enabled, functions private, fixed search_path, not callable by any API role.
select is((select count(*)::int from pg_trigger where tgname in ('google_captures_audit_stored', 'openseo_jobs_audit_completed') and tgenabled = 'O'),
  2, 'both receipt triggers exist and are enabled');
select ok(bool_and(p.prosecdef and p.proconfig = array['search_path=""']), 'receipt functions: SECURITY DEFINER with an empty search_path')
  from pg_proc p where p.oid in ('private.queue_google_capture_receipt()'::regprocedure, 'private.queue_openseo_job_receipt()'::regprocedure,
    'private.provider_receipt_owner(uuid,uuid)'::regprocedure);
select ok(not bool_or(has_function_privilege(r, f, 'execute')), 'no API role or the writer can call the receipt functions')
  from unnest(array['anon', 'authenticated', 'rubik_audit_writer']) r,
    unnest(array['private.queue_google_capture_receipt()', 'private.queue_openseo_job_receipt()', 'private.provider_receipt_owner(uuid,uuid)']) f;
select ok(not has_table_privilege('rubik_audit_writer', 'private.audit_outbox', 'insert'), 'the writer cannot create receipts itself');

insert into auth.users(id, email, aud, role) values
 ('00000000-0000-4000-8000-0000000000c7', 'rcpt-owner@example.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000000c8', 'rcpt-viewer@example.test', 'authenticated', 'authenticated');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
 select set_config('role', 'authenticated', true),
 set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c7');
insert into public.organizations(slug, name) values ('rcpt-a', 'A');
insert into public.projects(organization_id, slug, name) select id, 'rcpt-a1', 'A1' from public.organizations where slug = 'rcpt-a';
select set_config('role', 'postgres', true);
insert into public.organization_members(organization_id, user_id, role)
  select id, '00000000-0000-4000-8000-0000000000c8', 'member' from public.organizations where slug = 'rcpt-a';
insert into public.project_members(project_id, organization_id, user_id, role)
  select id, organization_id, '00000000-0000-4000-8000-0000000000c8', 'viewer' from public.projects where slug = 'rcpt-a1';
create temp table ids as select id project_id, organization_id from public.projects where slug = 'rcpt-a1';
create temp table job(id uuid);
grant select on ids to authenticated, rubik_audit_writer;
grant all on job to authenticated, rubik_audit_writer;

-- Constraint: the new actions target text, never a member uuid.
select throws_ok($$insert into private.audit_outbox (project_id, organization_id, actor_id, actor_role, action, target_id)
  select project_id, organization_id, gen_random_uuid(), 'owner', 'google.capture', gen_random_uuid() from ids$$,
  '23514', null, 'google.capture receipts must target the result id as text');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c7');
insert into job select (public.openseo_job(project_id, 'acquire') ->> 'jobId')::uuid from ids;
select lives_ok($$select public.openseo_job(project_id, 'bind', job.id, '{"auditId":"rcpt-audit"}') from ids, job$$, 'owner binds the audit');
select set_config('role', 'postgres', true);

create function pg_temp.result_row(op text) returns jsonb language sql as $$
 select jsonb_build_object('project_id', project_id, 'organization_id', organization_id, 'provider', 'openseo', 'operation', op, 'status', 'OK',
 'captured_at', '2026-10-15T07:00:00Z', 'data', '[]'::jsonb, 'data_hash_alg', 'sha256', 'data_hash', repeat('a', 64), 'key_id', 'test-key',
 'signature', repeat('b', 64), 'signed_payload', jsonb_build_object('scopeVersion', 1, 'scope', jsonb_build_object('tenantId', organization_id, 'projectId', project_id),
 'provenance', jsonb_build_object('evidence', jsonb_build_object('auditId', 'rcpt-audit')))) from ids;
$$;
-- Writer membership exists only inside this test transaction; the role switch is per call.
grant rubik_audit_writer to postgres;
create function pg_temp.as_writer(uid uuid, stmt text) returns jsonb language plpgsql as $f$
declare result jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role rubik_audit_writer;
  execute stmt into result;
  reset role;
  return result;
end;
$f$;

-- A viewer's identity cannot complete (and so cannot create a receipt), even through the writer.
select throws_ok($$select pg_temp.as_writer('00000000-0000-4000-8000-0000000000c8', $q$select private.openseo_job(project_id, 'complete', job.id,
  jsonb_build_object('auditIssues', pg_temp.result_row('auditIssues'), 'auditPages', pg_temp.result_row('auditPages'))) from ids, job$q$)$$,
  '42501', null, 'a viewer cannot complete a job through the writer');
select is((select count(*)::int from private.audit_outbox where action = 'openseo.audit.store'), 0, 'no receipt after a refused completion');

select lives_ok($$select pg_temp.as_writer('00000000-0000-4000-8000-0000000000c7', $q$select private.openseo_job(project_id, 'complete', job.id,
  jsonb_build_object('auditIssues', pg_temp.result_row('auditIssues'), 'auditPages', pg_temp.result_row('auditPages'))) from ids, job$q$)$$,
  'owner completes through the writer');
select is((select count(*)::int from private.audit_outbox o, job where o.id = job.id and o.action = 'openseo.audit.store' and o.state = 'pending'
  and o.target_text = 'rcpt-audit' and o.actor_id = '00000000-0000-4000-8000-0000000000c7' and o.actor_role = 'owner'), 1,
  'the completion and its receipt (id = job id, actor = verified owner) committed together');
select is((select (details ->> 'issuesResultId')::uuid from private.audit_outbox o, job where o.id = job.id),
  (select issues_result_id from private.openseo_project_jobs j, job where j.id = job.id), 'the receipt names the stored results');
select lives_ok($$select pg_temp.as_writer('00000000-0000-4000-8000-0000000000c7', $q$select private.openseo_job(project_id, 'complete', job.id, '{}') from ids, job$q$)$$,
  'a completion retry is accepted');
select is((select count(*)::int from private.audit_outbox where action = 'openseo.audit.store'), 1, 'a retry adds no second receipt');

-- Offline restoration (postgres, no JWT) keeps data as signed and creates no receipt.
select set_config('request.jwt.claims', '', true);
insert into private.openseo_project_jobs(project_id, organization_id, created_by, state, audit_id)
  select project_id, organization_id, '00000000-0000-4000-8000-0000000000c7', 'SYNCING', 'rcpt-restored' from ids;
update private.openseo_project_jobs set state = 'COMPLETED' where audit_id = 'rcpt-restored';
select is((select count(*)::int from private.audit_outbox where target_text = 'rcpt-restored'), 0, 'offline restoration creates no receipt');

-- The pending receipt protects the project from a cascading deletion (#106).
select throws_ok($$delete from public.projects where id = (select project_id from ids)$$, '55000', null,
  'the pending provider receipt blocks the project deletion');

select * from finish();
rollback;
