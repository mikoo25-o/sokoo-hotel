export type AppRole = "owner" | "manager" | "waiter" | "kitchen" | "cashier";

/** What the user can pick on the login screen. "manager" accepts owner and manager. */
export type LoginRole = "waiter" | "kitchen" | "cashier" | "manager";

export const LOGIN_ROLES: { value: LoginRole; label: string; hint: string }[] = [
  { value: "waiter", label: "Waiter", hint: "Take orders & serve" },
  { value: "kitchen", label: "Kitchen", hint: "Prepare orders" },
  { value: "cashier", label: "Cashier", hint: "Record payments" },
  { value: "manager", label: "Manager", hint: "Manage restaurant" },
];

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "Owner",
  manager: "Manager",
  waiter: "Waiter",
  kitchen: "Kitchen",
  cashier: "Cashier",
};

export const ROLE_HOME: Record<AppRole, string> = {
  owner: "/manager",
  manager: "/manager",
  waiter: "/waiter",
  kitchen: "/kitchen",
  cashier: "/cashier",
};

export function matchesLoginRole(role: AppRole, requested: LoginRole): boolean {
  return requested === "manager" ? role === "owner" || role === "manager" : role === requested;
}

export type ItemStatus = "pending" | "preparing" | "ready" | "served" | "cancelled";
export type OrderStatus = ItemStatus;
export type PayStatus = "unpaid" | "partial" | "paid";
export type PayMethod = "cash" | "mpesa";
export type Fulfilment = "kitchen" | "waiter";
export type SubStatus = "trial" | "active" | "past_due" | "grace" | "suspended" | "cancelled";

export const EXPENSE_CATEGORIES = [
  { value: "stock", label: "Stock" },
  { value: "supplies", label: "Supplies" },
  { value: "wages", label: "Wages" },
  { value: "rent", label: "Rent" },
  { value: "utilities", label: "Utilities" },
  { value: "transport", label: "Transport" },
  { value: "repairs", label: "Repairs" },
  { value: "other", label: "Other" },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

export const WORKSPACE_COOKIE = "sh_ws";

export const SITE_NAME = "SokoHotel";
export const TAGLINE = "Smarter Restaurant Operations";

/** Columns of public.restaurants that the browser may read (join_code is excluded on purpose). */
export const RESTAURANT_COLUMNS =
  "id, name, phone, email, address, currency, timezone, receipt_header, receipt_footer, takeaway_enabled, settings, created_at";
export const TIMEZONE_OPTIONS = ['Africa/Nairobi','Africa/Kampala','Africa/Dar_es_Salaam','Africa/Kigali','Africa/Addis_Ababa','UTC'];
