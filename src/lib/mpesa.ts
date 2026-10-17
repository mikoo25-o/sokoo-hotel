import "server-only";
import { mpesaConfig, siteUrl } from "@/lib/env";

/**
 * Safaricom Daraja STK push, used only to charge a restaurant for its SokoHotel
 * subscription. The customer approves on their own phone with their own PIN;
 * SokoHotel never sees or stores a PIN.
 */

const BASE = { sandbox: "https://sandbox.safaricom.co.ke", production: "https://api.safaricom.co.ke" } as const;

/** 0712345678, 0112345678, +254712345678 and 254712345678 all become 254712345678. */
export function normalizeKenyanPhone(input: string): string | null {
  const d = input.replace(/[\s\-()]/g, "").replace(/^\+/, "");
  const m = /^(?:254|0)([17]\d{8})$/.exec(d);
  return m ? `254${m[1]}` : null;
}

function timestamp(now = new Date()): string {
  // Daraja expects YYYYMMDDHHmmss.
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}${g("month")}${g("day")}${g("hour")}${g("minute")}${g("second")}`;
}

let cached: { token: string; until: number; key: string } | null = null;

async function accessToken(cfg: NonNullable<ReturnType<typeof mpesaConfig>>): Promise<string> {
  const key = `${cfg.env}:${cfg.consumerKey}`;
  if (cached && cached.key === key && cached.until > Date.now() + 30_000) return cached.token;
  const res = await fetch(`${BASE[cfg.env]}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64")}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error("mpesa_auth_failed");
  const body = (await res.json()) as { access_token?: string; expires_in?: string };
  if (!body.access_token) throw new Error("mpesa_auth_failed");
  cached = { token: body.access_token, until: Date.now() + Number(body.expires_in ?? 3000) * 1000, key };
  return body.access_token;
}

export function callbackUrl(secret: string): string {
  return `${siteUrl()}/api/billing/callback/${secret}`;
}

export async function stkPush(opts: { phone: string; amountKes: number; reference: string; description: string }) {
  const cfg = mpesaConfig();
  if (!cfg) throw new Error("mpesa_not_configured");
  if (!Number.isInteger(opts.amountKes) || opts.amountKes < 1) throw new Error("invalid_amount");
  const ts = timestamp();
  const res = await fetch(`${BASE[cfg.env]}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(cfg)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortcode,
      Password: Buffer.from(`${cfg.shortcode}${cfg.passkey}${ts}`).toString("base64"),
      Timestamp: ts,
      TransactionType: cfg.transactionType,
      Amount: opts.amountKes,
      PartyA: opts.phone,
      PartyB: cfg.partyB,
      PhoneNumber: opts.phone,
      CallBackURL: callbackUrl(cfg.callbackSecret),
      AccountReference: opts.reference.slice(0, 12),
      TransactionDesc: opts.description.slice(0, 13),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { ResponseCode?: string; CheckoutRequestID?: string; MerchantRequestID?: string; errorMessage?: string; ResponseDescription?: string };
  if (!res.ok || body.ResponseCode !== "0" || !body.CheckoutRequestID) {
    throw new Error(body.errorMessage || body.ResponseDescription || "mpesa_push_failed");
  }
  return { checkoutRequestId: body.CheckoutRequestID, merchantRequestId: body.MerchantRequestID ?? "" };
}

export type StkState = { state: "paid" } | { state: "pending" } | { state: "failed"; code: number; desc: string };

/**
 * Asks Safaricom what happened to a prompt. Used to double-check a callback
 * before trusting it, and to settle a payment when the callback is late.
 */
export async function stkQuery(checkoutRequestId: string): Promise<StkState> {
  const cfg = mpesaConfig();
  if (!cfg) throw new Error("mpesa_not_configured");
  const ts = timestamp();
  const res = await fetch(`${BASE[cfg.env]}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(cfg)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortcode,
      Password: Buffer.from(`${cfg.shortcode}${cfg.passkey}${ts}`).toString("base64"),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { ResultCode?: string | number; ResultDesc?: string; errorCode?: string };
  // While the customer is still deciding, Daraja answers with an error body instead of a result.
  if (body.ResultCode === undefined || body.ResultCode === null) return { state: "pending" };
  const code = Number(body.ResultCode);
  if (code === 0) return { state: "paid" };
  return { state: "failed", code, desc: body.ResultDesc ?? "Payment was not completed" };
}
