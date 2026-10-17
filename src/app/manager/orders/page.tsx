import { PageHeader } from "@/components/ui/Card";
import { LiveRefresh } from "@/components/LiveRefresh";
import { OrdersList } from "@/components/OrdersList";
import { createClient } from "@/lib/supabase/server";
import { MANAGERS, requireRole } from "@/lib/session";
import { addDays, localDateString, startOfDayISO } from "@/lib/dates";
import type { Order } from "@/lib/types";

export const metadata = { title: "Orders" };

export default async function ManagerOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const ctx = await requireRole(MANAGERS);
  const sp = await searchParams;
  const tz = ctx.current.restaurant.timezone;
  const since = startOfDayISO(addDays(localDateString(new Date(), tz), -1), tz);
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, reference, location_name, status, payment_status, total_minor, created_at, waiter_name, order_items(name_snapshot, quantity, status)")
    .or(`created_at.gte.${since},status.in.(pending,preparing,ready)`)
    .order("created_at", { ascending: false })
    .limit(250);
  return (
    <>
      <LiveRefresh restaurantId={ctx.current.restaurant.id} />
      <PageHeader title="Orders" subtitle="Everything from yesterday, today and anything still in progress." />
      <OrdersList
        orders={(data ?? []) as unknown as (Order & { order_items: { name_snapshot: string; quantity: number; status: "pending" }[] })[]}
        basePath="/manager/orders"
        detailBase="/waiter/orders"
        tab={sp.status ?? "all"}
        q={sp.q ?? ""}
        tz={tz}
        showWaiter
      />
    </>
  );
}
