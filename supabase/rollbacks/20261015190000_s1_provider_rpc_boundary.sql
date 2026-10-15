-- Containment rollback for an incident: stop all Google/OpenSEO RPC access and
-- dedicated writer completion. Keep the INSERT guard and committed evidence intact.
-- Requires an operator to inspect pending reservations before service restoration.
begin;
revoke execute on function private.google_capture_command(uuid,text,jsonb),
  public.google_capture(uuid,text,jsonb), private.openseo_job(uuid,text,uuid,jsonb),
  public.openseo_job(uuid,text,uuid,jsonb)
  from public, anon, authenticated, rubik_audit_writer;
commit;
