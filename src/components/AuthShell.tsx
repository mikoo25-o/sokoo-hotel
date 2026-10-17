import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/cn";

/** Centred card used by the simple account pages. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-canvas px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link href="/" aria-label="SokoHotel home" className="mb-6 mt-4">
        <Logo variant="full" priority className="h-28 w-auto" />
      </Link>
      <div className={cn("w-full rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8", wide ? "max-w-2xl" : "max-w-md")}>
        <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <div className="mt-5 max-w-md text-center text-sm text-muted">{footer}</div> : null}
    </main>
  );
}

export function SetupNotice() {
  return (
    <div role="alert" className="mb-5 rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
      <p className="font-semibold">Database not connected</p>
      <p className="mt-1">
        Add <code className="rounded bg-white/60 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="rounded bg-white/60 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code className="rounded bg-white/60 px-1">.env.local</code>, then
        restart. Sign in and sign up stay switched off until this is done. See the README, section 2.
      </p>
    </div>
  );
}
