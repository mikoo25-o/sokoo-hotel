-- SokoHotel core: enums, profiles, restaurants, memberships, join requests,
-- rate limiting and audit logging.
--
-- Money is stored as integer minor units (cents) in bigint columns named
-- *_minor. KSh 350.00 is stored as 35000. Never use floats for money.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('owner', 'manager', 'waiter', 'kitchen', 'cashier');
create type public.member_status as enum ('active', 'deactivated');
create type public.join_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.fulfilment_type as enum ('kitchen', 'waiter');
create type public.item_status as enum ('pending', 'preparing', 'ready', 'served', 'cancelled');
create type public.order_status as enum ('pending', 'preparing', 'ready', 'served', 'cancelled');
create type public.pay_status as enum ('unpaid', 'partial', 'paid');
create type public.payment_method as enum ('cash', 'mpesa');
create type public.payment_state as enum ('completed', 'reversed');
create type public.expense_category as enum
  ('stock', 'supplies', 'wages', 'rent', 'utilities', 'transport', 'repairs', 'other');
create type public.sub_status as enum
  ('trial', 'active', 'past_due', 'grace', 'suspended', 'cancelled');
create type public.location_kind as enum ('table', 'takeaway');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Returns null instead of raising when the text is not a UUID. Used by
-- storage policies, which read the restaurant id from the object path.
create or replace function public.safe_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (phone is null or char_length(phone) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 30), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Restaurants (the tenant)
-- ---------------------------------------------------------------------------
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  phone text check (phone is null or char_length(phone) <= 30),
  email text check (email is null or char_length(email) <= 160),
  address text check (address is null or char_length(address) <= 200),
  currency char(3) not null default 'KES',
  timezone text not null default 'Africa/Nairobi',
  receipt_header text check (receipt_header is null or char_length(receipt_header) <= 200),
  receipt_footer text check (receipt_footer is null or char_length(receipt_footer) <= 200),
  takeaway_enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  -- Null means the code is revoked. Format: SOKO + 6 unambiguous characters.
  join_code text unique
    check (join_code is null or join_code ~ '^SOKO[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger restaurants_touch before update on public.restaurants
  for each row execute function public.touch_updated_at();
alter table public.restaurants enable row level security;

-- ---------------------------------------------------------------------------
-- Memberships: who belongs to which restaurant, with which role
-- ---------------------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  status public.member_status not null default 'active',
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id) where status = 'active';
-- Exactly one owner per restaurant.
create unique index memberships_one_owner_idx on public.memberships (restaurant_id) where role = 'owner';
create trigger memberships_touch before update on public.memberships
  for each row execute function public.touch_updated_at();
alter table public.memberships enable row level security;

-- ---------------------------------------------------------------------------
-- Join requests: staff ask to join; a manager decides.
-- ---------------------------------------------------------------------------
create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  requested_role public.app_role check (requested_role is null or requested_role in ('waiter', 'kitchen', 'cashier')),
  message text check (message is null or char_length(message) <= 300),
  status public.join_status not null default 'pending',
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index join_requests_one_pending_idx
  on public.join_requests (restaurant_id, user_id) where status = 'pending';
create index join_requests_restaurant_idx on public.join_requests (restaurant_id, status);
create index join_requests_user_idx on public.join_requests (user_id);
alter table public.join_requests enable row level security;

-- ---------------------------------------------------------------------------
-- Rate limiting (called only by definer functions and the service role)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
alter table public.rate_limits enable row level security; -- no policies: deny all

-- Returns true while the caller is within the limit, false once exceeded.
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case
      when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
      else r.hits + 1
    end,
    window_start = case
      when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
      else r.window_start
    end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log. Rows are written only by definer functions and triggers.
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_restaurant_idx on public.audit_logs (restaurant_id, created_at desc);
alter table public.audit_logs enable row level security;

create or replace function public.write_audit(
  p_restaurant uuid,
  p_action text,
  p_entity text,
  p_entity_id text,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_logs (restaurant_id, actor_id, action, entity, entity_id, details)
  values (p_restaurant, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- Role helpers used by RLS policies and RPCs
-- ---------------------------------------------------------------------------
create or replace function public.is_member(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.restaurant_id = rid and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function public.has_role(rid uuid, roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.restaurant_id = rid
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any (roles)
  );
$$;

create or replace function public.is_manager(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(rid, array['owner', 'manager']::public.app_role[]);
$$;

create or replace function public.current_role_in(rid uuid)
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.memberships m
  where m.restaurant_id = rid and m.user_id = auth.uid() and m.status = 'active';
$$;

-- A user may read a profile if it is their own, or they manage a restaurant
-- the profile's owner belongs to (or has asked to join).
create or replace function public.can_view_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target = auth.uid()
  or exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.restaurant_id = mine.restaurant_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and mine.role in ('owner', 'manager')
      and theirs.user_id = target
  )
  or exists (
    select 1
    from public.join_requests jr
    join public.memberships mine on mine.restaurant_id = jr.restaurant_id
    where jr.user_id = target
      and mine.user_id = auth.uid()
      and mine.status = 'active'
      and mine.role in ('owner', 'manager')
  );
$$;
