import { Router, type IRouter } from "express";
import { db, householdsTable, householdMembersTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateHouseholdBody,
  UpdateHouseholdBody,
  RemoveHouseholdMemberParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/households", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(404).json({ error: "No household" }); return; }

  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, user.householdId));
  if (!household) { res.status(404).json({ error: "Not found" }); return; }

  res.json({ ...household, createdAt: household.createdAt.toISOString() });
});

router.post("/households", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = CreateHouseholdBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [household] = await db.insert(householdsTable).values({
    name: parsed.data.name,
    ownerId: userId,
  }).returning();

  await db.insert(householdMembersTable).values({
    userId,
    householdId: household.id,
    role: "owner",
  });

  await db.update(usersTable).set({ householdId: household.id }).where(eq(usersTable.id, userId));

  res.status(201).json({ ...household, createdAt: household.createdAt.toISOString() });
});

router.patch("/households", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = UpdateHouseholdBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(404).json({ error: "No household" }); return; }

  const [household] = await db.update(householdsTable)
    .set(parsed.data)
    .where(eq(householdsTable.id, user.householdId))
    .returning();

  if (!household) { res.status(404).json({ error: "Not found" }); return; }

  res.json({ ...household, createdAt: household.createdAt.toISOString() });
});

router.get("/households/members", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.json([]); return; }

  const members = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.householdId, user.householdId));

  const users = await db.select().from(usersTable);
  const userMap = new Map(users.map(u => [u.id, u]));

  res.json(members.map(m => ({
    userId: m.userId,
    householdId: m.householdId,
    role: m.role,
    name: userMap.get(m.userId)?.name ?? "Unknown",
    email: userMap.get(m.userId)?.email ?? "",
    joinedAt: m.joinedAt.toISOString(),
  })));
});

router.delete("/households/members/:userId", async (req, res): Promise<void> => {
  const currentUserId = (req.session as any)?.userId;
  if (!currentUserId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = RemoveHouseholdMemberParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, currentUserId));
  if (!currentUser?.householdId) { res.status(400).json({ error: "No household" }); return; }

  await db.delete(householdMembersTable).where(
    and(
      eq(householdMembersTable.userId, params.data.userId),
      eq(householdMembersTable.householdId, currentUser.householdId)
    )
  );

  await db.update(usersTable).set({ householdId: null }).where(eq(usersTable.id, params.data.userId));

  res.sendStatus(204);
});

router.post("/households/leave", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  await db.delete(householdMembersTable).where(
    and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, user.householdId))
  );

  await db.update(usersTable).set({ householdId: null }).where(eq(usersTable.id, userId));

  res.json({ success: true });
});

export default router;
