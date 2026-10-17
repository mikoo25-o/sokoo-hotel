import { describe, expect, it } from "vitest";
import { formatAmount, formatMoney, minorToInput, parseMoneyToMinor, percentChange } from "@/lib/money";

describe("parseMoneyToMinor", () => {
  it.each([
    ["350", 35000],
    ["1,200.50", 120050],
    ["KSh 80", 8000],
    ["ksh. 80.5", 8050],
    ["0.99", 99],
  ])("parses %s", (input, expected) => expect(parseMoneyToMinor(input)).toBe(expected));

  it.each(["", "abc", "-5", "1.234", "1e3", "12345678901", "5.", ".5"])("rejects %j", (input) => expect(parseMoneyToMinor(input)).toBeNull());
});

describe("formatting", () => {
  it("formats whole and fractional amounts", () => {
    expect(formatMoney(35000)).toBe("KSh 350");
    expect(formatMoney(35050)).toBe("KSh 350.50");
    expect(formatMoney(123456700)).toBe("KSh 1,234,567");
    expect(formatMoney("1000")).toBe("KSh 10");
    expect(formatMoney(null)).toBe("KSh 0");
    expect(formatMoney(-2500)).toBe("-KSh 25");
  });
  it("formats amount without symbol", () => {
    expect(formatAmount(120050)).toBe("1,200.50");
  });
  it("round-trips through minorToInput", () => {
    for (const v of [100, 35050, 99, 5]) expect(parseMoneyToMinor(minorToInput(v))).toBe(v);
  });
});

describe("percentChange", () => {
  it("returns null with no baseline", () => expect(percentChange(5, 0)).toBeNull());
  it("computes change", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
  });
});
