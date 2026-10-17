import { notFound } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ReceiptActions } from "@/components/cashier/ReceiptActions";
import { createClient } from "@/lib/supabase/server";
import { loadOrder } from "@/lib/order-data";
import { CASHIER_ACCESS, requireRole } from "@/lib/session";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { uuidSchema } from "@/lib/validation";
import { n, type Payment } from "@/lib/types";

export const metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRole(CASHIER_ACCESS);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("payments")
    .select("id, order_id, receipt_ref, amount_minor, method, transaction_ref, reference_verified, status, cashier_name, created_at, reversal_reason")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();
  const payment = p as Payment;
  const order = await loadOrder(supabase, payment.order_id);
  if (!order) notFound();

  const { data: all } = await supabase
    .from("payments")
    .select("amount_minor, created_at, status")
    .eq("order_id", payment.order_id)
    .eq("status", "completed")
    .lte("created_at", payment.created_at);
  const paidToDate = ((all ?? []) as { amount_minor: number | string }[]).reduce((s, r) => s + n(r.amount_minor), 0);
  const balanceAfter = n(order.total_minor) - paidToDate;

  const r = ctx.current.restaurant;
  const tz = r.timezone;
  const live = order.order_items.filter((i) => i.status !== "cancelled");
  const reversed = payment.status === "reversed";

  const shareText = [
    r.name,
    `Receipt ${payment.receipt_ref}`,
    `Order ${order.reference} (${order.location_name})`,
    ...live.map((i) => `${i.quantity} x ${i.name_snapshot}  ${formatMoney(i.line_total_minor)}`),
    `Total ${formatMoney(order.total_minor)}`,
    `Paid ${formatMoney(payment.amount_minor)} by ${payment.method === "mpesa" ? "M-Pesa" : "cash"}`,
    `Balance ${formatMoney(balanceAfter)}`,
    formatDateTime(payment.created_at, tz),
    r.receipt_footer ?? "Thank you!",
  ].join("\n");

  return (
    <>
      <div className="no-print mb-4 flex items-center gap-3 rounded-2xl border border-ok/30 bg-ok/10 p-4">
        <CircleCheck className="h-8 w-8 shrink-0 text-primary" aria-hidden />
        <div>
          <h1 className="font-display text-xl font-semibold text-ok">{reversed ? "Payment reversed" : "Payment recorded"}</h1>
          <p className="text-[15px] text-ink">{formatMoney(payment.amount_minor)} has been {reversed ? "reversed" : "saved"}.</p>
        </div>
      </div>

      <article aria-label="Receipt" className="mx-auto max-w-md rounded-2xl border border-line bg-white p-6 shadow-card print:border-0 print:shadow-none">
        <header className="text-center">
          <h2 className="font-display text-xl font-semibold text-ink">{r.name}</h2>
          {r.address ? <p className="text-sm text-muted">{r.address}</p> : null}
          {r.phone ? <p className="text-sm text-muted">Tel {r.phone}</p> : null}
          {r.receipt_header ? <p className="mt-1 text-sm text-ink">{r.receipt_header}</p> : null}
        </header>
        {reversed ? <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-center text-sm font-semibold text-danger">REVERSED: {payment.reversal_reason}</p> : null}

        <dl className="mt-4 space-y-1 border-y border-dashed border-line py-3 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted">Receipt</dt><dd className="font-mono">{payment.receipt_ref}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Order</dt><dd className="font-mono">{order.reference}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">{order.location_area}</dt><dd>{order.location_name}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Date</dt><dd>{formatDateTime(payment.created_at, tz)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">Cashier</dt><dd>{payment.cashier_name}</dd></div>
        </dl>

        <ul className="space-y-1.5 py-3 text-[15px]">
          {live.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span>{i.quantity} × {i.name_snapshot}</span>
              <span className="tabular-nums">{formatMoney(i.line_total_minor)}</span>
            </li>
          ))}
        </ul>

        <dl className="space-y-1.5 border-t border-dashed border-line pt-3 text-[15px]">
          <div className="flex justify-between"><dt className="text-muted">Bill total</dt><dd className="tabular-nums">{formatMoney(order.total_minor)}</dd></div>
          <div className="flex justify-between font-semibold text-ink">
            <dt>Paid now ({payment.method === "mpesa" ? "M-Pesa" : "Cash"})</dt>
            <dd className="tabular-nums">{formatMoney(payment.amount_minor)}</dd>
          </div>
          {payment.transaction_ref ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">M-Pesa code</dt>
              <dd className="flex items-center gap-2"><span className="font-mono">{payment.transaction_ref}</span><Badge tone={payment.reference_verified ? "success" : "warn"}>{payment.reference_verified ? "Verified" : "Unverified"}</Badge></dd>
            </div>
          ) : null}
          <div className="flex justify-between"><dt className="text-muted">Total paid so far</dt><dd className="tabular-nums">{formatMoney(paidToDate)}</dd></div>
          <div className="flex justify-between text-base font-semibold"><dt>Balance</dt><dd className={balanceAfter > 0 ? "text-warn" : "text-ok"}>{formatMoney(balanceAfter)}</dd></div>
        </dl>
        <p className="mt-5 text-center text-sm text-muted">{r.receipt_footer || "Thank you for dining with us."}</p>
        <p className="mt-1 text-center text-xs text-muted">Powered by SokoHotel</p>
      </article>

      <div className="mx-auto max-w-md">
        <ReceiptActions shareText={shareText} billHref={`/cashier/orders/${order.id}`} />
      </div>
    </>
  );
}
