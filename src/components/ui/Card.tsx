import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ children, className, tone = "white" }: { children: ReactNode; className?: string; tone?: "white" | "sky" }) {
  return (
    <div className={cn("rounded-2xl border shadow-card", tone === "sky" ? "border-skyline bg-sky text-skyink" : "border-line bg-white", className)}>{children}</div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="font-display text-2xl font-semibold leading-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-[15px] text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center justify-between gap-3 first:mt-0">
      <h2 className="font-display text-lg font-semibold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white px-6 py-10 text-center">
      {icon ? <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky text-skyd">{icon}</div> : null}
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      {children ? <p className="mt-1 max-w-sm text-sm text-muted">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  note,
  icon,
  tone = "white",
  valueClass,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
  tone?: "white" | "sky";
  valueClass?: string;
}) {
  const sky = tone === "sky";
  return (
    <Card tone={tone} className="p-4">
      <div className={cn("flex items-center gap-2 text-sm", sky ? "text-skyink/80" : "text-muted")}>
        {icon ? <span className={sky ? "text-skyd" : "text-primary"}>{icon}</span> : null}
        {label}
      </div>
      <div className={cn("mt-1.5 font-display text-2xl font-semibold", sky ? "text-skyink" : "text-ink", valueClass)}>{value}</div>
      {note ? <div className={cn("mt-0.5 text-xs", sky ? "text-skyink/75" : "text-muted")}>{note}</div> : null}
    </Card>
  );
}
