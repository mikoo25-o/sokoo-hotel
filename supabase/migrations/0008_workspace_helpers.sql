-- Lookups the app needs for people who are not (yet) members, and a
-- membership-checked subscription status for the workspace banner.

-- A user's own join requests, including the restaurant name, so the
-- "waiting for approval" page can say where they applied.
create or replace function public.my_join_requests()
returns table (id uuid, restaurant_name text, status public.join_status, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select jr.id, r.name, jr.status, jr.created_at
  from public.join_requests jr
  join public.restaurants r on r.id = jr.restaurant_id
  where jr.user_id = auth.uid()
  order by jr.created_at desc
  limit 20;
$$;

-- Subscription state for a restaurant the caller belongs to.
create or replace function public.workspace_status(p_restaurant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.subscriptions;
  v_effective text;
begin
  if not public.is_member(p_restaurant) then raise exception 'forbidden'; end if;
  select * into s from public.subscriptions where restaurant_id = p_restaurant;
  v_effective := public.subscription_effective_status(p_restaurant);
  return jsonb_build_object(
    'status', v_effective,
    'stored_status', s.status,
    'ends_at', case s.status when 'trial' then s.trial_ends_at else s.current_period_end end,
    'grace_days', s.grace_days,
    'writable', v_effective in ('trial', 'active', 'past_due', 'grace')
  );
end;
$$;

-- The raw status function is internal. Members use workspace_status().
revoke execute on function public.subscription_effective_status(uuid) from authenticated;

grant execute on function public.my_join_requests(), public.workspace_status(uuid) to authenticated;
