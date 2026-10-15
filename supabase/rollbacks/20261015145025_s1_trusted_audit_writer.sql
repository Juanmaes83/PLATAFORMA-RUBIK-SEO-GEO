-- Emergency containment for S1 only. Execute as the database owner in a reviewed
-- maintenance window. This intentionally leaves JWT INSERT denied and retains all
-- audit events, idempotency receipts, and pending withdrawal outbox rows.
-- Disconnect existing writer sessions separately after checking pg_stat_activity;
-- NOLOGIN only prevents new sessions.
begin;
set local lock_timeout = '3s';
revoke insert on public.audit_events from rubik_audit_writer;
revoke update on private.audit_outbox from rubik_audit_writer;
revoke update (state, event_seq, attempts, last_error, completed_at)
  on private.audit_outbox from rubik_audit_writer;
alter role rubik_audit_writer nologin;
commit;

-- Recovery after root cause is fixed and the chain/receipts are verified:
--   grant insert on public.audit_events to rubik_audit_writer;
--   grant update (state, event_seq, attempts, last_error, completed_at)
--     on private.audit_outbox to rubik_audit_writer;
--   activate LOGIN with an owner-managed server credential (never commit it).
-- Never grant INSERT on audit_events back to authenticated, anon, or PUBLIC.
