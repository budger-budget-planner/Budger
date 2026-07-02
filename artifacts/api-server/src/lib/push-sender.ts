import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

// Initialise VAPID once at module load — other routes import push-sender, not the other way around
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     ?? "mailto:admin@budger.app";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  let subs: typeof pushSubscriptionsTable.$inferSelect[] = [];
  try {
    subs = await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
  } catch (err) {
    logger.warn({ err, userId }, "push-sender: failed to fetch subscriptions");
    return;
  }

  if (subs.length === 0) return;

  const payloadStr = JSON.stringify({
    ...payload,
    icon: "/favicon.svg",
  });

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payloadStr,
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.delete(pushSubscriptionsTable).where(
          and(
            eq(pushSubscriptionsTable.userId, userId),
            eq(pushSubscriptionsTable.endpoint, sub.endpoint),
          ),
        );
        logger.info({ userId }, "push-sender: removed stale subscription");
      } else {
        logger.warn({ err, userId }, "push-sender: send failed");
      }
    }
  }
}

export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<void> {
  await Promise.all(userIds.map(id => sendPushToUser(id, payload)));
}
