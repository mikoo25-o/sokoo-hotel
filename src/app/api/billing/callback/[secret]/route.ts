import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { mpesaConfig } from "@/lib/env";
import { stkQuery } from "@/lib/mpesa";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const ACK = { ResultCode: 0, ResultDesc: "Accepted" };

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

interface Item { Name: string; Value?: string | number }

/**
 * Safaricom calls this when a subscription prompt is approved, declined or
 * times out. Daraja callbacks are not signed, so three things protect it:
 *   1. a long random secret in the address (only Safaricom is told it),
 *   2. the checkout id must match a payment we started and it must still be pending,
 *   3. a "paid" claim is checked with Safaricom's own query API before it is
 *      believed, and the amount must match what we asked for.
 * Anything that does not check out is ignored. The reply is always the same.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ secret: string }> }) {
  const cfg = mpesaConfig();
  const { secret } = await ctx.params;
  if (!cfg || !sameSecret(secret, cfg.callbackSecret)) return new NextResponse("Not found", { status: 404 });

  const service = createServiceClient();
  if (!service) return NextResponse.json(ACK);

  let cb: { CheckoutRequestID?: string; ResultCode?: number | string; ResultDesc?: string; CallbackMetadata?: { Item?: Item[] } } | undefined;
  try {
    cb = (await req.json())?.Body?.stkCallback;
  } catch {
    return NextResponse.json(ACK);
  }
  const checkout = cb?.CheckoutRequestID;
  if (!cb || typeof checkout !== "string" || checkout.length > 100) return NextResponse.json(ACK);

  const code = Number(cb.ResultCode);
  const items = cb.CallbackMetadata?.Item ?? [];
  const pick = (name: string) => items.find((i) => i.Name === name)?.Value;
  const amount = pick("Amount");
  const receipt = pick("MpesaReceiptNumber");

  try {
    if (code === 0) {
      const confirmed = await stkQuery(checkout);
      if (confirmed.state !== "paid") return NextResponse.json(ACK); // not believed; a later check settles it
    }
    await service.rpc("apply_subscription_payment", {
      p_checkout: checkout,
      p_result_code: Number.isFinite(code) ? code : 1,
      p_result_desc: String(cb.ResultDesc ?? "").slice(0, 300),
      p_receipt: typeof receipt === "string" && /^[A-Z0-9]{8,14}$/.test(receipt) ? receipt : null,
      p_amount_minor: typeof amount === "number" || (typeof amount === "string" && /^\d+(\.\d+)?$/.test(amount)) ? Math.round(Number(amount) * 100) : null,
    });
  } catch (e) {
    console.error("billing callback failed", (e as Error).message);
  }
  return NextResponse.json(ACK);
}
