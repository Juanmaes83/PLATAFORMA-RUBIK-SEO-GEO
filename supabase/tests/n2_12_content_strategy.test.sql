-- N2-12 content strategy: privileges, RLS by role, tenant/project isolation, foreign ids,
-- evidence provenance, brief review flow with database attribution, and S1 audit receipts.
-- Everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, email, aud, role) values
 ('00000000-0000-4000-8000-0000000d0a01', 'cs-owner-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000d0a02', 'cs-analyst-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000d0a03', 'cs-viewer-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000d0a04', 'cs-approver-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000d0a05', 'cs-manager-a@ejemplo.test', 'authenticated', 'authenticated'),
 ('00000000-0000-4000-8000-0000000d0b01', 'cs-owner-b@ejemplo.test', 'authenticated', 'authenticated');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a01');
insert into public.organizations(slug, name) values ('cs-a', 'Agencia A');
insert into public.projects(organization_id, slug, name, domain)
  select id, s, s, d from public.organizations, (values ('cs-a1', 'cliente-a1.es'), ('cs-a2', 'cliente-a2.es')) v(s, d) where slug = 'cs-a';
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0b01');
insert into public.organizations(slug, name) values ('cs-b', 'Agencia B');
insert into public.projects(organization_id, slug, name) select id, 'cs-b1', 'B1' from public.organizations where slug = 'cs-b';
select pg_temp.admin();
insert into public.organization_members(organization_id, user_id, role)
  select o.id, u, 'member' from public.organizations o, unnest(array['00000000-0000-4000-8000-0000000d0a02', '00000000-0000-4000-8000-0000000d0a03',
    '00000000-0000-4000-8000-0000000d0a04', '00000000-0000-4000-8000-0000000d0a05']::uuid[]) u where o.slug = 'cs-a';
insert into public.project_members(project_id, organization_id, user_id, role)
  select p.id, p.organization_id, v.u, v.r from public.projects p,
    (values ('00000000-0000-4000-8000-0000000d0a02'::uuid, 'analyst'), ('00000000-0000-4000-8000-0000000d0a03'::uuid, 'viewer'),
      ('00000000-0000-4000-8000-0000000d0a04'::uuid, 'client-approver'), ('00000000-0000-4000-8000-0000000d0a05'::uuid, 'account-manager')) v(u, r)
  where p.slug = 'cs-a1';
create temp table ids as select
  (select id from public.projects where slug = 'cs-a1') a1, (select id from public.projects where slug = 'cs-a2') a2,
  (select id from public.projects where slug = 'cs-b1') b1,
  (select id from public.organizations where slug = 'cs-a') org_a, (select id from public.organizations where slug = 'cs-b') org_b;
create temp table k(name text primary key, id uuid);
grant select on ids to authenticated, service_role;
grant all on k to authenticated;
-- Stored sources (as the offline operator): an import in A1 and A2, a provider result in A1 and B1.
insert into public.imports(project_id, organization_id, format, source_kind, source_label, captured_at, status, finding_count, error_count,
  findings, errors, file_sha256, file_bytes, created_by)
  select p, o, 'rubik-import-v1', 'audit', l, timestamptz '2026-10-01 09:00+02', 'complete', 1, 0,
    '[{"url":"https://cliente-a1.es/carta","ruleId":"thin","severity":"low","title":"Contenido escaso","observation":"Pocas palabras."}]', '[]',
    repeat(h, 64), 100, '00000000-0000-4000-8000-0000000d0a01'
  from ids, (values ('a1', 'Auditoría de contenido A1', 'a'), ('a2', 'Auditoría A2', 'b')) v(w, l, h)
  cross join lateral (select case w when 'a1' then a1 else a2 end p, org_a o) x;
insert into k select 'imp_a1', id from public.imports where source_label = 'Auditoría de contenido A1';
insert into k select 'imp_a2', id from public.imports where source_label = 'Auditoría A2';
insert into public.provider_results(project_id, organization_id, provider, operation, status, captured_at, signed_payload, data, data_hash_alg, data_hash, key_id, signature, created_by)
  select p.id, p.organization_id, 'openseo', 'siteAudit', 'OK', timestamptz '2026-10-05 10:00+00',
    jsonb_build_object('scopeVersion', 1, 'provider', 'openseo', 'operation', 'siteAudit', 'status', 'OK', 'dataHashAlg', 'sha256', 'dataHash', repeat('c', 64),
      'scope', jsonb_build_object('tenantId', o.slug, 'projectId', p.slug)), '[]', 'sha256', repeat('c', 64), 'k-cs', repeat('d', 64), '00000000-0000-4000-8000-0000000d0a01'
  from public.projects p join public.organizations o on o.id = p.organization_id where p.slug in ('cs-a1', 'cs-b1');
insert into k select 'pr_a1', id from public.provider_results where project_id = (select a1 from ids);
insert into k select 'pr_b1', id from public.provider_results where project_id = (select b1 from ids);

-- ── Surface ────────────────────────────────────────────────────────────────────────────────
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.content_clusters'::regclass, 'public.content_opportunities'::regclass,
  'public.content_evidence'::regclass, 'public.content_briefs'::regclass)), 'RLS is enabled on the four tables');
select ok(not exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'
  and table_name in ('content_clusters', 'content_opportunities', 'content_evidence', 'content_briefs')), 'anon has no privilege');
select ok(not has_table_privilege('authenticated', 'public.content_evidence', 'update'), 'evidence is never updated by users');
select ok(not has_column_privilege('authenticated', 'public.content_briefs', 'status', 'insert')
  and not has_column_privilege('authenticated', 'public.content_briefs', 'approved_by', 'update')
  and not has_column_privilege('authenticated', 'public.content_briefs', 'approved_at', 'update')
  and not has_column_privilege('authenticated', 'public.content_briefs', 'version', 'update'), 'approval attribution and version are not client columns');
select ok(not has_column_privilege('authenticated', 'public.content_opportunities', 'status', 'insert'), 'an opportunity starts open');
select ok(not has_table_privilege('authenticated', 'private.audit_outbox', 'insert'), 'JWT cannot write audit receipts');
select ok((select pg_get_constraintdef(oid) from pg_constraint where conname = 'audit_outbox_action_check') like all
  (array['%member.withdraw%', '%import.file%', '%openseo.audit.store%', '%content.brief.approve%']), 'S1 actions kept, content actions added');

-- ── Clusters and opportunities ─────────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a02');
select lives_ok($$insert into public.content_clusters(project_id, organization_id, name, main_topic) select a1, org_a, 'Carta y menús', 'menú del día' from ids$$,
  'an analyst creates a cluster');
insert into k select 'cl1', id from public.content_clusters where name = 'Carta y menús';
select throws_ok($$insert into public.content_clusters(project_id, organization_id, name, main_topic) select a1, org_a, ' carta Y MENÚS ', 'x' from ids$$,
  '23505', null, 'cluster names are unique per project, case-insensitive');
select lives_ok($$insert into public.content_opportunities(project_id, organization_id, cluster_id, cluster_role, topic, search_intent, market_language,
  market_country, page_kind, page_url, opportunity_type, rationale, priority, priority_reason)
  select a1, org_a, (select id from k where name = 'cl1'), 'pillar', 'Menú del día en Madrid', 'local', 'es', 'ES', 'proposed', null, 'create',
    'No hay página que responda a esta búsqueda local.', 'high', 'Hipótesis del analista: búsqueda frecuente según el cliente' from ids$$,
  'an analyst proposes an opportunity in a cluster');
insert into k select 'op1', id from public.content_opportunities where topic = 'Menú del día en Madrid';
select lives_ok($$insert into public.content_opportunities(project_id, organization_id, cluster_id, cluster_role, topic, search_intent, market_language,
  page_kind, page_url, opportunity_type, rationale)
  select a1, org_a, (select id from k where name = 'cl1'), 'support', 'Carta de temporada', 'informational', 'es', 'existing',
    'https://cliente-a1.es/carta', 'improve', 'La auditoría indica contenido escaso.' from ids$$, 'an improvement of an existing page');
insert into k select 'op2', id from public.content_opportunities where topic = 'Carta de temporada';
select throws_ok($$insert into public.content_opportunities(project_id, organization_id, topic, search_intent, market_language, market_country, page_kind, page_url, opportunity_type, rationale)
  select a1, org_a, 'menú del día en madrid ', 'local', 'es', 'ES', 'proposed', null, 'research', 'x' from ids$$,
  '23505', null, 'the same topic and market is not proposed twice');
select throws_ok($$insert into public.content_opportunities(project_id, organization_id, topic, search_intent, market_language, page_kind, opportunity_type, rationale)
  select a1, org_a, 'Nueva', 'local', 'es', 'proposed', 'improve', 'x' from ids$$, '23514', null, 'improving needs an existing page');
select throws_ok($$insert into public.content_opportunities(project_id, organization_id, topic, search_intent, market_language, page_kind, page_url, opportunity_type, rationale, priority)
  select a1, org_a, 'Otra', 'local', 'es', 'proposed', null, 'create', 'x', 'high' from ids$$, '23514', null, 'a priority needs its reason');
select throws_ok($$insert into public.content_opportunities(project_id, organization_id, topic, search_intent, market_language, page_kind, page_url, opportunity_type, rationale)
  select a1, org_a, 'Url mala', 'local', 'es', 'existing', 'javascript:alert(1)', 'update', 'x' from ids$$, '23514', null, 'only http(s) page URLs');
select throws_ok($$insert into public.content_opportunities(project_id, organization_id, topic, search_intent, market_language, page_kind, opportunity_type, rationale)
  select a1, org_a, 'Intención', 'viral', 'es', 'proposed', 'create', 'x' from ids$$, '23514', null, 'only catalogued intents');
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a01');
insert into public.content_clusters(project_id, organization_id, name, main_topic) select a2, org_a, 'Cluster A2', 'x' from ids;
insert into k select 'cl_a2', id from public.content_clusters where name = 'Cluster A2';
select throws_ok($$insert into public.content_opportunities(project_id, organization_id, cluster_id, topic, search_intent, market_language, page_kind, opportunity_type, rationale)
  select a1, org_a, (select id from k where name = 'cl_a2'), 'Cruzada', 'local', 'es', 'proposed', 'create', 'x' from ids$$,
  '23503', null, 'a cluster of another project is refused');
select throws_ok($$insert into public.content_opportunities(project_id, organization_id, topic, search_intent, market_language, page_kind, opportunity_type, rationale)
  select a1, org_b, 'Org falsa', 'local', 'es', 'proposed', 'create', 'x' from ids$$, '23503', null, 'a forged organization id is refused');
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a03');
select throws_ok($$insert into public.content_opportunities(project_id, organization_id, topic, search_intent, market_language, page_kind, opportunity_type, rationale)
  select a1, org_a, 'Visor', 'local', 'es', 'proposed', 'create', 'x' from ids$$, '42501', null, 'a viewer cannot propose');
select is((select count(*)::int from public.content_opportunities), 2, 'a viewer reads the project opportunities');
select is_empty($$update public.content_opportunities set status = 'discarded' where id = (select id from k where name = 'op1') returning 1$$, 'a viewer cannot change status');

-- ── Isolation: organization B ───────────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0b01');
select is((select count(*)::int from public.content_opportunities) + (select count(*)::int from public.content_clusters), 0, 'owner of B lists nothing of A');
select throws_ok($$insert into public.content_opportunities(project_id, organization_id, topic, search_intent, market_language, page_kind, opportunity_type, rationale)
  select a1, org_a, 'Intrusa', 'local', 'es', 'proposed', 'create', 'x' from ids$$, '42501', null, 'owner of B cannot propose in A1');
select is_empty($$update public.content_opportunities set rationale = 'x' where id = (select id from k where name = 'op1') returning 1$$, 'owner of B cannot edit');
select is_empty($$delete from public.content_opportunities where id = (select id from k where name = 'op1') returning 1$$, 'owner of B cannot erase');
select throws_ok($$insert into public.content_evidence(project_id, organization_id, opportunity_id, kind, title) select a1, org_a, (select id from k where name = 'op1'), 'analyst-proposal', 'x' from ids$$,
  '42501', null, 'owner of B cannot attach evidence in A1');

-- ── Evidence provenance ─────────────────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a02');
select lives_ok($$insert into public.content_evidence(project_id, organization_id, opportunity_id, kind, import_id, title, detail)
  select a1, org_a, (select id from k where name = 'op2'), 'import-finding', (select id from k where name = 'imp_a1'), 'Título inventado', 'Regla thin en /carta' from ids$$,
  'an import of the same project is linked as evidence');
select is((select title || ' | ' || source_date from public.content_evidence where kind = 'import-finding'), 'Auditoría de contenido A1 | 2026-10-01',
  'label and date come from the stored import, not from the client');
select throws_ok($$insert into public.content_evidence(project_id, organization_id, opportunity_id, kind, import_id, title)
  select a1, org_a, (select id from k where name = 'op2'), 'import-finding', (select id from k where name = 'imp_a2'), 'x' from ids$$,
  '23503', null, 'an import of another project is refused');
select lives_ok($$insert into public.content_evidence(project_id, organization_id, opportunity_id, kind, provider_result_id, title)
  select a1, org_a, (select id from k where name = 'op2'), 'provider-result', (select id from k where name = 'pr_a1'), 'x' from ids$$,
  'a stored provider result of the project is linked');
select is((select title from public.content_evidence where kind = 'provider-result'), 'openseo · siteAudit', 'provider label taken from the stored result');
select throws_ok($$insert into public.content_evidence(project_id, organization_id, opportunity_id, kind, provider_result_id, title)
  select a1, org_a, (select id from k where name = 'op2'), 'provider-result', (select id from k where name = 'pr_b1'), 'x' from ids$$,
  '23503', null, 'a provider result of another organization is refused');
select lives_ok($$insert into public.content_evidence(project_id, organization_id, opportunity_id, kind, title, source_url, source_date)
  select a1, org_a, (select id from k where name = 'op1'), 'manual-source', 'Revisión manual de resultados de búsqueda', 'https://www.google.es/search?q=menu', current_date - 1 from ids$$,
  'a manual source with URL (stored as text) and date');
select throws_ok($$insert into public.content_evidence(project_id, organization_id, opportunity_id, kind, title, source_date)
  select a1, org_a, (select id from k where name = 'op1'), 'manual-source', 'Futuro', current_date + 1 from ids$$, '23514', null, 'a source cannot be dated in the future');
select throws_ok($$insert into public.content_evidence(project_id, organization_id, opportunity_id, kind, title, source_url)
  select a1, org_a, (select id from k where name = 'op1'), 'analyst-proposal', 'Hipótesis', 'https://x.es' from ids$$, '23514', null, 'a hypothesis carries no source URL');
select lives_ok($$insert into public.content_evidence(project_id, organization_id, opportunity_id, kind, title, detail)
  select a1, org_a, (select id from k where name = 'op1'), 'analyst-proposal', 'Propuesta', 'El cliente recibe llamadas preguntando por el menú.' from ids$$, 'an analyst hypothesis');
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a01');
select throws_ok($$insert into public.content_evidence(project_id, organization_id, opportunity_id, kind, title)
  select a2, org_a, (select id from k where name = 'op1'), 'analyst-proposal', 'x' from ids$$, '23503', null, 'an opportunity of another project is refused');
select throws_ok($$update public.content_evidence set detail = 'cambiado'$$, '42501', null, 'evidence cannot be edited');

-- ── Briefs and review ──────────────────────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a02');
select lives_ok($$insert into public.content_briefs(project_id, organization_id, opportunity_id, market_language, market_country, search_intent, main_topic)
  select a1, org_a, (select id from k where name = 'op1'), 'es', 'ES', 'local', 'Menú del día en Madrid' from ids$$, 'an analyst starts a brief');
insert into k select 'b1', id from public.content_briefs;
select throws_ok($$insert into public.content_briefs(project_id, organization_id, opportunity_id, market_language, search_intent, main_topic)
  select a1, org_a, (select id from k where name = 'op1'), 'es', 'local', 'otro' from ids$$, '23505', null, 'one brief per opportunity');
select throws_ok($$update public.content_briefs set status = 'in-review' where id = (select id from k where name = 'b1')$$,
  '23514', null, 'an incomplete brief cannot go to review');
select throws_ok($$update public.content_briefs set outline = '[{"level":4,"text":"x"}]' where id = (select id from k where name = 'b1')$$,
  '23514', null, 'outline levels are H1 to H3');
select throws_ok($$update public.content_briefs set outline = '[{"level":1,"text":"a"},{"level":1,"text":"b"}]' where id = (select id from k where name = 'b1')$$,
  '23514', null, 'a brief has at most one H1');
select throws_ok($$update public.content_briefs set internal_links = '[{"url":"javascript:alert(1)","anchor":"x"}]' where id = (select id from k where name = 'b1')$$,
  '23514', null, 'internal links are http(s) URLs or site paths');
select lives_ok($$update public.content_briefs set objective = 'Captar reservas de mediodía', audience = 'Oficinistas de la zona',
  outline = '[{"level":1,"text":"Menú del día en Madrid"},{"level":2,"text":"Qué incluye"},{"level":3,"text":"Precio"}]',
  questions = '["¿Cuánto cuesta?"]', internal_links = '[{"url":"/carta","anchor":"Carta de temporada"}]' where id = (select id from k where name = 'b1')$$,
  'the draft is edited');
select is((select version from public.content_briefs where id = (select id from k where name = 'b1')), 2, 'each content edit raises the version');
select throws_ok($$update public.content_briefs set approved_by = auth.uid() where id = (select id from k where name = 'b1')$$,
  '42501', null, 'the approver cannot be written by the client');
select lives_ok($$update public.content_briefs set status = 'in-review' where id = (select id from k where name = 'b1')$$, 'the analyst submits for review');
select is((select submitted_by from public.content_briefs where id = (select id from k where name = 'b1')), '00000000-0000-4000-8000-0000000d0a02'::uuid,
  'the submitter is recorded by the database');
select throws_ok($$update public.content_briefs set objective = 'cambio' where id = (select id from k where name = 'b1')$$,
  '42501', null, 'a brief under review is locked');
select throws_ok($$update public.content_briefs set status = 'approved' where id = (select id from k where name = 'b1')$$,
  '42501', null, 'an analyst cannot approve (review-action)');
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a04');
select is_empty($$update public.content_briefs set status = 'approved' where id = (select id from k where name = 'b1') returning 1$$,
  'a client approver cannot approve an editorial brief');
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a05');
select lives_ok($$update public.content_briefs set status = 'draft', review_note = 'Falta la pregunta sobre alérgenos' where id = (select id from k where name = 'b1')$$,
  'the account manager returns it with a note');
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a02');
select throws_ok($$update public.content_briefs set review_note = 'borrado' where id = (select id from k where name = 'b1')$$, '42501', null, 'the note is not rewritten by an editor');
select lives_ok($$update public.content_briefs set questions = '["¿Cuánto cuesta?","¿Hay opciones sin gluten?"]' where id = (select id from k where name = 'b1')$$, 'fixed');
select lives_ok($$update public.content_briefs set status = 'in-review' where id = (select id from k where name = 'b1')$$, 'resubmitted');
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a05');
select lives_ok($$update public.content_briefs set status = 'approved' where id = (select id from k where name = 'b1')$$, 'the account manager approves');
select pg_temp.admin();
select ok((select approved_by = '00000000-0000-4000-8000-0000000d0a05' and approved_at is not null and version = 3 from public.content_briefs
  where id = (select id from k where name = 'b1')), 'approval attributed and dated by the database, on version 3');
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a05');
select throws_ok($$update public.content_briefs set cta = 'Reserva' where id = (select id from k where name = 'b1')$$, '42501', null, 'an approved brief is not edited');
select throws_ok($$update public.content_briefs set status = 'draft' where id = (select id from k where name = 'b1')$$, '23514', null, 'approved cannot silently go back to draft');
select lives_ok($$update public.content_briefs set status = 'archived' where id = (select id from k where name = 'b1')$$, 'archived');
select ok((select approved_by is not null and archived_at is not null from public.content_briefs where id = (select id from k where name = 'b1')),
  'archiving keeps who approved it');
select lives_ok($$update public.content_briefs set status = 'draft' where id = (select id from k where name = 'b1')$$, 'restored to draft');
select ok((select approved_by is null and archived_at is null from public.content_briefs where id = (select id from k where name = 'b1')),
  'a restored draft carries no approval');

-- ── Revocation: a removed member loses access at once ──────────────────────────────────────
select pg_temp.admin();
delete from public.project_members where user_id = '00000000-0000-4000-8000-0000000d0a03';
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a03');
select is((select count(*)::int from public.content_opportunities), 0, 'a revoked viewer reads nothing');

-- ── Erase (owner) and erased sources ──────────────────────────────────────────────────────
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a02');
select is_empty($$delete from public.content_opportunities where id = (select id from k where name = 'op2') returning 1$$, 'an analyst cannot erase');
select pg_temp.admin();
delete from public.imports where id = (select id from k where name = 'imp_a1');
select is((select count(*)::int from public.content_evidence where kind = 'import-finding' and import_id is null and title = 'Auditoría de contenido A1'), 1,
  'an erased import keeps the evidence snapshot without the link');
select pg_temp.act_as('00000000-0000-4000-8000-0000000d0a01');
select lives_ok($$delete from public.content_clusters where id = (select id from k where name = 'cl1')$$, 'the owner erases the cluster');
select is((select count(*)::int || '/' || count(*) filter (where cluster_id is null and cluster_role is null) from public.content_opportunities
  where project_id = (select a1 from ids)), '2/2', 'erasing a cluster keeps its opportunities, without cluster or role');
select lives_ok($$delete from public.content_opportunities where id = (select id from k where name = 'op1')$$, 'the owner erases an opportunity');
select is((select count(*)::int from public.content_briefs) + (select count(*)::int from public.content_evidence where opportunity_id = (select id from k where name = 'op1')), 0,
  'its brief and evidence go with it');

-- ── S1 receipts ────────────────────────────────────────────────────────────────────────────
select pg_temp.admin();
select results_eq($$select action, count(*)::int from private.audit_outbox where project_id = (select a1 from ids) group by action order by action$$,
  $$values ('content.brief.add', 1), ('content.brief.approve', 1), ('content.brief.archive', 1), ('content.brief.restore', 1),
    ('content.brief.return', 1), ('content.brief.submit', 2), ('content.brief.update', 2), ('content.cluster.add', 1), ('content.cluster.erase', 1),
    ('content.evidence.add', 4), ('content.opportunity.add', 2), ('content.opportunity.erase', 1)$$,
  'one receipt per change; cascades and source erasure add none');
select is((select actor_role || '/' || actor_id from private.audit_outbox where action = 'content.brief.approve'),
  'account-manager/00000000-0000-4000-8000-0000000d0a05', 'the approval receipt carries the live role and the actor');
select throws_ok($$delete from public.projects where id = (select a1 from ids)$$, '55000', null, 'pending receipts block the project deletion (#106)');
delete from private.audit_outbox where project_id = (select a1 from ids) and state = 'pending';
select set_config('role', 'service_role', true);
select lives_ok($$delete from public.projects where id = (select a1 from ids)$$, 'the operator path deletes a project with content');
select pg_temp.admin();
select is((select count(*)::int from private.audit_outbox where project_id = (select a1 from ids)), 0, 'the cascade queued no orphan receipt');

select * from finish();
rollback;
