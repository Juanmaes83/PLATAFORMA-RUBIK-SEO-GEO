-- Emergency containment: stop new result writes without restoring JWT INSERT.
-- Preserve existing signed rows and their historical verification state.
revoke insert on public.provider_results from rubik_audit_writer;
