"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard } from "@/lib/action-guard";
import { done, errorMessage, fail, type ActionState } from "@/lib/errors";
import { generateOrderReference } from "@/lib/refs";
import { uuidSchema } from "@/lib/validation";
import { CASHIER_ACCESS, KITCHEN_ACCESS, WAITER_ACCESS } from "@/lib/session";
import type { AppRole } from "@/lib/constants";

const orderSchema = z.object({
  locationId: uuidSchema,
  idempotencyKey: z.string().min(8).max(80),
  note: z.string().trim().max(300).optional(),
  guests: z.number().int().min(1).max(100).nullable().optional(),
  items: z
    .array(
      z.object({
        menu_item_id: uuidSchema,
        quantity: z.number().int().min(1).max(99),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, "Add at least one item before sending the order.")
    .max(50),
});

export type OrderPayload = z.input<typeof orderSchema>;

/**
 * Saves a new order. Prices, names and fulfilment type come from the menu in
 * the database, so nothing the browser sends can change what is charged. The
 * result is only reported as successful after the database has committed.
 */
export async function createOrderAction(payload: OrderPayload): Promise<ActionState> {
  const g = await guard(WAITER_ACCESS);
  if (!g.ok) return g.error;
  const parsed = orderSchema.safeParse(payload);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the order and try again.");
  const o = parsed.data;

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await g.supabase.rpc("create_order", {
      p_restaurant: g.restaurantId,
      p_reference: generateOrderReference(g.ctx.current.restaurant.timezone),
      p_location: o.locationId,
      p_items: o.items.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity, note: i.note ?? "" })),
      p_idempotency: o.idempotencyKey,
      p_note: o.note || null,
      p_guests: o.guests ?? null,
    });
    if (!error && data) {
      const r = data as { id: string; reference: string; total_minor: number };
      revalidatePath("/", "layout");
      return done("Order sent.", { id: r.id, reference: r.reference });
    }
    // A reference collision (or a simultaneous duplicate submit): try again.
    if (error?.code === "23505") continue;
    return fail(errorMessage(error));
  }
  return fail("Could not save the order. Please try again.");
}

const statusSchema = z.enum(["preparing", "ready", "served", "cancelled", "pending"]);

async function changeItem(roles: AppRole[], itemId: string, to: string): Promise<ActionState> {
  const g = await guard(roles);
  if (!g.ok) return g.error;
  const id = uuidSchema.safeParse(itemId);
  const status = statusSchema.safeParse(to);
  if (!id.success || !status.success) return fail(errorMessage("invalid_transition"));
  const { error } = await g.supabase.rpc("set_item_status", { p_item: id.data, p_to: status.data });
  if (error) return fail(errorMessage(error));
  revalidatePath("/", "layout");
  return done();
}

async function changeOrder(roles: AppRole[], orderId: string, to: string): Promise<ActionState> {
  const g = await guard(roles);
  if (!g.ok) return g.error;
  const id = uuidSchema.safeParse(orderId);
  const status = z.enum(["preparing", "ready", "served"]).safeParse(to);
  if (!id.success || !status.success) return fail(errorMessage("invalid_transition"));
  const { data, error } = await g.supabase.rpc("bulk_set_items_status", { p_order: id.data, p_to: status.data });
  if (error) return fail(errorMessage(error));
  revalidatePath("/", "layout");
  return done(`${data} item${data === 1 ? "" : "s"} updated.`);
}

/** Kitchen: start or finish a kitchen item. Waiters and managers use the same function for serving and cancelling. */
export async function setItemStatusAction(itemId: string, to: string) {
  return changeItem([...KITCHEN_ACCESS, ...WAITER_ACCESS], itemId, to);
}

export async function bulkSetStatusAction(orderId: string, to: string) {
  return changeOrder([...KITCHEN_ACCESS, ...WAITER_ACCESS], orderId, to);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
import { parseMoneyToMinor } from "@/lib/money";
import { MPESA_CODE_RE } from "@/lib/validation";
import { redirect } from "next/navigation";

const paymentSchema = z.object({
  order_id: uuidSchema,
  method: z.enum(["cash", "mpesa"]),
  amount: z.string().min(1, "Enter the amount received"),
  txn: z.string().trim().toUpperCase().optional(),
  key: z.string().min(8).max(80),
});

export async function recordPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard(CASHIER_ACCESS);
  if (!g.ok) return g.error;
  const parsed = paymentSchema.safeParse({
    order_id: formData.get("order_id"),
    method: formData.get("method"),
    amount: String(formData.get("amount") ?? ""),
    txn: String(formData.get("txn") ?? "").replace(/\s+/g, ""),
    key: formData.get("key"),
  });
  if (!parsed.success) return fail("Check the payment details.", { amount: parsed.error.issues[0]?.message ?? "Check the amount" });
  const p = parsed.data;
  const minor = parseMoneyToMinor(p.amount);
  if (minor === null || minor <= 0) return fail("Enter a valid amount, for example 350 or 350.50.", { amount: "Enter a valid amount" });
  if (p.method === "mpesa" && !MPESA_CODE_RE.test(p.txn ?? "")) {
    return fail(errorMessage("invalid_transaction_ref"), { txn: "10 letters and numbers, e.g. QJK7L8M9N0" });
  }

  const { generateReceiptRef } = await import("@/lib/refs");
  let paymentId: string | null = null;
  for (let attempt = 0; attempt < 4 && !paymentId; attempt++) {
    const { data, error } = await g.supabase.rpc("record_payment", {
      p_order: p.order_id,
      p_amount: minor,
      p_method: p.method,
      p_txn_ref: p.method === "mpesa" ? p.txn : null,
      p_receipt_ref: generateReceiptRef(g.ctx.current.restaurant.timezone),
      p_idempotency: p.key,
    });
    if (!error && data) {
      paymentId = (data as { payment_id: string }).payment_id;
      break;
    }
    if (error?.code === "23505" && !/transaction_ref|payments_mpesa/.test(error.message)) continue;
    return fail(errorMessage(error));
  }
  if (!paymentId) return fail("Could not record the payment. Please try again.");
  revalidatePath("/", "layout");
  redirect(`/cashier/receipts/${paymentId}`);
}

export async function reversePaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const g = await guard(["owner", "manager"]);
  if (!g.ok) return g.error;
  const id = uuidSchema.safeParse(formData.get("payment_id"));
  if (!id.success) return fail(errorMessage("not_found"));
  const { error } = await g.supabase.rpc("reverse_payment", { p_payment: id.data, p_reason: String(formData.get("reason") ?? "") });
  if (error) return fail(errorMessage(error));
  revalidatePath("/", "layout");
  return done("Payment reversed. The original record is kept for the audit trail.");
}

export async function verifyPaymentAction(paymentId: string): Promise<ActionState> {
  const g = await guard(["owner", "manager"]);
  if (!g.ok) return g.error;
  const id = uuidSchema.safeParse(paymentId);
  if (!id.success) return fail(errorMessage("not_found"));
  const { error } = await g.supabase.rpc("verify_payment_reference", { p_payment: id.data });
  if (error) return fail(errorMessage(error));
  revalidatePath("/", "layout");
  return done("M-Pesa code marked as verified.");
}
