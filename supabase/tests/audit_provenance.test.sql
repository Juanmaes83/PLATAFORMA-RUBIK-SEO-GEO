-- CORE-9.2 · Append-only audit chain and signed provider results (pgTAP). LOCAL stack only,
-- inside a transaction that is rolled back. Fictitious users and fixed fictitious hashes: the
-- database only links and protects rows; SHA-256/HMAC are verified by the server (ADR 0004).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- a: owner of agencia-a/proyecto-a1 · b: owner of agencia-b/proyecto-b1
-- c: analyst in proyecto-a1 · v: viewer in proyecto-a1
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@ejemplo.test', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-4000-8000-0000000000b1', 'b@ejemplo.test', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-4000-8000-0000000000c1', 'c@ejemplo.test', 'authenticated', 'authenticated', '{}'),
  ('00000000-0000-4000-8000-0000000000d1', 'v@ejemplo.test', 'authenticated', 'authenticated', '{"role":"owner"}');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.act_as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
create function pg_temp.h(n int) returns text language sql as $$ select lpad(to_hex(n), 64, '0') $$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
insert into public.organizations (slug, name) values ('agencia-a', 'Agencia A');
insert into public.projects (organization_id, slug, name) select id, 'proyecto-a1', 'A1' from public.organizations where slug = 'agencia-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
insert into public.organizations (slug, name) values ('agencia-b', 'Agencia B');
insert into public.projects (organization_id, slug, name) select id, 'proyecto-b1', 'B1' from public.organizations where slug = 'agencia-b';

select pg_temp.act_as_admin();
create temp table ids on commit drop as
  select (select id from public.organizations where slug = 'agencia-a') org_a,
         (select id from public.organizations where slug = 'agencia-b') org_b,
         (select id from public.projects where slug = 'proyecto-a1') a1,
         (select id from public.projects where slug = 'proyecto-b1') b1;
grant select on ids to authenticated;
insert into public.organization_members (organization_id, user_id, role)
  select org_a, u, 'member' from ids, unnest(array['00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d1']::uuid[]) u;
insert into public.project_members (project_id, organization_id, user_id, role)
  select a1, org_a, '00000000-0000-4000-8000-0000000000c1'::uuid, 'analyst' from ids
  union all select a1, org_a, '00000000-0000-4000-8000-0000000000d1'::uuid, 'viewer' from ids;

-- ── Structure ───────────────────────────────────────────────────────────────────────────
select ok(bool_and(c.relrowsecurity), 'RLS is enabled on the CORE-9.2 tables')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('audit_events', 'provider_results');
select ok(not has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete'), 'anon has no privilege on ' || t)
  from unnest(array['audit_events', 'provider_results']) t;
select ok(not has_table_privilege('authenticated', 'public.' || t, 'update'), 'authenticated cannot update ' || t)
  from unnest(array['audit_events', 'provider_results']) t;
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'delete'), 'authenticated cannot delete audit events');
select ok(not has_column_privilege('authenticated', 'public.audit_events', 'actor_id', 'insert'), 'the client cannot choose actor_id');
select ok(not has_column_privilege('authenticated', 'public.audit_events', 'created_at', 'insert'), 'the client cannot choose created_at');
select ok(not has_column_privilege('authenticated', 'public.provider_results', 'created_by', 'insert'), 'the client cannot choose created_by');
select ok(not has_function_privilege('authenticated', 'private.link_audit_event()', 'execute'), 'nobody calls the trigger functions directly');

-- ── Audit chain ─────────────────────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select lives_ok($$insert into public.audit_events (project_id, organization_id, seq, at, actor_role, action, outcome, prev_hash, hash, key_id, signature)
  select a1, org_a, 1, '2026-10-07T10:00:00Z', 'owner', 'project.open', 'allowed', null, pg_temp.h(1), 'k-test', pg_temp.h(101) from ids$$, 'the owner appends the first event');
select throws_ok($$insert into public.audit_events (project_id, organization_id, seq, at, actor_role, action, outcome, prev_hash, hash, key_id, signature)
  select a1, org_a, 3, '2026-10-07T10:01:00Z', 'owner', 'x', 'allowed', pg_temp.h(1), pg_temp.h(3), 'k-test', pg_temp.h(103) from ids$$, '23514', null, 'a gap in seq is refused');
select throws_ok($$insert into public.audit_events (project_id, organization_id, seq, at, actor_role, action, outcome, prev_hash, hash, key_id, signature)
  select a1, org_a, 2, '2026-10-07T10:01:00Z', 'owner', 'x', 'allowed', pg_temp.h(9), pg_temp.h(2), 'k-test', pg_temp.h(102) from ids$$, '23514', null, 'a wrong prev_hash is refused');
select throws_ok($$insert into public.audit_events (project_id, organization_id, seq, at, actor_role, action, outcome, prev_hash, hash, key_id, signature)
  select a1, org_a, 1, '2026-10-07T10:01:00Z', 'owner', 'x', 'allowed', null, pg_temp.h(2), 'k-test', pg_temp.h(102) from ids$$, '23514', null, 'a second first event (replay of seq 1) is refused');
select throws_ok($$insert into public.audit_events (project_id, organization_id, seq, at, actor_role, action, outcome, prev_hash, hash, key_id, signature)
  select a1, org_a, 2, '2026-10-07T09:00:00Z', 'owner', 'x', 'allowed', pg_temp.h(1), pg_temp.h(2), 'k-test', pg_temp.h(102) from ids$$, '23514', null, 'an event before the previous one is refused');
select throws_ok($$insert into public.audit_events (project_id, organization_id, seq, at, actor_role, action, outcome, prev_hash, hash, key_id, signature)
  select a1, org_a, 2, '2026-10-07T10:01:00Z', 'owner', 'x', 'allowed', pg_temp.h(1), 'not-a-hash', 'k-test', pg_temp.h(102) from ids$$, '23514', null, 'a malformed hash is refused');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select throws_ok($$insert into public.audit_events (project_id, organization_id, seq, at, actor_role, action, outcome, prev_hash, hash, key_id, signature)
  select a1, org_a, 2, '2026-10-07T10:02:00Z', 'owner', 'x', 'allowed', pg_temp.h(1), pg_temp.h(2), 'k-test', pg_temp.h(102) from ids$$, '42501', null, 'the analyst cannot claim the owner role');
select lives_ok($$insert into public.audit_events (project_id, organization_id, seq, at, actor_role, action, outcome, prev_hash, hash, key_id, signature)
  select a1, org_a, 2, '2026-10-07T10:02:00Z', 'analyst', 'result.store', 'allowed', pg_temp.h(1), pg_temp.h(2), 'k-test', pg_temp.h(102) from ids$$, 'the analyst appends as analyst');
select is((select actor_id from public.audit_events where seq = 2), '00000000-0000-4000-8000-0000000000c1'::uuid, 'actor_id is the signed-in user');
select throws_ok($$update public.audit_events set outcome = 'denied'$$, '42501', null, 'the analyst cannot update audit rows');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select is_empty($$select 1 from public.audit_events$$, 'b cannot read the audit trail of proyecto-a1');
select throws_ok($$insert into public.audit_events (project_id, organization_id, seq, at, actor_role, action, outcome, prev_hash, hash, key_id, signature)
  select a1, org_a, 3, '2026-10-07T10:03:00Z', 'owner', 'x', 'allowed', pg_temp.h(2), pg_temp.h(3), 'k-test', pg_temp.h(103) from ids$$, '42501', null, 'b cannot append to proyecto-a1');
select throws_ok($$insert into public.audit_events (project_id, organization_id, seq, at, actor_role, action, outcome, prev_hash, hash, key_id, signature)
  select a1, org_b, 3, '2026-10-07T10:03:00Z', 'owner', 'x', 'allowed', pg_temp.h(2), pg_temp.h(3), 'k-test', pg_temp.h(103) from ids$$, '42501', 'permission denied for table audit_events', 'a non-member gets a generic refusal that reveals nothing about the chain');
select throws_ok($$insert into public.audit_events (project_id, organization_id, seq, at, actor_role, action, outcome, prev_hash, hash, key_id, signature)
  select b1, org_a, 1, '2026-10-07T10:03:00Z', 'owner', 'x', 'allowed', null, pg_temp.h(3), 'k-test', pg_temp.h(103) from ids$$, '23503', null, 'a project of agencia-b paired with agencia-a is refused by the composite key');

-- Administrators cannot rewrite history either; deletion happens only with the project.
select pg_temp.act_as_admin();
select throws_ok($$update public.audit_events set outcome = 'denied'$$, '42501', null, 'UPDATE is refused even for administrators');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select throws_ok($$delete from public.audit_events$$, '42501', null, 'a signed-in owner cannot delete audit rows');

-- ── Provider results ────────────────────────────────────────────────────────────────────
create temp table payload on commit drop as select jsonb_build_object('provider', 'manual', 'operation', 'import', 'status', 'OK',
  'dataHashAlg', 'sha256', 'dataHash', pg_temp.h(55)) p;
grant select on payload to authenticated;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select lives_ok($$insert into public.provider_results (project_id, organization_id, provider, operation, status, signed_payload, data, data_hash_alg, data_hash, key_id, signature)
  select a1, org_a, 'manual', 'import', 'OK', p, '[]', 'sha256', pg_temp.h(55), 'k-test', pg_temp.h(155) from ids, payload$$, 'the analyst stores a signed result');
select throws_ok($$insert into public.provider_results (project_id, organization_id, provider, operation, status, signed_payload, data, data_hash_alg, data_hash, key_id, signature)
  select a1, org_a, 'manual', 'import', 'OK', p || '{"dataHashAlg":"fnv1a32-mock"}', '[]', 'fnv1a32-mock', pg_temp.h(55), 'k-test', pg_temp.h(155) from ids, payload$$, '23514', null, 'the mock digest is refused');
select throws_ok($$insert into public.provider_results (project_id, organization_id, provider, operation, status, signed_payload, data, data_hash_alg, data_hash, key_id, signature)
  select a1, org_a, 'manual', 'import', 'VERIFIED', p, '[]', 'sha256', pg_temp.h(55), 'k-test', pg_temp.h(155) from ids, payload$$, '23514', null, 'columns must repeat the signed payload');
select throws_ok($$update public.provider_results set status = 'OK'$$, '42501', null, 'nobody updates a stored result');
select is_empty($$delete from public.provider_results returning 1$$, 'the analyst cannot delete results');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000d1');
select is((select count(*)::int from public.provider_results), 1, 'the viewer reads the result');
select throws_ok($$insert into public.provider_results (project_id, organization_id, provider, operation, status, signed_payload, data, data_hash_alg, data_hash, key_id, signature)
  select a1, org_a, 'manual', 'import', 'OK', p, '[]', 'sha256', pg_temp.h(55), 'k-test', pg_temp.h(155) from ids, payload$$, '42501', null, 'the viewer cannot store results');
select throws_ok($$insert into public.audit_events (project_id, organization_id, seq, at, actor_role, action, outcome, prev_hash, hash, key_id, signature)
  select a1, org_a, 3, '2026-10-07T10:04:00Z', 'analyst', 'x', 'allowed', pg_temp.h(2), pg_temp.h(3), 'k-test', pg_temp.h(103) from ids$$, '42501', null, 'the viewer cannot claim another role in the audit trail');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select is_empty($$select 1 from public.provider_results$$, 'b cannot read results of proyecto-a1');
select is_empty($$delete from public.provider_results returning 1$$, 'b cannot delete results of proyecto-a1');

select pg_temp.act_as_admin();
select throws_ok($$update public.provider_results set status = 'OK'$$, '42501', null, 'results are immutable even for administrators');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
select results_eq($$with d as (delete from public.provider_results returning 1) select count(*)::int from d$$, array[1], 'the project owner can erase results on request');

-- Cascade: removing the project (administrator) removes its audit trail.
select pg_temp.act_as_admin();
delete from public.projects where id = (select a1 from ids);
select is((select count(*)::int from public.audit_events where project_id = (select a1 from ids)), 0, 'the audit trail goes with its project');

select * from finish();
rollback;
