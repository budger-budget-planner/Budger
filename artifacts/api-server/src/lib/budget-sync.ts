import { db, categoriesTable, recurringPaymentsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Keeps `users.total_budget` in permanent sync with the sum of a user's
 * category budgets + recurring payments, computed server-side.
 *
 * This is the single source of truth for "total monthly budget" reconciliation.
 * It only ever RAISES the total budget (never lowers it) — a user's manually
 * chosen total is a ceiling they're free to set above their planned spend, but
 * the total must never sit below the sum of what they've actually budgeted.
 *
 * Call this after every category/recurring-payment create or update that can
 * change the budgeted sum. Doing this in the same request/transaction as the
 * mutation — rather than relying on a client-side "adjust to match" click —
 * is what makes the sync reliable regardless of client bugs, missed clicks,
 * or dropped network requests.
 */
export async function syncTotalBudgetFloor(userId: number): Promise<number | null> {
  const [categories, recurringPayments, [user]] = await Promise.all([
    db.select().from(categoriesTable).where(eq(categoriesTable.userId, userId)),
    db.select().from(recurringPaymentsTable).where(eq(recurringPaymentsTable.userId, userId)),
    db.select().from(usersTable).where(eq(usersTable.id, userId)),
  ]);

  if (!user) return null;

  const catSum = categories.reduce((s, c) => s + (c.budget != null ? parseFloat(c.budget) : 0), 0);
  const rpSum  = recurringPayments.reduce((s, rp) => s + parseFloat(rp.amount), 0);
  const combined = Math.round((catSum + rpSum) * 100) / 100;

  const currentTotal = user.totalBudget != null ? parseFloat(user.totalBudget) : null;
  if (combined <= 0) return currentTotal;
  if (currentTotal != null && combined <= currentTotal) return currentTotal;

  await db.update(usersTable)
    .set({ totalBudget: String(combined) })
    .where(eq(usersTable.id, userId));

  return combined;
}
