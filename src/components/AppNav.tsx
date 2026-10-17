"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList, CookingPot, History, Home, LayoutGrid, Receipt, ScrollText, Settings, ShieldCheck,
  Users, UtensilsCrossed, WalletCards, BarChart3, CreditCard, UserRound, MoreHorizontal, PlusCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { RoleGlyph } from "@/components/RoleGlyph";
import type { NavIcon, NavItem } from "@/lib/nav";

/** The supplied table-and-chairs artwork, sized like a Lucide icon so it slots into the nav. */
const TableIcon = (({ className }: { className?: string }) => <RoleGlyph name="table" className={className} />) as unknown as typeof Home;

const ICONS: Record<NavIcon, typeof Home> = {
  home: Home,
  orders: ClipboardList,
  tables: TableIcon,
  account: UserRound,
  kitchen: CookingPot,
  history: History,
  cashier: Receipt,
  menu: UtensilsCrossed,
  staff: Users,
  more: MoreHorizontal,
  reports: BarChart3,
  expenses: WalletCards,
  settings: Settings,
  subscription: CreditCard,
  audit: ScrollText,
  "new-order": PlusCircle,
};

function useActive(items: NavItem[]) {
  const path = usePathname();
  // Longest matching href wins so /manager/menu does not also light up /manager.
  const match = [...items]
    .filter((i) => (i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return { path, active: match?.href };
}

/** Bottom tab bar for phones. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const { path, active } = useActive(items);
  const bar = items.filter((i) => i.primary);
  // Pages reached from "More" keep the More tab selected.
  const moreActive = bar.some((i) => i.href === "/manager/more") && !bar.some((i) => i.href === active) && path.startsWith("/manager");
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-safe-b lg:hidden no-print">
      <ul className="mx-auto flex max-w-xl">
        {bar.map((item) => {
          const Icon = ICONS[item.icon];
          const on = item.href === active || (item.href === "/manager/more" && moreActive);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[12px] font-medium",
                  on ? "text-primary" : "text-muted",
                )}
              >
                {on ? <span className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-primary" aria-hidden /> : null}
                <Icon className="h-6 w-6" aria-hidden strokeWidth={on ? 2.25 : 1.75} />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Full sidebar for tablets and desktops. */
export function SideNav({ items }: { items: NavItem[] }) {
  const { active } = useActive(items);
  const main = items.filter((i) => i.href !== "/manager/more");
  return (
    <nav aria-label="Main" className="hidden w-60 shrink-0 border-r border-line bg-white lg:block no-print">
      <ul className="sticky top-16 space-y-1 p-3">
        {main.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutGrid;
          const on = item.href === active;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium",
                  on ? "bg-primary/10 text-primary" : "text-ink hover:bg-canvas",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MoreLinks({ items }: { items: NavItem[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
      {items
        .filter((i) => !i.primary)
        .map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <li key={item.href}>
              <Link href={item.href} className="flex min-h-14 items-center gap-3 px-4 text-[15px] font-medium text-ink hover:bg-canvas">
                <Icon className="h-5 w-5 text-primary" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
    </ul>
  );
}
