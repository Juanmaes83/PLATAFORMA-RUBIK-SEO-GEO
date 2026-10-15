-- LOCAL only. One statement/transaction; no schema changes. Recheck ownership
-- under locks: competing inserts cannot add cascading references during cleanup.
do $cleanup$
declare
  receipt jsonb := convert_from(decode('__LEDGER_HEX__', 'hex'), 'utf8')::jsonb;
  run text := receipt->>'run';
  fk record;
  parent_guard text;
  bad boolean;
  users_owned uuid[] := array(select (r->>'id')::uuid from jsonb_array_elements(receipt->'users') r);
  orgs_owned uuid[] := array(select (r->>'id')::uuid from jsonb_array_elements(receipt->'organizations') r);
  projects_owned uuid[] := array(select (r->>'id')::uuid from jsonb_array_elements(receipt->'projects') r);
begin
  perform set_config('lock_timeout', '2s', true);
  lock table auth.users, public.organizations, public.projects,
    public.organization_members, public.project_members in share row exclusive mode;
  if exists (
    select 1 from jsonb_to_recordset(receipt->'users') as r(id uuid, email text)
    join auth.users u on u.id=r.id
    where u.email is distinct from r.email or u.raw_app_meta_data->>'rubik_e2e_run' is distinct from run
  ) or exists (
    select 1 from auth.users u where u.email in (select jsonb_array_elements_text(receipt->'pendingEmails'))
      and u.id not in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'users') r)
  ) or exists (
    select 1 from jsonb_to_recordset(receipt->'organizations') as r(id uuid, slug text, created_by uuid)
    join public.organizations o on o.id=r.id where o.slug is distinct from r.slug or o.created_by is distinct from r.created_by
  ) or exists (
    select 1 from jsonb_to_recordset(receipt->'projects') as r(id uuid, slug text, organization_id uuid)
    join public.projects p on p.id=r.id where p.slug is distinct from r.slug or p.organization_id is distinct from r.organization_id
  ) or exists (
    select 1 from public.organizations o
    where o.created_by in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'users') r)
      and o.id not in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'organizations') r)
  ) or exists (
    select 1 from public.projects p
    where p.organization_id in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'organizations') r)
      and p.id not in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'projects') r)
  ) or exists (
    select 1 from public.organization_members m
    where (m.organization_id in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'organizations') r))
      <> (m.user_id in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'users') r))
  ) or exists (
    select 1 from public.project_members m
    where ((m.organization_id in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'organizations') r))
      or (m.project_id in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'projects') r))
      or (m.user_id in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'users') r)))
    and not ((m.organization_id in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'organizations') r))
      and (m.project_id in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'projects') r))
      and (m.user_id in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'users') r)))
  ) then
    raise exception 'Ambiguous E2E ownership; transaction rolled back';
  end if;

  -- Cover every non-Auth FK to auth.users, including accepted_by/created_by on
  -- PRIVATE invitations after membership was withdrawn. SET NULL is a mutation too.
  -- New tables without a recognized parent fail closed when they reference our users.
  for fk in
    select n.nspname, t.relname, a.attname, t.oid,
      exists(select 1 from pg_attribute x where x.attrelid=t.oid and x.attname='project_id' and not x.attisdropped) as has_project
    from pg_constraint c join pg_class t on t.oid=c.conrelid
      join pg_namespace n on n.oid=t.relnamespace
      join pg_attribute a on a.attrelid=t.oid and a.attnum=c.conkey[1]
    where c.contype='f' and c.confrelid='auth.users'::regclass and n.nspname<>'auth'
    order by n.nspname,t.relname,a.attname
  loop
    execute format('lock table %I.%I in share row exclusive mode', fk.nspname,fk.relname);
    parent_guard := case
      when fk.nspname='public' and fk.relname='organizations' then 'id=any($2)'
      when fk.nspname='public' and fk.relname='organization_members' then 'organization_id=any($2)'
      when fk.nspname in ('public','private') and fk.has_project then 'project_id=any($3)'
      else 'false' end;
    execute format('select exists(select 1 from %I.%I where
      (%I=any($1) and not coalesce((%s),false)) or
      (coalesce((%s),false) and %I is not null and not (%I=any($1))))',
      fk.nspname,fk.relname,fk.attname,parent_guard,parent_guard,fk.attname,fk.attname)
      into bad using users_owned,orgs_owned,projects_owned;
    if bad then raise exception 'Foreign E2E dependency; transaction rolled back'; end if;
  end loop;
  delete from public.organizations where id in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'organizations') r);
  delete from auth.users where id in (select (r->>'id')::uuid from jsonb_array_elements(receipt->'users') r)
    and raw_app_meta_data->>'rubik_e2e_run'=run;
end;
$cleanup$;
