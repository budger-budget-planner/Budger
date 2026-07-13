/** Pure helpers extracted from routes/goals.ts — importable and testable without a DB. */

export function isHead(role: string): boolean {
  return role === "head" || role === "owner";
}

export function isChildRole(role: string): boolean {
  return role === "child" || role === "member";
}

export function formatGoal(g: any) {
  return {
    ...g,
    budget: parseFloat(g.budget),
    currency: g.currency ?? null,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt?.toISOString?.() ?? g.createdAt.toISOString(),
  };
}

export function formatContribution(c: any, goal?: any) {
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

/**
 * Calculates the monthly savings target for a divide-by-months goal.
 * Returns null if divideByMonths is false.
 * `now` is injectable so tests can pin the date.
 */
export function calculateMonthlyTarget(
  budget: number,
  deadline: string,
  now: Date = new Date(),
): number | null {
  const deadlineDate = new Date(deadline);
  const monthsLeft = Math.max(
    1,
    (deadlineDate.getFullYear() - now.getFullYear()) * 12 +
      (deadlineDate.getMonth() - now.getMonth()) +
      1,
  );
  return Math.round((budget / monthsLeft) * 100) / 100;
}

/**
 * Percentage of a goal reached, capped at two decimal places.
 * Returns 0 when budget is zero (avoids division by zero).
 */
export function goalPercentage(contributed: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.round((contributed / budget) * 10000) / 100;
}
