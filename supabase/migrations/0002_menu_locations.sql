-- Menu categories, menu items and service locations (tables, takeaway).
-- Composite (id, restaurant_id) keys let child tables prove they belong to
-- the same restaurant as their parent, so cross-tenant references are
-- impossible even through a bug.

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id)
);
create unique index menu_categories_name_idx on public.menu_categories (restaurant_id, lower(name));
create trigger menu_categories_touch before update on public.menu_categories
  for each row execute function public.touch_updated_at();
alter table public.menu_categories enable row level security;

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  category_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  price_minor bigint not null check (price_minor > 0 and price_minor <= 100000000),
  image_path text check (image_path is null or char_length(image_path) <= 300),
  -- Availability is a quick on/off (sold out today). is_active is the soft
  -- delete: inactive items are hidden everywhere but kept for history.
  is_available boolean not null default true,
  is_active boolean not null default true,
  -- kitchen: prepared in the kitchen. waiter: released by the waiter
  -- directly (for example bottled drinks from the dining-area fridge).
  fulfilment public.fulfilment_type not null default 'kitchen',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, restaurant_id),
  foreign key (category_id, restaurant_id) references public.menu_categories (id, restaurant_id)
);
create unique index menu_items_name_idx on public.menu_items (restaurant_id, category_id, lower(name));
create index menu_items_restaurant_idx on public.menu_items (restaurant_id, is_active);
create trigger menu_items_touch before update on public.menu_items
  for each row execute function public.touch_updated_at();
alter table public.menu_items enable row level security;

create table public.service_locations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  area text not null default 'Main Hall' check (char_length(area) between 1 and 40),
  kind public.location_kind not null default 'table',
  seats integer check (seats is null or seats between 1 and 50),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, restaurant_id),
  unique (restaurant_id, area, name)
);
create index service_locations_restaurant_idx on public.service_locations (restaurant_id, is_active);
alter table public.service_locations enable row level security;

-- Price changes are audited so old bills can always be explained.
create or replace function public.audit_menu_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price_minor is distinct from old.price_minor then
    perform public.write_audit(
      new.restaurant_id, 'menu_price_changed', 'menu_item', new.id::text,
      jsonb_build_object('name', new.name, 'old_minor', old.price_minor, 'new_minor', new.price_minor)
    );
  end if;
  return new;
end;
$$;
create trigger menu_items_price_audit after update on public.menu_items
  for each row execute function public.audit_menu_price_change();
