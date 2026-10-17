import Link from "next/link";
import { BarChart3, Download } from "lucide-react";
import { Card, EmptyState, PageHeader, SectionTitle, Stat } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { MANAGERS, requireRole } from "@/lib/session";
import { addDays, formatDate, isDateString, localDateString } from "@/lib/dates";
import { errorMessage } from "@/lib/errors";
import { formatMoney, percentChange } from "@/lib/money";
import { n } from "@/lib/types";
import { cn } from "@/lib/cn";

export const metadata = { title: "Reports" };

interface Summary {
  sales_minor: number; orders_count: number; collected_minor: number; collected_by_method: Record<string, number>;
  expenses_minor: number; estimated_profit_minor: number; receivable_minor: number; receivable_count: number;
  previous: { sales_minor: number; orders_count: number; collected_minor: number; expenses_minor: number };
  daily: { date: string; sales_minor: number; collected_minor: number }[];
  top_items: { name: string; quantity: number; revenue_minor: number }[];
  by_category: { name: string; sales_minor: number }[];
}

const PRESETS = [
  { key: "today", label: "Today", days: 0 },
  { key: "7", label: "7 days", days: 6 },
  { key: "30", label: "30 days", days: 29 },
  { key: "90", label: "90 days", days: 89 },
] as const;

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const c = percentChange(cur, prev);
  return c === null ? <>No earlier data to compare</> : <>{c >= 0 ? "+" : ""}{c}% vs previous period</>;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const ctx = await requireRole(MANAGERS);
  const sp = await searchParams;
  const r = ctx.current.restaurant;
  const today = localDateString(new Date(), r.timezone);

  let from = addDays(today, -6);
  let to = today;
  let active: string = "7";
  const preset = PRESETS.find((p) => p.key === sp.range);
  if (preset) { from = addDays(today, -preset.days); active = preset.key; }
  else if (isDateString(sp.from) && isDateString(sp.to) && sp.from <= sp.to && sp.to <= today) { from = sp.from; to = sp.to; active = "custom"; }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_summary", { p_restaurant: r.id, p_from: from, p_to: to });
  const s = data as Summary | null;
  const maxDay = Math.max(1, ...(s?.daily ?? []).map((d) => Math.max(n(d.sales_minor), n(d.collected_minor))));
  const empty = !!s && s.orders_count === 0 && n(s.expenses_minor) === 0 && n(s.collected_minor) === 0;
  const dense = (s?.daily.length ?? 0) > 14;

  return (
    <>
      <PageHeader title="Reports" subtitle={`${formatDate(from, r.timezone)} to ${formatDate(to, r.timezone)}`}
        action={s ? <Link href={`/manager/reports/export?from=${from}&to=${to}`} prefetch={false} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-semibold text-ink hover:bg-canvas"><Download className="h-4 w-4" aria-hidden /> Export CSV</Link> : null} />

      <nav aria-label="Report period" className="scroll-hide -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {PRESETS.map((p) => (
          <Link key={p.key} href={`/manager/reports?range=${p.key}`} aria-current={active === p.key ? "page" : undefined}
            className={cn("inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[15px] font-semibold", active === p.key ? "border-primary bg-primary text-white" : "border-line bg-white text-ink hover:bg-canvas")}>{p.label}</Link>
        ))}
      </nav>
      <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-4">
        <label className="text-sm font-medium text-ink">From<input type="date" name="from" defaultValue={from} max={today} className="mt-1 block h-11 rounded-xl border border-line px-3" /></label>
        <label className="text-sm font-medium text-ink">To<input type="date" name="to" defaultValue={to} max={today} className="mt-1 block h-11 rounded-xl border border-line px-3" /></label>
        <button className="h-11 rounded-xl border border-line bg-white px-4 font-semibold text-ink hover:bg-canvas">Custom range</button>
      </form>

      {error || !s ? (
        <div role="alert"><Card className="p-5 text-danger">{errorMessage(error)}</Card></div>
      ) : empty ? (
        <EmptyState icon={<BarChart3 className="h-6 w-6" aria-hidden />} title="Nothing to report for this period">Reports fill in as orders, payments and expenses are recorded.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Sales" value={formatMoney(s.sales_minor)} note={<><span>{s.orders_count} orders · </span><Delta cur={n(s.sales_minor)} prev={n(s.previous.sales_minor)} /></>} />
            <Stat label="Collected" value={formatMoney(s.collected_minor)} note={<Delta cur={n(s.collected_minor)} prev={n(s.previous.collected_minor)} />} />
            <Stat label="Expenses" value={formatMoney(s.expenses_minor)} note={<Delta cur={n(s.expenses_minor)} prev={n(s.previous.expenses_minor)} />} />
            <Stat label="Estimated profit" value={formatMoney(s.estimated_profit_minor)} note="Sales minus recorded expenses" />
          </div>
          <Card className="mt-3 p-4 text-sm text-muted">
            <p><strong className="text-ink">How to read this.</strong> Sales is the value of orders placed. Collected is money actually received. Still owed right now is <strong className="text-warn">{formatMoney(s.receivable_minor)}</strong> across {s.receivable_count} unpaid bill{s.receivable_count === 1 ? "" : "s"}. Estimated profit does not include the cost of stock unless you record it as an expense.</p>
          </Card>

          <SectionTitle>Collected by method</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Cash" value={formatMoney(s.collected_by_method.cash)} />
            <Stat label="M-Pesa (manual entry)" value={formatMoney(s.collected_by_method.mpesa)} note="Includes unverified codes" />
          </div>

          <SectionTitle>Day by day</SectionTitle>
          <Card className="p-4">
            <div className="mb-3 flex gap-4 text-xs text-muted"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-primary" /> Sales</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-skyd" /> Collected</span></div>
            <ul className="space-y-2" aria-label="Daily sales and collections">
              {s.daily.map((d) => (
                <li key={d.date} className="grid grid-cols-[4.5rem_1fr_6.5rem] items-center gap-2 text-sm">
                  <span className="text-muted">{formatDate(d.date, "UTC").replace(/, \d{4}$/, "")}</span>
                  <span className="space-y-1">
                    <span className="block h-2.5 rounded-sm bg-primary" style={{ width: `${Math.max(n(d.sales_minor) ? 2 : 0, (n(d.sales_minor) / maxDay) * 100)}%` }} />
                    {!dense ? <span className="block h-2.5 rounded-sm bg-skyd" style={{ width: `${Math.max(n(d.collected_minor) ? 2 : 0, (n(d.collected_minor) / maxDay) * 100)}%` }} /> : null}
                  </span>
                  <span className="text-right tabular-nums text-ink">{formatMoney(d.sales_minor)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="mt-2 grid gap-5 lg:grid-cols-2">
            <div>
              <SectionTitle>Top selling items</SectionTitle>
              {!s.top_items.length ? <Card className="p-4 text-sm text-muted">No items sold in this period.</Card> : (
                <Card><ol className="divide-y divide-line">
                  {s.top_items.map((t, i) => (
                    <li key={t.name} className="flex items-center gap-3 px-4 py-3"><span className="w-5 text-sm text-muted">{i + 1}</span><span className="min-w-0 flex-1 truncate font-medium text-ink">{t.name}</span><span className="text-sm text-muted">{t.quantity} sold</span><span className="w-24 text-right tabular-nums text-ink">{formatMoney(t.revenue_minor)}</span></li>
                  ))}
                </ol></Card>
              )}
            </div>
            <div>
              <SectionTitle>Sales by category</SectionTitle>
              {!s.by_category.length ? <Card className="p-4 text-sm text-muted">No sales in this period.</Card> : (
                <Card><ul className="divide-y divide-line">
                  {s.by_category.map((c) => (
                    <li key={c.name} className="flex items-center justify-between gap-3 px-4 py-3"><span className="font-medium text-ink">{c.name}</span><span className="tabular-nums text-ink">{formatMoney(c.sales_minor)}</span></li>
                  ))}
                </ul></Card>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
