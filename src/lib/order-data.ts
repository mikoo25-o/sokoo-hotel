import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Order, OrderItem } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const ORDER_COLUMNS =
  "id, reference, location_id, location_name, location_area, created_by, waiter_name, status, payment_status, guests, note, total_minor, amount_paid_minor, created_at";
export const ITEM_COLUMNS =
  "id, order_id, menu_item_id, name_snapshot, category_name, unit_price_minor, quantity, line_total_minor, fulfilment, status, notes, status_updated_at";

/** One order with its items, or null when it does not exist or RLS hides it. */
export async function loadOrder(supabase: Supabase, id: string): Promise<(Order & { order_items: OrderItem[] }) | null> {
  const { data } = await supabase
    .from("orders")
    .select(`${ORDER_COLUMNS}, order_items(${ITEM_COLUMNS})`)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const order = data as unknown as Order & { order_items: OrderItem[] };
  order.order_items = [...(order.order_items ?? [])].sort((a, b) => a.name_snapshot.localeCompare(b.name_snapshot));
  return order;
}
