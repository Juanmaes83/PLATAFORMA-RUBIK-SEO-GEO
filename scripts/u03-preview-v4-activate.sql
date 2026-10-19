-- Operator only. Set a distinct Preview password with psql \password before this file.
-- Never use this file against another ref or without a short controlled window.
do $$ begin
  if (select count(*) from private.environment_identity) <> 1 or
     (select count(*) from private.environment_identity
        where environment = 'preview' and project_ref = 'rhnnplewqsekrnaousyl') <> 1 then
    raise exception 'V4_PREVIEW_IDENTITY_REJECTED';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'rubik_preview_receipt_writer'
      and not rolsuper and not rolbypassrls and not rolinherit
      and not rolcreaterole and not rolcreatedb and not rolcanlogin) then
    raise exception 'V4_PREVIEW_ROLE_REJECTED';
  end if;
  execute format('alter role rubik_preview_receipt_writer login valid until %L',
    now() + interval '30 minutes');
end $$;
