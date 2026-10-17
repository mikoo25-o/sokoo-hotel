import Link from "next/link";
import { CalendarDays, Info, Search } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { ITEM_COLUMNS, ORDER_COLUMNS } from "@/lib/order-data";
import { kitchenItems, kitchenStage, type KitchenOrder } from "@/lib/kitchen";
import { KITCHEN_ACCESS, requireRole } from "@/lib/session";
import { addDays, formatTime, isDateString, localDateString, startOfDayISO } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const metadata = { title: "Order history" };

const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
] as const;
const STATUS = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "served", label: "Served" },
] as const;

export default async function KitchenHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; status?: string; q?: string; date?: string }>;
}) {
  const ctx = await requireRole(KITCHEN_ACCESS);
  const sp = await searchParams;
  const tz = ctx.current.restaurant.timezone;
  const today = localDateString(new Date(), tz);

  let from = today;
  let to = today;
  let range: string = RANGES.some((r) => r.key === sp.range) ? sp.range! : "today";
  if (isDateString(sp.date)) {
    from = to = sp.date;
    range = "date";
  } else if (range === "yesterday") from = to = addDays(today, -1);
  else if (range === "7d") from = addDays(today, -6);

  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(`${ORDER_COLUMNS}, order_items(${ITEM_COLUMNS})`)
    .gte("created_at", startOfDayISO(from, tz))
    .lt("created_at", startOfDayISO(addDays(to, 1), tz))
    .order("created_at", { ascending: false })
    .limit(300);

  const needle = (sp.q ?? "").trim().toLowerCase();
  const status = STATUS.some((s) => s.key === sp.status) ? sp.status! : "all";
  const rows = ((data ?? []) as unknown as KitchenOrder[])
    .map((o) => ({ o, stage: kitchenStage(o) }))
    // History is about work that is finished from the kitchen's side.
    .filter((x) => x.stage === "ready" || x.stage === "served")
    .filter((x) => status === "all" || x.stage === status)
    .filter(
      (x) =>
        !needle ||
        x.o.reference.toLowerCase().includes(needle) ||
        x.o.location_name.toLowerCase().includes(needle) ||
        kitchenItems(x.o).some((i) => i.name_snapshot.toLowerCase().includes(needle)),
    );

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { range: range === "date" ? undefined : range, date: range === "date" ? from : undefined, status, q: sp.q, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all" && !(k === "range" && v === "today")) p.set(k, v);
    const s = p.toString();
    return `/kitchen/history${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <PageHeader title="Order history" subtitle="Completed and past orders from the kitchen's side." />

      <form action="/kitchen/history" method="get" className="mb-4 flex flex-col gap-3 sm:flex-row">
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        {range !== "today" && range !== "date" ? <input type="hidden" name="range" value={range} /> : null}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            name="q"
            defaultValue={sp.q}
            type="search"
            placeholder="Search by order number, table or item…"
            aria-label="Search history"
            className="h-12 w-full rounded-xl border border-line bg-white pl-11 pr-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <label className="relative sm:w-56">
          <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
          <span className="sr-only">Pick a date</span>
          <input
            name="date"
            type="date"
            max={today}
            defaultValue={range === "date" ? from : ""}
            className="h-12 w-full rounded-xl border border-line bg-white pl-11 pr-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <button className="min-h-12 rounded-xl bg-primary px-5 font-semibold text-white hover:bg-forest">Apply</button>
      </form>

      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-3">
        <nav aria-label="Date range" className="flex gap-2">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={qs({ range: r.key, date: undefined })}
              aria-current={range === r.key ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center rounded-full border px-4 text-[15px] font-semibold",
                range === r.key ? "border-primary bg-primary text-white" : "border-line bg-white text-ink hover:bg-canvas",
              )}
            >
              {r.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Status" className="flex gap-2">
          {STATUS.map((s) => (
            <Link
              key={s.key}
              href={qs({ status: s.key })}
              aria-current={status === s.key ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center rounded-full border px-4 text-[15px] font-semibold",
                status === s.key ? "border-forest bg-forest text-white" : "border-line bg-white text-ink hover:bg-canvas",
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Info className="h-6 w-6" aria-hidden />} title="No orders found">
          Nothing finished in this period matches your filters.
        </EmptyState>
      ) : (
        <>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-left text-[15px]">
              <thead className="bg-canvas text-sm text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Order #</th>
                  <th scope="col" className="px-4 py-3 font-medium">Table</th>
                  <th scope="col" className="px-4 py-3 font-medium">Items</th>
                  <th scope="col" className="px-4 py-3 font-medium">Time</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(({ o, stage }) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-mono text-xs">{o.reference}</td>
                    <td className="px-4 py-3 font-medium text-ink">{o.location_name}</td>
                    <td className="px-4 py-3 text-muted">{kitchenItems(o).map((i) => `${i.name_snapshot} × ${i.quantity}`).join(", ")}</td>
                    <td className="px-4 py-3 text-muted">{formatTime(o.created_at, tz)}</td>
                    <td className="px-4 py-3"><StatusBadge status={stage!} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <ul className="space-y-2.5 md:hidden">
            {rows.map(({ o, stage }) => (
              <li key={o.id} className="rounded-2xl border border-line bg-white p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{o.location_name}</p>
                    <p className="font-mono text-xs text-muted">{o.reference}</p>
                  </div>
                  <StatusBadge status={stage!} />
                </div>
                <p className="mt-2 text-sm text-muted">{kitchenItems(o).map((i) => `${i.name_snapshot} × ${i.quantity}`).join(", ")}</p>
                <p className="mt-1 text-xs text-muted">{formatTime(o.created_at, tz)}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">{rows.length} order{rows.length === 1 ? "" : "s"}</p>
        </>
      )}
    </>
  );
}
