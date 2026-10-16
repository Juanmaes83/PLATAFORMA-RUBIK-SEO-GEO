-- Roll back only after reconciling every RESERVED capture, as removing this guard restores
-- the five-minute automatic takeover and authenticated release behavior.
drop trigger if exists guard_google_capture_uncertain_retry on private.google_captures;
drop function if exists private.guard_google_capture_uncertain_retry();
