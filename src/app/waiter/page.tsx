import Link from "next/link";
import { ChevronRight, ClipboardList, ClipboardPlus, ScanSearch } from "lucide-react";
import { RoleGlyph } from "@/components/RoleGlyph";
import { Card } from "@/components/ui/Card";
import { PayBadge, StatusBadge } from "@/components/ui/Badge";
import { LiveRefresh } from "@/components/LiveRefresh";
import { createClient } from "@/lib/supabase/server";
import { requireRole, WAITER_ACCESS } from "@/lib/session";
import { formatTime, greeting, todayStartISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { n, type Order } from "@/lib/types";
import { cn } from "@/lib/cn";

export const metadata = { title: "Waiter" };

const TILES = [
  { href: "/waiter/tables", title: "New Order", text: "Choose a table and take an order", icon: ClipboardPlus, tint: "bg-primary/10 text-primary" },
  { href: "/waiter/orders", title: "My Active Orders", text: "Check order status and serve", icon: ClipboardList, tint: "bg-sky text-skyd" },
  { href: "/waiter/tables", title: "Tables", text: "See which tables are busy", icon: "table", tint: "bg-danger/10 text-danger" },
  { href: "/waiter/find", title: "Find Order", text: "Look up by order number", icon: ScanSearch, tint: "bg-sky text-skyd" },
];

export default async function WaiterHome() {
  const ctx = await requireRole(WAITER_ACCESS);
  const tz = ctx.current.restaurant.timezone;
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, reference, location_name, status, payment_status, total_minor, created_at")
    .eq("created_by", ctx.user.id)
    .or(`created_at.gte.${todayStartISO(tz)},status.in.(pending,preparing,ready)`)
    .order("created_at", { ascending: false })
    .limit(100);
  const orders = (data ?? []) as Order[];
  const active = orders.filter((o) => ["pending", "preparing", "ready"].includes(o.status));
  const toCollect = orders.filter((o) => o.status !== "cancelled" && o.payment_status !== "paid" && n(o.total_minor) > 0);
  const readyToServe = orders.filter((o) => o.status === "ready");
  const name = ctx.profile.full_name.split(" ")[0] || "there";

  const stats = [
    { label: "Active orders", value: active.length },
    { label: "Ready to serve", value: readyToServe.length },
    { label: "Awaiting payment", value: toCollect.length },
    { label: "Orders today", value: orders.length },
  ];

  return (
    <>
      <LiveRefresh restaurantId={ctx.current.restaurant.id} />
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
        {greeting(tz)}, {name}
      </h1>
      <p className="mt-1 text-[15px] text-muted">Take orders, serve your customers and keep things moving.</p>

      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TILES.map(({ href, title, text, icon, tint }) => (
          <li key={title}>
            <Link href={href} className="flex h-full min-h-36 flex-col rounded-2xl border border-line bg-white p-4 shadow-card transition-colors hover:border-primary">
              <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", tint)}>
                {icon === "table" ? <RoleGlyph name="table" className="h-8 w-8" /> : (() => { const Icon = icon; return <Icon className="h-6 w-6" aria-hidden />; })()}
              </span>
              <span className="mt-3 text-base font-semibold text-ink">{title}</span>
              <span className="mt-0.5 text-[13px] leading-snug text-muted">{text}</span>
            </Link>
          </li>
        ))}
      </ul>

      <Card tone="sky" className="mt-5 grid grid-cols-2 gap-y-4 p-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="px-2">
            <p className="font-display text-3xl font-semibold text-skyink">{s.value}</p>
            <p className="text-[13px] text-skyink/80">{s.label}</p>
          </div>
        ))}
      </Card>

      <div className="mb-3 mt-7 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Recent orders</h2>
        <Link href="/waiter/orders" className="text-sm font-semibold text-primary">
          View all orders
        </Link>
      </div>
      {orders.length === 0 ? (
        <Card className="p-6 text-center text-[15px] text-muted">No orders yet today. Choose a table to take your first order.</Card>
      ) : (
        <ul className="space-y-2.5">
          {orders.slice(0, 5).map((o) => (
            <li key={o.id}>
              <Link href={`/waiter/orders/${o.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5 shadow-card hover:border-primary">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">
                    {o.location_name} <span className="font-normal text-muted">· {formatTime(o.created_at, tz)}</span>
                  </p>
                  <p className="truncate font-mono text-xs text-muted">{o.reference}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusBadge status={o.status} />
                  <PayBadge status={o.payment_status} />
                </div>
                <div className="hidden w-24 text-right font-semibold text-ink sm:block">{formatMoney(o.total_minor)}</div>
                <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
