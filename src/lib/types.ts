import type { AppRole, ItemStatus, PayMethod, PayStatus, Fulfilment, SubStatus } from "@/lib/constants";

export interface Restaurant {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency: string;
  timezone: string;
  receipt_header: string | null;
  receipt_footer: string | null;
  takeaway_enabled: boolean;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface Membership {
  id: string;
  restaurant_id: string;
  user_id: string;
  role: AppRole;
  status: "active" | "deactivated";
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
}

export interface MenuCategory {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_minor: number | string;
  image_path: string | null;
  is_available: boolean;
  is_active: boolean;
  fulfilment: Fulfilment;
  sort_order: number;
}

export interface ServiceLocation {
  id: string;
  name: string;
  area: string;
  kind: "table" | "takeaway";
  seats: number | null;
  is_active: boolean;
  sort_order: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  name_snapshot: string;
  category_name: string | null;
  unit_price_minor: number | string;
  quantity: number;
  line_total_minor: number | string;
  fulfilment: Fulfilment;
  status: ItemStatus;
  notes: string | null;
  status_updated_at: string;
}

export interface Order {
  id: string;
  reference: string;
  location_id: string;
  location_name: string;
  location_area: string;
  created_by: string | null;
  waiter_name: string;
  status: ItemStatus;
  payment_status: PayStatus;
  guests: number | null;
  note: string | null;
  total_minor: number | string;
  amount_paid_minor: number | string;
  created_at: string;
  order_items?: OrderItem[];
}

export interface Payment {
  id: string;
  order_id: string;
  receipt_ref: string;
  amount_minor: number | string;
  method: PayMethod;
  transaction_ref: string | null;
  reference_verified: boolean;
  status: "completed" | "reversed";
  cashier_name: string;
  created_at: string;
  reversal_reason: string | null;
}

export interface WorkspaceStatus {
  status: SubStatus;
  stored_status: SubStatus;
  ends_at: string | null;
  grace_days: number;
  writable: boolean;
}

export const n = (v: number | string | null | undefined): number => Number(v ?? 0);
