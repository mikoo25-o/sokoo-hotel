import Link from "next/link";
import { Paperclip, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui/Card";
import { AddExpense, VoidExpense } from "@/components/manager/ExpenseForms";
import { createClient } from "@/lib/supabase/server";
import { MANAGERS, requireRole } from "@/lib/session";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { addDays, formatDate, isDateString, localDateString } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { n } from "@/lib/types";
import { cn } from "@/lib/cn";

export const metadata = { title: "Expenses" };

interface Row { id: string; amount_minor: number | string; category: string; expense_date: string; description: string; payment_method: string; payment_reference: string | null; receipt_path: string | null; created_by_name: string; voided_at: string | null; void_reason: string | null }

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; category?: string }> }) {
  const ctx = await requireRole(MANAGERS);
  const sp = await searchParams;
  const r = ctx.current.restaurant;
  const today = localDateString(new Date(), r.timezone);
  const from = isDateString(sp.from) ? sp.from : addDays(today, -29);
  const to = isDateString(sp.to) ? sp.to : today;
  const cat = EXPENSE_CATEGORIES.find((c) => c.value === sp.category)?.value;

  const supabase = await createClient();
  let q = supabase
    .from("expenses")
    .select("id, amount_minor, category, expense_date, description, payment_method, payment_reference, receipt_path, created_by_name, voided_at, void_reason")
    .gte("expense_date", from).lte("expense_date", to)
    .order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(300);
  if (cat) q = q.eq("category", cat);
  const { data } = await q;
  const rows = (data ?? []) as Row[];
  const live = rows.filter((x) => !x.voided_at);
  const total = live.reduce((s, x) => s + n(x.amount_minor), 0);

  const paths = rows.map((x) => x.receipt_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("expense-receipts").createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.signedUrl && s.path) urls.set(s.path, s.signedUrl);
  }
  const label = (v: string) => EXPENSE_CATEGORIES.find((c) => c.value === v)?.label ?? v;

  return (
    <>
      <PageHeader title="Expenses" subtitle="Money going out. Voided entries are kept but not counted." action={<AddExpense restaurantId={r.id} today={today} />} />

      <form method="get" className="mb-4 grid grid-cols-2 gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-4">
        <label className="text-sm font-medium text-ink">From<input type="date" name="from" defaultValue={from} max={today} className="mt-1 h-11 w-full rounded-xl border border-line px-3" /></label>
        <label className="text-sm font-medium text-ink">To<input type="date" name="to" defaultValue={to} max={today} className="mt-1 h-11 w-full rounded-xl border border-line px-3" /></label>
        <label className="col-span-2 text-sm font-medium text-ink sm:col-span-1">Category
          <select name="category" defaultValue={cat ?? ""} className="mt-1 h-11 w-full rounded-xl border border-line bg-white px-3">
            <option value="">All</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <button className="col-span-2 h-11 self-end rounded-xl bg-primary font-semibold text-white hover:bg-forest sm:col-span-1">Apply</button>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3"><Stat label="Total spent" icon={<Wallet className="h-4 w-4" />} value={formatMoney(total)} note={`${formatDate(from, r.timezone)} to ${formatDate(to, r.timezone)}`} /><Stat label="Entries" value={String(live.length)} note="Not voided" /></div>

      {rows.length === 0 ? (
        <EmptyState icon={<Wallet className="h-6 w-6" aria-hidden />} title="No expenses in this period">Record stock, wages, rent and other costs so reports can show an honest estimated profit.</EmptyState>
      ) : (
        <Card><ul className="divide-y divide-line">
          {rows.map((x) => (
            <li key={x.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3.5", x.voided_at && "bg-canvas")}>
              <div className="min-w-0 flex-1">
                <p className={cn("font-semibold text-ink", x.voided_at && "line-through")}>{x.description}</p>
                <p className="text-sm text-muted">{formatDate(x.expense_date, r.timezone)} · {label(x.category)} · {x.payment_method === "mpesa" ? "M-Pesa" : x.payment_method}{x.payment_reference ? ` ${x.payment_reference}` : ""} · {x.created_by_name || "Unknown"}</p>
                {x.voided_at ? <p className="text-sm text-danger">Voided: {x.void_reason}</p> : null}
              </div>
              {x.receipt_path && urls.get(x.receipt_path) ? (
                <Link href={urls.get(x.receipt_path)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary"><Paperclip className="h-4 w-4" aria-hidden /> Receipt</Link>
              ) : null}
              {x.voided_at ? <Badge tone="danger">Voided</Badge> : null}
              <span className={cn("font-display text-lg font-semibold", x.voided_at ? "text-muted line-through" : "text-ink")}>{formatMoney(x.amount_minor)}</span>
              {!x.voided_at ? <VoidExpense id={x.id} /> : null}
            </li>
          ))}
        </ul></Card>
      )}
    </>
  );
}
