import { describe, expect, it } from "vitest";
import { addDays, elapsed, greeting, isDateString, localDateString, startOfDayISO } from "@/lib/dates";

describe("dates", () => {
  it("finds the start of a Nairobi day in UTC", () => expect(startOfDayISO("2026-10-15", "Africa/Nairobi")).toBe("2026-10-14T21:00:00.000Z"));
  it("localDateString respects the time zone", () => {
    expect(localDateString("2026-10-15T22:30:00Z", "Africa/Nairobi")).toBe("2026-10-16");
    expect(localDateString("2026-10-15T22:30:00Z", "UTC")).toBe("2026-10-15");
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("validates date strings", () => {
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("2026-10-15")).toBe(true);
    expect(isDateString("15/10/2026")).toBe(false);
    expect(isDateString(undefined)).toBe(false);
  });
  it("describes elapsed time", () => {
    const now = Date.parse("2026-10-15T12:00:00Z");
    expect(elapsed("2026-10-15T11:59:50Z", now)).toBe("just now");
    expect(elapsed("2026-10-15T11:55:00Z", now)).toBe("5 min");
    expect(elapsed("2026-10-15T10:55:00Z", now)).toBe("1 hr 5 min");
    expect(elapsed("2026-10-15T10:00:00Z", now)).toBe("2 hr");
  });
  it("greets by local hour", () => {
    expect(greeting("Africa/Nairobi", new Date("2026-10-15T05:00:00Z"))).toBe("Good morning");
    expect(greeting("Africa/Nairobi", new Date("2026-10-15T11:00:00Z"))).toBe("Good afternoon");
    expect(greeting("Africa/Nairobi", new Date("2026-10-15T17:00:00Z"))).toBe("Good evening");
  });
});
