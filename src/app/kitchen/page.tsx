import Link from "next/link";
import { ArrowLeft, ChefHat, ChevronRight, Users } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Elapsed } from "@/components/Elapsed";
import { LiveRefresh } from "@/components/LiveRefresh";
import { KitchenItemButtons, KitchenOrderButtons } from "@/components/kitchen/KitchenControls";
import { createClient } from "@/lib/supabase/server";
import { ITEM_COLUMNS, ORDER_COLUMNS } from "@/lib/order-data";
import { kitchenItems, kitchenStage, type KitchenOrder } from "@/lib/kitchen";
import { KITCHEN_ACCESS, requireRole } from "@/lib/session";
import { addDays, formatLongDate, formatTime, localDateString, startOfDayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { uuidSchema } from "@/lib/validation";
import { cn } from "@/lib/cn";

export const metadata = { title: "Kitchen orders" };

const TABS = [
  { key: "all", label: "All orders" },
  { key: "pending", label: "Pending" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
] as const;

export default async function KitchenPage({ searchParams }: { searchParams: Promise<{ tab?: string; order?: string }> }) {
  const ctx = await requireRole(KITCHEN_ACCESS);
  const sp = await searchParams;
  const tz = ctx.current.restaurant.timezone;
  const since = startOfDayISO(addDays(localDateString(new Date(), tz), -2), tz);
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(`${ORDER_COLUMNS}, order_items(${ITEM_COLUMNS})`)
    .or(`created_at.gte.${since},status.in.(pending,preparing,ready)`)
    .order("created_at", { ascending: true })
    .limit(200);

  const all = ((data ?? []) as unknown as KitchenOrder[])
    .map((o) => ({ o, stage: kitchenStage(o) }))
    // The kitchen board shows orders it still has work or pickups on.
    .filter((x) => x.stage && x.stage !== "served");
  const count = (k: string) => (k === "all" ? all.length : all.filter((x) => x.stage === k).length);
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "all";
  const list = all.filter((x) => tab === "all" || x.stage === tab);
  const selectedId = sp.order && uuidSchema.safeParse(sp.order).success ? sp.order : null;
  const selected = all.find((x) => x.o.id === selectedId) ?? null;
  const detail = selected ?? (selectedId ? null : null);
  const href = (t: string, order?: string) => {
    const p = new URLSearchParams();
    if (t !== "all") p.set("tab", t);
    if (order) p.set("order", order);
    const s = p.toString();
    return `/kitchen${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <LiveRefresh restaurantId={ctx.current.restaurant.id} />
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Kitchen orders</h1>
          <p className="mt-1 text-[15px] text-muted">View and manage incoming orders.</p>
        </div>
        <div className="flex items-center gap-3">
          <LiveRefresh restaurantId={ctx.current.restaurant.id} showStatus />
          <span className="hidden rounded-xl border border-line bg-white px-3 py-2 text-right text-sm sm:block">
            <span className="block text-muted">{formatLongDate(new Date(), tz)}</span>
            <span className="font-semibold text-ink">{formatTime(new Date(), tz)}</span>
          </span>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <section className={cn(selected && "hidden lg:block")} aria-label="Orders">
          <nav aria-label="Filter by status" className="scroll-hide -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={href(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[15px] font-semibold",
                  tab === t.key ? "border-primary bg-primary text-white" : "border-line bg-white text-ink hover:bg-canvas",
                )}
              >
                {t.label}
                <span className={cn("rounded-full px-2 text-xs", tab === t.key ? "bg-white/25" : "bg-line text-muted")}>{count(t.key)}</span>
              </Link>
            ))}
          </nav>

          {list.length === 0 ? (
            <EmptyState icon={<ChefHat className="h-6 w-6" aria-hidden />} title="No orders to prepare">
              New orders appear here the moment a waiter sends them.
            </EmptyState>
          ) : (
            <ul className="space-y-2.5">
              {list.map(({ o, stage }) => {
                const items = kitchenItems(o);
                const on = o.id === selected?.o.id;
                return (
                  <li key={o.id}>
                    <Link
                      href={href(tab, o.id)}
                      aria-current={on ? "true" : undefined}
                      className={cn(
                        "flex items-start gap-4 rounded-2xl border bg-white p-4 shadow-card transition-colors hover:border-primary",
                        on ? "border-2 border-primary bg-primary/5" : "border-line",
                      )}
                    >
                      <div className="w-20 shrink-0">
                        <p className="font-semibold text-ink">{o.location_name}</p>
                        {o.guests ? (
                          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
                            <Users className="h-3.5 w-3.5" aria-hidden /> {o.guests}
                          </p>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs text-muted">{o.reference}</p>
                        <ul className="mt-1 text-[15px] text-ink">
                          {items.slice(0, 4).map((i) => (
                            <li key={i.id} className={i.status === "ready" || i.status === "served" ? "text-muted" : undefined}>
                              {i.name_snapshot} × {i.quantity}
                              {i.notes ? <span className="text-warn"> · {i.notes}</span> : null}
                            </li>
                          ))}
                          {items.length > 4 ? <li className="text-muted">+{items.length - 4} more</li> : null}
                        </ul>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="text-sm text-muted">{formatTime(o.created_at, tz)}</span>
                        <StatusBadge status={stage!} />
                        <Elapsed since={o.created_at} className="text-xs font-medium text-muted" />
                      </div>
                      <ChevronRight className="mt-1 hidden h-5 w-5 shrink-0 text-muted sm:block" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className={cn("lg:block", !selected && "hidden")} aria-label="Order details">
          {detail ? (
            <Card className="p-5 lg:sticky lg:top-24">
              <Link href={href(tab)} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary lg:hidden">
                <ArrowLeft className="h-4 w-4" aria-hidden /> All orders
              </Link>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold text-ink">{detail.o.reference}</p>
                  <p className="text-sm text-muted">
                    {detail.o.location_name}
                    {detail.o.guests ? ` · ${detail.o.guests} guests` : ""} · {formatTime(detail.o.created_at, tz)}
                  </p>
                </div>
                <StatusBadge status={detail.stage!} />
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-primary/5 px-4 py-3">
                <span className="flex items-center gap-2 font-medium text-ink">
                  <ChefHat className="h-5 w-5 text-primary" aria-hidden /> {kitchenItems(detail.o).length} kitchen item{kitchenItems(detail.o).length === 1 ? "" : "s"}
                </span>
                <Elapsed since={detail.o.created_at} className="text-sm font-semibold text-primary" />
              </div>

              <h2 className="mb-1 mt-5 font-display text-base font-semibold">Order items</h2>
              <ul className="divide-y divide-line">
                {kitchenItems(detail.o).map((i) => (
                  <li key={i.id} className="py-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-canvas px-2 text-sm font-semibold">{i.quantity}×</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{i.name_snapshot}</p>
                        {i.notes ? <p className="text-sm font-medium text-warn">{i.notes}</p> : null}
                      </div>
                      <StatusBadge status={i.status} />
                    </div>
                    <div className="mt-2">
                      <KitchenItemButtons itemId={i.id} status={i.status} />
                    </div>
                  </li>
                ))}
              </ul>

              <h2 className="mb-1.5 mt-5 font-display text-base font-semibold">Notes</h2>
              <p className="rounded-xl bg-canvas px-4 py-3 text-[15px] text-ink">{detail.o.note || "No special requests"}</p>

              <div className="mt-5">
                <KitchenOrderButtons
                  orderId={detail.o.id}
                  canStart={kitchenItems(detail.o).some((i) => i.status === "pending")}
                  canFinish={kitchenItems(detail.o).some((i) => i.status === "preparing")}
                />
              </div>
            </Card>
          ) : (
            <Card className="hidden p-8 text-center text-[15px] text-muted lg:block">
              {selectedId ? "That order is no longer on the board. It may have been served." : "Select an order to see its items and update progress."}
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
