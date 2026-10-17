import type { ItemStatus } from "@/lib/constants";
import type { Order, OrderItem } from "@/lib/types";

export type KitchenOrder = Order & { order_items: OrderItem[] };
export type KitchenStage = "pending" | "preparing" | "ready" | "served";

/** Only the items the kitchen is responsible for, minus cancelled ones. */
export const kitchenItems = (o: KitchenOrder) => o.order_items.filter((i) => i.fulfilment === "kitchen" && i.status !== "cancelled");

/** Where an order stands from the kitchen's point of view. Null when it has no kitchen items. */
export function kitchenStage(o: KitchenOrder): KitchenStage | null {
  const items = kitchenItems(o);
  if (!items.length) return null;
  const has = (s: ItemStatus) => items.some((i) => i.status === s);
  if (items.every((i) => i.status === "served")) return "served";
  if (items.every((i) => i.status === "ready" || i.status === "served")) return "ready";
  if (has("preparing") || (has("pending") && (has("ready") || has("served")))) return "preparing";
  return "pending";
}
