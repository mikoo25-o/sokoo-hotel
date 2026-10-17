import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Receipt } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/Card";
import { PayBadge, StatusBadge } from "@/components/ui/Badge";
import { LiveRefresh } from "@/components/LiveRefresh";
import { OrderItemRow } from "@/components/OrderItemRow";
import { ItemActions, ServeAllButton } from "@/components/waiter/ItemActions";
import { createClient } from "@/lib/supabase/server";
import { loadOrder } from "@/lib/order-data";
import { requireRole, WAITER_ACCESS } from "@/lib/session";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { uuidSchema } from "@/lib/validation";
import { n } from "@/lib/types";

export const metadata = { title: "Order details" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRole(WAITER_ACCESS);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const order = await loadOrder(supabase, id);
  if (!order) notFound();

  const role = ctx.current.membership.role;
  const isManager = role === "owner" || role === "manager";
  const mine = order.created_by === ctx.user.id;
  const canAct = mine || isManager;
  const tz = ctx.current.restaurant.timezone;
  const back = isManager ? "/manager/orders" : "/waiter/orders";
  const balance = n(order.total_minor) - n(order.amount_paid_minor);
  const hasReady = order.order_items.some((i) => i.status === "ready");

  return (
    <>
      <LiveRefresh restaurantId={ctx.current.restaurant.id} />
      <PageHeader
        back={
          <Link href={back} className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Orders
          </Link>
        }
        title={`${order.location_name}`}
        subtitle={`${order.location_area} · ${formatDateTime(order.created_at, tz)}`}
        action={<StatusBadge status={order.status} />}
      />

      <Card className="mb-4 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <div>
          <p className="text-sm text-muted">Order number</p>
          <p className="font-mono text-sm font-semibold text-ink">{order.reference}</p>
        </div>
        <div>
          <p className="text-sm text-muted">Taken by</p>
          <p className="font-semibold text-ink">{order.waiter_name}</p>
        </div>
        <div>
          <p className="text-sm text-muted">Guests</p>
          <p className="font-semibold text-ink">{order.guests ?? "Not given"}</p>
        </div>
        <div>
          <p className="text-sm text-muted">Payment</p>
          <PayBadge status={order.payment_status} />
        </div>
      </Card>
      {order.note ? (
        <Card className="mb-4 border-warn/30 bg-warn/5 p-4 text-[15px] text-ink">
          <span className="font-semibold text-warn">Order note: </span>
          {order.note}
        </Card>
      ) : null}

      <Card className="px-4">
        <ul className="divide-y divide-line">
          {order.order_items.map((i) => (
            <OrderItemRow
              key={i.id}
              item={i}
              actions={canAct ? <ItemActions itemId={i.id} status={i.status} fulfilment={i.fulfilment} canCancel={n(order.amount_paid_minor) === 0} /> : undefined}
            />
          ))}
        </ul>
        <div className="space-y-1 border-t border-line py-3 text-[15px]">
          <div className="flex justify-between">
            <span className="text-muted">Total</span>
            <span className="font-display text-lg font-semibold text-ink">{formatMoney(order.total_minor)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Paid</span>
            <span className="font-medium text-ink">{formatMoney(order.amount_paid_minor)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Balance</span>
            <span className={balance > 0 ? "font-semibold text-warn" : "font-medium text-ok"}>{formatMoney(balance)}</span>
          </div>
        </div>
      </Card>

      <div className="mt-4 space-y-3">
        {canAct && hasReady ? <ServeAllButton orderId={order.id} /> : null}
        {["owner", "manager", "cashier"].includes(role) ? (
          <Link href={`/cashier/orders/${order.id}`} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white font-semibold text-ink hover:bg-canvas">
            <Receipt className="h-5 w-5" aria-hidden /> Bill and payments
          </Link>
        ) : (
          <p className="text-center text-sm text-muted">The cashier will take payment for this order.</p>
        )}
      </div>
    </>
  );
}
