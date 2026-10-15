-- Emergency containment only. Keep existing imports and durable outbox receipts intact.
-- Apply manually only after inventory/backup in the explicitly selected environment.
revoke insert, delete on public.imports from public, anon, authenticated;
revoke insert (project_id, organization_id, format, source_kind, source_label, source_url,
  source_tool, captured_at, period_start, period_end, status, finding_count, error_count,
  findings, errors, file_sha256, file_bytes) on public.imports from public, anon, authenticated;
revoke execute on function public.delete_import_with_receipt(uuid, uuid) from public, anon, authenticated;
