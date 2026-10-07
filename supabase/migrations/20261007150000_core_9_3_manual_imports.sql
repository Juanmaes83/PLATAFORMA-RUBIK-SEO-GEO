-- CORE-9.3 · Manual imports (ADR 0005). LOCAL stack and CI only; the hosted project is the
-- owner's manual step (docs/SETUP-SUPABASE.md).
--
-- One row per accepted file, written in a single INSERT so an import is never half stored:
-- the validated, normalised findings and the row errors live in the same row (jsonb). The
-- original file is NOT stored (minimisation): only its SHA-256 and size, which make the
-- import idempotent per project. Imported data is DECLARED (method `import`), never a verified
-- provider result. `captured_at` is when the data was observed at its source; `created_at`
-- is when it was imported.

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  organization_id uuid not null,
  format text not null check (format = 'rubik-import-v1'),
  source_kind text not null check (source_kind in ('audit', 'crawl-export', 'offpage-inventory', 'manual-review')),
  source_label text not null check (char_length(source_label) between 1 and 120),
  source_url text check (source_url is null or (char_length(source_url) <= 2048 and source_url ~ '^https?://')),
  source_tool text check (source_tool is null or char_length(source_tool) <= 80),
  captured_at timestamptz not null,
  period_start timestamptz,
  period_end timestamptz,
  status text not null check (status in ('complete', 'partial', 'failed', 'empty')),
  finding_count integer not null check (finding_count between 0 and 5000),
  error_count integer not null check (error_count >= 0),
  findings jsonb not null check (jsonb_typeof(findings) = 'array' and jsonb_array_length(findings) = finding_count),
  errors jsonb not null check (jsonb_typeof(errors) = 'array' and jsonb_array_length(errors) = error_count),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  file_bytes integer not null check (file_bytes between 1 and 900000),
  created_by uuid not null default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((period_start is null) = (period_end is null)),
  check (period_end is null or (period_start <= period_end and period_end <= captured_at)),
  check ((status = 'empty') = (finding_count = 0 and error_count = 0)),
  check ((status = 'complete') = (finding_count > 0 and error_count = 0)),
  check ((status = 'failed') = (finding_count = 0 and error_count > 0)),
  -- The same file imported twice into a project is the same import.
  unique (project_id, file_sha256),
  foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade
);
create index imports_project_idx on public.imports (project_id, created_at desc);

create function private.refuse_import_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'imports rows are immutable' using errcode = '42501';
end;
$$;
create trigger imports_immutable before update on public.imports
  for each row execute function private.refuse_import_update();
revoke all on function private.refuse_import_update() from public, anon, authenticated;

revoke all on public.imports from public, anon, authenticated;
grant select on public.imports to authenticated;
grant insert (project_id, organization_id, format, source_kind, source_label, source_url, source_tool, captured_at,
  period_start, period_end, status, finding_count, error_count, findings, errors, file_sha256, file_bytes)
  on public.imports to authenticated;
grant delete on public.imports to authenticated;

alter table public.imports enable row level security;

create policy "project members read imports" on public.imports
  for select to authenticated using ((select private.is_project_member(project_id)));
-- Roles with `draft` in the Core MATRIX import data.
create policy "drafting roles import data" on public.imports
  for insert to authenticated
  with check (created_by = (select auth.uid())
    and (select private.has_project_role(project_id, array['owner', 'account-manager', 'analyst'])));
-- Erasure on request: only `owner` holds `delete-data`.
create policy "project owners delete imports" on public.imports
  for delete to authenticated using ((select private.has_project_role(project_id, array['owner'])));
