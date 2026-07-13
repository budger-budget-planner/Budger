/** Pure helpers extracted from routes/summary.ts — importable and testable without a DB. */

/**
 * Returns true when a transaction should be counted in native-currency totals.
 * A transaction is "native" when it has no foreign-currency tag, or its tag
 * matches the user's current display currency.
 */
export function isNativeCurrency(
  tx: { transactionCurrency?: string | null },
  userCurrency?: string,
): boolean {
  if (!tx.transactionCurrency) return true;
  if (userCurrency && tx.transactionCurrency === userCurrency) return true;
  return false;
}

/**
 * Returns true iff the string is a strict YYYY-MM month prefix.
 * Rejects anything that could be used as a SQL wildcard.
 */
export function isValidMonthPrefix(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s);
}

/**
 * Returns the YYYY-MM-DD first day of the month that is `monthsBack`
 * months before `from`. Used to compute SQL-level date cutoffs.
 */
export function monthsAgoDate(from: Date, monthsBack: number): string {
  const d = new Date(from.getFullYear(), from.getMonth() - monthsBack, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Rounds a monetary total to two decimal places.
 * Centralises the rounding rule used throughout summary endpoints.
 */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Filters an array of transactions to those that count toward native spending.
 * Excludes locked, unavailable, goal-funded, larder, and foreign-currency rows.
 */
export function nativeSpendingTxs(
  txs: Array<{
    currencyLocked?: boolean | null;
    currencyUnavailable?: boolean | null;
    foundedWithRealizedGoal?: boolean | null;
    isLarderFund?: boolean | null;
    transactionCurrency?: string | null;
  }>,
  userCurrency?: string,
) {
  return txs.filter(
    (tx) =>
      !tx.currencyLocked &&
      !tx.currencyUnavailable &&
      !tx.foundedWithRealizedGoal &&
      !tx.isLarderFund &&
      isNativeCurrency(tx, userCurrency),
  );
}
