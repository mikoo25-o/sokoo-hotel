import { describe, expect, it } from "vitest";
import { emailSchema, MPESA_CODE_RE, passwordSchema, phoneSchema, safeNext, uuidSchema } from "@/lib/validation";

describe("safeNext (open redirect protection)", () => {
  it.each(["/waiter", "/cashier/orders/abc?x=1"])("allows %s", (v) => expect(safeNext(v)).toBe(v));
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "waiter", "/a\r\nSet-Cookie: x=1", null, undefined])("blocks %j", (v) =>
    expect(safeNext(v as string)).toBeNull(),
  );
});

describe("schemas", () => {
  it("normalises email", () => expect(emailSchema.parse("  Mike@Example.COM ")).toBe("mike@example.com"));
  it("rejects a bad email", () => expect(emailSchema.safeParse("nope").success).toBe(false));
  it("requires letters and numbers in passwords", () => {
    expect(passwordSchema.safeParse("abcdefgh").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("goodpass1").success).toBe(true);
  });
  it("accepts Kenyan phone formats and blank", () => {
    for (const p of ["0712 345 678", "+254712345678", ""]) expect(phoneSchema.safeParse(p).success).toBe(true);
    expect(phoneSchema.safeParse("abc").success).toBe(false);
  });
  it("validates uuids", () => {
    expect(uuidSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(uuidSchema.safeParse("123e4567-e89b-42d3-a456-426614174000").success).toBe(true);
  });
  it("matches M-Pesa confirmation codes", () => {
    expect(MPESA_CODE_RE.test("QJK7L8M9N0")).toBe(true);
    expect(MPESA_CODE_RE.test("qjk7")).toBe(false);
  });
});
