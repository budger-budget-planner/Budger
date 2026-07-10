/** Pure helpers extracted from routes/splits.ts — importable and testable without a DB. */

export interface SplitRow {
  id: number;
  transactionId: number;
  transactionDescription: string;
  transactionDate: string;
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
  tx: { description?: string | null; date?: string | null } | undefined,
  issuerName: string | undefined,
  recipientName: string | undefined,
): SplitRow {
  return {
    id: s.id,
    transactionId: s.transactionId,
    transactionDescription: tx?.description ?? "",
    transactionDate: tx?.date ?? "",
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
