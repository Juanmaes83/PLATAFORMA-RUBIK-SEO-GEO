-- Containment rollback for 20261015210000 (local; hosted only with explicit owner approval).
-- Stops creating provider receipts; keeps every existing receipt (pending ones stay
-- drainable) and the widened action constraint, so no audit evidence is lost. It does not
-- reopen any HMAC path: provider_results remain writable only by the dedicated writer.
-- Deploy together with the application version that appends `google.capture` directly,
-- otherwise new captures would be stored without any audit event.
begin;
drop trigger if exists google_captures_audit_stored on private.google_captures;
drop trigger if exists openseo_jobs_audit_completed on private.openseo_project_jobs;
drop function if exists private.queue_google_capture_receipt();
drop function if exists private.queue_openseo_job_receipt();
drop function if exists private.provider_receipt_owner(uuid, uuid);
commit;
