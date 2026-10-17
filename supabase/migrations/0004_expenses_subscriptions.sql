-- Expenses and subscriptions.
-- Restaurant customer payments (0003) are completely separate from the
-- restaurant's own SokoHotel subscription below.

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 1000000000),
  category public.expense_category not null,
  expense_date date not null,
  description text not null check (char_length(description) between 1 and 200),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'mpesa', 'bank', 'other')),
  payment_reference text check (payment_reference is null or char_length(payment_reference) <= 60),
  receipt_path text check (receipt_path is null or char_length(receipt_path) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_by_name text not null default '',
  -- Expenses are never deleted. A correction voids the row with a reason.
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text check (void_reason is null or char_length(void_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_restaurant_date_idx on public.expenses (restaurant_id, expense_date desc);
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();
alter table public.expenses enable row level security;

create or replace function public.audit_expense_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(new.restaurant_id, 'expense_created', 'expense', new.id::text,
      jsonb_build_object('amount_minor', new.amount_minor, 'category', new.category));
  elsif old.voided_at is null and new.voided_at is not null then
    perform public.write_audit(new.restaurant_id, 'expense_voided', 'expense', new.id::text,
      jsonb_build_object('amount_minor', new.amount_minor, 'reason', new.void_reason));
  elsif (old.amount_minor, old.category, old.expense_date, old.description, old.payment_method, old.payment_reference)
     is distinct from
        (new.amount_minor, new.category, new.expense_date, new.description, new.payment_method, new.payment_reference) then
    perform public.write_audit(new.restaurant_id, 'expense_corrected', 'expense', new.id::text,
      jsonb_build_object(
        'before', jsonb_build_object('amount_minor', old.amount_minor, 'category', old.category,
          'expense_date', old.expense_date, 'description', old.description),
        'after', jsonb_build_object('amount_minor', new.amount_minor, 'category', new.category,
          'expense_date', new.expense_date, 'description', new.description)));
  end if;
  return new;
end;
$$;
create trigger expenses_audit after insert or update on public.expenses
  for each row execute function public.audit_expense_changes();

-- ---------------------------------------------------------------------------
-- Subscription plans (configurable by the platform operator) and each
-- restaurant's subscription. Plans start empty: no price is hard-coded.
-- ---------------------------------------------------------------------------
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  name text not null check (char_length(name) between 1 and 60),
  description text check (description is null or char_length(description) <= 300),
  price_minor bigint not null check (price_minor >= 0),
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  max_staff integer check (max_staff is null or max_staff > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.subscription_plans enable row level security;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants (id) on delete cascade,
  plan_id uuid references public.subscription_plans (id) on delete set null,
  status public.sub_status not null default 'trial',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  grace_days integer not null default 7 check (grace_days between 0 and 60),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();
alter table public.subscriptions enable row level security;

create or replace function public.audit_subscription_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status or new.plan_id is distinct from old.plan_id
     or new.current_period_end is distinct from old.current_period_end then
    perform public.write_audit(new.restaurant_id, 'subscription_changed', 'subscription', new.id::text,
      jsonb_build_object('old_status', old.status, 'new_status', new.status,
        'old_plan', old.plan_id, 'new_plan', new.plan_id, 'period_end', new.current_period_end));
  end if;
  return new;
end;
$$;
create trigger subscriptions_audit after update on public.subscriptions
  for each row execute function public.audit_subscription_changes();

-- What the subscription means right now. A lapsed trial or period first moves
-- to a grace window, then to suspended. Data is never deleted for non-payment.
create or replace function public.subscription_effective_status(rid uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.subscriptions;
  v_end timestamptz;
begin
  select * into s from public.subscriptions where restaurant_id = rid;
  if not found then
    return 'suspended';
  end if;
  if s.status in ('suspended', 'cancelled', 'past_due', 'grace') then
    return s.status::text;
  end if;
  v_end := case s.status when 'trial' then s.trial_ends_at else s.current_period_end end;
  if v_end is null or v_end >= now() then
    return s.status::text;
  end if;
  if now() < v_end + make_interval(days => s.grace_days) then
    return 'grace';
  end if;
  return 'suspended';
end;
$$;

-- Suspended and cancelled restaurants become read-only. They can still view
-- and export their data.
create or replace function public.restaurant_writable(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.subscription_effective_status(rid) in ('trial', 'active', 'past_due', 'grace');
$$;
