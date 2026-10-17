import { StarterData } from "@/components/manager/StarterData";
import Link from "next/link";
import { ArrowRight, Banknote, CheckCircle2, Circle, ClipboardList, Receipt, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { Card, PageHeader, SectionTitle, Stat } from "@/components/ui/Card";
import { LiveRefresh } from "@/components/LiveRefresh";
import { createClient } from "@/lib/supabase/server";
import { MANAGERS, requireRole } from "@/lib/session";
import { formatDateTime, greeting, localDateString } from "@/lib/dates";
import { formatMoney, percentChange } from "@/lib/money";
import { n } from "@/lib/types";

export const metadata = { title: "Dashboard" };

interface Summary {
  sales_minor: number; orders_count: number; collected_minor: number; expenses_minor: number;
  estimated_profit_minor: number; receivable_minor: number; receivable_count: number;
  previous: { sales_minor: number; orders_count: number };
}
interface Activity { type: "payment" | "order" | "expense"; at: string; amount_minor: number; label: string; detail: string }

export default async function ManagerHome() {
  const ctx = await requireRole(MANAGERS);
  const r = ctx.current.restaurant;
  const tz = r.timezone;
  const today = localDateString(new Date(), tz);
  const supabase = await createClient();

  const [{ data: sum }, { data: act }, locs, items, staff] = await Promise.all([
    supabase.rpc("report_summary", { p_restaurant: r.id, p_from: today, p_to: today }),
    supabase.rpc("recent_activity", { p_restaurant: r.id, p_limit: 8 }),
    supabase.from("service_locations").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);
  const s = sum as Summary | null;
  const activity = (act as Activity[] | null) ?? [];
  const nLocs = locs.count ?? 0, nItems = items.count ?? 0, nStaff = staff.count ?? 0;

  const setup = [
    { done: nItems > 0, label: "Add your menu", href: "/manager/menu" },
    { done: nLocs > 0, label: "Add your tables", href: "/manager/settings#tables" },
    { done: nStaff > 1, label: "Invite your team", href: "/manager/staff" },
  ];
  const setupDone = setup.every((x) => x.done);
  const change = s ? percentChange(n(s.sales_minor), n(s.previous.sales_minor)) : null;
  const first = ctx.profile.full_name.split(" ")[0] || "there";

  return (
    <>
      <LiveRefresh restaurantId={r.id} />
      <PageHeader title={`${greeting(tz)}, ${first}`} subtitle={`${r.name} · today so far`} />

      {nItems === 0 ? <StarterData /> : null}
      {!setupDone ? (
        <Card className="mb-5 p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Finish setting up</h2>
          <p className="text-sm text-muted">Your restaurant starts empty. Three steps and your team can take orders.</p>
          <ul className="mt-3 divide-y divide-line">
            {setup.map((x) => (
              <li key={x.label}>
                <Link href={x.href} className="flex min-h-12 items-center gap-3 text-[15px] font-medium text-ink">
                  {x.done ? <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden /> : <Circle className="h-5 w-5 text-muted" aria-hidden />}
                  <span className={x.done ? "text-muted line-through" : ""}>{x.label}</span>
                  {!x.done ? <ArrowRight className="ml-auto h-4 w-4 text-primary" aria-hidden /> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales" icon={<TrendingUp className="h-4 w-4" />} value={formatMoney(s?.sales_minor)} note={change === null ? "Value of orders placed" : `${change >= 0 ? "+" : ""}${change}% vs yesterday`} />
        <Stat tone="sky" label="Collected" icon={<Banknote className="h-4 w-4" />} value={formatMoney(s?.collected_minor)} note="Payments received" />
        <Stat tone="sky" label="Orders" icon={<ShoppingBag className="h-4 w-4" />} value={String(s?.orders_count ?? 0)} note="Placed today" />
        <Stat label="Still owed" valueClass="text-danger" icon={<Wallet className="h-4 w-4" />} value={formatMoney(s?.receivable_minor)} note={`${s?.receivable_count ?? 0} unpaid bill${s?.receivable_count === 1 ? "" : "s"}`} />
      </div>
      <p className="mt-2 text-xs text-muted">Sales is what was ordered. Collected is money actually received. They differ when bills are unpaid.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Link href="/manager/orders" className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 font-semibold text-ink hover:border-primary"><ClipboardList className="h-5 w-5 text-primary" aria-hidden /> View orders</Link>
        <Link href="/cashier" className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 font-semibold text-ink hover:border-primary"><Receipt className="h-5 w-5 text-primary" aria-hidden /> Open cashier</Link>
        <Link href="/manager/reports" className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 font-semibold text-ink hover:border-primary"><TrendingUp className="h-5 w-5 text-primary" aria-hidden /> Reports</Link>
      </div>

      <SectionTitle>Recent activity</SectionTitle>
      {activity.length === 0 ? (
        <Card className="p-5 text-[15px] text-muted">Nothing yet. Orders, payments and expenses appear here as they happen.</Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {activity.map((a, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">
                    {a.type === "payment" ? "Payment" : a.type === "order" ? "Order" : "Expense"} · {a.label}
                  </p>
                  <p className="text-sm text-muted">{formatDateTime(a.at, tz)} · {a.detail}</p>
                </div>
                <span className={a.type === "expense" ? "font-semibold text-warn" : "font-semibold text-ink"}>
                  {a.type === "expense" ? "-" : ""}{formatMoney(a.amount_minor)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
