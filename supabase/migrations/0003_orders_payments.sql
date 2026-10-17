-- Orders, order items (with price and name snapshots), item status history
-- and payments. Orders and payments are written only through the RPC
-- functions in 0005 so every change is validated and audited.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  -- Public, unpredictable reference such as SH-261015-X7K9QM4D. The random
  -- part comes from the server's CSPRNG. The id above is never shown.
  reference text not null unique
    check (reference ~ '^SH-[0-9]{6}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  location_id uuid not null,
  location_name text not null,
  location_area text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  waiter_name text not null default '',
  status public.order_status not null default 'pending',
  payment_status public.pay_status not null default 'unpaid',
  guests integer check (guests is null or guests between 1 and 100),
  note text check (note is null or char_length(note) <= 300),
  total_minor bigint not null default 0 check (total_minor >= 0),
  amount_paid_minor bigint not null default 0 check (amount_paid_minor >= 0),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_paid_minor <= total_minor),
  unique (id, restaurant_id),
  unique (restaurant_id, idempotency_key),
  foreign key (location_id, restaurant_id) references public.service_locations (id, restaurant_id)
);
create index orders_restaurant_created_idx on public.orders (restaurant_id, created_at desc);
create index orders_restaurant_status_idx on public.orders (restaurant_id, status);
create index orders_restaurant_pay_idx on public.orders (restaurant_id, payment_status);
create index orders_creator_idx on public.orders (created_by, created_at desc);
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
alter table public.orders enable row level security;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  order_id uuid not null,
  menu_item_id uuid not null,
  -- Snapshots taken when the order was placed. Later menu edits never change
  -- historical bills.
  name_snapshot text not null,
  category_name text,
  unit_price_minor bigint not null check (unit_price_minor > 0),
  quantity integer not null check (quantity between 1 and 99),
  line_total_minor bigint generated always as (unit_price_minor * quantity) stored,
  fulfilment public.fulfilment_type not null,
  status public.item_status not null default 'pending',
  notes text check (notes is null or char_length(notes) <= 200),
  status_updated_at timestamptz not null default now(),
  status_updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (order_id, restaurant_id) references public.orders (id, restaurant_id) on delete cascade,
  foreign key (menu_item_id, restaurant_id) references public.menu_items (id, restaurant_id)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_restaurant_status_idx on public.order_items (restaurant_id, status);
alter table public.order_items enable row level security;

-- Every status change is kept, so overall order status never erases history.
create table public.order_item_events (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  from_status public.item_status,
  to_status public.item_status not null,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index order_item_events_item_idx on public.order_item_events (order_item_id);
alter table public.order_item_events enable row level security;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  order_id uuid not null,
  receipt_ref text not null unique
    check (receipt_ref ~ '^RC-[0-9]{6}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  amount_minor bigint not null check (amount_minor > 0),
  method public.payment_method not null,
  -- M-Pesa confirmation code typed in by the cashier (never a PIN).
  transaction_ref text check (transaction_ref is null or transaction_ref ~ '^[A-Z0-9]{10}$'),
  check (method <> 'mpesa' or transaction_ref is not null),
  -- True only after a manager has matched the code to the M-Pesa statement.
  reference_verified boolean not null default false,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  status public.payment_state not null default 'completed',
  cashier_id uuid references auth.users (id) on delete set null,
  cashier_name text not null default '',
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users (id) on delete set null,
  reversal_reason text check (reversal_reason is null or char_length(reversal_reason) <= 300),
  unique (restaurant_id, idempotency_key),
  foreign key (order_id, restaurant_id) references public.orders (id, restaurant_id)
);
-- The same M-Pesa code cannot be used to settle two bills.
create unique index payments_mpesa_ref_idx
  on public.payments (restaurant_id, transaction_ref)
  where method = 'mpesa' and status = 'completed';
create index payments_order_idx on public.payments (order_id);
create index payments_restaurant_created_idx on public.payments (restaurant_id, created_at desc);
alter table public.payments enable row level security;

-- ---------------------------------------------------------------------------
-- Overall order status is derived from item statuses.
-- ---------------------------------------------------------------------------
create or replace function public.derive_order_status(p_order uuid)
returns public.order_status
language plpgsql
stable
as $$
declare
  v_active integer;
  v_served integer;
  v_k_pending integer;
  v_k_preparing integer;
  v_k_done integer;
begin
  select
    count(*) filter (where status <> 'cancelled'),
    count(*) filter (where status = 'served'),
    count(*) filter (where fulfilment = 'kitchen' and status = 'pending'),
    count(*) filter (where fulfilment = 'kitchen' and status = 'preparing'),
    count(*) filter (where fulfilment = 'kitchen' and status in ('ready', 'served'))
  into v_active, v_served, v_k_pending, v_k_preparing, v_k_done
  from public.order_items where order_id = p_order;

  if v_active = 0 then return 'cancelled'; end if;
  if v_served = v_active then return 'served'; end if;
  -- Nothing left for the kitchen to do: waiting to be served.
  if v_k_pending + v_k_preparing = 0 then return 'ready'; end if;
  -- The kitchen has not started yet. Drinks the waiter already released do
  -- not count as kitchen progress.
  if v_k_preparing = 0 and v_k_done = 0 then return 'pending'; end if;
  return 'preparing';
end;
$$;

-- Recomputes total, status and payment status for one order.
create or replace function public.refresh_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_paid bigint;
begin
  select coalesce(sum(line_total_minor) filter (where status <> 'cancelled'), 0)
  into v_total from public.order_items where order_id = p_order;

  select coalesce(sum(amount_minor), 0) into v_paid
  from public.payments where order_id = p_order and status = 'completed';

  update public.orders set
    total_minor = v_total,
    amount_paid_minor = v_paid,
    status = public.derive_order_status(p_order),
    payment_status = case
      when v_paid = 0 then 'unpaid'::public.pay_status
      when v_paid >= v_total then 'paid'::public.pay_status
      else 'partial'::public.pay_status
    end
  where id = p_order;
end;
$$;
