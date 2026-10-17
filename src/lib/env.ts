/**
 * Environment access. Nothing here throws at import time, so the marketing
 * page still renders when Supabase has not been configured yet. Pages that
 * need the backend check isSupabaseConfigured() and show a clear setup
 * notice instead of pretending to work.
 */

export function supabaseUrl(): string | undefined {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return v && /^https?:\/\//.test(v) && !v.includes("YOUR-PROJECT-REF") ? v : undefined;
}

export function supabaseAnonKey(): string | undefined {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return v && !v.startsWith("YOUR-") ? v : undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function trialDays(): number {
  const raw = process.env.TRIAL_DAYS?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 90 ? n : 7; // one free week by default
}

/** The service-role key is server-only. Returns undefined when not set. */
export function serviceRoleKey(): string | undefined {
  const v = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return v && !v.startsWith("YOUR-") ? v : undefined;
}

/**
 * M-Pesa STK push for SokoHotel subscriptions. Everything here is server-only.
 * It is "configured" only when every value needed is present.
 */
export function mpesaConfig() {
  const e = process.env;
  const clean = (v: string | undefined) => (v && !v.startsWith("YOUR-") ? v : undefined);
  const consumerKey = clean(e.MPESA_CONSUMER_KEY);
  const consumerSecret = clean(e.MPESA_CONSUMER_SECRET);
  const shortcode = clean(e.MPESA_SHORTCODE);
  const passkey = clean(e.MPESA_PASSKEY);
  const callbackSecret = clean(e.MPESA_CALLBACK_SECRET);
  if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackSecret || callbackSecret.length < 24) return null;
  return {
    env: e.MPESA_ENV === "production" ? ("production" as const) : ("sandbox" as const),
    consumerKey,
    consumerSecret,
    shortcode,
    passkey,
    callbackSecret,
    // Paybill: CustomerPayBillOnline. Till number: CustomerBuyGoodsOnline.
    transactionType: e.MPESA_TRANSACTION_TYPE === "CustomerBuyGoodsOnline" ? ("CustomerBuyGoodsOnline" as const) : ("CustomerPayBillOnline" as const),
    partyB: clean(e.MPESA_PARTY_B) ?? shortcode,
  };
}

export function mpesaConfigured(): boolean {
  return mpesaConfig() !== null;
}
