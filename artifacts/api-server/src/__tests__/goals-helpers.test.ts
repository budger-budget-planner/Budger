import { describe, it, expect } from "vitest";

// ─── Inlined helpers (same logic as goals.ts, extracted for unit testing) ───

function isHead(role: string) {
  return role === "head" || role === "owner";
}

function isChildRole(role: string) {
  return role === "child" || role === "member";
}

function formatGoal(g: any) {
  return {
    ...g,
    budget: parseFloat(g.budget),
    currency: g.currency ?? null,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt?.toISOString?.() ?? g.createdAt.toISOString(),
  };
}

function formatContribution(c: any, goal?: any) {
  return {
    id: c.id,
    goalId: c.goalId,
    goalName: goal?.name ?? null,
    goalColor: goal?.color ?? null,
    goalCurrency: goal?.currency ?? null,
    transactionId: c.transactionId ?? null,
    amount: parseFloat(c.amount),
    currency: c.currency ?? null,
    accountAmount: c.accountAmount != null ? parseFloat(c.accountAmount) : null,
    accountCurrency: c.accountCurrency ?? null,
    month: c.month,
    userId: c.userId,
    householdId: c.householdId ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("isHead", () => {
  it("returns true for 'head'", () => expect(isHead("head")).toBe(true));
  it("returns true for 'owner'", () => expect(isHead("owner")).toBe(true));
  it("returns false for 'member'", () => expect(isHead("member")).toBe(false));
  it("returns false for 'child'", () => expect(isHead("child")).toBe(false));
  it("returns false for empty string", () => expect(isHead("")).toBe(false));
});

describe("isChildRole", () => {
  it("returns true for 'child'", () => expect(isChildRole("child")).toBe(true));
  it("returns true for 'member'", () => expect(isChildRole("member")).toBe(true));
  it("returns false for 'head'", () => expect(isChildRole("head")).toBe(false));
  it("returns false for 'owner'", () => expect(isChildRole("owner")).toBe(false));
});

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
    const g = { ...base, updatedAt: null };
    expect(formatGoal(g).updatedAt).toBe("2024-01-15T10:00:00.000Z");
  });

  it("passes currency through as-is", () => {
    expect(formatGoal(base).currency).toBe("USD");
  });

  it("normalises null currency to null", () => {
    expect(formatGoal({ ...base, currency: null }).currency).toBeNull();
  });
});

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

  it("attaches goal name from the goal argument", () => {
    expect(formatContribution(contrib, goal).goalName).toBe("Emergency Fund");
  });

  it("sets goalName to null when no goal is passed", () => {
    expect(formatContribution(contrib).goalName).toBeNull();
  });

  it("converts createdAt to ISO string", () => {
    expect(formatContribution(contrib, goal).createdAt).toBe("2024-06-10T12:00:00.000Z");
  });

  it("normalises null transactionId to null", () => {
    expect(formatContribution(contrib, goal).transactionId).toBeNull();
  });
});
