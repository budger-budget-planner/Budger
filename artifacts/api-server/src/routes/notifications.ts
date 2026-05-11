import { Router, type IRouter } from "express";
import { db, notificationSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  UpdateNotificationSettingsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

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

export default router;
