import { StatusBadge } from "@/components/ui/Badge";
import { formatAmount } from "@/lib/money";
import type { OrderItem } from "@/lib/types";

export function OrderItemRow({ item, actions }: { item: OrderItem; actions?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-canvas px-2 text-sm font-semibold text-ink">{item.quantity}×</span>
      <div className="min-w-0 flex-1">
        <p className={item.status === "cancelled" ? "font-medium text-muted line-through" : "font-medium text-ink"}>{item.name_snapshot}</p>
        <p className="text-sm text-muted">
          KSh {formatAmount(item.unit_price_minor)} each{item.fulfilment === "waiter" ? " · waiter serves" : ""}
        </p>
        {item.notes ? <p className="text-sm text-warn">Note: {item.notes}</p> : null}
      </div>
      <StatusBadge status={item.status} />
      <span className="w-20 text-right text-sm font-semibold text-ink">{formatAmount(item.line_total_minor)}</span>
      {actions}
    </li>
  );
}
