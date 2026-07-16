import { Router, type IRouter } from "express";
import webpush from "web-push";
import { db, notificationSettingsTable, pushSubscriptionsTable, notificationItemsTable } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { UpdateNotificationSettingsBody, SavePushSubscriptionBody, CreateNotificationItemBody } from "../api-zod";
import { logger } from "../lib/logger";
import { PUSH_CONFIGURED, VAPID_PUBLIC_KEY_VALUE } from "../lib/push-sender";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSettings(s: any) {
  return {
    id: s.id,
    userId: s.userId,
    enabled: s.enabled,
    reminderTime: s.reminderTime,
    timezone: s.timezone ?? "UTC",
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

// Returns null publicKey when push is not configured so the frontend can
// gracefully skip subscription rather than registering and then silently
// receiving nothing.
router.get("/notifications/vapid-public-key", (req, res): void => {
  res.json({ publicKey: VAPID_PUBLIC_KEY_VALUE, configured: PUSH_CONFIGURED });
});

router.post("/notifications/push-subscribe", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  // Reject subscription attempts when VAPID is not configured so the frontend
  // knows push cannot work instead of silently storing a useless endpoint.
  if (!PUSH_CONFIGURED) {
    res.status(503).json({
      error: "Push notifications are not configured on this server. VAPID keys are missing.",
    });
    return;
  }

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

// Removes a device's push subscription so the server stops sending it real
// pushes. Called when the user turns off the "Enable Notifications" toggle
// (browser permission itself can't be revoked from JS, so this — plus the
// browser-side unsubscribe — is the actual "off" switch). If no endpoint is
// given (e.g. the browser had no live subscription object anymore), fall
// back to removing every subscription on file for this user so stale
// endpoints can't keep receiving pushes either.
router.delete("/notifications/push-subscribe", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : undefined;

  if (endpoint) {
    await db.delete(pushSubscriptionsTable)
      .where(and(eq(pushSubscriptionsTable.userId, userId), eq(pushSubscriptionsTable.endpoint, endpoint)));
  } else {
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
  }

  res.json({ ok: true });
});

// ── Daily reminder scheduler ──────────────────────────────────────────────────

/**
 * Returns the current HH:MM in the given IANA timezone.
 * Falls back to UTC if the timezone string is invalid.
 */
function getLocalHHMM(timezone: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const hh = parts.find(p => p.type === "hour")?.value ?? "00";
    const mm = parts.find(p => p.type === "minute")?.value ?? "00";
    // Some environments emit "24" for midnight — normalise it.
    return `${hh === "24" ? "00" : hh}:${mm}`;
  } catch {
    const now = new Date();
    return `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  }
}

/**
 * Returns the current day-of-week key ("mon"…"sun") in the given IANA timezone.
 */
function getLocalDayKey(timezone: string): string {
  try {
    const now = new Date();
    const dayName = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(now).toLowerCase(); // "mon", "tue", …, "sun"
    return dayName;
  } catch {
    return DAY_KEYS[new Date().getUTCDay()];
  }
}

// In-memory dedup: prevents double-sends when the interval fires twice near a
// minute boundary (e.g. after a server restart). Key: `userId:YYYY-MM-DD:HH:MM`.
// Cleared at midnight UTC so tomorrow's reminders can fire normally.
const sentReminderKeys = new Set<string>();

function todayUTCStr(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Reset dedup set every 24 h.
setInterval(() => sentReminderKeys.clear(), 24 * 60 * 60 * 1000);

async function sendDailyReminders() {
  if (!PUSH_CONFIGURED) return;

  let settingsList: any[] = [];
  try {
    settingsList = await db.select().from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.enabled, true));
  } catch (err) {
    logger.error({ err }, "Failed to fetch notification settings for push");
    return;
  }

  // Check each user's reminder time in their own timezone.
  const dueUsers = settingsList.filter(s => {
    const tz = s.timezone || "UTC";
    const localHHMM  = getLocalHHMM(tz);
    const localDay   = getLocalDayKey(tz);
    return s.reminderTime === localHHMM && s.days.includes(localDay);
  });

  for (const settings of dueUsers) {
    // Dedup: skip if we already sent this user's reminder for this minute today.
    const dedupKey = `${settings.userId}:${todayUTCStr()}:${settings.reminderTime}`;
    if (sentReminderKeys.has(dedupKey)) continue;
    sentReminderKeys.add(dedupKey);

    let subs: any[] = [];
    try {
      subs = await db.select().from(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.userId, settings.userId));
    } catch (err) {
      logger.warn({ err, userId: settings.userId }, "daily-reminder: failed to fetch subscriptions, skipping user");
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

// ── Minute-aligned scheduler ─────────────────────────────────────────────────
// Align the first tick to the top of the next wall-clock minute so the check
// always lands at :00 seconds rather than at a random offset depending on when
// the process started.  After the first aligned tick, run every 60 s.
// This prevents missing a user's minute window on server restarts.
function scheduleDailyReminders() {
  const now = new Date();
  const msUntilNextMinute =
    (60 - now.getSeconds()) * 1_000 - now.getMilliseconds() + 50; // +50 ms buffer

  setTimeout(() => {
    sendDailyReminders().catch(err =>
      logger.warn({ err }, "daily-reminder: unhandled error in reminder job"),
    );
    setInterval(() => {
      sendDailyReminders().catch(err =>
        logger.warn({ err }, "daily-reminder: unhandled error in reminder job"),
      );
    }, 60_000);
  }, msUntilNextMinute);
}

scheduleDailyReminders();

// Smart alerts (budget thresholds + goal check-ins) — server-side push so
// they fire even when the app is closed.  Import triggers its own scheduler.
import("../lib/smart-alert-scheduler").catch(err => logger.warn({ err }, "smart-alerts: module load failed"));


export default router;
