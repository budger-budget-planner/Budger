import { Router, type IRouter } from "express";
import webpush from "web-push";
import { db, notificationSettingsTable, pushSubscriptionsTable, notificationItemsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { UpdateNotificationSettingsBody, SavePushSubscriptionBody, CreateNotificationItemBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── VAPID setup ───────────────────────────────────────────────────────────────

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT     ?? "mailto:admin@budger.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSettings(s: any) {
  return {
    id: s.id,
    userId: s.userId,
    enabled: s.enabled,
    reminderTime: s.reminderTime,
    days: s.days,
    createdAt: s.createdAt.toISOString(),
  };
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// ── Notification settings routes ──────────────────────────────────────────────

router.get("/notifications", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  let [settings] = await db.select().from(notificationSettingsTable).where(eq(notificationSettingsTable.userId, userId));

  if (!settings) {
    [settings] = await db.insert(notificationSettingsTable).values({
      userId,
      enabled: false,
      reminderTime: "20:00",
      days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    }).returning();
  }

  res.json(formatSettings(settings));
});

router.put("/notifications", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = UpdateNotificationSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const existing = await db.select().from(notificationSettingsTable).where(eq(notificationSettingsTable.userId, userId));

  let settings;
  if (existing.length === 0) {
    [settings] = await db.insert(notificationSettingsTable).values({
      userId,
      ...parsed.data,
    }).returning();
  } else {
    [settings] = await db.update(notificationSettingsTable)
      .set(parsed.data)
      .where(eq(notificationSettingsTable.userId, userId))
      .returning();
  }

  res.json(formatSettings(settings));
});

// ── Notification-center feed items ──────────────────────────────────────────────
// Persisted server-side (per user) so read/dismissed state survives reloads,
// new devices, and project remixes instead of living only in localStorage.

function formatItem(n: any) {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    titleEn: n.titleEn,
    titlePl: n.titlePl,
    bodyEn: n.bodyEn,
    bodyPl: n.bodyPl,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

const NOTIFICATION_ITEMS_MAX = 50;

router.get("/notifications/items", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const items = await db.select().from(notificationItemsTable)
    .where(and(
      eq(notificationItemsTable.userId, userId),
      eq(notificationItemsTable.dismissed, false),
    ))
    .orderBy(desc(notificationItemsTable.createdAt))
    .limit(NOTIFICATION_ITEMS_MAX);

  res.json(items.map(formatItem));
});

router.post("/notifications/items", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = CreateNotificationItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // ON CONFLICT DO NOTHING on the (user_id, dedup_key) partial unique index so
  // the same notification can never be inserted twice, even across sessions.
  const result = await db.insert(notificationItemsTable)
    .values({ userId, ...parsed.data })
    .onConflictDoNothing()
    .returning();

  // result is empty when the row was a duplicate — treat as success (no-op).
  if (result.length === 0) { res.status(204).send(); return; }

  const item = result[0];

  // Trim old items beyond the cap (only needed on real inserts, not no-ops).
  const excess = await db.select({ id: notificationItemsTable.id }).from(notificationItemsTable)
    .where(and(
      eq(notificationItemsTable.userId, userId),
      eq(notificationItemsTable.dismissed, false),
    ))
    .orderBy(desc(notificationItemsTable.createdAt))
    .offset(NOTIFICATION_ITEMS_MAX);
  if (excess.length > 0) {
    await db.update(notificationItemsTable)
      .set({ dismissed: true })
      .where(sql`id IN (${sql.join(excess.map(r => sql`${r.id}`), sql`, `)})`);
  }

  res.json(formatItem(item));
});

router.patch("/notifications/items/mark-all-read", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  await db.update(notificationItemsTable)
    .set({ read: true })
    .where(and(
      eq(notificationItemsTable.userId, userId),
      eq(notificationItemsTable.read, false),
      eq(notificationItemsTable.dismissed, false),
    ));

  res.json({ ok: true });
});

// Soft-delete: marks dismissed=true so the dedup_key row is preserved,
// permanently preventing re-insertion of the same notification.
router.patch("/notifications/items/:id/dismiss", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.update(notificationItemsTable)
    .set({ dismissed: true })
    .where(and(eq(notificationItemsTable.id, id), eq(notificationItemsTable.userId, userId)));

  res.status(204).send();
});

// Sets the read/unread state of a single item — used by the swipe-left-to-right
// toggle in the Notification Center feed (swipe-to-delete stays right-to-left).
router.patch("/notifications/items/:id/read", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const read = req.body?.read;
  if (typeof read !== "boolean") { res.status(400).json({ error: "read must be a boolean" }); return; }

  const result = await db.update(notificationItemsTable)
    .set({ read })
    .where(and(eq(notificationItemsTable.id, id), eq(notificationItemsTable.userId, userId)))
    .returning();

  if (result.length === 0) { res.status(404).json({ error: "Not found" }); return; }

  res.json(formatItem(result[0]));
});

// ── Web Push routes ────────────────────────────────────────────────────────────

router.get("/notifications/vapid-public-key", (req, res): void => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

router.post("/notifications/push-subscribe", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = SavePushSubscriptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { endpoint, p256dh, auth } = parsed.data;

  const existing = await db.select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, endpoint));

  if (existing.length === 0) {
    await db.insert(pushSubscriptionsTable).values({ userId, endpoint, p256dh, auth });
  } else {
    await db.update(pushSubscriptionsTable)
      .set({ userId, p256dh, auth })
      .where(eq(pushSubscriptionsTable.endpoint, endpoint));
  }

  res.json({ ok: true });
});

// ── Daily reminder scheduler ──────────────────────────────────────────────────

async function sendDailyReminders() {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const now = new Date();
  const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const currentDayKey = DAY_KEYS[now.getDay()];

  let settingsList: any[] = [];
  try {
    settingsList = await db.select().from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.enabled, true));
  } catch (err) {
    logger.error({ err }, "Failed to fetch notification settings for push");
    return;
  }

  const dueUsers = settingsList.filter(s =>
    s.reminderTime === currentHHMM && s.days.includes(currentDayKey)
  );

  for (const settings of dueUsers) {
    let subs: any[] = [];
    try {
      subs = await db.select().from(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.userId, settings.userId));
    } catch {
      continue;
    }

    const payload = JSON.stringify({
      title: "Budger",
      body: "Time to log today's spending.",
      url: "/",
      tag: "daily-reminder",
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.delete(pushSubscriptionsTable)
            .where(and(
              eq(pushSubscriptionsTable.userId, settings.userId),
              eq(pushSubscriptionsTable.endpoint, sub.endpoint)
            ));
          logger.info({ userId: settings.userId }, "Removed stale push subscription");
        } else {
          logger.warn({ err, userId: settings.userId }, "Push notification failed");
        }
      }
    }
  }
}

// Run every minute
setInterval(() => { sendDailyReminders().catch(() => {}); }, 60_000);

export default router;
