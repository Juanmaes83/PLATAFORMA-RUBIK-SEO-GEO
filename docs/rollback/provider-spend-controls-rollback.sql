-- Rollback of 20261010150000_provider_spend_controls.sql. Run only with a backup, then
-- `npx supabase@2.118.0 migration repair --status reverted 20261010150000`.
-- Restores the budget function of 20261010090000 and drops the new columns (idempotency keys,
-- overrun blocks and stored conversions are lost; budgets and spend history are kept).
create or replace function private.provider_budget(
  p_project_id uuid, p_provider text, p_command text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b private.provider_budgets;
  s private.provider_spend;
  p public.projects;
  month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  used bigint;
  amount bigint;
begin
  if auth.uid() is null or not private.has_project_role(p_project_id, array['owner']) then
    raise exception 'Provider budget access denied' using errcode = '42501';
  end if;
  if p_provider is null or p_provider not in ('openseo')
    or p_command is null or p_command not in ('get', 'set', 'reserve', 'settle', 'release') then
    raise exception 'Invalid provider budget command' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('provider_budget:' || p_project_id::text || ':' || p_provider, 0));
  select * into b from private.provider_budgets where project_id = p_project_id and provider = p_provider;

  if p_command = 'set' then
    if jsonb_typeof(p_payload -> 'monthlyLimit') is distinct from 'number'
      or (p_payload ->> 'monthlyLimit') !~ '^[0-9]{1,9}$' or (p_payload ->> 'monthlyLimit')::bigint > 100000000 then
      raise exception 'Invalid monthly limit' using errcode = '22023';
    end if;
    select * into strict p from public.projects where id = p_project_id;
    insert into private.provider_budgets(project_id, organization_id, provider, monthly_limit, set_by)
      values (p.id, p.organization_id, p_provider, (p_payload ->> 'monthlyLimit')::integer, auth.uid())
      on conflict (project_id, provider) do update set monthly_limit = excluded.monthly_limit, set_by = excluded.set_by, set_at = now()
      returning * into b;

  elsif p_command = 'reserve' then
    if b.project_id is null then
      raise exception 'No budget defined for this provider' using errcode = '23514';
    end if;
    if jsonb_typeof(p_payload -> 'estimated') is distinct from 'number' or (p_payload ->> 'estimated') !~ '^[0-9]{1,9}$'
      or (p_payload ->> 'estimated')::bigint not between 1 and 100000000
      or coalesce(p_payload ->> 'operation', '') !~ '^[a-z][a-z0-9_]{0,63}$'
      or (p_payload ? 'reference' and coalesce(p_payload ->> 'reference', '') !~ '^[A-Za-z0-9_:.-]{1,120}$') then
      raise exception 'Invalid reservation' using errcode = '22023';
    end if;
    amount := (p_payload ->> 'estimated')::bigint;
    select coalesce(sum(case when state = 'SETTLED' then actual else estimated end), 0) into used
      from private.provider_spend
      where project_id = p_project_id and provider = p_provider and state in ('RESERVED', 'SETTLED') and reserved_at >= month_start;
    if used + amount > b.monthly_limit then
      raise exception 'Monthly budget exceeded' using errcode = '23514';
    end if;
    insert into private.provider_spend(project_id, organization_id, provider, operation, reference, estimated, state, reserved_by)
      values (b.project_id, b.organization_id, p_provider, p_payload ->> 'operation', p_payload ->> 'reference', amount, 'RESERVED', auth.uid())
      returning * into s;

  elsif p_command in ('settle', 'release') then
    if coalesce(p_payload ->> 'spendId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid spend reference' using errcode = '22023';
    end if;
    select * into s from private.provider_spend
      where id = (p_payload ->> 'spendId')::uuid and project_id = p_project_id and provider = p_provider;
    if s.id is null or s.state <> 'RESERVED' then
      raise exception 'No open reservation' using errcode = '22023';
    end if;
    if p_command = 'settle' then
      -- The real cost may exceed the estimate: it is recorded as reported, and it counts against
      -- the month, so later reservations see it. Nothing is hidden to stay under the limit.
      if jsonb_typeof(p_payload -> 'actual') is distinct from 'number' or (p_payload ->> 'actual') !~ '^[0-9]{1,9}$'
        or (p_payload ->> 'actual')::bigint > 100000000 then
        raise exception 'Invalid actual cost' using errcode = '22023';
      end if;
      update private.provider_spend set state = 'SETTLED', actual = (p_payload ->> 'actual')::integer, closed_at = now()
        where id = s.id returning * into s;
    else
      update private.provider_spend set state = 'RELEASED', closed_at = now() where id = s.id returning * into s;
    end if;
  end if;

  select coalesce(sum(case when state = 'SETTLED' then actual else estimated end), 0) into used
    from private.provider_spend
    where project_id = p_project_id and provider = p_provider and state in ('RESERVED', 'SETTLED') and reserved_at >= month_start;
  return jsonb_build_object(
    'provider', p_provider,
    'periodStart', month_start,
    'monthlyLimit', b.monthly_limit,
    'used', used,
    'available', case when b.project_id is null then null else greatest(b.monthly_limit - used, 0) end,
    'spend', case when s.id is null then null else jsonb_build_object('spendId', s.id, 'state', s.state,
      'operation', s.operation, 'estimated', s.estimated, 'actual', s.actual) end);
end;
$$;
drop index if exists private.provider_spend_idempotency;
alter table private.provider_spend drop column if exists idempotency_key;
alter table private.provider_budgets drop constraint if exists provider_budgets_blocked,
  drop column if exists blocked_at, drop column if exists blocked_reason, drop column if exists conversion;
