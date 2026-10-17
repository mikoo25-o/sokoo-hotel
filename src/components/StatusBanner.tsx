import { Suspense } from "react";
import Link from "next/link";
import { Info, TriangleAlert } from "lucide-react";
import { formatDate } from "@/lib/dates";
import { getWorkspaceStatus } from "@/lib/session";
import type { WorkspaceStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

function SubscriptionNotice({ status, tz, canPay }: { status: WorkspaceStatus; tz: string; canPay: boolean }) {
  const end = status.ends_at ? formatDate(status.ends_at, tz) : null;
  let text: string | null = null;
  let tone: "info" | "warn" | "danger" = "info";
  if (status.status === "trial" && end) {
    const days = Math.ceil((new Date(status.ends_at!).getTime() - Date.now()) / 86400000);
    if (days <= 5) text = `Free trial ends ${end} (${Math.max(days, 0)} day${days === 1 ? "" : "s"} left).`;
  } else if (status.status === "grace" || status.status === "past_due") {
    text = `Subscription payment is overdue${end ? ` since ${end}` : ""}. Everything still works for now. Please renew to avoid a pause.`;
    tone = "warn";
  } else if (status.status === "suspended" || status.status === "cancelled") {
    text = "Subscription inactive: the restaurant is read-only. Nothing has been deleted. Reports and data exports still work.";
    tone = "danger";
  } else if (status.status === "active" && end) {
    const days = Math.ceil((new Date(status.ends_at!).getTime() - Date.now()) / 86400000);
    if (days <= 3) text = `Subscription renews on ${end}.`;
  }
  if (!text) return null;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 px-4 py-2.5 text-sm",
        tone === "info" && "bg-sky text-skyink",
        tone === "warn" && "bg-warn/10 text-warn",
        tone === "danger" && "bg-danger/10 text-danger",
      )}
    >
      {tone === "info" ? <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <span>
        {text}
        {canPay ? (
          <>
            {" "}
            <Link href="/manager/subscription" className="font-semibold underline underline-offset-2">
              Pay now
            </Link>
          </>
        ) : null}
      </span>
    </div>
  );
}


async function Loaded({ restaurantId, tz, canPay }: { restaurantId: string; tz: string; canPay: boolean }) {
  const status = await getWorkspaceStatus(restaurantId);
  if (!status) return null;
  return <SubscriptionNotice status={status} tz={tz} canPay={canPay} />;
}

/** Loads the subscription state on its own so the page itself is never held up waiting for it. */
export function StatusBanner({ restaurantId, tz, canPay }: { restaurantId: string; tz: string; canPay: boolean }) {
  return (
    <Suspense fallback={null}>
      <Loaded restaurantId={restaurantId} tz={tz} canPay={canPay} />
    </Suspense>
  );
}
