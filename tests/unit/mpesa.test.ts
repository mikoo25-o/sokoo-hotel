import { describe, expect, it } from "vitest";
import { normalizeKenyanPhone } from "@/lib/mpesa";

describe("normalizeKenyanPhone", () => {
  it("accepts common Kenyan formats", () => {
    for (const v of ["0712345678", "+254712345678", "254712345678", "0712 345 678", "0112345678", "0712-345-678"]) {
      expect(normalizeKenyanPhone(v)).toMatch(/^254[17]\d{8}$/);
    }
  });
  it("rejects bad numbers", () => {
    for (const v of ["", "12345", "0212345678", "07123456789", "abc", "+255712345678"]) expect(normalizeKenyanPhone(v)).toBeNull();
  });
});
