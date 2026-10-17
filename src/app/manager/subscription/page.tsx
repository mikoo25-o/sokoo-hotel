import { Info } from "lucide-react";
import { SubBadge } from "@/components/ui/Badge";
import { Card, PageHeader, SectionTitle } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceStatus, MANAGERS, requireRole } from "@/lib/session";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { n } from "@/lib/types";
import { mpesaConfigured } from "@/lib/env";
import { SubscriptionPay, type PayPlan } from "@/components/manager/SubscriptionPay";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/dates";
import type { SubStatus } from "@/lib/constants";

export const metadata = { title: "Subscription" };

const NOTICE: Record<SubStatus, string> = {
  trial: "You are on a free trial. Everything works normally.",
  active: "Your subscription is active.",
  past_due: "Your payment is due. Everything keeps working while you arrange payment.",
  grace: "Your plan has ended and you are in a grace period. Everything still works for now.",
  suspended: "Changes are paused because the subscription has lapsed. Your data is safe, and you can still view and export it.",
  cancelled: "This subscription is cancelled. Your data is kept, and you can still view and export it.",
};

export default async function SubscriptionPage() {
  const ctx = await requireRole(MANAGERS);
  const r = ctx.current.restaurant;
  const supabase = await createClient();
  const [status, { data: sub }] = await Promise.all([
    getWorkspaceStatus(r.id),
    supabase.from("subscriptions").select("status, trial_ends_at, current_period_end, grace_days, note, plan_id").maybeSingle(),
  ]);
  const { data: plan } = sub?.plan_id ? await supabase.from("subscription_plans").select("name, description, price_minor, billing_interval, max_staff").eq("id", sub.plan_id).maybeSingle() : { data: null };
  const { data: plans } = await supabase.from("subscription_plans").select("id, name, description, price_minor, billing_interval, max_staff").eq("is_active", true).gt("price_minor", 0).order("sort_order");
  const { data: history } = await supabase.from("subscription_payments").select("id, amount_minor, periods, status, mpesa_receipt, created_at").order("created_at", { ascending: false }).limit(20);
  const eff = status?.status ?? "trial";

  return (
    <>
      <PageHeader title="Subscription" subtitle={r.name} />
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3"><h2 className="font-display text-xl font-semibold text-ink">{plan?.name ?? "Free trial"}</h2><SubBadge status={eff} /></div>
        <p className="mt-2 text-[15px] text-ink">{NOTICE[eff]}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          {status?.ends_at ? <div><dt className="text-muted">{sub?.status === "trial" ? "Trial ends" : "Current period ends"}</dt><dd className="font-medium text-ink">{formatDate(status.ends_at, r.timezone)}</dd></div> : null}
          <div><dt className="text-muted">Grace period</dt><dd className="font-medium text-ink">{status?.grace_days ?? 7} days</dd></div>
          {plan ? <div><dt className="text-muted">Price</dt><dd className="font-medium text-ink">{formatMoney(plan.price_minor)} per {plan.billing_interval}</dd></div> : null}
        </dl>
        {sub?.note ? <p className="mt-3 text-sm text-muted">{sub.note}</p> : null}
      </Card>

      <SectionTitle>Pay for your subscription</SectionTitle>
      <Card className="p-5">
        <SubscriptionPay plans={(plans ?? []) as PayPlan[]} enabled={mpesaConfigured()} defaultPhone={ctx.profile.phone ?? ""} />
      </Card>

      <SectionTitle>Payment history</SectionTitle>
      {history?.length ? (
        <Card>
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{formatMoney(h.amount_minor)} · {h.periods} {h.periods === 1 ? "period" : "periods"}</p>
                  <p className="text-sm text-muted">{formatDateTime(h.created_at, r.timezone)}{h.mpesa_receipt ? ` · M-Pesa ${h.mpesa_receipt}` : ""}</p>
                </div>
                <Badge tone={h.status === "paid" ? "success" : h.status === "pending" ? "sky" : "danger"}>
                  {h.status === "paid" ? "Paid" : h.status === "pending" ? "Waiting" : h.status === "cancelled" ? "Cancelled" : h.status === "expired" ? "Expired" : "Failed"}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-5 text-[15px] text-muted">No payments yet.</Card>
      )}

      <Card className="mt-5 flex gap-3 p-5 text-sm text-muted">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div>
          <p>Your subscription is extended only after Safaricom confirms the payment. If a payment is confirmed but your date has not changed within a few minutes, contact SokoHotel support with the M-Pesa message.</p>
          <p className="mt-2">We never delete your restaurant&apos;s data because of a late payment. If a subscription lapses, the app becomes read-only, and you can still view reports and export your records.</p>
        </div>
      </Card>
    </>
  );
}
