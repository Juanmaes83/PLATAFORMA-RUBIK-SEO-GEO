-- Reject Data API writes that bypass the server action's same-project URL check.
-- This migration is local-only until a hosted schema plan is approved.
create function private.seo_keyword_target_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  project_domain text;
  authority text;
  port_text text;
begin
  if new.target_url is null then return new; end if;
  select domain into project_domain from public.projects
    where id = new.project_id and organization_id = new.organization_id;
  authority := substring(new.target_url from '^https://([^/?#]+)');
  if project_domain is null or authority is null or position('@' in authority) > 0 then
    raise exception 'keyword target must belong to the project domain' using errcode = '23514';
  end if;
  if split_part(lower(authority), ':', 1) <> project_domain then
    raise exception 'keyword target must belong to the project domain' using errcode = '23514';
  end if;
  if position(':' in authority) > 0 then
    port_text := split_part(authority, ':', 2);
    if authority !~ '^[^:]+:[0-9]{1,5}$' or port_text::integer not between 1 and 65535 then
      raise exception 'invalid keyword target port' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.seo_keyword_target_guard() from public, anon, authenticated;
create trigger seo_keywords_target_guard before insert or update on public.seo_keywords
  for each row execute function private.seo_keyword_target_guard();
