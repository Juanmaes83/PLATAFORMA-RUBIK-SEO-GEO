-- F-OPS-2: a provider may have spent quota even if its HTTP answer or the SQL writer is lost.
-- Keep an authenticated caller from reopening an uncertain capture after the old five-minute
-- lease or via the public release RPC. Only a privileged, separately audited reconciliation
-- with no JWT may release it after establishing the provider outcome.
create function private.guard_google_capture_uncertain_retry()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.state = 'RESERVED' and new.state in ('RESERVED', 'RELEASED')
    and auth.uid() is not null then
    raise exception 'Capture outcome requires reconciliation before retry' using errcode = '55P03';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_google_capture_uncertain_retry() from public, anon, authenticated;
create trigger guard_google_capture_uncertain_retry
  before update on private.google_captures
  for each row execute function private.guard_google_capture_uncertain_retry();
