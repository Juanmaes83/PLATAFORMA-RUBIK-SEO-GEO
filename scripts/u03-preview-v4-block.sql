-- Emergency containment. Run separately in autocommit with psql -X -v ON_ERROR_STOP=1 -f.
-- No administrative credential is available to the campaign wrapper.
do $$ begin
  if (select count(*) from private.environment_identity) <> 1 or
     (select count(*) from private.environment_identity
        where environment = 'preview' and project_ref = 'rhnnplewqsekrnaousyl') <> 1 then
    raise exception 'V4_PREVIEW_IDENTITY_REJECTED';
  end if;
  if exists (select 1 from pg_roles where rolname = 'rubik_preview_receipt_writer') then
    execute 'alter role rubik_preview_receipt_writer nologin';
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_roles
      where rolname = 'rubik_preview_receipt_writer' and rolcanlogin) then
    raise exception 'V4_PREVIEW_NOLOGIN_UNVERIFIED';
  end if;
end $$;
