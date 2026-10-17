"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guard } from "@/lib/action-guard";
import { done, errorMessage, fail, type ActionState } from "@/lib/errors";
import { mpesaConfigured } from "@/lib/env";
import { normalizeKenyanPhone, stkPush, stkQuery } from "@/lib/mpesa";
import { createServiceClient } from "@/lib/supabase/service";
import { fieldErrors, formObject, uuidSchema } from "@/lib/validation";
import { MANAGERS } from "@/lib/session";

const schema = z.object({
  plan_id: uuidSchema,
  periods: z.coerce.number().int().min(1).max(12),
  phone: z.string().trim().min(1, "Enter the M-Pesa phone number"),
});

/**
 * Asks the manager's phone to approve a subscription payment. The price comes
 * from the plan in the database. The subscription is only extended later, when
 * Safaricom confirms the payment (see /api/billing/callback).
 */
export async function startSubscriptionPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const g = await guard(MANAGERS);
  if (!g.ok) return g.error;
  if (!mpesaConfigured()) return fail("Online payment is not switched on for this SokoHotel server yet. Please contact SokoHotel support.");
  const p = schema.safeParse(formObject(fd));
  if (!p.success) return fail("Check the form.", fieldErrors(p.error));
  const phone = normalizeKenyanPhone(p.data.phone);
  if (!phone) return fail("Check the form.", { phone: "Use a Safaricom number like 0712 345 678" });
  const service = createServiceClient();
  if (!service) return fail("Online payment is not switched on for this SokoHotel server yet. Please contact SokoHotel support.");

  const { data, error } = await g.supabase.rpc("start_subscription_payment", {
    p_restaurant: g.restaurantId,
    p_plan: p.data.plan_id,
    p_phone: phone,
    p_periods: p.data.periods,
  });
  if (error) return fail(errorMessage(error));
  const started = data as { id: string; amount_minor: number };

  try {
    const r = await stkPush({
      phone,
      amountKes: started.amount_minor / 100,
      reference: `SH${started.id.slice(0, 8).toUpperCase()}`,
      description: "SokoHotel",
    });
    await service.rpc("record_stk_initiated", { p_payment: started.id, p_checkout: r.checkoutRequestId, p_merchant: r.merchantRequestId });
  } catch (e) {
    await service.rpc("fail_subscription_payment", { p_payment: started.id, p_desc: (e as Error).message });
    return fail("Could not send the M-Pesa prompt. Check the number and try again.");
  }
  revalidatePath("/manager/subscription");
  return done("Check your phone and enter your M-Pesa PIN to approve.", { paymentId: started.id });
}

/**
 * Settles a payment from Safaricom's own answer when the callback has not
 * arrived (or to show the result sooner). Safe to call repeatedly.
 */
export async function checkSubscriptionPaymentAction(paymentId: string): Promise<{ status: string; message?: string }> {
  const g = await guard(MANAGERS);
  if (!g.ok) return { status: "error", message: g.error.message };
  if (!uuidSchema.safeParse(paymentId).success) return { status: "error" };
  const { data: row } = await g.supabase
    .from("subscription_payments")
    .select("id, status, checkout_request_id, amount_minor, created_at")
    .eq("id", paymentId)
    .maybeSingle();
  if (!row) return { status: "error", message: errorMessage("not_found") };
  if (row.status !== "pending") return { status: row.status };
  if (!row.checkout_request_id) return { status: "pending" };

  const service = createServiceClient();
  if (!service) return { status: "pending" };
  try {
    const q = await stkQuery(row.checkout_request_id);
    if (q.state === "pending") {
      // Prompts that nobody answered stop waiting after a while.
      if (Date.now() - new Date(row.created_at).getTime() > 3 * 60_000 + 30_000) {
        await service.rpc("apply_subscription_payment", { p_checkout: row.checkout_request_id, p_result_code: 1037, p_result_desc: "No response from the phone", p_receipt: null, p_amount_minor: null });
        revalidatePath("/manager/subscription");
        return { status: "expired" };
      }
      return { status: "pending" };
    }
    const code = q.state === "paid" ? 0 : q.code;
    const desc = q.state === "paid" ? "Confirmed by Safaricom" : q.desc;
    await service.rpc("apply_subscription_payment", { p_checkout: row.checkout_request_id, p_result_code: code, p_result_desc: desc, p_receipt: null, p_amount_minor: null });
  } catch {
    return { status: "pending" };
  }
  revalidatePath("/", "layout");
  const { data: after } = await g.supabase.from("subscription_payments").select("status").eq("id", paymentId).maybeSingle();
  return { status: after?.status ?? "pending" };
}
