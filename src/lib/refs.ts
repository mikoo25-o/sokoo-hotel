import "server-only";
import { randomInt } from "node:crypto";

/**
 * Unpredictable public references. The random part comes from the operating
 * system's CSPRNG (crypto.randomInt, which avoids modulo bias). The alphabet
 * leaves out I, L, O, 0 and 1 so references are easy to read out loud.
 */
export const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomString(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return out;
}

/** YYMMDD in the restaurant's own time zone. */
export function datePart(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}`;
}

/** SH-261015-X7K9QM4D: date for staff, 8 random characters (about 40 bits) for secrecy. */
export function generateOrderReference(timeZone = "Africa/Nairobi", now = new Date()): string {
  return `SH-${datePart(timeZone, now)}-${randomString(8)}`;
}

export function generateReceiptRef(timeZone = "Africa/Nairobi", now = new Date()): string {
  return `RC-${datePart(timeZone, now)}-${randomString(8)}`;
}

/** Restaurant joining code, for example SOKO7K4M9Q. */
export function generateJoinCode(): string {
  return `SOKO${randomString(6)}`;
}

/** Random idempotency key for server-initiated writes. */
export function generateKey(): string {
  return `srv-${randomString(16)}`;
}
