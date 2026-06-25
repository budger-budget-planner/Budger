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

function isHead(role: string) { return role === "head" || role === "owner"; }

function enrichInvite(invite: any, household: any) {
  return {
    id: invite.id,
    email: invite.email,
    token: invite.token,
    householdId: invite.householdId,
    householdName: household?.name ?? null,
    role: invite.role ?? "child",
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

  // Only head can invite
  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, user.householdId)));
  if (!myMembership || !isHead(myMembership.role)) {
    res.status(403).json({ error: "Only the head of the household can invite members" }); return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const role = parsed.data.role ?? "child";

  const [invitedUser] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!invitedUser) {
    res.status(422).json({ error: "USER_NOT_FOUND" });
    return;
  }
  if (invitedUser.householdId) {
    res.status(422).json({ error: "USER_IN_HOUSEHOLD" });
    return;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [invite] = await db.insert(invitesTable).values({
    email,
    token,
    householdId: user.householdId,
    role,
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

router.get("/invites/incoming", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.json([]); return; }

  const now = new Date();
  const invites = await db.select().from(invitesTable)
    .where(and(eq(invitesTable.email, user.email), eq(invitesTable.status, "pending")));

  const active = invites.filter(i => i.expiresAt > now);

  const results = await Promise.all(active.map(async invite => {
    const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, invite.householdId));
    return enrichInvite(invite, household);
  }));

  res.json(results);
});

router.get("/invites/:token", async (req, res): Promise<void> => {
  const params = GetInviteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [invite] = await db.select().from(invitesTable).where(eq(invitesTable.token, params.data.token));
  if (!invite) { res.status(404).json({ error: "Invite not found" }); return; }
  if (invite.status === "cancelled") { res.status(410).json({ error: "Invite has been revoked" }); return; }
  if (invite.status !== "pending" || invite.expiresAt < new Date()) {
    res.status(404).json({ error: "Invite expired" }); return;
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
      role: invite.role ?? "child",
      memberColor: color,
    });
  }

  await db.update(usersTable).set({ householdId: invite.householdId }).where(eq(usersTable.id, userId));

  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, invite.householdId));
  res.json({ ...household, createdAt: household.createdAt.toISOString() });
});

router.post("/invites/:token/decline", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = CancelInviteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  await db.update(invitesTable).set({ status: "declined" }).where(eq(invitesTable.token, params.data.token));
  res.sendStatus(204);
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
