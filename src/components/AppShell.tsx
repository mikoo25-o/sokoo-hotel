import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BottomNav, SideNav } from "@/components/AppNav";
import { navFor } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/constants";
import { SignOutButton } from "@/components/SignOutButton";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import type { AppContext, Workspace } from "@/lib/session";
import { cn } from "@/lib/cn";

export function AppShell({
  ctx,
  workspace,
  banner,
  children,
  wide = false,
}: {
  ctx: AppContext;
  workspace: Workspace;
  /** Optional strip under the header, for example the subscription notice. Streams in without blocking the page. */
  banner?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const role = workspace.membership.role;
  const items = navFor(role);
  const name = ctx.profile.full_name || ctx.user.email?.split("@")[0] || "Staff";
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-40 bg-primary text-white no-print">
        <div className="flex h-16 items-center gap-3 px-4">
          <Link href="/" aria-label="SokoHotel home" className="flex min-w-0 items-center gap-3">
            <Logo variant="mark" white className="h-9 w-9 shrink-0" />
            <span className="min-w-0 leading-tight">
              <span className="block font-display text-lg font-semibold">SokoHotel</span>
              <span className="block truncate text-xs text-white/90">{workspace.restaurant.name}</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {ctx.workspaces.length > 1 ? (
              <Link href="/workspace" className="hidden rounded-lg px-2.5 py-1.5 text-sm text-white/90 hover:bg-white/10 sm:block">
                Switch restaurant
              </Link>
            ) : null}
            <Link
              href="/account"
              className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/10"
              aria-label={`Account: ${name}, ${ROLE_LABEL[role]}`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-semibold text-forest">{initials || "U"}</span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block max-w-36 truncate text-sm font-medium">{name}</span>
                <span className="block text-xs text-white/90">{ROLE_LABEL[role]}</span>
              </span>
            </Link>
            <SignOutButton />
          </div>
        </div>
        <ConnectionBanner />
        {banner}
      </header>
      <div className="flex">
        <SideNav items={items} />
        <main className={cn("min-w-0 flex-1 px-4 pb-28 pt-5 lg:pb-10 lg:pt-8", wide ? "lg:px-8" : "lg:px-10")}>
          <div className={cn("mx-auto w-full", wide ? "max-w-7xl" : "max-w-3xl")}>{children}</div>
        </main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}
