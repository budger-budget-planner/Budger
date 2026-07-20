/** Pure helpers extracted from routes/recurring-payments.ts — importable and testable without a DB. */

/**
 * Returns the YYYY-MM key for the given date (defaults to today).
 * Injectable `now` lets tests pin the month without mocking Date globally.
 */
export function monthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Returns the number of days in `month` (1-12) of `year`.
 * Uses the "day 0 of next month" trick which handles leap years correctly.
 */
export function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Clamps `dayOfMonth` to the last actual day of the given month.
 * e.g. dayOfMonth=31 in February → 28 or 29.
 */
export function actualDayForMonth(
  dayOfMonth: number,
  year: number,
  month: number,
): number {
  return Math.min(dayOfMonth, getLastDayOfMonth(year, month));
}

/**
 * Returns whether a scheduled recurring payment is due on or before `today`.
 */
export function isPaymentDue(
  dayOfMonth: number,
  year: number,
  month: number,
  today: number,
): boolean {
  return today >= actualDayForMonth(dayOfMonth, year, month);
}

/** Formats a recurring-payment row for the API response. */
export function formatRP(
  rp: any,
  appliedThisMonth: boolean,
  transactionId: number | null,
) {
  return {
    id: rp.id,
    userId: rp.userId,
    householdId: rp.householdId ?? null,
    name: rp.name,
    color: rp.color,
    type: rp.type,
    amount: parseFloat(rp.amount),
    dayOfMonth: rp.dayOfMonth ?? null,
    addToLarder: rp.addToLarder ?? false,
    scope: rp.scope ?? "personal",
    appliedThisMonth,
    transactionId,
    createdAt:
      rp.createdAt instanceof Date ? rp.createdAt.toISOString() : rp.createdAt,
  };
}
