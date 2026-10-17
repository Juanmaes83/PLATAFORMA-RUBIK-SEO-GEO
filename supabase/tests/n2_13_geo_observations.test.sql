-- N2-13 GEO observations and proposals: privileges, RLS by role, tenant/project isolation,
-- declared → verified with database attribution, immutability, corrections, proposal review and
-- S1 receipts. Rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, email, aud, role) values
 ('00000000-0000-4000-8000-0000000e0a01', 'geo-owner-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000e0a02', 'geo-analyst-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000e0a03', 'geo-viewer-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000e0a04', 'geo-approver-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000e0a05', 'geo-manager-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000e0b01', 'geo-owner-b@ejemplo.test', 'authenticated', 'authenticated');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000e0a01');
insert into public.organizations(slug, name) values ('geo-a', 'Agencia A');
insert into public.projects(organization_id, slug, name, domain)
  select id, s, s, 'sol.es' from public.organizations, (values ('geo-a1'), ('geo-a2')) v(s) where slug = 'geo-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0b01');
insert into public.organizations(slug, name) values ('geo-b', 'Agencia B');
insert into public.projects(organization_id, slug, name) select id, 'geo-b1', 'B1' from public.organizations where slug = 'geo-b';
select pg_temp.admin();
insert into public.organization_members(organization_id, user_id, role)
  select o.id, u, 'member' from public.organizations o, unnest(array['00000000-0000-4000-8000-0000000e0a02', '00000000-0000-4000-8000-0000000e0a03',
    '00000000-0000-4000-8000-0000000e0a04', '00000000-0000-4000-8000-0000000e0a05']::uuid[]) u where o.slug = 'geo-a';
insert into public.project_members(project_id, organization_id, user_id, role)
  select p.id, p.organization_id, v.u, v.r from public.projects p,
    (values ('00000000-0000-4000-8000-0000000e0a02'::uuid, 'analyst'), ('00000000-0000-4000-8000-0000000e0a03'::uuid, 'viewer'),
      ('00000000-0000-4000-8000-0000000e0a04'::uuid, 'client-approver'), ('00000000-0000-4000-8000-0000000e0a05'::uuid, 'account-manager')) v(u, r)
  where p.slug = 'geo-a1';
create temp table ids as select
  (select id from public.projects where slug = 'geo-a1') a1, (select id from public.projects where slug = 'geo-a2') a2,
  (select id from public.projects where slug = 'geo-b1') b1,
  (select id from public.organizations where slug = 'geo-a') org_a, (select id from public.organizations where slug = 'geo-b') org_b;
create temp table k(name text primary key, id uuid);
grant select on ids to authenticated, service_role;
grant all on k to authenticated;
create function pg_temp.observe(p uuid, o uuid, q text, presence text, sources jsonb default '[]', engine text default 'chatgpt', supersedes uuid default null)
returns uuid language sql as $$
  insert into public.geo_observations(project_id, organization_id, entity_name, engine, query_text, observed_on, market_language, market_country,
    method, presence, answer_excerpt, cited_sources, mentioned_entities, supersedes_id)
  values (p, o, 'Restaurante Sol', engine, q, current_date - 2, 'es', 'ES', 'manual-copy', presence,
    '<script>alert(1)</script> Recomiendo Bar Luna.', sources, '["Bar Luna"]', supersedes) returning id;
$$;
grant execute on function pg_temp.observe(uuid, uuid, text, text, jsonb, text, uuid) to authenticated;

-- ── Surface ────────────────────────────────────────────────────────────────────────────────
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.geo_observations'::regclass, 'public.geo_proposals'::regclass)), 'RLS on both tables');
select ok(not exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'
  and table_name in ('geo_observations', 'geo_proposals')), 'anon has no privilege');
select ok(not has_column_privilege('authenticated', 'public.geo_observations', 'presence', 'update')
  and not has_column_privilege('authenticated', 'public.geo_observations', 'answer_excerpt', 'update'), 'observed content cannot be edited');
select ok(not has_column_privilege('authenticated', 'public.geo_observations', 'verification', 'insert')
  and not has_column_privilege('authenticated', 'public.geo_observations', 'verified_by', 'update'), 'verification is never self-declared');
select ok(not has_column_privilege('authenticated', 'public.geo_proposals', 'reviewed_by', 'update')
  and not has_column_privilege('authenticated', 'public.geo_proposals', 'evidence_ids', 'update'), 'review attribution and evidence are not client columns');
select ok((select pg_get_constraintdef(oid) from pg_constraint where conname = 'audit_outbox_action_check') like all
  (array['%member.withdraw%', '%openseo.audit.store%', '%geo.observation.verify%', '%geo.proposal.accept%']), 'S1 actions kept, geo actions added');
-- Integration with main (#120 convention): one complete static allowlist, S1 → SEO → competitors →
-- content → GEO; 6 + 3 + 8 + 16 + 10 = 43 actions, none lost whatever module wrote it last.
select is((select count(*)::int from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z0-9.-]+)''', 'g')
  where c.conname = 'audit_outbox_action_check' and c.conrelid = 'private.audit_outbox'::regclass), 43,
  'the audit allowlist holds exactly the 43 S1, SEO, competitor, content and GEO actions');
select ok((select pg_get_constraintdef(oid) from pg_constraint where conname = 'audit_outbox_action_check') like all
  (array['%seo.keyword.erase%', '%competitor.observation.erase%', '%content.brief.erase%', '%geo.proposal.erase%']),
  'every module keeps its actions in the final allowlist');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname like '%audit_outbox_action%'), 'no executable helper rewrites the allowlist');

-- ── Recording ───────────────────────────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0a02');
select lives_ok($$insert into k select 'o1', pg_temp.observe(a1, org_a, '¿Dónde comer menú del día en Madrid?', 'absent') from ids$$, 'an analyst records an observation');
select is((select verification from public.geo_observations where id = (select id from k where name = 'o1')), 'declared', 'a manual observation starts declared');
select is((select answer_excerpt from public.geo_observations where id = (select id from k where name = 'o1')), '<script>alert(1)</script> Recomiendo Bar Luna.',
  'hostile text is stored verbatim as data (rendered escaped by the UI)');
select throws_ok($$select pg_temp.observe(a1, org_a, '¿Dónde comer menú del día en Madrid?', 'absent') from ids$$, '23505', null, 'the same reading is not recorded twice');
select throws_ok($$select pg_temp.observe(a1, org_a, 'q2', 'cited') from ids$$, '23514', null, '"cited" needs at least one cited source');
select throws_ok($$select pg_temp.observe(a1, org_a, 'q3', 'mentioned', '[{"url":"javascript:alert(1)"}]') from ids$$, '23514', null, 'only http(s) cited URLs');
select throws_ok($$select pg_temp.observe(a1, org_a, 'q4', 'mentioned', '"https://x.es"') from ids$$, '23514', null, 'cited sources must be a list');
select throws_ok($$insert into public.geo_observations(project_id, organization_id, entity_name, engine, query_text, observed_on, method, presence)
  select a1, org_a, 'Sol', 'chatgpt', 'q5', current_date + 1, 'manual-copy', 'absent' from ids$$, '23514', null, 'no future observation date');
select throws_ok($$insert into public.geo_observations(project_id, organization_id, entity_name, engine, query_text, observed_on, method, presence)
  select a1, org_a, 'Sol', 'skynet', 'q6', current_date, 'manual-copy', 'absent' from ids$$, '23514', null, 'only catalogued engines');
select throws_ok($$select pg_temp.observe(a1, org_b, 'q7', 'absent') from ids$$, '23503', null, 'a forged organization is refused');
select throws_ok($$select pg_temp.observe(a2, org_a, 'q8', 'absent') from ids$$, '42501', null, 'not a member of A2: nothing recorded there');
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0a03');
select throws_ok($$select pg_temp.observe(a1, org_a, 'q9', 'absent') from ids$$, '42501', null, 'a viewer cannot record');
select is((select count(*)::int from public.geo_observations), 1, 'a viewer reads the observations');
select is_empty($$update public.geo_observations set verification = 'verified' returning 1$$, 'a viewer cannot verify');

-- ── Isolation: organization B ───────────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0b01');
select is((select count(*)::int from public.geo_observations), 0, 'owner of B reads nothing of A');
select throws_ok($$select pg_temp.observe(a1, org_a, 'q10', 'absent') from ids$$, '42501', null, 'owner of B cannot record in A1');
select is_empty($$delete from public.geo_observations where id = (select id from k where name = 'o1') returning 1$$, 'owner of B cannot erase');
select throws_ok($$insert into public.geo_proposals(project_id, organization_id, rule, query_text, title, problem, hypothesis, suggested_action, priority, priority_reason, evidence_ids)
  select b1, org_b, 'answer-gap', 'q', 't', 'p', 'h', 'a', 'low', 'r', array[(select id from k where name = 'o1')] from ids$$,
  '23503', null, 'an observation of another organization cannot back a proposal');

-- ── Verification and immutability ───────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0a02');
select is_empty($$update public.geo_observations set verification = 'verified' where id = (select id from k where name = 'o1') returning 1$$,
  'an analyst cannot verify (approve-fact)');
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0a04');
select lives_ok($$update public.geo_observations set verification = 'verified' where id = (select id from k where name = 'o1')$$, 'the client approver verifies');
select pg_temp.admin();
select is((select verified_by from public.geo_observations where id = (select id from k where name = 'o1')), '00000000-0000-4000-8000-0000000e0a04'::uuid,
  'the verifier is recorded by the database');
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0a04');
select throws_ok($$update public.geo_observations set verification = 'declared' where id = (select id from k where name = 'o1')$$, '42501', null, 'a verification is not undone');
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0a02');
select lives_ok($$insert into k select 'o2', pg_temp.observe(a1, org_a, '¿Dónde comer menú del día en Madrid?', 'cited', '[{"url":"https://sol.es/menu","title":"Menú"}]', 'gemini', (select id from k where name = 'o1')) from ids$$,
  'a correction supersedes the earlier observation');
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0a01');
select throws_ok($$insert into public.geo_observations(project_id, organization_id, entity_name, engine, query_text, observed_on, method, presence, supersedes_id)
  select a2, org_a, 'Sol', 'chatgpt', 'q11', current_date, 'manual-copy', 'absent', (select id from k where name = 'o1') from ids$$,
  '23503', null, 'a correction cannot supersede an observation of another project');

-- ── Proposals and review ───────────────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0a02');
select lives_ok($$insert into public.geo_proposals(project_id, organization_id, rule, query_text, title, problem, hypothesis, suggested_action, priority, priority_reason, evidence_ids)
  select a1, org_a, 'answer-gap', '¿Dónde comer menú del día en Madrid?', 'Responder', 'No aparece', 'Podría ayudar', 'Crear página', 'medium', 'Una observación',
    array[(select id from k where name = 'o1')] from ids$$, 'an analyst saves a proposal with evidence');
insert into k select 'p1', id from public.geo_proposals;
select throws_ok($$insert into public.geo_proposals(project_id, organization_id, rule, query_text, title, problem, hypothesis, suggested_action, priority, priority_reason)
  select a1, org_a, 'answer-gap', '¿DÓNDE comer menú del día en Madrid? ', 't', 'p', 'h', 'a', 'low', 'r' from ids$$, '23505', null, 'one open proposal per rule and question');
select throws_ok($$update public.geo_proposals set status = 'accepted' where id = (select id from k where name = 'p1')$$, '42501', null, 'an analyst cannot accept (review-action)');
select lives_ok($$update public.geo_proposals set suggested_action = 'Crear la página con respuesta directa' where id = (select id from k where name = 'p1')$$, 'editable while proposed');
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0a05');
select lives_ok($$update public.geo_proposals set status = 'accepted', review_note = 'Encaja en el plan' where id = (select id from k where name = 'p1')$$, 'the account manager accepts');
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0a02');
select throws_ok($$update public.geo_proposals set title = 'otro' where id = (select id from k where name = 'p1')$$, '42501', null, 'an accepted proposal is not edited');
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0a05');
select throws_ok($$update public.geo_proposals set status = 'proposed' where id = (select id from k where name = 'p1')$$, '23514', null, 'accepted cannot silently go back to proposed');
select lives_ok($$update public.geo_proposals set status = 'done' where id = (select id from k where name = 'p1')$$, 'marked done');
select pg_temp.admin();
select is((select reviewed_by from public.geo_proposals where id = (select id from k where name = 'p1')), '00000000-0000-4000-8000-0000000e0a05'::uuid, 'review attributed by the database');

-- ── Erase (owner) ──────────────────────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0a02');
select is_empty($$delete from public.geo_observations where id = (select id from k where name = 'o2') returning 1$$, 'an analyst cannot erase');
select pg_temp.act_as('00000000-0000-4000-8000-0000000e0a01');
select lives_ok($$delete from public.geo_observations where id = (select id from k where name = 'o1')$$, 'the owner erases the superseded observation');
select is((select supersedes_id from public.geo_observations where id = (select id from k where name = 'o2')), null::uuid, 'the correction keeps existing without its link');
select is((select cardinality(evidence_ids) from public.geo_proposals where id = (select id from k where name = 'p1')), 1, 'the proposal keeps the id of erased evidence (shown as erased)');

-- ── S1 receipts ────────────────────────────────────────────────────────────────────────────
select pg_temp.admin();
select results_eq($$select action, count(*)::int from private.audit_outbox where project_id = (select a1 from ids) group by action order by action$$,
  $$values ('geo.observation.add', 2), ('geo.observation.erase', 1), ('geo.observation.verify', 1), ('geo.proposal.accept', 1),
    ('geo.proposal.add', 1), ('geo.proposal.done', 1), ('geo.proposal.update', 1)$$, 'one receipt per change; the cleared link adds none');
select is((select actor_role from private.audit_outbox where action = 'geo.observation.verify'), 'client-approver', 'the verification receipt carries the live role');
select throws_ok($$delete from auth.users where id = '00000000-0000-4000-8000-0000000e0a02'$$, '23503', null, 'an account with authored GEO rows cannot be deleted (authorship retention)');
select throws_ok($$delete from public.projects where id = (select a1 from ids)$$, '55000', null, 'pending receipts block the project deletion (#106)');
delete from private.audit_outbox where project_id = (select a1 from ids) and state = 'pending';
select set_config('role', 'service_role', true);
select lives_ok($$delete from public.projects where id = (select a1 from ids)$$, 'the operator path deletes a project with GEO data');
select pg_temp.admin();
select is((select count(*)::int from private.audit_outbox where project_id = (select a1 from ids)), 0, 'the cascade queued no orphan receipt');

select * from finish();
rollback;
