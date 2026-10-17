import { describe, expect, it } from "vitest";
import { datePart, generateJoinCode, generateOrderReference, generateReceiptRef, randomString, REF_ALPHABET } from "@/lib/refs";
import { JOIN_CODE_RE } from "@/lib/validation";

describe("references", () => {
  it("order references have the expected shape", () => {
    expect(generateOrderReference("Africa/Nairobi", new Date("2026-10-15T10:00:00Z"))).toMatch(/^SH-261015-[A-HJKMNP-Z2-9]{8}$/);
    expect(generateReceiptRef("Africa/Nairobi", new Date("2026-10-15T10:00:00Z"))).toMatch(/^RC-261015-[A-HJKMNP-Z2-9]{8}$/);
  });
  it("uses the restaurant's own day, not UTC", () => {
    // 22:30 UTC on the 15th is already the 16th in Nairobi (UTC+3).
    expect(datePart("Africa/Nairobi", new Date("2026-10-15T22:30:00Z"))).toBe("261016");
    expect(datePart("UTC", new Date("2026-10-15T22:30:00Z"))).toBe("261015");
  });
  it("never repeats across many draws and avoids confusing characters", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(randomString(8));
    expect(seen.size).toBe(5000);
    expect(REF_ALPHABET).not.toMatch(/[ILO01]/);
  });
  it("join codes satisfy the validator", () => {
    for (let i = 0; i < 200; i++) expect(generateJoinCode()).toMatch(JOIN_CODE_RE);
  });
});
