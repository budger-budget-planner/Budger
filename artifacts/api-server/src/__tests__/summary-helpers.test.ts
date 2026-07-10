import { describe, it, expect } from "vitest";
import {
  isNativeCurrency,
  isValidMonthPrefix,
  monthsAgoDate,
  roundMoney,
  nativeSpendingTxs,
} from "../lib/summary-helpers";

// ─── isNativeCurrency ────────────────────────────────────────────────────────

describe("isNativeCurrency", () => {
  it("returns true when transaction has no currency tag", () => {
    expect(isNativeCurrency({ transactionCurrency: null })).toBe(true);
  });
  it("returns true when transaction currency tag is undefined", () => {
    expect(isNativeCurrency({})).toBe(true);
  });
  it("returns true when tag matches the user currency", () => {
    expect(isNativeCurrency({ transactionCurrency: "EUR" }, "EUR")).toBe(true);
  });
  it("returns false when tag does not match user currency", () => {
    expect(isNativeCurrency({ transactionCurrency: "USD" }, "EUR")).toBe(false);
  });
  it("returns false when tag is set but no user currency given", () => {
    expect(isNativeCurrency({ transactionCurrency: "USD" })).toBe(false);
  });
  it("is case-sensitive for currency codes", () => {
    expect(isNativeCurrency({ transactionCurrency: "usd" }, "USD")).toBe(false);
  });
});

// ─── isValidMonthPrefix ──────────────────────────────────────────────────────

describe("isValidMonthPrefix", () => {
  it("accepts a valid YYYY-MM string", () => {
    expect(isValidMonthPrefix("2024-06")).toBe(true);
  });
  it("accepts January edge case", () => {
    expect(isValidMonthPrefix("2024-01")).toBe(true);
  });
  it("accepts December edge case", () => {
    expect(isValidMonthPrefix("2024-12")).toBe(true);
  });
  it("rejects a full date", () => {
    expect(isValidMonthPrefix("2024-06-15")).toBe(false);
  });
  it("rejects a year only", () => {
    expect(isValidMonthPrefix("2024")).toBe(false);
  });
  it("rejects a SQL wildcard attempt", () => {
    expect(isValidMonthPrefix("2024-%")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isValidMonthPrefix("")).toBe(false);
  });
  it("rejects non-numeric characters", () => {
    expect(isValidMonthPrefix("YYYY-MM")).toBe(false);
  });
});

// ─── monthsAgoDate ───────────────────────────────────────────────────────────

describe("monthsAgoDate", () => {
  it("returns first day of the same month when monthsBack is 0", () => {
    expect(monthsAgoDate(new Date("2024-06-15"), 0)).toBe("2024-06-01");
  });
  it("goes back 1 month", () => {
    expect(monthsAgoDate(new Date("2024-06-15"), 1)).toBe("2024-05-01");
  });
  it("goes back 5 months", () => {
    expect(monthsAgoDate(new Date("2024-06-15"), 5)).toBe("2024-01-01");
  });
  it("wraps correctly across a year boundary", () => {
    expect(monthsAgoDate(new Date("2024-02-10"), 3)).toBe("2023-11-01");
  });
  it("always returns the first day of the month", () => {
    const result = monthsAgoDate(new Date("2024-12-31"), 6);
    expect(result).toMatch(/-01$/);
  });
  it("pads single-digit months with a leading zero", () => {
    expect(monthsAgoDate(new Date("2024-10-01"), 1)).toBe("2024-09-01");
  });
});

// ─── roundMoney ──────────────────────────────────────────────────────────────

describe("roundMoney", () => {
  it("leaves an already-round value unchanged", () => {
    expect(roundMoney(100)).toBe(100);
  });
  it("rounds down at two decimal places", () => {
    expect(roundMoney(1.234)).toBe(1.23);
  });
  it("rounds up at two decimal places", () => {
    expect(roundMoney(1.235)).toBe(1.24);
  });
  it("handles zero", () => {
    expect(roundMoney(0)).toBe(0);
  });
  it("handles negative amounts", () => {
    expect(roundMoney(-9.999)).toBe(-10);
  });
});

// ─── nativeSpendingTxs ───────────────────────────────────────────────────────

describe("nativeSpendingTxs", () => {
  const base = {
    currencyLocked: false,
    currencyUnavailable: false,
    foundedWithRealizedGoal: false,
    isLarderFund: false,
    transactionCurrency: null,
  };

  it("includes a plain transaction with no flags", () => {
    expect(nativeSpendingTxs([base])).toHaveLength(1);
  });
  it("excludes a currency-locked transaction", () => {
    expect(nativeSpendingTxs([{ ...base, currencyLocked: true }])).toHaveLength(0);
  });
  it("excludes a currency-unavailable transaction", () => {
    expect(nativeSpendingTxs([{ ...base, currencyUnavailable: true }])).toHaveLength(0);
  });
  it("excludes a goal-funded transaction", () => {
    expect(nativeSpendingTxs([{ ...base, foundedWithRealizedGoal: true }])).toHaveLength(0);
  });
  it("excludes a larder-fund transaction", () => {
    expect(nativeSpendingTxs([{ ...base, isLarderFund: true }])).toHaveLength(0);
  });
  it("excludes a foreign-currency transaction when user currency not set", () => {
    expect(nativeSpendingTxs([{ ...base, transactionCurrency: "USD" }])).toHaveLength(0);
  });
  it("includes a foreign-currency transaction that matches the user currency", () => {
    expect(nativeSpendingTxs([{ ...base, transactionCurrency: "USD" }], "USD")).toHaveLength(1);
  });
  it("filters a mixed list correctly", () => {
    const txs = [
      base,
      { ...base, currencyLocked: true },
      { ...base, isLarderFund: true },
      { ...base },
    ];
    expect(nativeSpendingTxs(txs)).toHaveLength(2);
  });
});
