-- Emergency containment: stop result erasure without dropping pending receipts.
-- Do not remove the trigger or regrant JWT INSERT.
revoke delete on public.provider_results from public, anon, authenticated;
