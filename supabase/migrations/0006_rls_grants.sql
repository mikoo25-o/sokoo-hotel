-- Row Level Security policies and privileges.
-- Default deny: RLS is enabled on every table (in 0001-0004) and nothing is
-- readable or writable unless a policy below allows it. Privileges are also
-- narrowed to what each table needs, as a second layer of defence.

-- ---------------------------------------------------------------------------
-- Start from nothing
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Policy helper functions: needed by policies evaluated as the signed-in user
-- ---------------------------------------------------------------------------
grant execute on function
  public.is_member(uuid),
  public.has_role(uuid, public.app_role[]),
  public.is_manager(uuid),
  public.current_role_in(uuid),
  public.can_view_profile(uuid),
  public.restaurant_writable(uuid),
  public.subscription_effective_status(uuid),
  public.safe_uuid(text)
to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs callable by signed-in users (each re-checks membership and role)
-- ---------------------------------------------------------------------------
grant execute on function
  public.create_restaurant(text, text, text, text, boolean, integer),
  public.get_join_code(uuid),
  public.rotate_join_code(uuid, text),
  public.revoke_join_code(uuid),
  public.request_join(text, text, public.app_role),
  public.decide_join_request(uuid, boolean, public.app_role),
  public.set_member_role(uuid, public.app_role),
  public.set_member_active(uuid, boolean),
  public.create_order(uuid, text, uuid, jsonb, text, text, integer),
  public.set_item_status(uuid, public.item_status),
  public.bulk_set_items_status(uuid, public.item_status),
  public.occupied_locations(uuid),
  public.record_payment(uuid, bigint, public.payment_method, text, text, text),
  public.reverse_payment(uuid, text),
  public.verify_payment_reference(uuid),
  public.report_summary(uuid, date, date),
  public.recent_activity(uuid, integer),
  public.log_export(uuid, text)
to authenticated;

-- The rate limiter is used from the server with the service role only.
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_view_profile(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- restaurants. join_code is deliberately not selectable; managers read it
-- through get_join_code(), which is audited and role-checked.
-- ---------------------------------------------------------------------------
grant select (id, name, phone, email, address, currency, timezone, receipt_header, receipt_footer,
              takeaway_enabled, settings, created_by, created_at, updated_at)
  on public.restaurants to authenticated;
grant update (name, phone, email, address, currency, timezone, receipt_header, receipt_footer,
              takeaway_enabled, settings)
  on public.restaurants to authenticated;
create policy restaurants_select on public.restaurants for select to authenticated
  using (public.is_member(id));
create policy restaurants_update on public.restaurants for update to authenticated
  using (public.is_manager(id) and public.restaurant_writable(id))
  with check (public.is_manager(id));

-- ---------------------------------------------------------------------------
-- memberships, join requests, audit log: read-only to managers (and to the
-- user for their own rows). All writes go through RPCs.
-- ---------------------------------------------------------------------------
grant select on public.memberships, public.join_requests, public.audit_logs to authenticated;
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_manager(restaurant_id));
create policy join_requests_select on public.join_requests for select to authenticated
  using (user_id = auth.uid() or public.is_manager(restaurant_id));
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.is_manager(restaurant_id));

-- ---------------------------------------------------------------------------
-- Menu and service locations
-- ---------------------------------------------------------------------------
grant select, insert, update on public.menu_categories, public.menu_items, public.service_locations
  to authenticated;

create policy menu_categories_select on public.menu_categories for select to authenticated
  using (public.is_member(restaurant_id));
create policy menu_categories_insert on public.menu_categories for insert to authenticated
  with check (public.is_manager(restaurant_id) and public.restaurant_writable(restaurant_id));
create policy menu_categories_update on public.menu_categories for update to authenticated
  using (public.is_manager(restaurant_id) and public.restaurant_writable(restaurant_id))
  with check (public.is_manager(restaurant_id));

create policy menu_items_select on public.menu_items for select to authenticated
  using (public.is_member(restaurant_id));
create policy menu_items_insert on public.menu_items for insert to authenticated
  with check (
    public.is_manager(restaurant_id) and public.restaurant_writable(restaurant_id)
    and (image_path is null or image_path like restaurant_id::text || '/menu/%')
  );
create policy menu_items_update on public.menu_items for update to authenticated
  using (public.is_manager(restaurant_id) and public.restaurant_writable(restaurant_id))
  with check (
    public.is_manager(restaurant_id)
    and (image_path is null or image_path like restaurant_id::text || '/menu/%')
  );

create policy service_locations_select on public.service_locations for select to authenticated
  using (public.is_member(restaurant_id));
create policy service_locations_insert on public.service_locations for insert to authenticated
  with check (public.is_manager(restaurant_id) and public.restaurant_writable(restaurant_id));
create policy service_locations_update on public.service_locations for update to authenticated
  using (public.is_manager(restaurant_id) and public.restaurant_writable(restaurant_id))
  with check (public.is_manager(restaurant_id));

-- ---------------------------------------------------------------------------
-- Orders: waiters see only their own orders; managers, kitchen and cashiers
-- see the restaurant's orders. Writes happen only through RPCs.
-- ---------------------------------------------------------------------------
grant select on public.orders, public.order_items, public.order_item_events, public.payments
  to authenticated;

create policy orders_select on public.orders for select to authenticated
  using (
    public.has_role(restaurant_id, array['owner', 'manager', 'kitchen', 'cashier']::public.app_role[])
    or (created_by = auth.uid() and public.has_role(restaurant_id, array['waiter']::public.app_role[]))
  );
-- Order items follow the visibility of their order.
create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));
create policy order_item_events_select on public.order_item_events for select to authenticated
  using (public.is_manager(restaurant_id));
create policy payments_select on public.payments for select to authenticated
  using (public.has_role(restaurant_id, array['owner', 'manager', 'cashier']::public.app_role[]));

-- ---------------------------------------------------------------------------
-- Expenses (managers only). Rows are voided, never deleted.
-- ---------------------------------------------------------------------------
grant select, insert, update on public.expenses to authenticated;
create policy expenses_select on public.expenses for select to authenticated
  using (public.is_manager(restaurant_id));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (
    public.is_manager(restaurant_id) and public.restaurant_writable(restaurant_id)
    and created_by = auth.uid()
    and (receipt_path is null or receipt_path like restaurant_id::text || '/receipts/%')
  );
create policy expenses_update on public.expenses for update to authenticated
  using (public.is_manager(restaurant_id) and public.restaurant_writable(restaurant_id))
  with check (
    public.is_manager(restaurant_id)
    and (receipt_path is null or receipt_path like restaurant_id::text || '/receipts/%')
  );

-- ---------------------------------------------------------------------------
-- Subscriptions: managers read their own. Plans are public to signed-in
-- users. Changes are made by the platform operator with the service role.
-- ---------------------------------------------------------------------------
grant select on public.subscription_plans, public.subscriptions to authenticated;
create policy subscription_plans_select on public.subscription_plans for select to authenticated
  using (is_active);
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.is_manager(restaurant_id));

-- Kitchen order updates reach the browser through Supabase Realtime. Every
-- item change also updates its order row, so subscribing to orders is enough
-- and Realtime applies the orders RLS policy to each subscriber.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;
