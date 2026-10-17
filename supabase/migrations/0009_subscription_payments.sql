-- Paying for a SokoHotel subscription with M-Pesa STK push.
--
-- The restaurant's manager asks for a prompt on their own phone. Safaricom
-- tells the server when it is paid, and the server then extends the paid
-- period. These payments are separate from the restaurant's own customer
-- payments (0003).
--
-- Browsers can read their own restaurant's payments and can ask to START one.
-- Everything that marks a payment as paid runs with the service role only,
-- from the callback route on the server.

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  plan_id uuid references public.subscription_plans (id) on delete set null,
  periods integer not null default 1 check (periods between 1 and 12),
  amount_minor bigint not null check (amount_minor > 0),
  phone text not null check (phone ~ '^254[17][0-9]{8}$'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled', 'expired')),
  checkout_request_id text unique,
  merchant_request_id text,
  -- Unique, so the same M-Pesa payment can never extend a subscription twice.
  mpesa_receipt text unique,
  result_code integer,
  result_desc text check (result_desc is null or char_length(result_desc) <= 300),
  initiated_by uuid references auth.users (id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscription_payments_restaurant_idx on public.subscription_payments (restaurant_id, created_at desc);
create trigger subscription_payments_touch before update on public.subscription_payments
  for each row execute function public.touch_updated_at();
alter table public.subscription_payments enable row level security;

revoke all on public.subscription_payments from anon, authenticated;
grant select on public.subscription_payments to authenticated;
create policy subscription_payments_select on public.subscription_payments for select to authenticated
  using (public.is_manager(restaurant_id));

-- ---------------------------------------------------------------------------
-- Manager asks to pay. Creates a pending row; the amount comes from the plan
-- in the database, never from the browser.
-- ---------------------------------------------------------------------------
create or replace function public.start_subscription_payment(p_restaurant uuid, p_plan uuid, p_phone text, p_periods integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pl public.subscription_plans;
  v_amount bigint;
  v_id uuid;
  v_max integer;
begin
  if not public.is_manager(p_restaurant) then raise exception 'forbidden'; end if;
  select * into pl from public.subscription_plans where id = p_plan and is_active;
  if not found then raise exception 'not_found'; end if;
  -- (computed first: PL/pgSQL would read the CASE's own THEN as the end of the IF condition)
  v_max := case pl.billing_interval when 'year' then 3 else 12 end;
  if p_periods is null or p_periods < 1 or p_periods > v_max then
    raise exception 'invalid_quantity';
  end if;
  if p_phone is null or p_phone !~ '^254[17][0-9]{8}$' then raise exception 'invalid_phone'; end if;
  v_amount := pl.price_minor * p_periods;
  -- M-Pesa charges whole shillings only, and a free plan has nothing to pay.
  if v_amount <= 0 or v_amount % 100 <> 0 then raise exception 'invalid_amount'; end if;

  -- Prompts that were never answered stop counting as "in progress".
  update public.subscription_payments set status = 'expired', result_desc = 'No response from the phone'
    where restaurant_id = p_restaurant and status = 'pending' and created_at < now() - interval '10 minutes';
  if exists (select 1 from public.subscription_payments
             where restaurant_id = p_restaurant and status = 'pending' and created_at > now() - interval '2 minutes') then
    raise exception 'payment_in_progress';
  end if;
  if (select count(*) from public.subscription_payments
      where restaurant_id = p_restaurant and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited';
  end if;

  insert into public.subscription_payments (restaurant_id, plan_id, periods, amount_minor, phone, initiated_by)
  values (p_restaurant, p_plan, p_periods, v_amount, p_phone, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'amount_minor', v_amount);
end;
$$;

-- ---------------------------------------------------------------------------
-- Service role only: used by the server after talking to Safaricom.
-- ---------------------------------------------------------------------------
create or replace function public.record_stk_initiated(p_payment uuid, p_checkout text, p_merchant text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.subscription_payments
    set checkout_request_id = p_checkout, merchant_request_id = p_merchant
    where id = p_payment and status = 'pending' and checkout_request_id is null;
$$;

create or replace function public.fail_subscription_payment(p_payment uuid, p_desc text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.subscription_payments
    set status = 'failed', result_desc = left(coalesce(p_desc, 'Could not start the payment'), 300)
    where id = p_payment and status = 'pending';
$$;

-- Applies the outcome of a prompt exactly once. Returns:
--   applied | duplicate | failed | amount_mismatch | unknown
create or replace function public.apply_subscription_payment(
  p_checkout text, p_result_code integer, p_result_desc text, p_receipt text, p_amount_minor bigint
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  pay public.subscription_payments;
  pl public.subscription_plans;
  sub public.subscriptions;
  v_base timestamptz;
  v_end timestamptz;
begin
  select * into pay from public.subscription_payments where checkout_request_id = p_checkout for update;
  if not found then return 'unknown'; end if;
  -- A repeated callback or a second poll changes nothing.
  if pay.status <> 'pending' then return 'duplicate'; end if;

  if p_result_code is distinct from 0 then
    update public.subscription_payments
      set status = case p_result_code when 1032 then 'cancelled' when 1037 then 'expired' else 'failed' end,
          result_code = p_result_code, result_desc = left(p_result_desc, 300)
      where id = pay.id;
    return 'failed';
  end if;

  -- The amount Safaricom reports must be what we asked for.
  if p_amount_minor is not null and p_amount_minor <> pay.amount_minor then
    update public.subscription_payments
      set status = 'failed', result_code = p_result_code, result_desc = 'amount_mismatch'
      where id = pay.id;
    perform public.write_audit(pay.restaurant_id, 'subscription_payment_mismatch', 'subscription_payment', pay.id::text,
      jsonb_build_object('expected_minor', pay.amount_minor, 'received_minor', p_amount_minor, 'receipt', p_receipt));
    return 'amount_mismatch';
  end if;

  select * into pl from public.subscription_plans where id = pay.plan_id;
  select * into sub from public.subscriptions where restaurant_id = pay.restaurant_id for update;

  -- Paying early adds to the time left, it never throws it away.
  v_base := greatest(
    now(),
    coalesce(sub.current_period_end, now()),
    case when sub.status = 'trial' then coalesce(sub.trial_ends_at, now()) else now() end
  );
  v_end := v_base + case coalesce(pl.billing_interval, 'month')
    when 'year' then make_interval(years => pay.periods)
    else make_interval(months => pay.periods)
  end;

  update public.subscriptions
    set status = 'active', plan_id = pay.plan_id, current_period_end = v_end
    where restaurant_id = pay.restaurant_id;

  update public.subscription_payments
    set status = 'paid', mpesa_receipt = p_receipt, paid_at = now(), result_code = 0, result_desc = left(p_result_desc, 300)
    where id = pay.id;

  perform public.write_audit(pay.restaurant_id, 'subscription_payment', 'subscription_payment', pay.id::text,
    jsonb_build_object('amount_minor', pay.amount_minor, 'periods', pay.periods, 'receipt', p_receipt, 'paid_until', v_end));
  return 'applied';
end;
$$;

revoke execute on function
  public.start_subscription_payment(uuid, uuid, text, integer),
  public.record_stk_initiated(uuid, text, text),
  public.fail_subscription_payment(uuid, text),
  public.apply_subscription_payment(text, integer, text, text, bigint)
from public, anon, authenticated;

grant execute on function public.start_subscription_payment(uuid, uuid, text, integer) to authenticated;
grant execute on function
  public.record_stk_initiated(uuid, text, text),
  public.fail_subscription_payment(uuid, text),
  public.apply_subscription_payment(text, integer, text, text, bigint)
to service_role;
