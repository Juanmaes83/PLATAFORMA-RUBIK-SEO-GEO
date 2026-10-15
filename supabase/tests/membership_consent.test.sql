-- S2 privilege regression. LOCAL only; no persisted fixtures or schema changes.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Inspect every column, including future columns: a table-level check is insufficient.
select ok(not has_table_privilege(r, c.oid, 'INSERT'), r || ' has no table INSERT on ' || c.relname)
from pg_class c, unnest(array['anon','authenticated']) r
where c.oid in ('public.organization_members'::regclass, 'public.project_members'::regclass);
select ok(not has_column_privilege(r, a.attrelid, a.attnum, 'INSERT'),
  r || ' has no column INSERT on ' || a.attrelid::regclass || '.' || a.attname)
from pg_attribute a, unnest(array['anon','authenticated']) r
where a.attrelid in ('public.organization_members'::regclass, 'public.project_members'::regclass)
  and a.attnum > 0 and not a.attisdropped;
select is(count(*)::int, 0, 'no INSERT or ALL policy permits ordinary membership enrollment')
from pg_policies where schemaname='public'
  and tablename in ('organization_members','project_members') and cmd in ('INSERT','ALL');
select ok(has_table_privilege('authenticated',t,privilege), privilege || ' retained: ' || t)
from unnest(array['public.organization_members','public.project_members']) t, unnest(array['SELECT','DELETE']) privilege;
select ok(has_column_privilege('authenticated',t,'role','UPDATE'), 'role management retained: ' || t)
from unnest(array['public.organization_members','public.project_members']) t;
select ok(not has_column_privilege('authenticated',a.attrelid,a.attnum,'UPDATE'),
  'identity cannot be reassigned via UPDATE: ' || a.attrelid::regclass || '.' || a.attname)
from pg_attribute a where a.attrelid in ('public.organization_members'::regclass,'public.project_members'::regclass)
  and a.attnum > 0 and not a.attisdropped and a.attname <> 'role';

-- These are the only enrollment writers. Pin effective owner, definer and empty path.
select ok(p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
  and (select rolsuper or rolbypassrls from pg_roles where oid=p.proowner)
  and 'search_path=""'=any(p.proconfig), 'trusted enrollment writer: ' || p.oid::regprocedure)
from pg_proc p where p.oid in ('private.add_creator_as_org_owner()'::regprocedure,
  'private.add_creator_as_project_owner()'::regprocedure,'private.accept_project_invitation(text)'::regprocedure);
select ok(not has_function_privilege('authenticated', f, 'EXECUTE'), 'trigger cannot be called as an RPC: ' || f)
from unnest(array['private.add_creator_as_org_owner()','private.add_creator_as_project_owner()']) f;
select ok(not p.prosecdef, 'public invitation wrapper remains invoker: ' || p.oid::regprocedure)
from pg_proc p where p.oid in ('public.project_invitations(uuid,text,jsonb)'::regprocedure,
  'public.accept_project_invitation(text)'::regprocedure);
select ok(has_function_privilege('authenticated','private.accept_project_invitation(text)','EXECUTE'), 'recipient retains acceptance entry point');
select ok(not has_function_privilege('anon','private.accept_project_invitation(text)','EXECUTE'), 'anonymous cannot accept');
select * from finish();
rollback;
