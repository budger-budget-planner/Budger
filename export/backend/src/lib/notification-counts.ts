import { db, notificationItemsTable } from "../db";
import { and, eq, sql } from "drizzle-orm";

/**
 * Unread, non-dismissed Notification Center item count for a user — this is
 * exactly what the frontend bell badge and home-screen app icon badge
 * (Badging API) display, so any push that should update the icon count needs
 * this computed *after* the triggering notificationItemsTable row is inserted.
 */
export async function getUnreadNotificationCount(userId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationItemsTable)
    .where(and(
      eq(notificationItemsTable.userId, userId),
      eq(notificationItemsTable.read, false),
      eq(notificationItemsTable.dismissed, false),
    ));
  return row?.count ?? 0;
}
