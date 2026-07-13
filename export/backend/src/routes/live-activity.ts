/**
 * Live Activity routes.
 *
 * POST /api/live-activity/token
 *   The iOS app registers a Live Activity push token here whenever it
 *   starts a new Live Activity (tokens change per activity instance).
 *
 * POST /api/live-activity/push
 *   Internal or trusted caller sends a content-state update to all
 *   active Live Activity tokens for a given user.
 *   (In production, call this from transaction create/update/delete routes
 *    so household members' Lock Screen widgets update in real time.)
 *
 * DELETE /api/live-activity/token
 *   The iOS app calls this when it ends its Live Activity so the server
 *   stops sending pushes to the now-invalid token.
 */

import { Router, type IRouter } from "express";
import { db } from "../db";
import { liveActivityTokensTable } from "../db";
import { eq, and } from "drizzle-orm";
import { sendLiveActivityPush, apnsConfigured } from "../lib/apns-sender";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Register a Live Activity token ───────────────────────────────────────────

router.post("/live-activity/token", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { token, activityId } = req.body ?? {};
  if (!token || !activityId) {
    res.status(400).json({ error: "token and activityId required" });
    return;
  }

  // Upsert — one activityId = one token row
  const existing = await db
    .select()
    .from(liveActivityTokensTable)
    .where(
      and(
        eq(liveActivityTokensTable.userId, userId),
        eq(liveActivityTokensTable.activityId, String(activityId)),
      ),
    );

  if (existing.length > 0) {
    await db
      .update(liveActivityTokensTable)
      .set({ token: String(token), updatedAt: new Date() })
      .where(eq(liveActivityTokensTable.id, existing[0].id));
  } else {
    await db.insert(liveActivityTokensTable).values({
      userId,
      activityId: String(activityId),
      token: String(token),
    });
  }

  res.status(200).json({ ok: true });
});

// ─── Remove a Live Activity token (activity ended on device) ─────────────────

router.delete("/live-activity/token", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { activityId } = req.body ?? {};
  if (!activityId) { res.status(400).json({ error: "activityId required" }); return; }

  await db
    .delete(liveActivityTokensTable)
    .where(
      and(
        eq(liveActivityTokensTable.userId, userId),
        eq(liveActivityTokensTable.activityId, String(activityId)),
      ),
    );

  res.status(200).json({ ok: true });
});

// ─── Push a content-state update to all of a user's live activity tokens ──────

export async function pushLiveActivityToUser(
  userId: number,
  contentState: Record<string, unknown>,
  event: "update" | "end" = "update",
): Promise<void> {
  if (!apnsConfigured()) return;

  let tokens: typeof liveActivityTokensTable.$inferSelect[] = [];
  try {
    tokens = await db
      .select()
      .from(liveActivityTokensTable)
      .where(eq(liveActivityTokensTable.userId, userId));
  } catch (err) {
    logger.warn({ err, userId }, "live-activity: failed to fetch tokens");
    return;
  }

  if (tokens.length === 0) return;

  for (const row of tokens) {
    await sendLiveActivityPush({
      deviceToken: row.token,
      event,
      contentState,
    }).catch(err => {
      logger.warn({ err, userId }, "live-activity: push failed");
    });
  }

  if (event === "end") {
    await db
      .delete(liveActivityTokensTable)
      .where(eq(liveActivityTokensTable.userId, userId));
  }
}

// ─── Manual push endpoint (useful for server-admin / testing) ─────────────────

router.post("/live-activity/push", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const { contentState, event } = req.body ?? {};
  if (!contentState) { res.status(400).json({ error: "contentState required" }); return; }

  if (!apnsConfigured()) {
    res.status(503).json({ error: "APNs not configured on server" });
    return;
  }

  await pushLiveActivityToUser(userId, contentState, event ?? "update");
  res.json({ ok: true });
});

export default router;
