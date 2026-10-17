import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ItemStatus, PayStatus, SubStatus } from "@/lib/constants";

type Tone = "neutral" | "warn" | "primary" | "success" | "danger" | "dark" | "sky";

const TONES: Record<Tone, string> = {
  neutral: "bg-line/60 text-muted",
  warn: "bg-warn/10 text-warn",
  sky: "bg-sky text-skyink",
  primary: "bg-primary/10 text-primary",
  success: "bg-ok/10 text-ok",
  danger: "bg-danger/10 text-danger",
  dark: "bg-forest text-white",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", TONES[tone], className)}>
      {children}
    </span>
  );
}

const ITEM_TONE: Record<ItemStatus, Tone> = {
  pending: "warn",
  preparing: "sky",
  ready: "success",
  served: "neutral",
  cancelled: "danger",
};
const ITEM_LABEL: Record<ItemStatus, string> = {
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  return <Badge tone={ITEM_TONE[status]}>{ITEM_LABEL[status]}</Badge>;
}

const PAY_TONE: Record<PayStatus, Tone> = { unpaid: "warn", partial: "sky", paid: "success" };
const PAY_LABEL: Record<PayStatus, string> = { unpaid: "Unpaid", partial: "Partially paid", paid: "Paid" };

export function PayBadge({ status }: { status: PayStatus }) {
  return <Badge tone={PAY_TONE[status]}>{PAY_LABEL[status]}</Badge>;
}

const SUB_LABEL: Record<SubStatus, string> = {
  trial: "Free trial",
  active: "Active",
  past_due: "Payment due",
  grace: "Grace period",
  suspended: "Suspended",
  cancelled: "Cancelled",
};
const SUB_TONE: Record<SubStatus, Tone> = {
  trial: "primary",
  active: "success",
  past_due: "warn",
  grace: "warn",
  suspended: "danger",
  cancelled: "danger",
};

export function SubBadge({ status }: { status: SubStatus }) {
  return <Badge tone={SUB_TONE[status]}>{SUB_LABEL[status]}</Badge>;
}

export const statusLabel = (s: ItemStatus) => ITEM_LABEL[s];
