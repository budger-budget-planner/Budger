import { describe, it, expect } from "vitest";
import {
  isHead,
  isChildRole,
  formatGoal,
  formatContribution,
  calculateMonthlyTarget,
  goalPercentage,
} from "../lib/goals-helpers";

// ─── isHead ──────────────────────────────────────────────────────────────────

describe("isHead", () => {
  it("returns true for 'head'", () => expect(isHead("head")).toBe(true));
  it("returns true for 'owner'", () => expect(isHead("owner")).toBe(true));
  it("returns false for 'member'", () => expect(isHead("member")).toBe(false));
  it("returns false for 'child'", () => expect(isHead("child")).toBe(false));
  it("returns false for empty string", () => expect(isHead("")).toBe(false));
  it("returns false for unknown role", () => expect(isHead("admin")).toBe(false));
});

// ─── isChildRole ─────────────────────────────────────────────────────────────

describe("isChildRole", () => {
  it("returns true for 'child'", () => expect(isChildRole("child")).toBe(true));
  it("returns true for 'member'", () => expect(isChildRole("member")).toBe(true));
  it("returns false for 'head'", () => expect(isChildRole("head")).toBe(false));
  it("returns false for 'owner'", () => expect(isChildRole("owner")).toBe(false));
  it("returns false for empty string", () => expect(isChildRole("")).toBe(false));
});

// ─── formatGoal ──────────────────────────────────────────────────────────────

describe("formatGoal", () => {
  const base = {
    id: 1,
    name: "Emergency Fund",
    color: "#10b981",
    budget: "5000.00",
    currency: "USD",
    deadline: "2025-12-31",
    divideByMonths: false,
    userId: 42,
    householdId: null,
    realizedAt: null,
    createdAt: new Date("2024-01-15T10:00:00Z"),
    updatedAt: new Date("2024-06-01T08:30:00Z"),
  };

  it("converts budget string to number", () => {
    expect(formatGoal(base).budget).toBe(5000);
  });
  it("converts createdAt to ISO string", () => {
    expect(formatGoal(base).createdAt).toBe("2024-01-15T10:00:00.000Z");
  });
  it("converts updatedAt to ISO string when present", () => {
    expect(formatGoal(base).updatedAt).toBe("2024-06-01T08:30:00.000Z");
  });
  it("falls back to createdAt when updatedAt is null", () => {
    expect(formatGoal({ ...base, updatedAt: null }).updatedAt).toBe("2024-01-15T10:00:00.000Z");
  });
  it("passes currency through", () => {
    expect(formatGoal(base).currency).toBe("USD");
  });
  it("normalises undefined currency to null", () => {
    const { currency: _c, ...rest } = base;
    expect(formatGoal(rest).currency).toBeNull();
  });
  it("preserves non-budget fields unchanged", () => {
    expect(formatGoal(base).name).toBe("Emergency Fund");
    expect(formatGoal(base).userId).toBe(42);
  });
});

// ─── formatContribution ──────────────────────────────────────────────────────

describe("formatContribution", () => {
  const now = new Date("2024-06-10T12:00:00Z");
  const contrib = {
    id: 7,
    goalId: 1,
    transactionId: null,
    amount: "250.50",
    currency: "PLN",
    accountAmount: "62.63",
    accountCurrency: "USD",
    month: "2024-06",
    userId: 42,
    householdId: null,
    createdAt: now,
  };
  const goal = { name: "Emergency Fund", color: "#10b981", currency: "USD" };

  it("converts amount to number", () => {
    expect(formatContribution(contrib, goal).amount).toBe(250.5);
  });
  it("converts accountAmount to number when present", () => {
    expect(formatContribution(contrib, goal).accountAmount).toBeCloseTo(62.63);
  });
  it("sets accountAmount to null when missing", () => {
    expect(formatContribution({ ...contrib, accountAmount: null }, goal).accountAmount).toBeNull();
  });
  it("attaches goalName from goal argument", () => {
    expect(formatContribution(contrib, goal).goalName).toBe("Emergency Fund");
  });
  it("sets goalName to null when no goal passed", () => {
    expect(formatContribution(contrib).goalName).toBeNull();
  });
  it("sets goalColor to null when no goal passed", () => {
    expect(formatContribution(contrib).goalColor).toBeNull();
  });
  it("converts createdAt to ISO string", () => {
    expect(formatContribution(contrib, goal).createdAt).toBe("2024-06-10T12:00:00.000Z");
  });
  it("preserves null transactionId", () => {
    expect(formatContribution(contrib, goal).transactionId).toBeNull();
  });
  it("passes through a numeric transactionId", () => {
    expect(formatContribution({ ...contrib, transactionId: 99 }, goal).transactionId).toBe(99);
  });
});

// ─── calculateMonthlyTarget ──────────────────────────────────────────────────

describe("calculateMonthlyTarget", () => {
  it("splits budget evenly over months remaining", () => {
    // now = Jan 2024, deadline = Dec 2024 → 12 months left (Jan…Dec inclusive)
    // formula: (2024-2024)*12 + (11-0) + 1 = 12
    const now = new Date("2024-01-01");
    const target = calculateMonthlyTarget(1200, "2024-12-31", now);
    expect(target).toBe(100); // 1200 / 12
  });

  it("uses at least 1 month even if deadline has passed", () => {
    const now = new Date("2025-06-01");
    const target = calculateMonthlyTarget(500, "2024-01-31", now);
    expect(target).toBe(500); // clamped to 1 month
  });

  it("rounds to two decimal places", () => {
    // 100 / 3 = 33.333… → 33.33
    const now = new Date("2024-01-01");
    const target = calculateMonthlyTarget(100, "2024-03-31", now);
    expect(target).toBe(33.33);
  });

  it("handles single-month remaining", () => {
    const now = new Date("2024-06-01");
    const target = calculateMonthlyTarget(750, "2024-06-30", now);
    expect(target).toBe(750);
  });
});

// ─── goalPercentage ──────────────────────────────────────────────────────────

describe("goalPercentage", () => {
  it("returns 50 when half funded", () => {
    expect(goalPercentage(500, 1000)).toBe(50);
  });
  it("returns 100 when fully funded", () => {
    expect(goalPercentage(1000, 1000)).toBe(100);
  });
  it("returns 0 when nothing contributed", () => {
    expect(goalPercentage(0, 1000)).toBe(0);
  });
  it("returns 0 when budget is zero (avoids division by zero)", () => {
    expect(goalPercentage(500, 0)).toBe(0);
  });
  it("rounds to two decimal places", () => {
    // 1/3 of 1000 = 33.33%
    expect(goalPercentage(333.33, 1000)).toBe(33.33);
  });
  it("can exceed 100% when over-funded", () => {
    expect(goalPercentage(1200, 1000)).toBe(120);
  });
});
