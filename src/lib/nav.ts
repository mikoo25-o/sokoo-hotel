import type { AppRole } from "@/lib/constants";

export type NavIcon =
  | "home" | "orders" | "tables" | "account" | "kitchen" | "history" | "cashier"
  | "menu" | "staff" | "more" | "reports" | "expenses" | "settings" | "subscription" | "audit" | "new-order";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Shown in the phone bottom bar. Others appear in the desktop sidebar and the "More" page. */
  primary?: boolean;
  /** Matches only the exact path (for home links). */
  exact?: boolean;
}

export function navFor(role: AppRole): NavItem[] {
  switch (role) {
    case "waiter":
      return [
        { href: "/waiter", label: "Home", icon: "home", primary: true, exact: true },
        { href: "/waiter/orders", label: "Orders", icon: "orders", primary: true },
        { href: "/waiter/tables", label: "Tables", icon: "tables", primary: true },
        { href: "/account", label: "Account", icon: "account", primary: true },
      ];
    case "kitchen":
      return [
        { href: "/kitchen", label: "Kitchen", icon: "kitchen", primary: true, exact: true },
        { href: "/kitchen/history", label: "Order History", icon: "history", primary: true },
        { href: "/account", label: "Account", icon: "account", primary: true },
      ];
    case "cashier":
      return [
        { href: "/cashier", label: "Bills", icon: "cashier", primary: true, exact: true },
        { href: "/account", label: "Account", icon: "account", primary: true },
      ];
    default:
      return [
        { href: "/manager", label: "Home", icon: "home", primary: true, exact: true },
        { href: "/manager/orders", label: "Orders", icon: "orders", primary: true },
        { href: "/manager/menu", label: "Menu", icon: "menu", primary: true },
        { href: "/manager/staff", label: "Staff", icon: "staff", primary: true },
        { href: "/manager/more", label: "More", icon: "more", primary: true },
        { href: "/waiter/tables", label: "New order", icon: "new-order" },
        { href: "/kitchen", label: "Kitchen view", icon: "kitchen" },
        { href: "/cashier", label: "Cashier view", icon: "cashier" },
        { href: "/manager/reports", label: "Reports", icon: "reports" },
        { href: "/manager/expenses", label: "Expenses", icon: "expenses" },
        { href: "/manager/settings", label: "Settings", icon: "settings" },
        { href: "/manager/subscription", label: "Subscription", icon: "subscription" },
        { href: "/manager/audit", label: "Audit log", icon: "audit" },
        { href: "/account", label: "Account", icon: "account" },
      ];
  }
}
