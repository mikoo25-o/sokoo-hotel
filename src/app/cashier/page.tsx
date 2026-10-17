import Link from "next/link";
import { ChevronRight, Receipt, Search } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui/Card";
import { PayBadge } from "@/components/ui/Badge";
import { LiveRefresh } from "@/components/LiveRefresh";
import { createClient } from "@/lib/supabase/server";
import { CASHIER_ACCESS, requireRole } from "@/lib/session";
import { formatTime, todayStartISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { n } from "@/lib/types";
import { cn } from "@/lib/cn";
import type { Order } from "@/lib/types";

export const metadata = { title: "Cashier" };

const TABS = [
  { key: "unpaid", label: "Unpaid" },
  { key: "partial", label: "Partially paid" },
  { key: "paid", label: "Paid today" },
] as const;

export default async function CashierPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const ctx = await requireRole(CASHIER_ACCESS);
  const sp = await searchParams;
  const tz = ctx.current.restaurant.timezone;
  const supabase = await createClient();

  // Money owed is never hidden by date. Settled bills show for today only.
  const { data } = await supabase
    .from("orders")
    .select("id, reference, location_name, location_area, status, payment_status, total_minor, amount_paid_minor, created_at, updated_at, waiter_name")
    .neq("status", "cancelled")
    .gt("total_minor", 0)
    .or(`payment_status.in.(unpaid,partial),updated_at.gte.${todayStartISO(tz)}`)
    .order("created_at", { ascending: false })
    .limit(300);
  const orders = (data ?? []) as (Order & { updated_at: string })[];

  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "unpaid";
  const q = (sp.q ?? "").trim().toLowerCase();
  const countOf = (k: string) => orders.filter((o) => o.payment_status === k).length;
  const shown = orders
    .filter((o) => o.payment_status === tab)
    .filter((o) => !q || o.reference.toLowerCase().includes(q) || o.location_name.toLowerCase().includes(q));
  const outstanding = orders.filter((o) => o.payment_status !== "paid").reduce((s, o) => s + n(o.total_minor) - n(o.amount_paid_minor), 0);

  const href = (t: string) => `/cashier?${new URLSearchParams({ tab: t, ...(sp.q ? { q: sp.q } : {}) }).toString()}`;

  return (
    <>
      <LiveRefresh restaurantId={ctx.current.restaurant.id} />
      <PageHeader title="Cashier" subtitle="Bills waiting for payment, and what has been collected today." />

      <Card tone="sky" className="mb-4 grid grid-cols-3 gap-2 p-4">
        <div>
          <p className="font-display text-2xl font-semibold text-skyink">{countOf("unpaid")}</p>
          <p className="text-[13px] text-skyink/80">Unpaid</p>
        </div>
        <div>
          <p className="font-display text-2xl font-semibold text-skyink">{countOf("partial")}</p>
          <p className="text-[13px] text-skyink/80">Partially paid</p>
        </div>
        <div>
          <p className="font-display text-2xl font-semibold text-danger">{formatMoney(outstanding)}</p>
          <p className="text-[13px] text-skyink/80">Still to collect</p>
        </div>
      </Card>

      <form action="/cashier" method="get" className="relative mb-3">
        <input type="hidden" name="tab" value={tab} />
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          name="q"
          defaultValue={sp.q}
          type="search"
          placeholder="Search by order number or table…"
          aria-label="Search bills"
          className="h-12 w-full rounded-xl border border-line bg-white pl-11 pr-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </form>

      <nav aria-label="Payment status" className="scroll-hide -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
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
            <span className={cn("rounded-full px-2 text-xs", tab === t.key ? "bg-white/25" : "bg-line text-muted")}>{countOf(t.key)}</span>
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <EmptyState icon={<Receipt className="h-6 w-6" aria-hidden />} title={tab === "paid" ? "No bills settled yet today" : "Nothing waiting here"}>
          {q ? "No bills match your search." : "Bills appear as soon as a waiter sends an order."}
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((o) => {
            const balance = n(o.total_minor) - n(o.amount_paid_minor);
            return (
              <li key={o.id}>
                <Link href={`/cashier/orders/${o.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-card hover:border-primary">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      {o.location_name} <span className="font-normal text-muted">· {formatTime(o.created_at, tz)}</span>
                    </p>
                    <p className="font-mono text-xs text-muted">{o.reference}</p>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-muted">Total</dt>
                        <dd className="font-semibold text-ink">{formatMoney(o.total_minor)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Received</dt>
                        <dd className="font-medium text-ink">{formatMoney(o.amount_paid_minor)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Balance</dt>
                        <dd className={balance > 0 ? "font-semibold text-warn" : "font-medium text-ok"}>{formatMoney(balance)}</dd>
                      </div>
                    </dl>
                  </div>
                  <PayBadge status={o.payment_status} />
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
