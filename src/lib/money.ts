/**
 * Money is always an integer number of minor units (cents). KSh 350.00 is
 * 35000. These helpers never use floating point arithmetic on amounts.
 */

const SYMBOLS: Record<string, string> = { KES: "KSh" };

/** Parses what a person types ("350", "1,200.50", "KSh 80") into minor units. */
export function parseMoneyToMinor(input: string): number | null {
  const cleaned = input.replace(/ksh\.?/gi, "").replace(/[,\s]/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** 35000 -> "KSh 350", 35050 -> "KSh 350.50". */
export function formatMoney(minor: number | string | null | undefined, currency = "KES"): string {
  const n = Math.round(Number(minor ?? 0));
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const whole = Math.trunc(abs / 100);
  const cents = abs % 100;
  const symbol = SYMBOLS[currency] ?? currency;
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${symbol} ${w}${cents ? "." + String(cents).padStart(2, "0") : ""}`;
}

/** Amount without the currency symbol, for tables. */
export function formatAmount(minor: number | string | null | undefined): string {
  return formatMoney(minor).replace(/^-?\S+\s/, (m) => (m.startsWith("-") ? "-" : ""));
}

/** 35000 -> "350", 35050 -> "350.50". For pre-filling form fields. */
export function minorToInput(minor: number): string {
  const whole = Math.trunc(minor / 100);
  const cents = minor % 100;
  return cents ? `${whole}.${String(cents).padStart(2, "0")}` : String(whole);
}

/** Percentage change, or null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}
