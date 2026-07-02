import { Router, type IRouter } from "express";
import { db, householdsTable, householdMembersTable, usersTable, transactionsTable, categoriesTable, recurringPaymentsTable, recurringPaymentLogsTable } from "@workspace/db";
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

function isHead(role: string) { return role === "head" || role === "owner"; }
function isParent(role: string) { return role === "parent"; }

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

function serializeMember(m: any, memberUser: any) {
  return {
    userId: m.userId,
    householdId: m.householdId,
    role: m.role,
    memberColor: m.memberColor,
    name: memberUser?.name ?? "Unknown",
    email: memberUser?.email ?? "",
    dashboardBlocked: memberUser?.dashboardBlocked ?? false,
    monthlySpent: 0,
    joinedAt: m.joinedAt instanceof Date ? m.joinedAt.toISOString() : m.joinedAt,
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
    role: "head",
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
      .filter(t => t.date.startsWith(monthPrefix) && !t.currencyLocked && !t.foundedWithRealizedGoal)
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

  // Viewing own data is always allowed
  if (targetUserId !== currentUserId) {
    // Get viewer's role
    const [viewerMembership] = await db.select().from(householdMembersTable)
      .where(and(eq(householdMembersTable.userId, currentUserId), eq(householdMembersTable.householdId, currentUser.householdId)));
    const viewerRole = viewerMembership?.role ?? "child";

    // Get target's role
    const [targetMembership] = await db.select().from(householdMembersTable)
      .where(and(eq(householdMembersTable.userId, targetUserId), eq(householdMembersTable.householdId, currentUser.householdId)));
    const targetRole = targetMembership?.role ?? "child";

    if (targetUser.dashboardBlocked) {
      // Head sees everyone
      if (isHead(viewerRole)) {
        // allowed
      } else if (isParent(viewerRole)) {
        // Parent cannot see head's private dashboard
        if (isHead(targetRole)) {
          res.status(403).json({ error: "blocked" }); return;
        }
        // Parent can see other parents' and children's dashboards even if blocked
      } else {
        // Child cannot see any private dashboard
        res.status(403).json({ error: "blocked" }); return;
      }
    }
  }

  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const txs = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.userId, targetUserId));
  const categories = await db.select().from(categoriesTable);
  const catMap = new Map(categories.map(c => [c.id, c]));

  const filtered = txs.filter(t => t.date.startsWith(monthPrefix) && !t.currencyLocked && !t.foundedWithRealizedGoal);

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

  // Fetch recurring payments for this member and merge them in.
  // INNER JOIN with transactions: only consider logs whose transaction still exists,
  // so a deleted transaction doesn't permanently mark the RP as "applied".
  const memberRPs = await db.select().from(recurringPaymentsTable)
    .where(eq(recurringPaymentsTable.userId, targetUserId));
  const validRpLogs = await db
    .select({
      recurringPaymentId: recurringPaymentLogsTable.recurringPaymentId,
      transactionId: recurringPaymentLogsTable.transactionId,
    })
    .from(recurringPaymentLogsTable)
    .innerJoin(
      transactionsTable,
      eq(transactionsTable.id, recurringPaymentLogsTable.transactionId),
    )
    .where(and(
      eq(recurringPaymentLogsTable.userId, targetUserId),
      eq(recurringPaymentLogsTable.monthKey, monthPrefix),
    ));
  const appliedRPIds  = new Set(validRpLogs.map(l => l.recurringPaymentId));
  // Exclude RP-linked transactions from the regular category grouping so they are
  // only accounted for via the RP rows (prevents double-counting).
  const rpTxIds = new Set(validRpLogs.map(l => l.transactionId).filter(Boolean) as number[]);

  const rpItems = memberRPs.map(rp => ({
    categoryId: null as null,
    categoryName: rp.name,
    categoryColor: rp.color,
    categoryIcon: "repeat",
    budget: parseFloat(rp.amount),
    total: appliedRPIds.has(rp.id) ? parseFloat(rp.amount) : 0,
    count: appliedRPIds.has(rp.id) ? 1 : 0,
    percentage: 0,
    isRecurringPayment: true,
    recurringPaymentId: rp.id,
  }));

  // Re-group excluding RP transactions (they are represented by rpItems)
  const groupedFiltered = new Map<string, { total: number; count: number; category: any }>();
  for (const tx of filtered) {
    if (rpTxIds.has(tx.id)) continue; // skip — already accounted for in rpItems
    const key = tx.categoryId ? String(tx.categoryId) : "uncategorized";
    const category = tx.categoryId ? catMap.get(tx.categoryId) : null;
    if (!groupedFiltered.has(key)) groupedFiltered.set(key, { total: 0, count: 0, category });
    const entry = groupedFiltered.get(key)!;
    entry.total += parseFloat(tx.amount);
    entry.count += 1;
  }

  const grandTotalFiltered = Array.from(groupedFiltered.values()).reduce((s, e) => s + e.total, 0);

  const result = Array.from(groupedFiltered.entries()).map(([key, entry]) => ({
    categoryId: key === "uncategorized" ? null : parseInt(key),
    categoryName: entry.category?.name ?? "Uncategorized",
    categoryColor: entry.category?.color ?? "#94a3b8",
    categoryIcon: entry.category?.icon ?? "tag",
    budget: entry.category?.budget ? parseFloat(entry.category.budget) : null,
    total: Math.round(entry.total * 100) / 100,
    count: entry.count,
    percentage: grandTotalFiltered > 0 ? Math.round((entry.total / grandTotalFiltered) * 10000) / 100 : 0,
    isRecurringPayment: false,
    recurringPaymentId: null as null,
  })).sort((a, b) => b.total - a.total);

  res.json([...result, ...rpItems]);
});

// Update a member's role — head only
router.patch("/households/members/:userId/role", async (req, res): Promise<void> => {
  const currentUserId = (req.session as any)?.userId;
  if (!currentUserId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const targetUserId = parseInt(req.params.userId);
  if (isNaN(targetUserId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const { role } = req.body;
  if (!role || !["head", "parent", "child"].includes(role)) {
    res.status(400).json({ error: "role must be head, parent, or child" }); return;
  }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, currentUserId));
  if (!currentUser?.householdId) { res.status(403).json({ error: "Not in a household" }); return; }

  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, currentUserId), eq(householdMembersTable.householdId, currentUser.householdId)));
  if (!myMembership || !isHead(myMembership.role)) {
    res.status(403).json({ error: "Only the head of the household can change roles" }); return;
  }

  if (targetUserId === currentUserId) {
    res.status(400).json({ error: "Cannot change your own role" }); return;
  }

  const [targetMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, targetUserId), eq(householdMembersTable.householdId, currentUser.householdId)));
  if (!targetMembership) { res.status(404).json({ error: "Member not found" }); return; }

  await db.update(householdMembersTable)
    .set({ role })
    .where(and(eq(householdMembersTable.userId, targetUserId), eq(householdMembersTable.householdId, currentUser.householdId)));

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId));

  res.json(serializeMember({ ...targetMembership, role }, targetUser));
});

router.delete("/households/members/:userId", async (req, res): Promise<void> => {
  const currentUserId = (req.session as any)?.userId;
  if (!currentUserId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = RemoveHouseholdMemberParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, currentUserId));
  if (!currentUser?.householdId) { res.status(400).json({ error: "No household" }); return; }

  // Only head can remove members
  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, currentUserId), eq(householdMembersTable.householdId, currentUser.householdId)));
  if (!myMembership || !isHead(myMembership.role)) {
    res.status(403).json({ error: "Only the head of the household can remove members" }); return;
  }

  // Fetch household name to store in alert for the removed user
  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, currentUser.householdId));

  await db.delete(householdMembersTable).where(
    and(
      eq(householdMembersTable.userId, params.data.userId),
      eq(householdMembersTable.householdId, currentUser.householdId)
    )
  );
  await db.update(usersTable)
    .set({ householdId: null, pendingHouseholdAlert: household?.name ?? "your household" })
    .where(eq(usersTable.id, params.data.userId));

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

  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, user.householdId)));
  if (!myMembership || !isHead(myMembership.role)) {
    res.status(403).json({ error: "Only the head of the household can delete it" }); return;
  }

  const householdId = user.householdId;

  const members = await db.select().from(householdMembersTable).where(eq(householdMembersTable.householdId, householdId));
  for (const m of members) {
    await db.update(usersTable).set({ householdId: null }).where(eq(usersTable.id, m.userId));
  }
  await db.delete(householdMembersTable).where(eq(householdMembersTable.householdId, householdId));
  await db.delete(householdsTable).where(eq(householdsTable.id, householdId));

  res.json({ success: true });
});

export default router;
