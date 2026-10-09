-- Spend controls on top of the budget ledger (20261010090000), after the owner's decision of
-- 09/10/2026: a variable-spend ceiling of 10 EUR per calendar month and project (a ceiling, not a
-- target). See docs/CONSUMO-Y-PRESUPUESTO.md.
--  * Retries never charge twice: a reservation may carry an idempotency key, unique per project
--    and provider while it is RESERVED or SETTLED; repeating it returns the same reservation.
--  * The reserved amount is the verifiable MAXIMUM cost of the call. A settlement above it is
--    recorded as reported (nothing is hidden) and blocks the provider for the project until the
--    owner reviews it and sets the limit again.
--  * The limit carries the documented conversion it came from (ceiling, tariff, exchange rate,
--    taxes and sources), so the monthly summary can show a cost without inventing one.
--  * `summary` returns the month's operations per project; there is no recharge or scheduling here.
alter table private.provider_spend add column idempotency_key text
  check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9_:.-]{8,120}$');
create unique index provider_spend_idempotency on private.provider_spend(project_id, provider, idempotency_key)
  where idempotency_key is not null and state in ('RESERVED', 'SETTLED');
alter table private.provider_budgets
  add column blocked_at timestamptz,
  add column blocked_reason text check (blocked_reason is null or blocked_reason in ('OVERRUN')),
  add column conversion jsonb check (conversion is null or (jsonb_typeof(conversion) = 'object' and pg_column_size(conversion) <= 4096)),
  add constraint provider_budgets_blocked check ((blocked_at is null) = (blocked_reason is null));

create or replace function private.provider_budget(
  p_project_id uuid, p_provider text, p_command text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b private.provider_budgets;
  s private.provider_spend;
  p public.projects;
  month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  period_start timestamptz;
  used bigint;
  amount bigint;
  replayed boolean := false;
  overrun boolean := false;
begin
  if auth.uid() is null or not private.has_project_role(p_project_id, array['owner']) then
    raise exception 'Provider budget access denied' using errcode = '42501';
  end if;
  if p_provider is null or p_provider not in ('openseo')
    or p_command is null or p_command not in ('get', 'set', 'reserve', 'settle', 'release', 'summary') then
    raise exception 'Invalid provider budget command' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('provider_budget:' || p_project_id::text || ':' || p_provider, 0));
  select * into b from private.provider_budgets where project_id = p_project_id and provider = p_provider;

  if p_command = 'summary' then
    if p_payload ? 'month' and coalesce(p_payload ->> 'month', '') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then
      raise exception 'Invalid month' using errcode = '22023';
    end if;
    period_start := case when p_payload ? 'month' then ((p_payload ->> 'month') || '-01')::timestamp at time zone 'UTC' else month_start end;
    return jsonb_build_object(
      'provider', p_provider,
      'periodStart', period_start,
      'monthlyLimit', b.monthly_limit,
      'conversion', b.conversion,
      'blocked', b.blocked_at is not null,
      'operations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'operation', g.operation, 'reserved', g.reserved, 'settled', g.settled, 'released', g.released,
          'credits', g.credits, 'overruns', g.overruns, 'references', g.refs) order by g.operation)
        from (
          select operation,
            count(*) filter (where state = 'RESERVED') reserved,
            count(*) filter (where state = 'SETTLED') settled,
            count(*) filter (where state = 'RELEASED') released,
            coalesce(sum(case when state = 'SETTLED' then actual when state = 'RESERVED' then estimated else 0 end), 0) credits,
            count(*) filter (where state = 'SETTLED' and actual > estimated) overruns,
            coalesce(jsonb_agg(distinct reference) filter (where reference is not null and state = 'SETTLED'), '[]'::jsonb) refs
          from private.provider_spend
          where project_id = p_project_id and provider = p_provider
            and reserved_at >= period_start and reserved_at < period_start + interval '1 month'
          group by operation
        ) g
      ), '[]'::jsonb));
  end if;

  if p_command = 'set' then
    if jsonb_typeof(p_payload -> 'monthlyLimit') is distinct from 'number'
      or (p_payload ->> 'monthlyLimit') !~ '^[0-9]{1,9}$' or (p_payload ->> 'monthlyLimit')::bigint > 100000000
      or (p_payload ? 'conversion' and (jsonb_typeof(p_payload -> 'conversion') is distinct from 'object'
        or pg_column_size(p_payload -> 'conversion') > 4096)) then
      raise exception 'Invalid monthly limit' using errcode = '22023';
    end if;
    select * into strict p from public.projects where id = p_project_id;
    -- Setting the limit again is the owner's explicit review: it clears an overrun block.
    insert into private.provider_budgets(project_id, organization_id, provider, monthly_limit, set_by, conversion)
      values (p.id, p.organization_id, p_provider, (p_payload ->> 'monthlyLimit')::integer, auth.uid(), p_payload -> 'conversion')
      on conflict (project_id, provider) do update set monthly_limit = excluded.monthly_limit, set_by = excluded.set_by,
        set_at = now(), conversion = excluded.conversion, blocked_at = null, blocked_reason = null
      returning * into b;

  elsif p_command = 'reserve' then
    if jsonb_typeof(p_payload -> 'estimated') is distinct from 'number' or (p_payload ->> 'estimated') !~ '^[0-9]{1,9}$'
      or (p_payload ->> 'estimated')::bigint not between 1 and 100000000
      or coalesce(p_payload ->> 'operation', '') !~ '^[a-z][a-z0-9_]{0,63}$'
      or (p_payload ? 'reference' and coalesce(p_payload ->> 'reference', '') !~ '^[A-Za-z0-9_:.-]{1,120}$')
      or (p_payload ? 'idempotencyKey' and coalesce(p_payload ->> 'idempotencyKey', '') !~ '^[A-Za-z0-9_:.-]{8,120}$') then
      raise exception 'Invalid reservation' using errcode = '22023';
    end if;
    if b.project_id is null then
      raise exception 'No budget defined for this provider' using errcode = '23514';
    end if;
    -- A retry with the same key gets the original reservation back, whatever its state: no new charge.
    if p_payload ? 'idempotencyKey' then
      select * into s from private.provider_spend
        where project_id = p_project_id and provider = p_provider and idempotency_key = p_payload ->> 'idempotencyKey'
          and state in ('RESERVED', 'SETTLED');
      if s.id is not null then
        if s.operation <> p_payload ->> 'operation' or s.estimated <> (p_payload ->> 'estimated')::integer then
          raise exception 'Idempotency key reused for a different call' using errcode = '22023';
        end if;
        replayed := true;
      end if;
    end if;
    if not replayed then
      if b.blocked_at is not null then
        raise exception 'Provider blocked for this project' using errcode = '23514';
      end if;
      amount := (p_payload ->> 'estimated')::bigint;
      select coalesce(sum(case when state = 'SETTLED' then actual else estimated end), 0) into used
        from private.provider_spend
        where project_id = p_project_id and provider = p_provider and state in ('RESERVED', 'SETTLED') and reserved_at >= month_start;
      if used + amount > b.monthly_limit then
        raise exception 'Monthly budget exceeded' using errcode = '23514';
      end if;
      insert into private.provider_spend(project_id, organization_id, provider, operation, reference, estimated, state, reserved_by, idempotency_key)
        values (b.project_id, b.organization_id, p_provider, p_payload ->> 'operation', p_payload ->> 'reference', amount, 'RESERVED', auth.uid(),
          p_payload ->> 'idempotencyKey')
        returning * into s;
    end if;

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
      if jsonb_typeof(p_payload -> 'actual') is distinct from 'number' or (p_payload ->> 'actual') !~ '^[0-9]{1,9}$'
        or (p_payload ->> 'actual')::bigint > 100000000 then
        raise exception 'Invalid actual cost' using errcode = '22023';
      end if;
      update private.provider_spend set state = 'SETTLED', actual = (p_payload ->> 'actual')::integer, closed_at = now()
        where id = s.id returning * into s;
      -- The reservation was supposed to be the maximum. Going over it means the cap is not
      -- verifiable: record the real cost and stop further reservations until the owner reviews.
      if s.actual > s.estimated then
        overrun := true;
        update private.provider_budgets set blocked_at = now(), blocked_reason = 'OVERRUN'
          where project_id = p_project_id and provider = p_provider returning * into b;
      end if;
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
    'blocked', b.blocked_at is not null,
    'spend', case when s.id is null then null else jsonb_build_object('spendId', s.id, 'state', s.state,
      'operation', s.operation, 'estimated', s.estimated, 'actual', s.actual, 'replayed', replayed, 'overrun', overrun) end);
end;
$$;
