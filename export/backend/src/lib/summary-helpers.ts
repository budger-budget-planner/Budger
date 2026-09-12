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

export type CalendarPeriod = {
  index: number;
  startDate: string;
  endDate: string;
  days: number;
};

function formatCalendarDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Splits a calendar month into four deterministic, contiguous periods.
 * Extra days are assigned from the beginning of the month:
 * 28 → 7/7/7/7, 29 → 8/7/7/7, 30 → 8/8/7/7, 31 → 8/8/8/7.
 */
export function buildCalendarPeriods(month: string): CalendarPeriod[] {
  if (!isValidMonthPrefix(month)) {
    throw new Error("Invalid month format, expected YYYY-MM");
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const monthIndex = monthNumber - 1;
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const baseDays = Math.floor(daysInMonth / 4);
  const extraDays = daysInMonth % 4;
  let cursor = 1;

  return Array.from({ length: 4 }, (_, index) => {
    const days = baseDays + (index < extraDays ? 1 : 0);
    const startDay = cursor;
    const endDay = cursor + days - 1;
    cursor = endDay + 1;
    return {
      index,
      startDate: formatCalendarDate(year, monthIndex, startDay),
      endDate: formatCalendarDate(year, monthIndex, endDay),
      days,
    };
  });
}
