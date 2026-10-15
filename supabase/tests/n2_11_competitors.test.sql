-- N2-11 competitor intelligence: privileges, RLS by role, tenant/project isolation, foreign ids,
-- validation, immutability, verification, archive and S1 audit receipts. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, email, aud, role) values
 ('00000000-0000-4000-8000-0000000c0a01', 'cmp-owner-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000c0a02', 'cmp-analyst-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000c0a03', 'cmp-viewer-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000c0a04', 'cmp-approver-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000c0b01', 'cmp-owner-b@ejemplo.test', 'authenticated', 'authenticated');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000c0a01');
insert into public.organizations(slug, name) values ('cmp-a', 'Agencia A');
insert into public.projects(organization_id, slug, name, domain)
  select id, s, s, d from public.organizations, (values ('cmp-a1', 'propio-a1.test'), ('cmp-a2', 'propio-a2.test')) v(s, d) where slug = 'cmp-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0b01');
insert into public.organizations(slug, name) values ('cmp-b', 'Agencia B');
insert into public.projects(organization_id, slug, name) select id, 'cmp-b1', 'B1' from public.organizations where slug = 'cmp-b';
select pg_temp.admin();
insert into public.organization_members(organization_id, user_id, role)
  select o.id, u, 'member' from public.organizations o, unnest(array['00000000-0000-4000-8000-0000000c0a02', '00000000-0000-4000-8000-0000000c0a03',
    '00000000-0000-4000-8000-0000000c0a04']::uuid[]) u where o.slug = 'cmp-a';
insert into public.project_members(project_id, organization_id, user_id, role)
  select p.id, p.organization_id, v.u, v.r from public.projects p,
    (values ('00000000-0000-4000-8000-0000000c0a02'::uuid, 'analyst'), ('00000000-0000-4000-8000-0000000c0a03'::uuid, 'viewer'),
      ('00000000-0000-4000-8000-0000000c0a04'::uuid, 'client-approver')) v(u, r) where p.slug = 'cmp-a1';
create temp table ids as select
  (select id from public.projects where slug = 'cmp-a1') a1, (select id from public.projects where slug = 'cmp-a2') a2,
  (select id from public.projects where slug = 'cmp-b1') b1,
  (select id from public.organizations where slug = 'cmp-a') org_a, (select id from public.organizations where slug = 'cmp-b') org_b;
create temp table k(name text primary key, id uuid);
grant select on ids to authenticated, service_role;
grant all on k to authenticated;

-- ── Surface ────────────────────────────────────────────────────────────────────────────────
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.competitors'::regclass, 'public.competitor_observations'::regclass)),
  'RLS is enabled on both tables');
select ok(not has_table_privilege('anon', 'public.competitors', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.competitor_observations', 'select,insert,update,delete'), 'anon has no privilege');
select ok(not has_column_privilege('authenticated', 'public.competitors', 'domain', 'update'), 'a domain cannot be rewritten');
select ok(not has_column_privilege('authenticated', 'public.competitors', 'status', 'insert'), 'status is not chosen at insert');
select ok(not has_column_privilege('authenticated', 'public.competitor_observations', 'value', 'update'), 'observed values cannot be updated');
select ok(not has_column_privilege('authenticated', 'public.competitor_observations', 'verified_by', 'update')
  and not has_column_privilege('authenticated', 'public.competitor_observations', 'verification', 'insert'), 'verification is never self-declared');
select ok(not has_table_privilege('authenticated', 'private.audit_outbox', 'insert'), 'JWT cannot write audit receipts');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'insert'), 'JWT cannot write audit events');

-- ── Add competitors (draft roles) ──────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0a02');
select lives_ok($$insert into public.competitors(project_id, organization_id, domain, name, relation)
  select a1, org_a, 'rival-uno.es', 'Rival Uno', 'direct' from ids$$, 'an analyst adds a competitor');
insert into k select 'c1', id from public.competitors where domain = 'rival-uno.es';
select throws_ok($$insert into public.competitors(project_id, organization_id, domain) select a1, org_a, 'rival-uno.es' from ids$$,
  '23505', null, 'the same domain twice in a project is refused');
select throws_ok($$insert into public.competitors(project_id, organization_id, domain) select a1, org_a, 'https://rival.es/' from ids$$,
  '23514', null, 'a URL is not a normalised domain');
select throws_ok($$insert into public.competitors(project_id, organization_id, domain) select a1, org_a, 'Rival.ES' from ids$$,
  '23514', null, 'uppercase is not normalised');
select throws_ok($$insert into public.competitors(project_id, organization_id, domain) select a1, org_a, '127.0.0.1' from ids$$,
  '23514', null, 'an IP address is not a competitor domain');
select throws_ok($$insert into public.competitors(project_id, organization_id, domain) select a1, org_b, 'otro.es' from ids$$,
  '23503', null, 'a project cannot be paired with another organization');
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0a03');
select throws_ok($$insert into public.competitors(project_id, organization_id, domain) select a1, org_a, 'visor.es' from ids$$,
  '42501', null, 'a viewer cannot add competitors');
select is((select count(*)::int from public.competitors), 1, 'a viewer reads the project competitors');
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0a02');
select throws_ok($$insert into public.competitors(project_id, organization_id, domain) select a2, org_a, 'ajeno.es' from ids$$,
  '42501', null, 'not a member of A2: no competitor there');

-- ── Isolation: organization B sees and changes nothing of A ──────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0b01');
select is((select count(*)::int from public.competitors), 0, 'owner of B lists no competitor of A');
select throws_ok($$insert into public.competitors(project_id, organization_id, domain) select a1, org_a, 'intruso.es' from ids$$,
  '42501', null, 'owner of B cannot add to A1');
select is_empty($$update public.competitors set name = 'x' where id = (select id from k where name = 'c1') returning 1$$, 'owner of B cannot edit');
select is_empty($$delete from public.competitors where id = (select id from k where name = 'c1') returning 1$$, 'owner of B cannot erase');
select throws_ok($$insert into public.competitor_observations(project_id, organization_id, competitor_id, metric, availability, value, method, source_name, observed_on)
  select a1, org_a, (select id from k where name = 'c1'), 'backlinks', 'available', 5, 'observed', 'Ahrefs', current_date from ids$$,
  '42501', null, 'owner of B cannot record observations in A1');

-- ── Observations ───────────────────────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0a02');
select lives_ok($$insert into public.competitor_observations(project_id, organization_id, competitor_id, metric, availability, value, method, source_name, observed_on, market_country, market_language)
  select a1, org_a, (select id from k where name = 'c1'), 'referring-domains', 'available', 120, 'observed', 'Ahrefs', current_date - 3, 'ES', 'es' from ids$$,
  'a competitor observation with source, method, date and market');
select lives_ok($$insert into public.competitor_observations(project_id, organization_id, competitor_id, metric, availability, value, method, source_name, observed_on, market_country, market_language)
  select a1, org_a, null, 'referring-domains', 'available', 80, 'observed', 'Ahrefs', current_date - 2, 'ES', 'es' from ids$$,
  'an observation of the project''s own site (baseline)');
select lives_ok($$insert into public.competitor_observations(project_id, organization_id, competitor_id, metric, availability, value, method, source_name, observed_on)
  select a1, org_a, (select id from k where name = 'c1'), 'organic-traffic', 'not-available', null, 'observed', 'Semrush', current_date from ids$$,
  'a value the source does not give is stored as not available');
select throws_ok($$insert into public.competitor_observations(project_id, organization_id, competitor_id, metric, availability, value, method, source_name, observed_on, market_country, market_language)
  select a1, org_a, (select id from k where name = 'c1'), 'referring-domains', 'available', 121, 'observed', 'ahrefs', current_date - 3, 'ES', 'es' from ids$$,
  '23505', null, 'the same reading (source case-insensitive, date, market) is not duplicated');
select throws_ok($$insert into public.competitor_observations(project_id, organization_id, competitor_id, metric, availability, value, method, source_name, observed_on)
  select a1, org_a, (select id from k where name = 'c1'), 'backlinks', 'not-available', 0, 'observed', 'Ahrefs', current_date from ids$$,
  '23514', null, 'not available cannot carry a value (unknown is not zero)');
select throws_ok($$insert into public.competitor_observations(project_id, organization_id, competitor_id, metric, availability, value, method, source_name, observed_on)
  select a1, org_a, (select id from k where name = 'c1'), 'authority-score', 'available', 120, 'observed', 'Moz', current_date from ids$$,
  '23514', null, 'an authority score is bounded to 100');
select throws_ok($$insert into public.competitor_observations(project_id, organization_id, competitor_id, metric, availability, value, method, source_name, observed_on)
  select a1, org_a, (select id from k where name = 'c1'), 'backlinks', 'available', 5, 'observed', 'Ahrefs', current_date + 1 from ids$$,
  '23514', null, 'an observation cannot be dated in the future');
select throws_ok($$insert into public.competitor_observations(project_id, organization_id, competitor_id, metric, availability, value, method, source_name, observed_on)
  select a1, org_a, (select id from k where name = 'c1'), 'pagerank', 'available', 5, 'observed', 'X', current_date from ids$$,
  '23514', null, 'only catalogued metrics');
-- A competitor of A1 cannot be used from A2 (owner of A is a member of both).
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0a01');
select throws_ok($$insert into public.competitor_observations(project_id, organization_id, competitor_id, metric, availability, value, method, source_name, observed_on)
  select a2, org_a, (select id from k where name = 'c1'), 'backlinks', 'available', 5, 'observed', 'Ahrefs', current_date from ids$$,
  '23503', null, 'a competitor id of another project is refused');

-- ── Immutability and verification (approve-fact) ─────────────────────────────────────────
insert into k select 'o1', id from public.competitor_observations where metric = 'referring-domains' and competitor_id is not null;
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0a02');
select throws_ok($$update public.competitor_observations set value = 1 where id = (select id from k where name = 'o1')$$,
  '42501', null, 'an analyst cannot change an observed value');
select is_empty($$update public.competitor_observations set verification = 'verified' where id = (select id from k where name = 'o1') returning 1$$,
  'an analyst cannot verify (approve-fact)');
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0a04');
select lives_ok($$update public.competitor_observations set verification = 'verified' where id = (select id from k where name = 'o1')$$,
  'a client approver verifies an observation');
select pg_temp.admin();
select is((select verified_by from public.competitor_observations where id = (select id from k where name = 'o1')),
  '00000000-0000-4000-8000-0000000c0a04'::uuid, 'the verifier is recorded by the database, not the client');
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0a04');
select throws_ok($$update public.competitor_observations set verification = 'unverified' where id = (select id from k where name = 'o1')$$,
  '42501', null, 'a verification cannot be undone silently');

-- ── Edit, archive, erase ───────────────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0a02');
select lives_ok($$update public.competitors set name = 'Rival Uno SL', relation = 'indirect' where id = (select id from k where name = 'c1')$$,
  'an analyst edits name and relation');
select throws_ok($$update public.competitors set status = 'archived' where id = (select id from k where name = 'c1')$$,
  '42501', null, 'an analyst cannot archive (review-action)');
select is_empty($$delete from public.competitors where id = (select id from k where name = 'c1') returning 1$$, 'an analyst cannot erase');
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0a01');
select lives_ok($$update public.competitors set status = 'archived' where id = (select id from k where name = 'c1')$$, 'the owner archives');
select pg_temp.admin();
select isnt((select archived_at from public.competitors where id = (select id from k where name = 'c1')), null, 'archived_at set by the database');
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0a02');
select throws_ok($$insert into public.competitor_observations(project_id, organization_id, competitor_id, metric, availability, value, method, source_name, observed_on)
  select a1, org_a, (select id from k where name = 'c1'), 'backlinks', 'available', 5, 'observed', 'Ahrefs', current_date from ids$$,
  '23514', null, 'an archived competitor takes no new observations');
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0a01');
select lives_ok($$update public.competitors set status = 'active' where id = (select id from k where name = 'c1')$$, 'the owner restores');
select is((select count(*)::int from public.competitor_observations where competitor_id = (select id from k where name = 'c1')), 2,
  'archiving kept every observation');
select lives_ok($$delete from public.competitor_observations where metric = 'organic-traffic'$$, 'the owner erases one observation');
select lives_ok($$delete from public.competitors where id = (select id from k where name = 'c1')$$, 'the owner erases the competitor');
select is((select count(*)::int from public.competitor_observations where competitor_id is not null), 0, 'its observations go with it');

-- ── S1 audit receipts (same transaction, actor and role from the database) ───────────────
select pg_temp.admin();
select results_eq($$select action, count(*)::int from private.audit_outbox where project_id = (select a1 from ids) group by action order by action$$,
  $$values ('competitor.add', 1), ('competitor.archive', 1), ('competitor.erase', 1), ('competitor.observation.add', 3),
    ('competitor.observation.erase', 1), ('competitor.observation.verify', 1), ('competitor.restore', 1), ('competitor.update', 1)$$,
  'every change left exactly one receipt; the cascade did not add observation receipts');
select is((select actor_role from private.audit_outbox where action = 'competitor.observation.verify'), 'client-approver',
  'the receipt carries the live project role');
select is((select count(*)::int from private.audit_outbox where project_id = (select a1 from ids) and state = 'pending'), 10,
  'receipts wait for the trusted signer');
-- The pending receipts protect the project against a cascading deletion (#106).
select throws_ok($$delete from public.projects where id = (select a1 from ids)$$, '55000', null, 'pending receipts block the project deletion');

-- Operator deletion (service role, no auth.uid()) cascades through competitors and their
-- observations without raising and without leaving receipts behind, once receipts are signed.
select pg_temp.act_as('00000000-0000-4000-8000-0000000c0a01');
insert into public.competitors(project_id, organization_id, domain) select a1, org_a, 'cascada.es' from ids;
insert into public.competitor_observations(project_id, organization_id, competitor_id, metric, availability, value, method, source_name, observed_on)
  select a1, org_a, c.id, 'backlinks', 'available', 7, 'observed', 'Ahrefs', current_date from ids, public.competitors c where c.domain = 'cascada.es';
select pg_temp.admin();
delete from private.audit_outbox where project_id = (select a1 from ids) and state = 'pending';
select set_config('role', 'service_role', true);
select lives_ok($$delete from public.projects where id = (select a1 from ids)$$, 'the operator path deletes a project with competitors');
select pg_temp.admin();
select is((select count(*)::int from private.audit_outbox where project_id = (select a1 from ids)), 0, 'the cascade queued no orphan receipt');
select is((select count(*)::int from public.competitors where project_id = (select a1 from ids)), 0, 'competitors went with the project');

select * from finish();
rollback;
