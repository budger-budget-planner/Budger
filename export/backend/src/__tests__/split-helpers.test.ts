import { describe, it, expect } from "vitest";
import { formatSplitRow, validateSplitAmount, validateSplitGroup, computeGroupState, computeRecipientAmount } from "../lib/split-helpers";

// ─── formatSplitRow ──────────────────────────────────────────────────────────

const createdAt = new Date("2024-06-01T10:00:00Z");

const rawSplit = {
  id: 5,
  groupId: "g-1",
  transactionId: 12,
  splitAmount: "49.99",
  issuerCurrency: "PLN",
  issuerId: 1,
  recipientId: 2,
  status: "pending",
  recipientTransactionId: null,
  issuerNotified: false,
  createdAt,
};

const tx = { description: "Dinner at Sakura", date: "2024-06-01", amount: "99.98" };

describe("formatSplitRow", () => {
  it("converts splitAmount string to number", () => {
    expect(formatSplitRow(rawSplit, tx, "Alice", "Bob").splitAmount).toBe(49.99);
  });
  it("converts splitAmount numeric value to number", () => {
    expect(formatSplitRow({ ...rawSplit, splitAmount: 49.99 }, tx, "Alice", "Bob").splitAmount).toBe(49.99);
  });
  it("copies transaction description", () => {
    expect(formatSplitRow(rawSplit, tx, "Alice", "Bob").transactionDescription).toBe("Dinner at Sakura");
  });
  it("copies transaction date", () => {
    expect(formatSplitRow(rawSplit, tx, "Alice", "Bob").transactionDate).toBe("2024-06-01");
  });
  it("falls back to empty string when transaction is undefined", () => {
    const row = formatSplitRow(rawSplit, undefined, "Alice", "Bob");
    expect(row.transactionDescription).toBe("");
    expect(row.transactionDate).toBe("");
  });
  it("attaches issuer and recipient names", () => {
    const row = formatSplitRow(rawSplit, tx, "Alice", "Bob");
    expect(row.issuerName).toBe("Alice");
    expect(row.recipientName).toBe("Bob");
  });
  it("falls back to empty string for missing names", () => {
    const row = formatSplitRow(rawSplit, tx, undefined, undefined);
    expect(row.issuerName).toBe("");
    expect(row.recipientName).toBe("");
  });
  it("defaults issuerCurrency to USD when absent", () => {
    const { issuerCurrency: _c, ...rest } = rawSplit;
    expect(formatSplitRow(rest, tx, "A", "B").issuerCurrency).toBe("USD");
  });
  it("preserves the provided issuerCurrency", () => {
    expect(formatSplitRow(rawSplit, tx, "A", "B").issuerCurrency).toBe("PLN");
  });
  it("converts createdAt to ISO string", () => {
    expect(formatSplitRow(rawSplit, tx, "A", "B").createdAt).toBe("2024-06-01T10:00:00.000Z");
  });
  it("preserves status", () => {
    expect(formatSplitRow(rawSplit, tx, "A", "B").status).toBe("pending");
  });
  it("sets recipientTransactionId to null when absent", () => {
    expect(formatSplitRow(rawSplit, tx, "A", "B").recipientTransactionId).toBeNull();
  });
  it("passes through a present recipientTransactionId", () => {
    expect(formatSplitRow({ ...rawSplit, recipientTransactionId: 77 }, tx, "A", "B").recipientTransactionId).toBe(77);
  });
  it("passes through the groupId", () => {
    expect(formatSplitRow(rawSplit, tx, "A", "B").groupId).toBe("g-1");
  });
  it("defaults groupId to empty string when absent", () => {
    const { groupId: _g, ...rest } = rawSplit;
    expect(formatSplitRow(rest, tx, "A", "B").groupId).toBe("");
  });
  it("includes the parent transaction's amount", () => {
    expect(formatSplitRow(rawSplit, tx, "A", "B").transactionAmount).toBe(99.98);
  });
  it("sets transactionAmount to null when transaction is undefined", () => {
    expect(formatSplitRow(rawSplit, undefined, "A", "B").transactionAmount).toBeNull();
  });
});

// ─── validateSplitAmount ─────────────────────────────────────────────────────

describe("validateSplitAmount", () => {
  it("returns null for a valid split amount", () => {
    expect(validateSplitAmount(25, 100)).toBeNull();
  });
  it("returns null when split equals the full transaction amount", () => {
    expect(validateSplitAmount(100, 100)).toBeNull();
  });
  it("returns an error when split is zero", () => {
    expect(validateSplitAmount(0, 100)).toBe("Split amount must be positive");
  });
  it("returns an error when split is negative", () => {
    expect(validateSplitAmount(-10, 100)).toBe("Split amount must be positive");
  });
  it("returns an error when split exceeds transaction", () => {
    expect(validateSplitAmount(101, 100)).toBe("Split amount exceeds transaction amount");
  });
  it("rejects a split of 0.01 above the transaction amount", () => {
    expect(validateSplitAmount(100.01, 100)).toBe("Split amount exceeds transaction amount");
  });
  it("accepts a very small positive split", () => {
    expect(validateSplitAmount(0.01, 100)).toBeNull();
  });
});

// ─── validateSplitGroup ──────────────────────────────────────────────────────

describe("validateSplitGroup", () => {
  it("returns null for a valid multi-recipient group", () => {
    expect(validateSplitGroup([{ recipientId: 2, amount: 30 }, { recipientId: 3, amount: 20 }], 100, 1)).toBeNull();
  });
  it("rejects an empty list", () => {
    expect(validateSplitGroup([], 100, 1)).toBe("Select at least one household member");
  });
  it("rejects the issuer splitting with themselves", () => {
    expect(validateSplitGroup([{ recipientId: 1, amount: 10 }], 100, 1)).toBe("Cannot split with yourself");
  });
  it("rejects duplicate recipients", () => {
    expect(validateSplitGroup([{ recipientId: 2, amount: 10 }, { recipientId: 2, amount: 10 }], 100, 1))
      .toBe("Each member can only appear once");
  });
  it("rejects a zero or negative amount", () => {
    expect(validateSplitGroup([{ recipientId: 2, amount: 0 }], 100, 1))
      .toBe("Each selected member needs an amount greater than zero");
  });
  it("rejects a sum exceeding the transaction amount", () => {
    expect(validateSplitGroup([{ recipientId: 2, amount: 60 }, { recipientId: 3, amount: 60 }], 100, 1))
      .toBe("Split amounts exceed the transaction amount");
  });
  it("allows a tiny floating-point epsilon over the total", () => {
    expect(validateSplitGroup([{ recipientId: 2, amount: 100.005 }], 100, 1)).toBeNull();
  });
});

// ─── computeGroupState ───────────────────────────────────────────────────────

describe("computeGroupState", () => {
  it("is pending when any sibling hasn't responded", () => {
    expect(computeGroupState(["accepted", "pending"])).toBe("pending");
  });
  it("is settled when all responded and at least one accepted", () => {
    expect(computeGroupState(["accepted", "declined"])).toBe("settled");
  });
  it("is all_declined when everyone declined", () => {
    expect(computeGroupState(["declined", "declined"])).toBe("all_declined");
  });
});

// ─── computeRecipientAmount ──────────────────────────────────────────────────

describe("computeRecipientAmount", () => {
  const rates = { USD: 1, PLN: 3.95, EUR: 0.92, GBP: 0.79 };

  it("converts the split amount from the issuer's currency into the recipient's currency", () => {
    // 200 PLN requested; recipient's account is USD.
    const result = computeRecipientAmount(200, "PLN", "USD", rates);
    expect(result).toBeCloseTo(200 / 3.95, 5);
    expect(result).toBeLessThan(60); // sanity: must shrink, never come out ~= the PLN face value
  });

  it("returns the raw amount unchanged when issuer and recipient share a currency", () => {
    expect(computeRecipientAmount(50, "USD", "USD", rates)).toBe(50);
  });

  it("returns the raw amount unchanged when no recipient currency is known", () => {
    expect(computeRecipientAmount(50, "PLN", undefined, rates)).toBe(50);
    expect(computeRecipientAmount(50, "PLN", null as any, rates)).toBe(50);
  });

  it("is the exact inverse of converting back, up to floating point", () => {
    const usd = computeRecipientAmount(200, "PLN", "USD", rates);
    const back = computeRecipientAmount(usd, "USD", "PLN", rates);
    expect(back).toBeCloseTo(200, 5);
  });
});
