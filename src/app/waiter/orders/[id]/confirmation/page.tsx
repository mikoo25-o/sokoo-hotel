import Link from "next/link";
import { notFound } from "next/navigation";
import { ChefHat, Check, CreditCard, HandPlatter } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { LiveRefresh } from "@/components/LiveRefresh";
import { createClient } from "@/lib/supabase/server";
import { loadOrder } from "@/lib/order-data";
import { requireRole, WAITER_ACCESS } from "@/lib/session";
import { formatTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { uuidSchema } from "@/lib/validation";
import { n } from "@/lib/types";
import { ROLE_HOME } from "@/lib/constants";

export const metadata = { title: "Order sent" };

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function ConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRole(WAITER_ACCESS);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const order = await loadOrder(supabase, id);
  if (!order) notFound();

  const live = order.order_items.filter((i) => i.status !== "cancelled");
  const kitchen = live.filter((i) => i.fulfilment === "kitchen");
  const waiter = live.filter((i) => i.fulfilment === "waiter");
  const kitchenDone = kitchen.filter((i) => ["ready", "served"].includes(i.status)).length;
  const waiterDone = waiter.filter((i) => i.status === "served").length;
  const tz = ctx.current.restaurant.timezone;
  const itemCount = live.reduce((s, i) => s + i.quantity, 0);
  const home = ROLE_HOME[ctx.current.membership.role];

  const payText = order.payment_status === "paid" ? "Paid in full" : order.payment_status === "partial" ? "Part paid" : "Waiting for payment";

  return (
    <>
      <LiveRefresh restaurantId={ctx.current.restaurant.id} />
      <Card className="flex flex-wrap items-center gap-4 border-ok/30 bg-ok/10 p-5">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-white">
          <Check className="h-8 w-8" strokeWidth={3} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold text-ok">Order Sent</h1>
          <p className="text-[15px] text-ink">Your order has been saved and sent to the kitchen and cashier.</p>
        </div>
        <div className="rounded-xl bg-white/70 px-4 py-2.5">
          <p className="text-xs text-muted">Order number</p>
          <p className="font-mono text-lg font-semibold tracking-wide text-ink">{order.reference}</p>
          <p className="text-sm text-muted">
            {order.location_name} · {formatTime(order.created_at, tz)}
          </p>
        </div>
      </Card>

      <h2 className="mb-3 mt-6 font-display text-lg font-semibold">Order progress</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><ChefHat className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-semibold text-ink">Kitchen</p>
              <p className="text-sm text-muted">{kitchen.length ? `${kitchenDone} of ${kitchen.length} ready` : "Nothing to cook"}</p>
            </div>
          </div>
          <Progress done={kitchenDone} total={kitchen.length} />
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ok/10 text-ok"><HandPlatter className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-semibold text-ink">Waiter</p>
              <p className="text-sm text-muted">{waiter.length ? `${waiterDone} of ${waiter.length} served (drinks and sides)` : "No direct items"}</p>
            </div>
          </div>
          <Progress done={waiterDone} total={waiter.length} />
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warn/10 text-warn"><CreditCard className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="font-semibold text-ink">Cashier</p>
              <p className="text-sm text-muted">{payText}</p>
            </div>
          </div>
          <Progress done={n(order.amount_paid_minor)} total={n(order.total_minor)} />
        </Card>
      </div>

      <h2 className="mb-3 mt-6 font-display text-lg font-semibold">Order summary</h2>
      <Card className="grid grid-cols-3 gap-2 p-4 text-center sm:text-left">
        <div>
          <p className="text-sm text-muted">{order.location_area}</p>
          <p className="font-semibold text-ink">{order.location_name}</p>
        </div>
        <div>
          <p className="text-sm text-muted">Items</p>
          <p className="font-semibold text-ink">{itemCount}</p>
        </div>
        <div>
          <p className="text-sm text-muted">Total</p>
          <p className="font-display text-xl font-semibold text-ink">{formatMoney(order.total_minor)}</p>
        </div>
      </Card>

      <div className="mt-6 space-y-3">
        <LinkButton href={`/waiter/orders/${order.id}`} size="lg" block>
          View Order Details
        </LinkButton>
        <LinkButton href={home} size="lg" block variant="secondary">
          Back to Home
        </LinkButton>
        <p className="text-center text-sm text-muted">
          <Link href="/waiter/tables" className="font-semibold text-primary underline underline-offset-4">
            Take another order
          </Link>
        </p>
      </div>
    </>
  );
}
