import { and, eq, inArray } from "drizzle-orm";
import { recurringPaymentsTable, recurringPaymentLogsTable } from "../db";

/**
 * Moves the outgoing head's household recurring payments to the incoming head.
 * Household RPs become manual on transfer, regardless of their previous type.
 *
 * This must be called with the transaction used for the corresponding head
 * transfer so role, owner, RP, and RP-log changes commit or roll back together.
 */
export async function transferHouseholdRecurringPayments(
  tx: any,
  previousHeadUserId: number,
  newHeadUserId: number,
  householdId: number,
): Promise<number> {
  const existing = await tx
    .select({ id: recurringPaymentsTable.id })
    .from(recurringPaymentsTable)
    .where(and(
      eq(recurringPaymentsTable.userId, previousHeadUserId),
      eq(recurringPaymentsTable.scope, "household"),
    ));

  if (existing.length === 0) return 0;

  const recurringPaymentIds = existing.map((rp: { id: number }) => rp.id);

  await tx
    .update(recurringPaymentsTable)
    .set({
      userId: newHeadUserId,
      householdId,
      type: "manual",
      dayOfMonth: null,
    })
    .where(and(
      eq(recurringPaymentsTable.userId, previousHeadUserId),
      eq(recurringPaymentsTable.scope, "household"),
    ));

  // Keep prior application state with the RP after ownership changes. This
  // also prevents the old user's account deletion from cascading these logs.
  await tx
    .update(recurringPaymentLogsTable)
    .set({ userId: newHeadUserId })
    .where(and(
      eq(recurringPaymentLogsTable.userId, previousHeadUserId),
      inArray(recurringPaymentLogsTable.recurringPaymentId, recurringPaymentIds),
    ));

  return existing.length;
}