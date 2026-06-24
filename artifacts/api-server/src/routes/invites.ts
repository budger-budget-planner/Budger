import { Router, type IRouter } from "express";
import { db, invitesTable, householdsTable, usersTable, householdMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { pickNextColor } from "./households";
import {
  CreateInviteBody,
  AcceptInviteParams,
  GetInviteParams,
  CancelInviteParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function enrichInvite(invite: any, household: any) {
  return {
    id: invite.id,
    email: invite.email,
    token: invite.token,
    householdId: invite.householdId,
    householdName: household?.name ?? null,
    status: invite.status,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  };
}

router.post("/invites", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = CreateInviteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "You must be in a household to invite" }); return; }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [invite] = await db.insert(invitesTable).values({
    email: parsed.data.email,
    token,
    householdId: user.householdId,
    expiresAt,
  }).returning();

  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, user.householdId));

  res.status(201).json(enrichInvite(invite, household));
});

router.get("/invites", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.json([]); return; }

  const invites = await db.select().from(invitesTable)
    .where(and(eq(invitesTable.householdId, user.householdId), eq(invitesTable.status, "pending")));

  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, user.householdId));

  res.json(invites.map(i => enrichInvite(i, household)));
});

router.get("/invites/:token", async (req, res): Promise<void> => {
  const params = GetInviteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [invite] = await db.select().from(invitesTable).where(eq(invitesTable.token, params.data.token));
  if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
    res.status(404).json({ error: "Invite not found or expired" });
    return;
  }

  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, invite.householdId));
  res.json(enrichInvite(invite, household));
});

router.post("/invites/:token/accept", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = AcceptInviteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [invite] = await db.select().from(invitesTable).where(eq(invitesTable.token, params.data.token));
  if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
    res.status(404).json({ error: "Invite not found or expired" });
    return;
  }

  await db.update(invitesTable).set({ status: "accepted" }).where(eq(invitesTable.id, invite.id));

  const existingMember = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, invite.householdId)));

  if (existingMember.length === 0) {
    const color = await pickNextColor(invite.householdId);
    await db.insert(householdMembersTable).values({
      userId,
      householdId: invite.householdId,
      role: "member",
      memberColor: color,
    });
  }

  await db.update(usersTable).set({ householdId: invite.householdId }).where(eq(usersTable.id, userId));

  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, invite.householdId));
  res.json({ ...household, createdAt: household.createdAt.toISOString() });
});

router.delete("/invites/:token", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = CancelInviteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  await db.update(invitesTable).set({ status: "cancelled" }).where(eq(invitesTable.token, params.data.token));
  res.sendStatus(204);
});

export default router;
