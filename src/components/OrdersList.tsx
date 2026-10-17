import Link from "next/link";
import { ChevronRight, ClipboardList, Search } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/Card";
import { PayBadge, StatusBadge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/money";
import { formatTime } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { Order, OrderItem } from "@/lib/types";

type Row = Order & { order_items: Pick<OrderItem, "name_snapshot" | "quantity" | "status">[] };

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "preparing", label: "In kitchen" },
  { key: "ready", label: "Ready to serve" },
  { key: "served", label: "Served" },
] as const;

export function OrdersList({
  orders,
  basePath,
  detailBase,
  tab,
  q,
  tz,
  showWaiter = false,
}: {
  orders: Row[];
  basePath: string;
  detailBase: string;
  tab: string;
  q: string;
  tz: string;
  showWaiter?: boolean;
}) {
  const count = (s: string) => orders.filter((o) => o.status === s).length;
  const active = orders.filter((o) => ["pending", "preparing", "ready"].includes(o.status)).length;
  const needle = q.trim().toLowerCase();
  const shown = orders
    .filter((o) => tab === "all" || o.status === tab)
    .filter((o) => !needle || o.reference.toLowerCase().includes(needle) || o.location_name.toLowerCase().includes(needle));
  const href = (t: string) => `${basePath}?${new URLSearchParams({ ...(t !== "all" ? { status: t } : {}), ...(q ? { q } : {}) }).toString()}`;

  return (
    <>
      <Card className="mb-4 grid grid-cols-2 gap-y-3 p-4 sm:grid-cols-4">
        {[
          ["Active orders", active],
          ["Pending", count("pending")],
          ["In kitchen", count("preparing")],
          ["Ready to serve", count("ready")],
        ].map(([label, value]) => (
          <div key={label as string} className="px-2">
            <p className="font-display text-2xl font-semibold text-ink">{value}</p>
            <p className="text-[13px] text-muted">{label}</p>
          </div>
        ))}
      </Card>

      <form action={basePath} method="get" className="relative mb-3">
        {tab !== "all" ? <input type="hidden" name="status" value={tab} /> : null}
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          name="q"
          defaultValue={q}
          type="search"
          placeholder="Search by table or order number…"
          aria-label="Search orders"
          className="h-12 w-full rounded-xl border border-line bg-white pl-11 pr-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </form>

      <nav aria-label="Filter by status" className="scroll-hide -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-[15px] font-semibold",
              tab === t.key ? "border-primary bg-primary text-white" : "border-line bg-white text-ink hover:bg-canvas",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6" aria-hidden />} title={orders.length ? "No orders match" : "No orders yet"}>
          {orders.length ? "Try a different filter or search." : "Orders appear here as soon as they are sent."}
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((o) => {
            const live = o.order_items.filter((i) => i.status !== "cancelled");
            const preview = live.slice(0, 3).map((i) => `${i.quantity}× ${i.name_snapshot}`).join(" · ");
            return (
              <li key={o.id}>
                <Link href={`${detailBase}/${o.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5 shadow-card hover:border-primary">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      {o.location_name} <span className="font-normal text-muted">· {formatTime(o.created_at, tz)}</span>
                    </p>
                    <p className="font-mono text-xs text-muted">{o.reference}</p>
                    <p className="mt-1 truncate text-sm text-muted">
                      {preview}
                      {live.length > 3 ? ` +${live.length - 3} more` : ""}
                    </p>
                    {showWaiter ? <p className="text-xs text-muted">Taken by {o.waiter_name}</p> : null}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusBadge status={o.status} />
                    <PayBadge status={o.payment_status} />
                    <span className="text-sm font-semibold text-ink">{formatMoney(o.total_minor)}</span>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
