import { Router, type IRouter } from "express";
import { db, householdsTable, householdMembersTable, usersTable, transactionsTable, categoriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateHouseholdBody,
  UpdateHouseholdBody,
  RemoveHouseholdMemberParams,
  GetMemberSpendingParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const MEMBER_COLORS = [
  "#818cf8", "#34d399", "#fb923c", "#f472b6",
  "#38bdf8", "#a78bfa", "#fbbf24", "#f87171",
  "#4ade80", "#60a5fa", "#e879f9", "#2dd4bf",
];

export async function pickNextColor(householdId: number): Promise<string> {
  const members = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.householdId, householdId));
  const usedColors = new Set(members.map(m => m.memberColor));
  return MEMBER_COLORS.find(c => !usedColors.has(c)) ?? MEMBER_COLORS[members.length % MEMBER_COLORS.length];
}

function serializeHousehold(h: any) {
  return {
    ...h,
    budget: h.budget != null ? parseFloat(h.budget) : null,
    createdAt: h.createdAt instanceof Date ? h.createdAt.toISOString() : h.createdAt,
  };
}

router.get("/households", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(404).json({ error: "No household" }); return; }

  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, user.householdId));
  if (!household) { res.status(404).json({ error: "Not found" }); return; }

  res.json(serializeHousehold(household));
});

router.post("/households", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = CreateHouseholdBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [household] = await db.insert(householdsTable).values({
    name: parsed.data.name,
    ownerId: userId,
    budget: parsed.data.budget != null ? String(parsed.data.budget) : null,
  }).returning();

  await db.insert(householdMembersTable).values({
    userId,
    householdId: household.id,
    role: "owner",
    memberColor: MEMBER_COLORS[0],
  });

  await db.update(usersTable).set({ householdId: household.id }).where(eq(usersTable.id, userId));

  res.status(201).json(serializeHousehold(household));
});

router.patch("/households", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = UpdateHouseholdBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(404).json({ error: "No household" }); return; }

  const updateData: Record<string, any> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if ("budget" in parsed.data) updateData.budget = parsed.data.budget != null ? String(parsed.data.budget) : null;

  const [household] = await db.update(householdsTable)
    .set(updateData)
    .where(eq(householdsTable.id, user.householdId))
    .returning();

  if (!household) { res.status(404).json({ error: "Not found" }); return; }

  res.json(serializeHousehold(household));
});

router.get("/households/members", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.json([]); return; }

  const members = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.householdId, user.householdId));

  const allUsers = await db.select().from(usersTable);
  const userMap = new Map(allUsers.map(u => [u.id, u]));

  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const enriched = await Promise.all(members.map(async m => {
    const memberUser = userMap.get(m.userId);
    const txs = await db.select().from(transactionsTable)
      .where(eq(transactionsTable.userId, m.userId));
    const monthlySpent = txs
      .filter(t => t.date.startsWith(monthPrefix))
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    return {
      userId: m.userId,
      householdId: m.householdId,
      role: m.role,
      memberColor: m.memberColor,
      name: memberUser?.name ?? "Unknown",
      email: memberUser?.email ?? "",
      dashboardBlocked: memberUser?.dashboardBlocked ?? false,
      monthlySpent: Math.round(monthlySpent * 100) / 100,
      joinedAt: m.joinedAt.toISOString(),
    };
  }));

  res.json(enriched);
});

router.get("/households/members/:userId/spending", async (req, res): Promise<void> => {
  const currentUserId = (req.session as any)?.userId;
  if (!currentUserId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = GetMemberSpendingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const targetUserId = params.data.userId;

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, currentUserId));
  if (!currentUser?.householdId) { res.status(403).json({ error: "Not in a household" }); return; }

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId));
  if (!targetUser || targetUser.householdId !== currentUser.householdId) {
    res.status(404).json({ error: "Member not found" }); return;
  }

  if (targetUserId !== currentUserId && targetUser.dashboardBlocked) {
    res.status(403).json({ error: "blocked" }); return;
  }

  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const txs = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.userId, targetUserId));
  const categories = await db.select().from(categoriesTable);
  const catMap = new Map(categories.map(c => [c.id, c]));

  const filtered = txs.filter(t => t.date.startsWith(monthPrefix));

  const grouped = new Map<string, { total: number; count: number; category: any }>();
  for (const tx of filtered) {
    const key = tx.categoryId ? String(tx.categoryId) : "uncategorized";
    const category = tx.categoryId ? catMap.get(tx.categoryId) : null;
    if (!grouped.has(key)) grouped.set(key, { total: 0, count: 0, category });
    const entry = grouped.get(key)!;
    entry.total += parseFloat(tx.amount);
    entry.count += 1;
  }

  const grandTotal = Array.from(grouped.values()).reduce((s, e) => s + e.total, 0);

  const result = Array.from(grouped.entries()).map(([key, entry]) => ({
    categoryId: key === "uncategorized" ? null : parseInt(key),
    categoryName: entry.category?.name ?? "Uncategorized",
    categoryColor: entry.category?.color ?? "#94a3b8",
    categoryIcon: entry.category?.icon ?? "tag",
    budget: entry.category?.budget ? parseFloat(entry.category.budget) : null,
    total: Math.round(entry.total * 100) / 100,
    count: entry.count,
    percentage: grandTotal > 0 ? Math.round((entry.total / grandTotal) * 10000) / 100 : 0,
  })).sort((a, b) => b.total - a.total);

  res.json(result);
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

router.delete("/households", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, user.householdId));
  if (!household || household.ownerId !== userId) {
    res.status(403).json({ error: "Only the household owner can delete it" }); return;
  }

  const householdId = household.id;

  // Clear householdId for all members
  const members = await db.select().from(householdMembersTable).where(eq(householdMembersTable.householdId, householdId));
  for (const m of members) {
    await db.update(usersTable).set({ householdId: null }).where(eq(usersTable.id, m.userId));
  }
  await db.delete(householdMembersTable).where(eq(householdMembersTable.householdId, householdId));
  await db.delete(householdsTable).where(eq(householdsTable.id, householdId));

  res.json({ success: true });
});

export default router;
