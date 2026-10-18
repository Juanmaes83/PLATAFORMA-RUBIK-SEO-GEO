-- Preview-only U02 operation after the exact 27 N1 migrations. Do not put this file
-- in supabase/migrations: Preview must not apply the intervening N2 migrations.
-- Execute only against --project-ref rhnnplewqsekrnaousyl after the remote dry run.
begin;
do $$
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 27
    or (select max(version) from supabase_migrations.schema_migrations) <> '20261015210000'
    or to_regclass('public.organizations') is null
    or to_regclass('private.audit_outbox') is null
    or to_regclass('public.content_clusters') is not null
    or (select count(*) from auth.users) <> 0
    or (select count(*) from public.organizations) <> 0
    or (select count(*) from private.audit_outbox) <> 0
  then
    raise exception 'U02 Preview identity preconditions failed';
  end if;
end $$;

create table public.environment_identity (
  identity_id smallint primary key default 1 check (identity_id = 1),
  environment text not null check (environment = 'preview'),
  project_ref text not null check (project_ref = 'rhnnplewqsekrnaousyl')
);
alter table public.environment_identity enable row level security;
alter table public.environment_identity force row level security;
revoke all on public.environment_identity from public, anon, authenticated;
grant select on public.environment_identity to anon, authenticated;
create policy preview_identity_read on public.environment_identity
  for select to anon, authenticated
  using (identity_id = 1 and environment = 'preview' and project_ref = 'rhnnplewqsekrnaousyl');
insert into public.environment_identity (identity_id, environment, project_ref)
values (1, 'preview', 'rhnnplewqsekrnaousyl');
commit;
