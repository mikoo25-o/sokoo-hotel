import { z } from "zod";

/** Only same-site relative paths are accepted as post-login destinations. */
export function safeNext(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return null;
  return value.slice(0, 200);
}

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(160);

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Include at least one letter and one number");

export const phoneSchema = z
  .string()
  .trim()
  .max(30)
  .regex(/^[+\d][\d\s-]{6,}$/, "Enter a valid phone number")
  .or(z.literal(""));

export const uuidSchema = z.string().uuid();

/** Flattens zod issues into { field: message } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export const JOIN_CODE_RE = /^SOKO[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/** M-Pesa confirmation codes are 10 upper-case letters and digits. */
export const MPESA_CODE_RE = /^[A-Z0-9]{10}$/;
