import { ScrollText } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { MANAGERS, requireRole } from "@/lib/session";
import { formatDateTime } from "@/lib/dates";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Audit log" };

const LABELS: Record<string, string> = {
  restaurant_created: "Restaurant created", join_code_rotated: "Joining code replaced", join_code_revoked: "Joining switched off",
  join_approved: "Join request approved", join_rejected: "Join request declined", role_changed: "Role changed", payment_reference_verified: "M-Pesa code verified", expense_created: "Expense added", expense_corrected: "Expense corrected", order_item_cancelled: "Order item cancelled",
  member_deactivated: "Access removed", member_reactivated: "Access restored", menu_price_changed: "Menu price changed",
  payment_recorded: "Payment recorded", payment_reversed: "Payment reversed", payment_verified: "M-Pesa code verified",
  expense_voided: "Expense voided", data_exported: "Data exported", subscription_changed: "Subscription changed",
};
const pretty = (a: string) => LABELS[a] ?? a.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function summary(d: Record<string, unknown>): string {
  const bits: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === "" || typeof v === "object") continue;
    bits.push(`${k.replace(/_/g, " ")}: ${/_minor$/.test(k) ? (Number(v) / 100).toLocaleString("en-KE") : String(v)}`);
  }
  return bits.slice(0, 5).join(" · ");
}

export default async function AuditPage() {
  const ctx = await requireRole(MANAGERS);
  const tz = ctx.current.restaurant.timezone;
  const supabase = await createClient();
  const { data } = await supabase.from("audit_logs").select("id, actor_id, action, entity, entity_id, details, created_at").order("created_at", { ascending: false }).limit(150);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((x) => x.actor_id).filter((x): x is string => !!x))];
  const { data: profs } = ids.length ? await supabase.from("profiles").select("id, full_name, phone").in("id", ids) : { data: [] };
  const names = new Map(((profs ?? []) as Profile[]).map((p) => [p.id, p.full_name]));

  return (
    <>
      <PageHeader title="Audit log" subtitle="Who changed what. Entries cannot be edited or deleted." />
      {!rows.length ? (
        <EmptyState icon={<ScrollText className="h-6 w-6" aria-hidden />} title="No activity recorded yet">Important changes like prices, roles, reversals and exports are listed here.</EmptyState>
      ) : (
        <Card><ul className="divide-y divide-line">
          {rows.map((x) => (
            <li key={x.id} className="px-4 py-3.5">
              <p className="font-semibold text-ink">{pretty(x.action)}</p>
              <p className="text-sm text-muted">{formatDateTime(x.created_at, tz)} · {x.actor_id ? (names.get(x.actor_id) || "A team member") : "System"}</p>
              {summary((x.details ?? {}) as Record<string, unknown>) ? <p className="mt-0.5 text-sm text-ink">{summary((x.details ?? {}) as Record<string, unknown>)}</p> : null}
            </li>
          ))}
        </ul></Card>
      )}
    </>
  );
}
