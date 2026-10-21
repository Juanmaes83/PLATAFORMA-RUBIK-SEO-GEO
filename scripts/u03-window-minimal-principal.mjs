// Preview-only SQL for a run-scoped signing principal. This role never inherits or
// SET ROLEs to the product writer; provider RPC grants remain untouched.
export const ROLE = 'rubik_preview_u03_writer';
export const WRITER = 'rubik_audit_writer';
export const REF = 'rhnnplewqsekrnaousyl';
export const RELATIONS = Object.freeze([
  'public.audit_events', 'public.provider_results', 'private.audit_idempotency', 'private.audit_outbox',
]);
const RUN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PASSWORD = /^[A-Za-z0-9_-]{40,50}$/;

export function runScope(runId) {
  if (!RUN.test(runId)) throw new Error('RUN_ID_REJECTED');
  return `u03-${runId.replaceAll('-', '').slice(0, 12).toLowerCase()}`;
}

export function policyNames(runId) {
  const tag = runScope(runId).slice(4);
  return RELATIONS.map((_, i) => `u03_preview_writer_${tag}_${['audit_events','provider_results','audit_idempotency','audit_outbox'][i]}`);
}

export const ORIGINAL_PROVIDER_GUARD = `create or replace function private.trusted_provider_insert_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if session_user <> 'rubik_audit_writer'
    and current_setting('role', true) <> 'rubik_audit_writer'
    and not (session_user = 'postgres' and current_setting('role', true) in ('none', 'postgres')) then
    raise exception 'trusted provider writer required' using errcode = '42501';
  end if;
  return new;
end;
$$;`;

export function buildMinimalInstallSql(runId, credential, expiresAt) {
  const namespace = runScope(runId);
  const when = new Date(expiresAt);
  if (!PASSWORD.test(credential) || !Number.isFinite(when.getTime()) ||
      when.getTime() <= Date.now() || when.getTime() > Date.now() + 30 * 60_000)
    throw new Error('WINDOW_CREDENTIAL_OR_TTL_REJECTED');
  const timestamp = when.toISOString();
  const marker = `u03-window:${runId}`;
  const names = policyNames(runId);
  const scope = `(statement_timestamp() < '${timestamp}'::timestamptz and exists (
    select 1 from pg_roles r where r.rolname = '${ROLE}' and r.rolcanlogin
      and r.rolvaliduntil > statement_timestamp()
      and shobj_description(r.oid,'pg_authid') = '${marker}') and exists (
    select 1 from private.audit_writer_project(project_id) s where
      (s.tenant_slug = '${namespace}-a' and s.project_slug in ('a1','a2')) or
      (s.tenant_slug = '${namespace}-b' and s.project_slug = 'b1')))`;
  const policies = RELATIONS.map((relation, i) => `create policy "${names[i]}" on ${relation}
    as permissive for all to ${ROLE} using (${scope}) with check (${scope});`).join('\n');
  // The trigger executes as invoker. Neither a client GUC nor an HTTP runId
  // authorizes it: only the administrator-owned role marker, SQL identity,
  // project namespace, and database TTL do.
  const guard = `create or replace function private.trusted_provider_insert_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare permitted boolean; project_scope record;
begin
  if session_user = '${ROLE}' and current_user = '${ROLE}' then
    select r.rolcanlogin and r.rolvaliduntil > statement_timestamp()
      and shobj_description(r.oid,'pg_authid') = '${marker}' into permitted
      from pg_roles r where r.rolname = '${ROLE}';
    if not coalesce(permitted,false) then
      raise exception 'window writer unavailable' using errcode = '42501';
    end if;
    select * into project_scope from private.audit_writer_project(new.project_id);
    if project_scope.tenant_slug = '${namespace}-a' and project_scope.project_slug in ('a1','a2')
      or project_scope.tenant_slug = '${namespace}-b' and project_scope.project_slug = 'b1' then
      return new;
    end if;
    raise exception 'window scope rejected' using errcode = '42501';
  end if;
  if session_user <> 'rubik_audit_writer'
    and current_setting('role', true) <> 'rubik_audit_writer'
    and not (session_user = 'postgres' and current_setting('role', true) in ('none', 'postgres')) then
    raise exception 'trusted provider writer required' using errcode = '42501';
  end if;
  return new;
end;
$$;`;
  return `begin;
do $u03$ begin
 if (select count(*) from private.environment_identity where environment='preview' and project_ref='${REF}') <> 1
    or (select count(*) from private.environment_identity) <> 1 then raise exception 'U03_REF_REJECTED'; end if;
 if exists(select 1 from pg_roles where rolname='${ROLE}') then raise exception 'U03_ROLE_EXISTS'; end if;
 if exists(select 1 from pg_policies where policyname like 'u03_preview_writer_%') then raise exception 'U03_POLICY_RESIDUE'; end if;
 if not exists(select 1 from pg_roles where rolname='${WRITER}' and not rolcanlogin and not rolbypassrls) then raise exception 'U03_WRITER_NOT_LOCKED'; end if;
end $u03$;
create role ${ROLE} nologin noinherit nobypassrls nosuperuser nocreatedb nocreaterole
  password '${credential}' valid until '${timestamp}';
comment on role ${ROLE} is '${marker}';
grant usage on schema public,private to ${ROLE};
grant select,insert on public.audit_events,public.provider_results,private.audit_idempotency to ${ROLE};
grant select on private.audit_outbox to ${ROLE};
grant update (state,event_seq,attempts,last_error,completed_at) on private.audit_outbox to ${ROLE};
grant execute on function private.audit_writer_actor(uuid,uuid),private.audit_writer_project(uuid) to ${ROLE};
${policies}
${guard}
commit;`;
}

export function buildMinimalRollbackSql(runId) {
  const names = policyNames(runId);
  return `do $u03$ begin
 if (select shobj_description(oid,'pg_authid') from pg_roles where rolname='${ROLE}') <> 'u03-window:${runId}'
    or not exists(select 1 from pg_roles where rolname='${ROLE}') then
   raise exception 'U03_ROLE_OWNERSHIP_UNVERIFIED'; end if;
end $u03$;
alter role ${ROLE} nologin;
select pg_terminate_backend(pid) from pg_stat_activity where usesysid=(select oid from pg_roles where rolname='${ROLE}') and pid<>pg_backend_pid();
begin;
do $u03$ begin
 if (select shobj_description(oid,'pg_authid') from pg_roles where rolname='${ROLE}') <> 'u03-window:${runId}'
    or (select count(*) from auth.users) <> 0
    or (select count(*) from public.organizations) <> 0
    or (select count(*) from public.projects) <> 0
    or (select count(*) from public.audit_events) <> 0
    or (select count(*) from public.provider_results) <> 0
    or (select count(*) from public.imports) <> 0
    or (select count(*) from private.audit_idempotency) <> 0
    or (select count(*) from private.audit_outbox) <> 0 then
   raise exception 'U03_RESIDUAL_DATA'; end if;
end $u03$;
${RELATIONS.map((relation, i) => `drop policy if exists "${names[i]}" on ${relation};`).join('\n')}
${ORIGINAL_PROVIDER_GUARD}
revoke execute on function private.audit_writer_actor(uuid,uuid),private.audit_writer_project(uuid) from ${ROLE};
revoke all on public.audit_events,public.provider_results,private.audit_idempotency,private.audit_outbox from ${ROLE};
revoke usage on schema public,private from ${ROLE};
drop role ${ROLE};
commit;`;
}
