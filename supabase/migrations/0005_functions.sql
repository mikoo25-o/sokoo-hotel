-- RPC functions. Every function that changes data:
--   * reads the caller from auth.uid() (never from a parameter),
--   * checks the caller's active membership and role in the restaurant,
--   * checks the restaurant subscription allows writes,
--   * runs in one transaction, so related changes succeed or fail together.
-- Errors are raised as short stable codes (for example 'forbidden') that the
-- Next.js server actions translate into user-friendly messages.

-- ---------------------------------------------------------------------------
-- Restaurants and staff
-- ---------------------------------------------------------------------------
create or replace function public.create_restaurant(
  p_name text,
  p_phone text,
  p_address text,
  p_join_code text,
  p_takeaway boolean,
  p_trial_days integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.rate_limit_hit('create_restaurant:' || v_uid::text, 5, 86400) then
    raise exception 'rate_limited';
  end if;

  insert into public.restaurants (name, phone, address, join_code, takeaway_enabled, created_by)
  values (trim(p_name), nullif(trim(p_phone), ''), nullif(trim(p_address), ''), p_join_code,
          coalesce(p_takeaway, true), v_uid)
  returning id into v_id;

  insert into public.memberships (restaurant_id, user_id, role, status, approved_by)
  values (v_id, v_uid, 'owner', 'active', v_uid);

  insert into public.subscriptions (restaurant_id, status, trial_ends_at)
  values (v_id, 'trial', now() + make_interval(days => greatest(coalesce(p_trial_days, 14), 0)));

  if coalesce(p_takeaway, true) then
    insert into public.service_locations (restaurant_id, name, area, kind, sort_order)
    values (v_id, 'Takeaway', 'Takeaway', 'takeaway', 1000);
  end if;

  perform public.write_audit(v_id, 'restaurant_created', 'restaurant', v_id::text, '{}'::jsonb);
  return v_id;
end;
$$;

create or replace function public.get_join_code(p_restaurant uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_manager(p_restaurant) then raise exception 'forbidden'; end if;
  select join_code into v_code from public.restaurants where id = p_restaurant;
  return v_code;
end;
$$;

create or replace function public.rotate_join_code(p_restaurant uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_manager(p_restaurant) then raise exception 'forbidden'; end if;
  if not public.restaurant_writable(p_restaurant) then raise exception 'subscription_inactive'; end if;
  update public.restaurants set join_code = p_code where id = p_restaurant;
  perform public.write_audit(p_restaurant, 'join_code_rotated', 'restaurant', p_restaurant::text, '{}'::jsonb);
  return p_code;
end;
$$;

create or replace function public.revoke_join_code(p_restaurant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_manager(p_restaurant) then raise exception 'forbidden'; end if;
  update public.restaurants set join_code = null where id = p_restaurant;
  perform public.write_audit(p_restaurant, 'join_code_revoked', 'restaurant', p_restaurant::text, '{}'::jsonb);
end;
$$;

-- Submitting a code only creates a pending request. It reveals nothing about
-- the restaurant and grants no access until a manager approves.
--
-- Failures are RETURNED as a status text instead of raised. A raised error
-- would roll back the rate-limit counter in the same transaction, letting an
-- attacker guess codes without ever being counted.
-- Returns: pending | invalid_code | already_member | access_revoked |
--          already_pending | rate_limited
create or replace function public.request_join(p_code text, p_message text default null, p_role public.app_role default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r public.restaurants;
  m public.memberships;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.rate_limit_hit('join:' || v_uid::text, 10, 900) then
    return 'rate_limited';
  end if;

  select * into r from public.restaurants where join_code = upper(trim(coalesce(p_code, '')));
  if not found then return 'invalid_code'; end if;

  select * into m from public.memberships where restaurant_id = r.id and user_id = v_uid;
  if found then
    if m.status = 'active' then return 'already_member'; end if;
    return 'access_revoked';
  end if;

  if exists (select 1 from public.join_requests
             where restaurant_id = r.id and user_id = v_uid and status = 'pending') then
    return 'already_pending';
  end if;

  insert into public.join_requests (restaurant_id, user_id, requested_role, message)
  values (r.id, v_uid,
          case when p_role in ('waiter', 'kitchen', 'cashier') then p_role else null end,
          nullif(left(trim(coalesce(p_message, '')), 300), ''));
  return 'pending';
end;
$$;

create or replace function public.decide_join_request(p_request uuid, p_approve boolean, p_role public.app_role default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  jr public.join_requests;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into jr from public.join_requests where id = p_request for update;
  if not found then raise exception 'not_found'; end if;
  if not public.is_manager(jr.restaurant_id) then raise exception 'forbidden'; end if;
  if not public.restaurant_writable(jr.restaurant_id) then raise exception 'subscription_inactive'; end if;
  if jr.status <> 'pending' then raise exception 'already_decided'; end if;

  if p_approve then
    if p_role is null or p_role = 'owner' then raise exception 'invalid_role'; end if;
    -- Only the owner can hand out manager access.
    if p_role = 'manager' and not public.has_role(jr.restaurant_id, array['owner']::public.app_role[]) then
      raise exception 'forbidden';
    end if;
    insert into public.memberships (restaurant_id, user_id, role, status, approved_by)
    values (jr.restaurant_id, jr.user_id, p_role, 'active', v_uid)
    on conflict (restaurant_id, user_id)
    do update set role = excluded.role, status = 'active', approved_by = v_uid;
    update public.join_requests
      set status = 'approved', decided_by = v_uid, decided_at = now() where id = p_request;
    perform public.write_audit(jr.restaurant_id, 'join_approved', 'membership', jr.user_id::text,
      jsonb_build_object('role', p_role));
  else
    update public.join_requests
      set status = 'rejected', decided_by = v_uid, decided_at = now() where id = p_request;
    perform public.write_audit(jr.restaurant_id, 'join_rejected', 'join_request', p_request::text, '{}'::jsonb);
  end if;
end;
$$;

create or replace function public.set_member_role(p_membership uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t public.memberships;
  v_is_owner boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into t from public.memberships where id = p_membership for update;
  if not found then raise exception 'not_found'; end if;
  if not public.is_manager(t.restaurant_id) then raise exception 'forbidden'; end if;
  if not public.restaurant_writable(t.restaurant_id) then raise exception 'subscription_inactive'; end if;
  if t.user_id = v_uid then raise exception 'cannot_change_self'; end if;
  if t.role = 'owner' or p_role = 'owner' then raise exception 'invalid_role'; end if;
  v_is_owner := public.has_role(t.restaurant_id, array['owner']::public.app_role[]);
  if (p_role = 'manager' or t.role = 'manager') and not v_is_owner then raise exception 'forbidden'; end if;

  update public.memberships set role = p_role where id = p_membership;
  perform public.write_audit(t.restaurant_id, 'role_changed', 'membership', t.user_id::text,
    jsonb_build_object('old_role', t.role, 'new_role', p_role));
end;
$$;

create or replace function public.set_member_active(p_membership uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t public.memberships;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into t from public.memberships where id = p_membership for update;
  if not found then raise exception 'not_found'; end if;
  if not public.is_manager(t.restaurant_id) then raise exception 'forbidden'; end if;
  if not public.restaurant_writable(t.restaurant_id) then raise exception 'subscription_inactive'; end if;
  if t.user_id = v_uid or t.role = 'owner' then raise exception 'invalid_role'; end if;
  if t.role = 'manager' and not public.has_role(t.restaurant_id, array['owner']::public.app_role[]) then
    raise exception 'forbidden';
  end if;

  update public.memberships
    set status = case when p_active then 'active'::public.member_status else 'deactivated'::public.member_status end
    where id = p_membership;
  perform public.write_audit(t.restaurant_id,
    case when p_active then 'member_reactivated' else 'member_deactivated' end,
    'membership', t.user_id::text, jsonb_build_object('role', t.role));
end;
$$;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_restaurant uuid,
  p_reference text,
  p_location uuid,
  p_items jsonb,
  p_idempotency text,
  p_note text default null,
  p_guests integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.orders;
  v_loc public.service_locations;
  v_order uuid;
  v_name text;
  v_total bigint;
  e jsonb;
  mi public.menu_items;
  v_qty integer;
  v_cat text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.has_role(p_restaurant, array['owner', 'manager', 'waiter']::public.app_role[]) then
    raise exception 'forbidden';
  end if;
  if not public.restaurant_writable(p_restaurant) then raise exception 'subscription_inactive'; end if;

  -- Idempotency: a retry of the same submission returns the first order.
  select * into v_existing from public.orders
    where restaurant_id = p_restaurant and idempotency_key = p_idempotency;
  if found then
    if v_existing.created_by is distinct from v_uid then raise exception 'forbidden'; end if;
    return jsonb_build_object('id', v_existing.id, 'reference', v_existing.reference,
      'total_minor', v_existing.total_minor, 'duplicate', true);
  end if;

  select * into v_loc from public.service_locations
    where id = p_location and restaurant_id = p_restaurant and is_active;
  if not found then raise exception 'invalid_location'; end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order';
  end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'too_many_items'; end if;

  select coalesce(nullif(trim(full_name), ''), 'Staff') into v_name from public.profiles where id = v_uid;
  v_name := coalesce(v_name, 'Staff');

  insert into public.orders
    (restaurant_id, reference, location_id, location_name, location_area, created_by, waiter_name,
     guests, note, idempotency_key)
  values
    (p_restaurant, p_reference, v_loc.id, v_loc.name, v_loc.area, v_uid, v_name,
     p_guests, nullif(left(trim(coalesce(p_note, '')), 300), ''), p_idempotency)
  returning id into v_order;

  for e in select * from jsonb_array_elements(p_items) loop
    mi := null;
    begin
      v_qty := (e ->> 'quantity')::integer;
      select * into mi from public.menu_items
        where id = (e ->> 'menu_item_id')::uuid and restaurant_id = p_restaurant;
    exception when others then
      raise exception 'invalid_item';
    end;
    if mi.id is null or not mi.is_active or not mi.is_available then
      raise exception 'item_unavailable';
    end if;
    if v_qty is null or v_qty < 1 or v_qty > 99 then raise exception 'invalid_quantity'; end if;

    select name into v_cat from public.menu_categories where id = mi.category_id;

    -- Price, name and fulfilment come from the database, never from the client.
    insert into public.order_items
      (restaurant_id, order_id, menu_item_id, name_snapshot, category_name, unit_price_minor,
       quantity, fulfilment, status, notes, status_updated_by)
    values
      (p_restaurant, v_order, mi.id, mi.name, v_cat, mi.price_minor, v_qty, mi.fulfilment,
       case when mi.fulfilment = 'waiter' then 'ready'::public.item_status else 'pending'::public.item_status end,
       nullif(left(trim(coalesce(e ->> 'note', '')), 200), ''), v_uid);
  end loop;

  insert into public.order_item_events (restaurant_id, order_item_id, from_status, to_status, actor_id)
  select restaurant_id, id, null, status, v_uid from public.order_items where order_id = v_order;

  perform public.refresh_order(v_order);
  select total_minor into v_total from public.orders where id = v_order;

  return jsonb_build_object('id', v_order, 'reference', p_reference, 'total_minor', v_total, 'duplicate', false);
end;
$$;

-- Moves one item along its workflow. Kitchen staff handle kitchen items
-- (pending -> preparing -> ready); waiters release and serve; the item must
-- be ready before it can be served. Returns true when something changed.
create or replace function public.set_item_status(p_item uuid, p_to public.item_status)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  it public.order_items;
  o public.orders;
  v_role public.app_role;
  v_ok boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into it from public.order_items where id = p_item for update;
  if not found then raise exception 'not_found'; end if;
  select * into o from public.orders where id = it.order_id;
  v_role := public.current_role_in(o.restaurant_id);
  -- Cashiers have no part in fulfilment.
  if v_role is null or v_role = 'cashier' then raise exception 'forbidden'; end if;
  if not public.restaurant_writable(o.restaurant_id) then raise exception 'subscription_inactive'; end if;
  if it.status = p_to then return false; end if;

  v_ok := case
    when it.fulfilment = 'kitchen' and v_role in ('kitchen', 'manager', 'owner') and (
         (it.status = 'pending' and p_to = 'preparing')
      or (it.status = 'preparing' and p_to = 'ready')
      or (it.status = 'preparing' and p_to = 'pending')
      or (it.status = 'ready' and p_to = 'preparing')) then true
    when it.status = 'ready' and p_to = 'served'
         and (v_role in ('manager', 'owner') or (v_role = 'waiter' and o.created_by = v_uid)) then true
    when p_to = 'cancelled'
         and (v_role in ('manager', 'owner') or (v_role = 'waiter' and o.created_by = v_uid))
         and ((it.fulfilment = 'kitchen' and it.status = 'pending')
           or (it.fulfilment = 'waiter' and it.status = 'ready')) then true
    else false end;
  if not v_ok then raise exception 'invalid_transition'; end if;
  if p_to = 'cancelled' and o.amount_paid_minor > 0 then raise exception 'order_has_payments'; end if;

  update public.order_items
    set status = p_to, status_updated_at = now(), status_updated_by = v_uid
    where id = p_item;
  insert into public.order_item_events (restaurant_id, order_item_id, from_status, to_status, actor_id)
  values (o.restaurant_id, p_item, it.status, p_to, v_uid);
  if p_to = 'cancelled' then
    perform public.write_audit(o.restaurant_id, 'order_item_cancelled', 'order', o.id::text,
      jsonb_build_object('reference', o.reference, 'item', it.name_snapshot, 'quantity', it.quantity));
  end if;
  perform public.refresh_order(it.order_id);
  return true;
end;
$$;

-- Applies one transition to every eligible item of an order, for example
-- "mark all kitchen items as preparing" or "serve everything that is ready".
create or replace function public.bulk_set_items_status(p_order uuid, p_to public.item_status)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  o public.orders;
  r record;
  v_count integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into o from public.orders where id = p_order;
  if not found then raise exception 'not_found'; end if;
  if public.current_role_in(o.restaurant_id) is null then raise exception 'forbidden'; end if;
  if p_to not in ('preparing', 'ready', 'served') then raise exception 'invalid_transition'; end if;

  for r in
    select id from public.order_items
    where order_id = p_order
      and ((p_to = 'preparing' and fulfilment = 'kitchen' and status = 'pending')
        or (p_to = 'ready' and fulfilment = 'kitchen' and status = 'preparing')
        or (p_to = 'served' and status = 'ready'))
    order by created_at
  loop
    if public.set_item_status(r.id, p_to) then v_count := v_count + 1; end if;
  end loop;

  if v_count = 0 then raise exception 'invalid_transition'; end if;
  return v_count;
end;
$$;

-- Ids of locations that currently have an unfinished order. No order
-- contents are exposed, so waiters can see which tables are busy.
create or replace function public.occupied_locations(p_restaurant uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct o.location_id
  from public.orders o
  where public.is_member(p_restaurant)
    and o.restaurant_id = p_restaurant
    and o.status <> 'cancelled'
    and not (o.status = 'served' and o.payment_status = 'paid');
$$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(
  p_order uuid,
  p_amount bigint,
  p_method public.payment_method,
  p_txn_ref text,
  p_receipt_ref text,
  p_idempotency text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  o public.orders;
  v_existing public.payments;
  v_pay uuid;
  v_name text;
  v_ref text;
  v_balance bigint;
  v_paid bigint;
  v_status public.pay_status;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;
  if not public.has_role(o.restaurant_id, array['owner', 'manager', 'cashier']::public.app_role[]) then
    raise exception 'forbidden';
  end if;
  if not public.restaurant_writable(o.restaurant_id) then raise exception 'subscription_inactive'; end if;

  select * into v_existing from public.payments
    where restaurant_id = o.restaurant_id and idempotency_key = p_idempotency;
  if found then
    select amount_paid_minor, payment_status into v_paid, v_status from public.orders where id = p_order;
    return jsonb_build_object('payment_id', v_existing.id, 'receipt_ref', v_existing.receipt_ref,
      'amount_paid_minor', v_paid, 'balance_minor', o.total_minor - v_paid,
      'payment_status', v_status, 'duplicate', true);
  end if;

  if o.status = 'cancelled' then raise exception 'order_cancelled'; end if;
  v_balance := o.total_minor - o.amount_paid_minor;
  if v_balance <= 0 then raise exception 'already_paid'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_amount > v_balance then raise exception 'overpayment'; end if;

  v_ref := case when p_method = 'mpesa' then upper(trim(coalesce(p_txn_ref, ''))) else null end;
  if p_method = 'mpesa' then
    if v_ref !~ '^[A-Z0-9]{10}$' then raise exception 'invalid_transaction_ref'; end if;
    if exists (select 1 from public.payments
               where restaurant_id = o.restaurant_id and method = 'mpesa'
                 and transaction_ref = v_ref and status = 'completed') then
      raise exception 'duplicate_transaction_ref';
    end if;
  end if;

  select coalesce(nullif(trim(full_name), ''), 'Staff') into v_name from public.profiles where id = v_uid;
  v_name := coalesce(v_name, 'Staff');

  insert into public.payments
    (restaurant_id, order_id, receipt_ref, amount_minor, method, transaction_ref, cashier_id,
     cashier_name, idempotency_key)
  values
    (o.restaurant_id, p_order, p_receipt_ref, p_amount, p_method, v_ref, v_uid, v_name, p_idempotency)
  returning id into v_pay;

  perform public.refresh_order(p_order);
  perform public.write_audit(o.restaurant_id, 'payment_recorded', 'payment', v_pay::text,
    jsonb_build_object('reference', o.reference, 'amount_minor', p_amount, 'method', p_method));

  select amount_paid_minor, payment_status, total_minor into v_paid, v_status, v_balance
    from public.orders where id = p_order;
  return jsonb_build_object('payment_id', v_pay, 'receipt_ref', p_receipt_ref,
    'amount_paid_minor', v_paid, 'balance_minor', v_balance - v_paid,
    'payment_status', v_status, 'duplicate', false);
end;
$$;

-- Payments are never deleted. A correction reverses the payment, keeping the
-- original row, who reversed it and why.
create or replace function public.reverse_payment(p_payment uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  p public.payments;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into p from public.payments where id = p_payment for update;
  if not found then raise exception 'not_found'; end if;
  if not public.is_manager(p.restaurant_id) then raise exception 'forbidden'; end if;
  if not public.restaurant_writable(p.restaurant_id) then raise exception 'subscription_inactive'; end if;
  if p.status <> 'completed' then raise exception 'already_reversed'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;

  perform 1 from public.orders where id = p.order_id for update;
  update public.payments
    set status = 'reversed', reversed_at = now(), reversed_by = v_uid,
        reversal_reason = left(trim(p_reason), 300)
    where id = p_payment;
  perform public.refresh_order(p.order_id);
  perform public.write_audit(p.restaurant_id, 'payment_reversed', 'payment', p_payment::text,
    jsonb_build_object('receipt_ref', p.receipt_ref, 'amount_minor', p.amount_minor, 'reason', left(trim(p_reason), 300)));
end;
$$;

-- A manager marks an M-Pesa code as matched against the M-Pesa statement.
create or replace function public.verify_payment_reference(p_payment uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  p public.payments;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into p from public.payments where id = p_payment for update;
  if not found then raise exception 'not_found'; end if;
  if not public.is_manager(p.restaurant_id) then raise exception 'forbidden'; end if;
  if p.method <> 'mpesa' or p.status <> 'completed' then raise exception 'invalid_transition'; end if;
  update public.payments
    set reference_verified = true, verified_by = v_uid, verified_at = now()
    where id = p_payment;
  perform public.write_audit(p.restaurant_id, 'payment_reference_verified', 'payment', p_payment::text,
    jsonb_build_object('receipt_ref', p.receipt_ref));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting (manager only). All figures come from real rows.
-- ---------------------------------------------------------------------------
create or replace function public.report_summary(p_restaurant uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tz text;
  t0 timestamptz;
  t1 timestamptz;
  pt0 timestamptz;
  span integer;
  v_sales bigint; v_orders bigint; v_collected bigint; v_expenses bigint;
  q_sales bigint; q_orders bigint; q_collected bigint; q_expenses bigint;
  v_recv bigint; v_recv_count bigint;
  by_method jsonb; daily jsonb; top_items jsonb; by_cat jsonb;
begin
  if not public.is_manager(p_restaurant) then raise exception 'forbidden'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid_range';
  end if;
  select timezone into tz from public.restaurants where id = p_restaurant;
  span := (p_to - p_from) + 1;
  t0 := p_from::timestamp at time zone tz;
  t1 := (p_to + 1)::timestamp at time zone tz;
  pt0 := (p_from - span)::timestamp at time zone tz;

  select coalesce(sum(total_minor), 0), count(*) into v_sales, v_orders
    from public.orders where restaurant_id = p_restaurant and status <> 'cancelled'
      and created_at >= t0 and created_at < t1;
  select coalesce(sum(total_minor), 0), count(*) into q_sales, q_orders
    from public.orders where restaurant_id = p_restaurant and status <> 'cancelled'
      and created_at >= pt0 and created_at < t0;

  select coalesce(sum(amount_minor), 0) into v_collected
    from public.payments where restaurant_id = p_restaurant and status = 'completed'
      and created_at >= t0 and created_at < t1;
  select coalesce(sum(amount_minor), 0) into q_collected
    from public.payments where restaurant_id = p_restaurant and status = 'completed'
      and created_at >= pt0 and created_at < t0;

  select coalesce(sum(amount_minor), 0) into v_expenses
    from public.expenses where restaurant_id = p_restaurant and voided_at is null
      and expense_date between p_from and p_to;
  select coalesce(sum(amount_minor), 0) into q_expenses
    from public.expenses where restaurant_id = p_restaurant and voided_at is null
      and expense_date between p_from - span and p_from - 1;

  -- Receivables are what is owed right now, regardless of the report range.
  select coalesce(sum(total_minor - amount_paid_minor), 0), count(*) into v_recv, v_recv_count
    from public.orders where restaurant_id = p_restaurant and status <> 'cancelled'
      and payment_status <> 'paid' and total_minor > 0;

  select coalesce(jsonb_object_agg(method, total), '{}'::jsonb) into by_method
    from (select method, sum(amount_minor) as total from public.payments
          where restaurant_id = p_restaurant and status = 'completed'
            and created_at >= t0 and created_at < t1 group by method) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'date', (p_from + n), 'sales_minor', coalesce(o.s, 0), 'collected_minor', coalesce(p.c, 0))
           order by n), '[]'::jsonb) into daily
    from generate_series(0, span - 1) as n
    left join (select (created_at at time zone tz)::date as dd, sum(total_minor) as s
               from public.orders where restaurant_id = p_restaurant and status <> 'cancelled'
                 and created_at >= t0 and created_at < t1 group by 1) o on o.dd = p_from + n
    left join (select (created_at at time zone tz)::date as dd, sum(amount_minor) as c
               from public.payments where restaurant_id = p_restaurant and status = 'completed'
                 and created_at >= t0 and created_at < t1 group by 1) p on p.dd = p_from + n;

  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'quantity', qty, 'revenue_minor', rev)
           order by qty desc, name), '[]'::jsonb) into top_items
    from (select oi.name_snapshot as name, sum(oi.quantity) as qty, sum(oi.line_total_minor) as rev
          from public.order_items oi join public.orders o on o.id = oi.order_id
          where oi.restaurant_id = p_restaurant and oi.status <> 'cancelled' and o.status <> 'cancelled'
            and o.created_at >= t0 and o.created_at < t1
          group by oi.name_snapshot order by sum(oi.quantity) desc, oi.name_snapshot limit 10) s;

  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'sales_minor', rev) order by rev desc, name),
           '[]'::jsonb) into by_cat
    from (select coalesce(oi.category_name, 'Uncategorised') as name, sum(oi.line_total_minor) as rev
          from public.order_items oi join public.orders o on o.id = oi.order_id
          where oi.restaurant_id = p_restaurant and oi.status <> 'cancelled' and o.status <> 'cancelled'
            and o.created_at >= t0 and o.created_at < t1
          group by coalesce(oi.category_name, 'Uncategorised')) s;

  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'sales_minor', v_sales, 'orders_count', v_orders,
    'collected_minor', v_collected, 'collected_by_method', by_method,
    'expenses_minor', v_expenses,
    -- Sales minus recorded expenses. Not true profit: stock cost is not tracked.
    'estimated_profit_minor', v_sales - v_expenses,
    'receivable_minor', v_recv, 'receivable_count', v_recv_count,
    'previous', jsonb_build_object('sales_minor', q_sales, 'orders_count', q_orders,
      'collected_minor', q_collected, 'expenses_minor', q_expenses),
    'daily', daily, 'top_items', top_items, 'by_category', by_cat);
end;
$$;

create or replace function public.recent_activity(p_restaurant uuid, p_limit integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 30);
begin
  if not public.is_manager(p_restaurant) then raise exception 'forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('type', t, 'at', ts, 'amount_minor', amt, 'label', lbl, 'detail', det)
             order by ts desc)
    from (
      select * from (
        select 'payment'::text as t, p.created_at as ts, p.amount_minor as amt,
               o.reference as lbl, p.method::text as det
          from public.payments p join public.orders o on o.id = p.order_id
          where p.restaurant_id = p_restaurant and p.status = 'completed'
        union all
        select 'order', o.created_at, o.total_minor, o.reference, o.location_name
          from public.orders o where o.restaurant_id = p_restaurant and o.status <> 'cancelled'
        union all
        select 'expense', e.created_at, e.amount_minor, e.description, e.category::text
          from public.expenses e where e.restaurant_id = p_restaurant and e.voided_at is null
      ) u order by ts desc limit v_limit
    ) s
  ), '[]'::jsonb);
end;
$$;

-- Records that a manager exported data (CSV downloads).
create or replace function public.log_export(p_restaurant uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_manager(p_restaurant) then raise exception 'forbidden'; end if;
  perform public.write_audit(p_restaurant, 'data_exported', 'export', p_kind, '{}'::jsonb);
end;
$$;
