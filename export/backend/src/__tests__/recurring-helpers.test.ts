import { describe, it, expect } from "vitest";
import {
  monthKey,
  getLastDayOfMonth,
  actualDayForMonth,
  isPaymentDue,
  formatRP,
} from "../lib/recurring-helpers";

// ─── monthKey ────────────────────────────────────────────────────────────────

describe("monthKey", () => {
  it("formats a mid-year date correctly", () => {
    expect(monthKey(new Date("2024-06-15"))).toBe("2024-06");
  });
  it("pads single-digit months with a leading zero", () => {
    expect(monthKey(new Date("2024-01-01"))).toBe("2024-01");
  });
  it("formats December correctly", () => {
    expect(monthKey(new Date("2024-12-31"))).toBe("2024-12");
  });
  it("handles year boundary — January of next year", () => {
    expect(monthKey(new Date("2025-01-01"))).toBe("2025-01");
  });
});

// ─── getLastDayOfMonth ───────────────────────────────────────────────────────

describe("getLastDayOfMonth", () => {
  it("returns 31 for January", () => expect(getLastDayOfMonth(2024, 1)).toBe(31));
  it("returns 28 for February in a non-leap year", () => expect(getLastDayOfMonth(2023, 2)).toBe(28));
  it("returns 29 for February in a leap year", () => expect(getLastDayOfMonth(2024, 2)).toBe(29));
  it("returns 30 for April", () => expect(getLastDayOfMonth(2024, 4)).toBe(30));
  it("returns 31 for December", () => expect(getLastDayOfMonth(2024, 12)).toBe(31));
  it("returns 31 for March", () => expect(getLastDayOfMonth(2024, 3)).toBe(31));
  it("returns 30 for June", () => expect(getLastDayOfMonth(2024, 6)).toBe(30));
  it("handles century years that are not leap years", () => {
    expect(getLastDayOfMonth(1900, 2)).toBe(28);
  });
  it("handles century years that are leap years", () => {
    expect(getLastDayOfMonth(2000, 2)).toBe(29);
  });
});

// ─── actualDayForMonth ───────────────────────────────────────────────────────

describe("actualDayForMonth", () => {
  it("returns the day as-is when within bounds", () => {
    expect(actualDayForMonth(15, 2024, 6)).toBe(15);
  });
  it("clamps day 31 to 30 for April", () => {
    expect(actualDayForMonth(31, 2024, 4)).toBe(30);
  });
  it("clamps day 31 to 28 for February in a non-leap year", () => {
    expect(actualDayForMonth(31, 2023, 2)).toBe(28);
  });
  it("clamps day 31 to 29 for February in a leap year", () => {
    expect(actualDayForMonth(31, 2024, 2)).toBe(29);
  });
  it("returns 1 unchanged for any month", () => {
    expect(actualDayForMonth(1, 2024, 2)).toBe(1);
  });
  it("does not clamp a valid day 31 in January", () => {
    expect(actualDayForMonth(31, 2024, 1)).toBe(31);
  });
  it("does not clamp day 28 in February non-leap", () => {
    expect(actualDayForMonth(28, 2023, 2)).toBe(28);
  });
});

// ─── isPaymentDue ────────────────────────────────────────────────────────────

describe("isPaymentDue", () => {
  it("is due when today equals the scheduled day", () => {
    expect(isPaymentDue(15, 2024, 6, 15)).toBe(true);
  });
  it("is due when today is past the scheduled day", () => {
    expect(isPaymentDue(10, 2024, 6, 20)).toBe(true);
  });
  it("is not due when today is before the scheduled day", () => {
    expect(isPaymentDue(20, 2024, 6, 15)).toBe(false);
  });
  it("handles end-of-month clamping — day 31 in April is due on the 30th", () => {
    // actualDay = 30, today = 30 → due
    expect(isPaymentDue(31, 2024, 4, 30)).toBe(true);
  });
  it("is not due when today is before the clamped day", () => {
    // actualDay = 30, today = 29 → not due
    expect(isPaymentDue(31, 2024, 4, 29)).toBe(false);
  });
});

// ─── formatRP ────────────────────────────────────────────────────────────────

describe("formatRP", () => {
  const now = new Date("2024-06-10T09:00:00Z");
  const rp = {
    id: 3,
    userId: 1,
    householdId: null,
    name: "Netflix",
    color: "#ef4444",
    type: "scheduled",
    amount: "14.99",
    dayOfMonth: 10,
    addToLarder: false,
    createdAt: now,
  };

  it("converts amount string to number", () => {
    expect(formatRP(rp, false, null).amount).toBe(14.99);
  });
  it("preserves appliedThisMonth flag", () => {
    expect(formatRP(rp, true, 42).appliedThisMonth).toBe(true);
    expect(formatRP(rp, false, null).appliedThisMonth).toBe(false);
  });
  it("preserves transactionId", () => {
    expect(formatRP(rp, true, 42).transactionId).toBe(42);
    expect(formatRP(rp, false, null).transactionId).toBeNull();
  });
  it("converts createdAt Date to ISO string", () => {
    expect(formatRP(rp, false, null).createdAt).toBe("2024-06-10T09:00:00.000Z");
  });
  it("passes through a createdAt string unchanged", () => {
    const rpStr = { ...rp, createdAt: "2024-06-10T09:00:00.000Z" };
    expect(formatRP(rpStr, false, null).createdAt).toBe("2024-06-10T09:00:00.000Z");
  });
  it("defaults addToLarder to false when absent", () => {
    const { addToLarder: _a, ...rest } = rp;
    expect(formatRP(rest, false, null).addToLarder).toBe(false);
  });
  it("defaults householdId to null when absent", () => {
    const { householdId: _h, ...rest } = rp;
    expect(formatRP(rest, false, null).householdId).toBeNull();
  });
});
