-- The Google and OpenSEO SECURITY DEFINER RPCs used to accept caller-supplied HMAC rows.
-- Their reservation commands remain available to JWT owners, but no JWT session may
-- insert provider evidence, even indirectly through those functions.
create function private.trusted_provider_insert_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if session_user <> 'rubik_audit_writer'
    and current_setting('role', true) <> 'rubik_audit_writer'
    and not (session_user = 'postgres' and current_setting('role', true) in ('none', 'postgres')) then
    raise exception 'trusted provider writer required' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.trusted_provider_insert_guard() from public, anon, authenticated;
create trigger provider_results_trusted_insert before insert on public.provider_results
  for each row execute function private.trusted_provider_insert_guard();

-- Only the server-side dedicated writer may complete a capture or job. These grants
-- do not give it general Auth or membership-table privileges.
grant execute on function private.google_capture_command(uuid,text,jsonb),
  private.openseo_job(uuid,text,uuid,jsonb) to rubik_audit_writer;
