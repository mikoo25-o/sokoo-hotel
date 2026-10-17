import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { Badge, PayBadge } from "@/components/ui/Badge";
import { Card, PageHeader, SectionTitle } from "@/components/ui/Card";
import { LiveRefresh } from "@/components/LiveRefresh";
import { OrderItemRow } from "@/components/OrderItemRow";
import { PaymentForm } from "@/components/cashier/PaymentForm";
import { ReverseForm, VerifyButton } from "@/components/cashier/ManagerPaymentTools";
import { createClient } from "@/lib/supabase/server";
import { loadOrder } from "@/lib/order-data";
import { CASHIER_ACCESS, requireRole } from "@/lib/session";
import { formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { uuidSchema } from "@/lib/validation";
import { n, type Payment } from "@/lib/types";

export const metadata = { title: "Bill" };

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireRole(CASHIER_ACCESS);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const order = await loadOrder(supabase, id);
  if (!order) notFound();
  const { data: pays } = await supabase
    .from("payments")
    .select("id, order_id, receipt_ref, amount_minor, method, transaction_ref, reference_verified, status, cashier_name, created_at, reversal_reason")
    .eq("order_id", id)
    .order("created_at", { ascending: true });
  const payments = (pays ?? []) as Payment[];

  const tz = ctx.current.restaurant.timezone;
  const isManager = ["owner", "manager"].includes(ctx.current.membership.role);
  const total = n(order.total_minor);
  const paid = n(order.amount_paid_minor);
  const balance = total - paid;
  const cancelled = order.status === "cancelled";

  return (
    <>
      <LiveRefresh restaurantId={ctx.current.restaurant.id} />
      <PageHeader
        back={
          <Link href="/cashier" className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Bills
          </Link>
        }
        title={`${order.location_name}`}
        subtitle={`${order.location_area} · ${formatDateTime(order.created_at, tz)}`}
        action={<PayBadge status={order.payment_status} />}
      />
      <p className="-mt-3 mb-4 font-mono text-sm text-muted">{order.reference}</p>

      <Card className="px-4">
        <ul className="divide-y divide-line">
          {order.order_items.map((i) => (
            <OrderItemRow key={i.id} item={i} />
          ))}
        </ul>
        <div className="space-y-1.5 border-t border-line py-3 text-[15px]">
          <div className="flex justify-between">
            <span className="text-muted">Bill total</span>
            <span className="font-display text-lg font-semibold text-ink">{formatMoney(total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Already paid</span>
            <span className="font-medium text-ink">{formatMoney(paid)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Remaining balance</span>
            <span className={balance > 0 ? "font-display text-lg font-semibold text-warn" : "font-semibold text-ok"}>{formatMoney(balance)}</span>
          </div>
        </div>
      </Card>

      {payments.length ? (
        <>
          <SectionTitle>Payments</SectionTitle>
          <ul className="space-y-2.5">
            {payments.map((p) => (
              <li key={p.id} className="rounded-2xl border border-line bg-white p-4 shadow-card">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      {formatMoney(p.amount_minor)} <span className="font-normal text-muted">· {p.method === "mpesa" ? "M-Pesa" : "Cash"}</span>
                    </p>
                    <p className="text-sm text-muted">
                      {formatDateTime(p.created_at, tz)} · {p.cashier_name}
                    </p>
                    <p className="font-mono text-xs text-muted">{p.receipt_ref}</p>
                    {p.transaction_ref ? <p className="font-mono text-xs text-ink">M-Pesa code {p.transaction_ref}</p> : null}
                    {p.status === "reversed" ? <p className="mt-1 text-sm text-danger">Reversed: {p.reversal_reason}</p> : null}
                  </div>
                  {p.status === "reversed" ? (
                    <Badge tone="danger">Reversed</Badge>
                  ) : p.method === "mpesa" ? (
                    <Badge tone={p.reference_verified ? "success" : "warn"}>{p.reference_verified ? "Verified" : "Unverified"}</Badge>
                  ) : null}
                  {p.status === "completed" ? (
                    <Link href={`/cashier/receipts/${p.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-canvas">
                      <FileText className="h-4 w-4" aria-hidden /> Receipt
                    </Link>
                  ) : null}
                </div>
                {isManager && p.status === "completed" ? (
                  <div className="mt-3 flex flex-wrap items-start gap-2">
                    {p.method === "mpesa" && !p.reference_verified ? <VerifyButton paymentId={p.id} /> : null}
                    <ReverseForm paymentId={p.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <SectionTitle>Take payment</SectionTitle>
      {cancelled ? (
        <Card className="p-5 text-[15px] text-muted">This order was cancelled, so it cannot be paid.</Card>
      ) : balance <= 0 ? (
        <Card className="border-ok/30 bg-ok/10 p-5 text-[15px] text-ok">This bill is fully paid.</Card>
      ) : (
        <Card className="p-5">
          <PaymentForm orderId={order.id} balanceMinor={balance} />
        </Card>
      )}
    </>
  );
}
