-- CORE-9.3 · Manual imports (pgTAP). LOCAL stack only; everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- a: owner of agencia-a/proyecto-a1 · b: owner of agencia-b · c: analyst in a1 · v: viewer in a1
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a2', 'a@ejemplo.test', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-4000-8000-0000000000b2', 'b@ejemplo.test', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-4000-8000-0000000000c2', 'c@ejemplo.test', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-4000-8000-0000000000d2', 'v@ejemplo.test', 'authenticated', 'authenticated', '{}');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.act_as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
insert into public.organizations (slug, name) values ('agencia-a', 'Agencia A');
insert into public.projects (organization_id, slug, name) select id, 'proyecto-a1', 'A1' from public.organizations where slug = 'agencia-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
insert into public.organizations (slug, name) values ('agencia-b', 'Agencia B');

select pg_temp.act_as_admin();
create temp table ids on commit drop as
  select (select id from public.organizations where slug = 'agencia-a') org_a,
         (select id from public.organizations where slug = 'agencia-b') org_b,
         (select id from public.projects where slug = 'proyecto-a1') a1;
grant select on ids to authenticated;
insert into public.organization_members (organization_id, user_id, role)
  select org_a, u, 'member' from ids, unnest(array['00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000d2']::uuid[]) u;
insert into public.project_members (project_id, organization_id, user_id, role)
  select a1, org_a, '00000000-0000-4000-8000-0000000000c2'::uuid, 'analyst' from ids
  union all select a1, org_a, '00000000-0000-4000-8000-0000000000d2'::uuid, 'viewer' from ids;

-- A valid row template: one finding, no errors, complete.
create function pg_temp.import_sql(sha text, status text, findings jsonb, errors jsonb, project text default 'a1', org text default 'org_a')
returns text language sql as $$
  select format($q$insert into public.imports (project_id, organization_id, format, source_kind, source_label, captured_at,
    status, finding_count, error_count, findings, errors, file_sha256, file_bytes)
    select %s, %s, 'rubik-import-v1', 'audit', 'Auditoría', '2026-10-07T10:00:00Z', %L, %s, %s, %L::jsonb, %L::jsonb, %L, 100 from ids$q$,
    project, org, status, jsonb_array_length(findings), jsonb_array_length(errors), findings, errors, sha);
$$;
grant execute on function pg_temp.import_sql(text, text, jsonb, jsonb, text, text) to authenticated;
create function pg_temp.sha(n int) returns text language sql as $$ select lpad(to_hex(n), 64, '0') $$;

-- ── Structure ───────────────────────────────────────────────────────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'public.imports'::regclass), 'RLS is enabled on imports');
select ok(not has_table_privilege('anon', 'public.imports', 'select,insert,update,delete'), 'anon has no privilege on imports');
select ok(not has_table_privilege('authenticated', 'public.imports', 'update'), 'nobody updates an import');
select ok(not has_column_privilege('authenticated', 'public.imports', 'created_by', 'insert'), 'the client cannot choose created_by');
select ok(not has_column_privilege('authenticated', 'public.imports', 'created_at', 'insert'), 'the client cannot choose the import date');

-- ── Writes ──────────────────────────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
select lives_ok(pg_temp.import_sql(pg_temp.sha(1), 'complete', '[{"url":"https://ejemplo.test/"}]', '[]'), 'the analyst imports a complete file');
select lives_ok(pg_temp.import_sql(pg_temp.sha(2), 'partial', '[{"url":"https://ejemplo.test/"}]', '[{"row":1}]'), 'a partial import keeps findings and errors');
select lives_ok(pg_temp.import_sql(pg_temp.sha(3), 'failed', '[]', '[{"row":0}]'), 'a failed import keeps its error report');
select lives_ok(pg_temp.import_sql(pg_temp.sha(4), 'empty', '[]', '[]'), 'an empty import is explicit');
select throws_ok(pg_temp.import_sql(pg_temp.sha(1), 'complete', '[{"url":"https://ejemplo.test/"}]', '[]'), '23505', null, 'the same file twice in a project is refused');
select throws_ok(pg_temp.import_sql(pg_temp.sha(5), 'complete', '[]', '[]'), '23514', null, 'status must match the counts (complete without findings)');
select throws_ok(pg_temp.import_sql(pg_temp.sha(6), 'empty', '[]', '[{"row":0}]'), '23514', null, 'status must match the counts (empty with errors)');
select throws_ok($$insert into public.imports (project_id, organization_id, format, source_kind, source_label, captured_at, status, finding_count, error_count, findings, errors, file_sha256, file_bytes)
  select a1, org_a, 'rubik-import-v1', 'audit', 'x', '2026-10-07T10:00:00Z', 'complete', 2, 0, '[{}]', '[]', pg_temp.sha(7), 1 from ids$$,
  '23514', null, 'finding_count must equal the stored findings');
select throws_ok($$insert into public.imports (project_id, organization_id, format, source_kind, source_label, captured_at, period_start, period_end, status, finding_count, error_count, findings, errors, file_sha256, file_bytes)
  select a1, org_a, 'rubik-import-v1', 'audit', 'x', '2026-10-07T10:00:00Z', '2026-10-01T00:00:00Z', '2026-10-09T00:00:00Z', 'empty', 0, 0, '[]', '[]', pg_temp.sha(8), 1 from ids$$,
  '23514', null, 'a period cannot end after the capture date');
select throws_ok($$insert into public.imports (project_id, organization_id, format, source_kind, source_label, source_url, captured_at, status, finding_count, error_count, findings, errors, file_sha256, file_bytes)
  select a1, org_a, 'rubik-import-v1', 'audit', 'x', 'javascript:alert(1)', '2026-10-07T10:00:00Z', 'empty', 0, 0, '[]', '[]', pg_temp.sha(9), 1 from ids$$,
  '23514', null, 'a non-http source URL is refused');
select throws_ok($$update public.imports set status = 'complete'$$, '42501', null, 'the analyst cannot update an import');
select is_empty($$delete from public.imports returning 1$$, 'the analyst cannot delete imports');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000d2');
select is((select count(*)::int from public.imports), 4, 'the viewer reads the imports');
select throws_ok(pg_temp.import_sql(pg_temp.sha(10), 'empty', '[]', '[]'), '42501', null, 'the viewer cannot import');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
select is_empty($$select 1 from public.imports$$, 'another tenant reads no import');
select throws_ok(pg_temp.import_sql(pg_temp.sha(11), 'empty', '[]', '[]'), '42501', null, 'another tenant cannot import into proyecto-a1');
select is_empty($$delete from public.imports returning 1$$, 'another tenant cannot delete imports');

select pg_temp.act_as_admin();
select throws_ok($$update public.imports set status = 'complete'$$, '42501', null, 'imports are immutable even for administrators');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
select results_eq($$with d as (delete from public.imports where file_sha256 = pg_temp.sha(4) returning 1) select count(*)::int from d$$, array[1], 'the project owner erases an import');

select * from finish();
rollback;
