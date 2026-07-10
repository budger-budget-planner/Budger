import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     ?? "mailto:admin@budger.app";

/**
 * True when VAPID keys are present and web-push has been initialised.
 * Export this so routes can gate push-subscription endpoints and return a
 * clear error instead of silently accepting subscriptions that will never work.
 */
export const PUSH_CONFIGURED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

/**
 * The VAPID public key to hand to the browser when it subscribes.
 * Null when push is not configured.
 */
export const VAPID_PUBLIC_KEY_VALUE: string | null = PUSH_CONFIGURED ? VAPID_PUBLIC_KEY : null;

if (PUSH_CONFIGURED) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  logger.info("push-sender: VAPID keys loaded — web push is active");
} else {
  logger.warn(
    "push-sender: VAPID_PUBLIC_KEY and/or VAPID_PRIVATE_KEY are not set. " +
    "Push notifications will not be delivered. " +
    "Generate keys with: npx web-push generate-vapid-keys"
  );
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!PUSH_CONFIGURED) {
    logger.warn({ userId }, "push-sender: push not configured — notification not delivered");
    return;
  }

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
