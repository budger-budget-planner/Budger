import { db, notificationItemsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

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
