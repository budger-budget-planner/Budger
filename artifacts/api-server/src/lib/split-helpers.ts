/** Pure helpers extracted from routes/splits.ts — importable and testable without a DB. */

import { convertAmount } from "./rates";

export interface SplitRow {
  id: number;
  groupId: string;
  transactionId: number;
  transactionDescription: string;
  transactionDate: string;
  transactionAmount: number | null;
  splitAmount: number;
  issuerCurrency: string;
  issuerId: number;
  issuerName: string;
  recipientId: number;
  recipientName: string;
  status: string;
  recipientTransactionId: number | null;
  issuerNotified: boolean;
  createdAt: string;
}

/**
 * Transforms a raw DB split row plus its related transaction and user records
 * into the API response shape. Pure function — no DB access.
 */
export function formatSplitRow(
  s: {
    id: number;
    groupId?: string | null;
    transactionId: number;
    splitAmount: string | number;
    issuerCurrency?: string | null;
    issuerId: number;
    recipientId: number;
    status: string;
    recipientTransactionId?: number | null;
    issuerNotified: boolean;
    createdAt: Date;
  },
  tx: { description?: string | null; date?: string | null; amount?: string | number | null } | undefined,
  issuerName: string | undefined,
  recipientName: string | undefined,
): SplitRow {
  return {
    id: s.id,
    groupId: s.groupId ?? "",
    transactionId: s.transactionId,
    transactionDescription: tx?.description ?? "",
    transactionDate: tx?.date ?? "",
    transactionAmount: tx?.amount != null ? parseFloat(String(tx.amount)) : null,
    splitAmount: parseFloat(String(s.splitAmount)),
    issuerCurrency: s.issuerCurrency ?? "USD",
    issuerId: s.issuerId,
    issuerName: issuerName ?? "",
    recipientId: s.recipientId,
    recipientName: recipientName ?? "",
    status: s.status,
    recipientTransactionId: s.recipientTransactionId ?? null,
    issuerNotified: s.issuerNotified,
    createdAt: s.createdAt.toISOString(),
  };
}

/**
 * Validates that a proposed split amount is within the allowed bounds.
 * Returns an error message string, or null if valid.
 */
export function validateSplitAmount(
  splitAmount: number,
  transactionAmount: number,
): string | null {
  if (splitAmount <= 0) return "Split amount must be positive";
  if (splitAmount > transactionAmount) return "Split amount exceeds transaction amount";
  return null;
}

export interface SplitLine {
  recipientId: number;
  amount: number;
}

/**
 * Validates a multi-recipient split request against the parent transaction amount.
 * Ensures: at least one line, no duplicate/self recipients, every amount is positive,
 * and the sum leaves the issuer with a non-negative remainder.
 * Returns an error message string, or null if valid.
 */
export function validateSplitGroup(
  lines: SplitLine[],
  transactionAmount: number,
  issuerId: number,
): string | null {
  if (!Array.isArray(lines) || lines.length === 0) return "Select at least one household member";
  const seen = new Set<number>();
  for (const line of lines) {
    if (!Number.isFinite(line.recipientId)) return "Invalid member selected";
    if (line.recipientId === issuerId) return "Cannot split with yourself";
    if (seen.has(line.recipientId)) return "Each member can only appear once";
    seen.add(line.recipientId);
    if (!(line.amount > 0)) return "Each selected member needs an amount greater than zero";
  }
  const sum = lines.reduce((acc, l) => acc + l.amount, 0);
  // Allow a tiny epsilon for floating point summation of percentage-derived amounts.
  if (sum > transactionAmount + 0.01) return "Split amounts exceed the transaction amount";
  return null;
}

/**
 * Computes the amount to record on the RECIPIENT's new ledger entry when they accept
 * a split, converting from the issuer's transaction currency into the recipient's own
 * account currency using live exchange rates.
 *
 * This is computed server-side (authoritative) rather than trusting a client-supplied
 * pre-converted amount: the client's own rate cache can be stale, not-yet-loaded (a
 * race with the "fetch rates on mount" effect returns the RAW, unconverted amount),
 * or simply out of sync with the rates fetched here — any of which would silently
 * charge the recipient the wrong amount instead of the true equivalent of what was
 * requested.
 *
 * Returns the raw `splitAmount` unchanged when there is nothing to convert (no
 * recipient currency provided, or issuer/recipient already share a currency).
 */
export function computeRecipientAmount(
  splitAmount: number,
  issuerCurrency: string,
  recipientCurrency: string | undefined | null,
  rates: Record<string, number>,
): number {
  if (!recipientCurrency || recipientCurrency === issuerCurrency) return splitAmount;
  return convertAmount(splitAmount, issuerCurrency, recipientCurrency, rates);
}

/**
 * Given the statuses of every sibling row in a split group, determines the
 * group's overall state: still waiting on someone, fully settled (>=1 accepted),
 * or fully declined (should revert the issuer's transaction to a plain, unsplit state).
 */
export function computeGroupState(statuses: string[]): "pending" | "settled" | "all_declined" {
  if (statuses.some(s => s === "pending")) return "pending";
  if (statuses.some(s => s === "accepted")) return "settled";
  return "all_declined";
}
