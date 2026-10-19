-- Operator only; psql -X -v ON_ERROR_STOP=1 -f (NEVER --single-transaction).
-- This first DO autocommits NOLOGIN before the residue gate. On any later error,
-- leave the role blocked and keep the campaign ledger/UUIDs for reconciliation.
do $$ begin
  if (select count(*) from private.environment_identity) <> 1 or
     (select count(*) from private.environment_identity
        where environment = 'preview' and project_ref = 'rhnnplewqsekrnaousyl') <> 1 then
    raise exception 'V4_PREVIEW_IDENTITY_REJECTED';
  end if;
  if exists (select 1 from pg_roles where rolname = 'rubik_preview_receipt_writer') then
    execute 'alter role rubik_preview_receipt_writer nologin';
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_roles
      where rolname = 'rubik_preview_receipt_writer' and rolcanlogin) then
    raise exception 'V4_PREVIEW_NOLOGIN_UNVERIFIED';
  end if;
end $$;

begin;
do $$
declare residue_count bigint;
begin
  if (select count(*) from private.environment_identity) <> 1 or
     (select count(*) from private.environment_identity
        where environment = 'preview' and project_ref = 'rhnnplewqsekrnaousyl') <> 1 then
    raise exception 'V4_PREVIEW_IDENTITY_REJECTED';
  end if;
  select
    (select count(*) from auth.users) +
    (select count(*) from public.organizations) +
    (select count(*) from public.organization_members) +
    (select count(*) from public.projects) +
    (select count(*) from public.project_members) +
    (select count(*) from public.audit_events) +
    (select count(*) from public.provider_results) +
    (select count(*) from public.imports) +
    (select count(*) from private.project_invitations) +
    (select count(*) from private.audit_outbox) +
    (select count(*) from private.audit_idempotency) +
    (select count(*) from private.openseo_project_jobs) +
    (select count(*) from private.openseo_project_connections) +
    (select count(*) from private.webmaster_properties) +
    (select count(*) from private.provider_budgets) +
    (select count(*) from private.provider_spend) +
    (select count(*) from private.openseo_google_properties) +
    (select count(*) from private.google_captures)
    into residue_count;
  if residue_count <> 0 then
    raise exception 'V4_PREVIEW_RESIDUES_KEEP_NOLOGIN count=%', residue_count;
  end if;
end $$;

drop policy if exists "u03 preview receipt reads audit" on public.audit_events;
drop policy if exists "u03 preview receipt appends audit" on public.audit_events;
drop policy if exists "u03 preview receipt reads outbox" on private.audit_outbox;
drop policy if exists "u03 preview receipt updates outbox" on private.audit_outbox;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'rubik_preview_receipt_writer') then
    revoke select, insert on public.audit_events from rubik_preview_receipt_writer;
    revoke select, update (state, event_seq, attempts, last_error, completed_at)
      on private.audit_outbox from rubik_preview_receipt_writer;
    revoke execute on function private.audit_writer_project(uuid) from rubik_preview_receipt_writer;
    revoke execute on function public.preview_environment_identity() from rubik_preview_receipt_writer;
    revoke usage on schema public, private from rubik_preview_receipt_writer;
  end if;
end $$;
drop role if exists rubik_preview_receipt_writer;
commit;
