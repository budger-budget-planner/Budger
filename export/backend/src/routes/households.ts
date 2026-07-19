import { Router, type IRouter } from "express";
import { db, householdsTable, householdMembersTable, usersTable, transactionsTable, categoriesTable, recurringPaymentsTable, recurringPaymentLogsTable, notificationItemsTable, invitesTable } from "../db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import {
  CreateHouseholdBody,
  UpdateHouseholdBody,
  RemoveHouseholdMemberParams,
  GetMemberSpendingParams,
} from "../api-zod";
import { sendPushToUser } from "../lib/push-sender";
import { getUnreadNotificationCount } from "../lib/notification-counts";

const router: IRouter = Router();

const MEMBER_COLORS = [
  "#818cf8", "#34d399", "#fb923c", "#f472b6",
  "#38bdf8", "#a78bfa", "#fbbf24", "#f87171",
  "#4ade80", "#60a5fa", "#e879f9", "#2dd4bf",
];

function isHead(role: string) { return role === "head" || role === "owner"; }
function isParent(role: string) { return role === "parent"; }

/** Extracts the requesterId stored in a head_request notification body.
 *  New format: JSON `{"requesterId":123}` — robust and unambiguous.
 *  Legacy format: plain numeric string `"123"` — parseInt fallback for
 *  any notifications that pre-date the JSON migration. */
function parseHeadRequesterId(body: string | null): number {
  if (!body) return NaN;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object" && typeof parsed.requesterId === "number") {
      return parsed.requesterId;
    }
  } catch { /* fall through to legacy parseInt */ }
  return parseInt(body, 10);
}

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

  // Capture the creator's currency as the budget's reference currency
  const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const [household] = await db.insert(householdsTable).values({
    name: parsed.data.name,
    ownerId: userId,
    budget: parsed.data.budget != null ? String(parsed.data.budget) : null,
    budgetCurrency: parsed.data.budget != null ? (creator?.currency ?? "USD") : null,
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
  if ("budget" in parsed.data && parsed.data.budget != null) {
    // Capture the currency of the user setting the budget so other members can convert
    const [settingUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    updateData.budgetCurrency = settingUser?.currency ?? "USD";
  } else if ("budget" in parsed.data && parsed.data.budget == null) {
    updateData.budgetCurrency = null;
  }
  if ("budgetCurrency" in parsed.data && !("budget" in parsed.data)) {
    updateData.budgetCurrency = parsed.data.budgetCurrency;
  }

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

  if (members.length === 0) { res.json([]); return; }

  const memberIds = members.map(m => m.userId);

  // Scope to only this household's members instead of loading every user in
  // the system, and batch the monthly-spending aggregation in one SQL query
  // instead of running a per-member query in a loop (N+1).
  const memberUsers = await db.select().from(usersTable).where(inArray(usersTable.id, memberIds));
  const userMap = new Map(memberUsers.map(u => [u.id, u]));

  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const spendingRows = await db
    .select({
      userId: transactionsTable.userId,
      total: sql<string>`coalesce(sum(${transactionsTable.amount}), 0)`,
    })
    .from(transactionsTable)
    .where(and(
      inArray(transactionsTable.userId, memberIds),
      sql`${transactionsTable.date} like ${monthPrefix + "%"}`,
      eq(transactionsTable.currencyLocked, false),
      eq(transactionsTable.foundedWithRealizedGoal, false),
      eq(transactionsTable.isLarderFund, false),
    ))
    .groupBy(transactionsTable.userId);
  const spendingMap = new Map(spendingRows.map(r => [r.userId, parseFloat(r.total)]));

  const enriched = members.map(m => {
    const memberUser = userMap.get(m.userId);
    const monthlySpent = spendingMap.get(m.userId) ?? 0;

    return {
      userId: m.userId,
      householdId: m.householdId,
      role: m.role,
      memberColor: m.memberColor,
      name: memberUser?.name ?? "Unknown",
      email: memberUser?.email ?? "",
      dashboardBlocked: memberUser?.dashboardBlocked ?? false,
      monthlySpent: Math.round(monthlySpent * 100) / 100,
      totalBudget: memberUser?.totalBudget != null ? parseFloat(String(memberUser.totalBudget)) : null,
      currency: memberUser?.currency ?? "USD",
      joinedAt: m.joinedAt.toISOString(),
    };
  });

  res.json(enriched);
});

router.get("/households/members/:userId/spending", async (req, res): Promise<void> => {
  const currentUserId = (req.session as any)?.userId;
  if (!currentUserId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = GetMemberSpendingParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const targetUserId = params.data.userId;

  // ── CRITICAL: coerce both sides to Number before comparing.
  // currentUserId is stored as a number in the session; targetUserId comes from
  // a URL param and may arrive as a string depending on how the Zod schema
  // parses it. A strict !== across different types is always true, which caused
  // the self-check to silently fail — the caller's own private dashboard was
  // evaluated against the role-fallback path and could be blocked for themselves.
  const isSelf = Number(targetUserId) === Number(currentUserId);

  // Fetch both users in parallel — they are independent queries.
  const [[currentUser], [targetUser]] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, Number(currentUserId))),
    db.select().from(usersTable).where(eq(usersTable.id, Number(targetUserId))),
  ]);

  if (!currentUser?.householdId) { res.status(403).json({ error: "Not in a household" }); return; }
  if (!targetUser || targetUser.householdId !== currentUser.householdId) {
    res.status(404).json({ error: "Member not found" }); return;
  }

  // Viewing own data is always allowed — skip the privacy block entirely.
  if (!isSelf) {
    // Fetch both memberships in parallel — independent queries.
    // Look up by userId alone (not householdId) — see earlier comment about
    // drift between users.household_id and household_members rows.
    const [[viewerMembership], [targetMembership]] = await Promise.all([
      db.select().from(householdMembersTable).where(eq(householdMembersTable.userId, Number(currentUserId))),
      db.select().from(householdMembersTable).where(eq(householdMembersTable.userId, Number(targetUserId))),
    ]);
    const viewerRole = viewerMembership?.role ?? "child";
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

  // Fire all four data queries in parallel. Filtering is done in SQL so we
  // only transfer this month's rows rather than the member's full history.
  const [txs, categories, memberRPs, validRpLogs] = await Promise.all([
    db.select().from(transactionsTable)
      .where(and(
        eq(transactionsTable.userId, Number(targetUserId)),
        sql`${transactionsTable.date} like ${monthPrefix + "%"}`,
        eq(transactionsTable.currencyLocked, false),
        eq(transactionsTable.foundedWithRealizedGoal, false),
        eq(transactionsTable.isLarderFund, false),
      )),
    db.select().from(categoriesTable),
    db.select().from(recurringPaymentsTable)
      .where(eq(recurringPaymentsTable.userId, Number(targetUserId))),
    db.select({
        recurringPaymentId: recurringPaymentLogsTable.recurringPaymentId,
        transactionId: recurringPaymentLogsTable.transactionId,
      })
      .from(recurringPaymentLogsTable)
      .innerJoin(transactionsTable, eq(transactionsTable.id, recurringPaymentLogsTable.transactionId))
      .where(and(
        eq(recurringPaymentLogsTable.userId, Number(targetUserId)),
        eq(recurringPaymentLogsTable.monthKey, monthPrefix),
      )),
  ]);

  const catMap = new Map(categories.map(c => [c.id, c]));
  // txs already pre-filtered by SQL — no JS re-filter needed.
  const filtered = txs;

  const appliedRPIds = new Set(validRpLogs.map(l => l.recurringPaymentId));
  // Exclude RP-linked transactions from the regular category grouping so they are
  // only accounted for via the RP rows (prevents double-counting).
  const rpTxIds = new Set(validRpLogs.map(l => l.transactionId).filter(Boolean) as number[]);

  // Only show recurring payments that were actually recorded this month —
  // an unapplied template is not an expense yet and shouldn't appear on the dashboard.
  const rpItems = memberRPs
    .filter(rp => appliedRPIds.has(rp.id))
    .map(rp => ({
      categoryId: null as null,
      categoryName: rp.name,
      categoryColor: rp.color,
      categoryIcon: "repeat",
      budget: parseFloat(rp.amount),
      total: parseFloat(rp.amount),
      count: 1,
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
  const [[household], [removedUser]] = await Promise.all([
    db.select().from(householdsTable).where(eq(householdsTable.id, currentUser.householdId)),
    db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, params.data.userId)),
  ]);

  await db.delete(householdMembersTable).where(
    and(
      eq(householdMembersTable.userId, params.data.userId),
      eq(householdMembersTable.householdId, currentUser.householdId)
    )
  );
  await db.update(usersTable)
    .set({ householdId: null, pendingHouseholdAlert: household?.name ?? "your household" })
    .where(eq(usersTable.id, params.data.userId));
  // The removed member's own categories must stop being shared with the household
  // they no longer belong to — otherwise they keep showing up for the remaining
  // members forever, even though this member never intended to give them up.
  await db.update(categoriesTable)
    .set({ householdId: null })
    .where(and(eq(categoriesTable.userId, params.data.userId), eq(categoriesTable.householdId, currentUser.householdId)));

  // Cancel all invite records (any status) for the removed user's email in this
  // household so stale email links lead to the "revoked" screen rather than
  // ALREADY_DECIDED when they get re-invited later.
  if (removedUser?.email) {
    await db.update(invitesTable)
      .set({ status: "cancelled" })
      .where(and(
        eq(invitesTable.email, removedUser.email),
        eq(invitesTable.householdId, currentUser.householdId),
      ));
  }

  res.sendStatus(204);
});

router.post("/households/leave", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const leavingHouseholdId = user.householdId;

  await db.delete(householdMembersTable).where(
    and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, leavingHouseholdId))
  );
  await db.update(usersTable).set({ householdId: null }).where(eq(usersTable.id, userId));
  // Un-share this user's own categories from the household they just left, so
  // they don't keep leaking to the remaining members.
  await db.update(categoriesTable)
    .set({ householdId: null })
    .where(and(eq(categoriesTable.userId, userId), eq(categoriesTable.householdId, leavingHouseholdId)));

  // Cancel all invite records for this user's email in the household they left
  // so that stale email links don't cause a confusing ALREADY_DECIDED dead-end
  // if they get re-invited later.
  await db.update(invitesTable)
    .set({ status: "cancelled" })
    .where(and(
      eq(invitesTable.email, user.email),
      eq(invitesTable.householdId, leavingHouseholdId),
    ));

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
  // The household is going away, so no category should still reference it —
  // otherwise the dangling householdId would keep matching a since-reused id
  // (or just be permanently orphaned) and could resurface for other users.
  await db.update(categoriesTable).set({ householdId: null }).where(eq(categoriesTable.householdId, householdId));
  await db.delete(householdMembersTable).where(eq(householdMembersTable.householdId, householdId));
  await db.delete(householdsTable).where(eq(householdsTable.id, householdId));

  res.json({ success: true });
});

// POST /households/request-head — member requests to be appointed head
router.post("/households/request-head", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, user.householdId)));
  if (!myMembership || isHead(myMembership.role)) {
    res.status(400).json({ error: "Already head or not a member" }); return;
  }

  const members = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.householdId, user.householdId));
  const headMember = members.find(m => isHead(m.role));
  if (!headMember) { res.status(400).json({ error: "No head found in household" }); return; }

  const requesterName = user.name ?? "A member";

  // Store the requesterId as structured JSON so it can be parsed unambiguously —
  // avoids brittle parseInt() on a plain string that might change format.
  const headRequestBody = JSON.stringify({ requesterId: userId });
  await db.insert(notificationItemsTable).values({
    userId: headMember.userId,
    type: "head_request",
    titleEn: `${requesterName} wants to become Head`,
    titlePl: `${requesterName} chce zostać Głową Rodziny`,
    bodyEn: headRequestBody,
    bodyPl: headRequestBody,
  });

  // Deliver as a real system push too, like every other NC item — the raw
  // JSON body above is for in-app parsing only, so the push gets its own
  // human-readable copy instead.
  const headRequestBadge = await getUnreadNotificationCount(headMember.userId);
  sendPushToUser(headMember.userId, {
    title: `${requesterName} wants to become Head`,
    body: "Tap to review the request.",
    url: "/?sheet=household",
    tag: `head-request-${userId}`,
    badgeCount: headRequestBadge,
  }).catch(() => {});

  res.json({ success: true });
});

// GET /households/head-requests — head fetches pending head-role requests
router.get("/households/head-requests", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.json([]); return; }

  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, user.householdId)));
  if (!myMembership || !isHead(myMembership.role)) { res.json([]); return; }

  const items = await db.select().from(notificationItemsTable)
    .where(and(
      eq(notificationItemsTable.userId, userId),
      eq(notificationItemsTable.type, "head_request"),
      eq(notificationItemsTable.dismissed, false),
    ))
    .orderBy(desc(notificationItemsTable.createdAt));

  // Deduplicate by requesterId — keep only the latest per requester
  const seen = new Set<number>();
  const result = [];
  for (const item of items) {
    const requesterId = parseHeadRequesterId(item.bodyEn);
    if (isNaN(requesterId) || seen.has(requesterId)) continue;
    seen.add(requesterId);
    const [requester] = await db.select().from(usersTable).where(eq(usersTable.id, requesterId));
    if (!requester) continue;
    result.push({ id: item.id, requesterId, requesterName: requester.name ?? "Unknown" });
  }

  res.json(result);
});

// POST /households/head-requests/:notifId/approve — head approves; roles swap
router.post("/households/head-requests/:notifId/approve", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const notifId = parseInt(req.params.notifId);
  if (isNaN(notifId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, user.householdId)));
  if (!myMembership || !isHead(myMembership.role)) {
    res.status(403).json({ error: "Only head can approve" }); return;
  }

  const [notif] = await db.select().from(notificationItemsTable)
    .where(and(eq(notificationItemsTable.id, notifId), eq(notificationItemsTable.userId, userId)));
  if (!notif) { res.status(404).json({ error: "Request not found" }); return; }

  const requesterId = parseHeadRequesterId(notif.bodyEn);
  if (isNaN(requesterId)) { res.status(400).json({ error: "Invalid request data" }); return; }

  const [requesterMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, requesterId), eq(householdMembersTable.householdId, user.householdId)));
  if (!requesterMembership) { res.status(404).json({ error: "Requester not in household" }); return; }

  // Swap roles: requester becomes head, current head becomes member
  await db.update(householdMembersTable)
    .set({ role: "head" })
    .where(and(eq(householdMembersTable.userId, requesterId), eq(householdMembersTable.householdId, user.householdId)));
  await db.update(householdMembersTable)
    .set({ role: "parent" })
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, user.householdId)));

  // Transfer household ownership
  await db.update(householdsTable)
    .set({ ownerId: requesterId })
    .where(eq(householdsTable.id, user.householdId));

  // Hard-delete all pending head-requests addressed to the current head (they are now member)
  await db.delete(notificationItemsTable)
    .where(and(eq(notificationItemsTable.userId, userId), eq(notificationItemsTable.type, "head_request")));

  // Notify the requester that they have been promoted
  await db.insert(notificationItemsTable).values({
    userId: requesterId,
    type: "share_approved",
    titleEn: "You are now Head of Household",
    titlePl: "Jesteś teraz Głową Rodziny",
    bodyEn: "Your request to become Head was approved.",
    bodyPl: "Twoja prośba o zostanie Głową Rodziny została zaakceptowana.",
  });

  const promotedBadge = await getUnreadNotificationCount(requesterId);
  sendPushToUser(requesterId, {
    title: "You are now Head of Household",
    body: "Your request to become Head was approved.",
    url: "/?sheet=household",
    tag: `head-promoted-${requesterId}`,
    badgeCount: promotedBadge,
  }).catch(() => {});

  res.json({ success: true });
});

// POST /households/head-requests/:notifId/decline — head declines; hard-delete so user can re-request
router.post("/households/head-requests/:notifId/decline", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const notifId = parseInt(req.params.notifId);
  if (isNaN(notifId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, user.householdId)));
  if (!myMembership || !isHead(myMembership.role)) {
    res.status(403).json({ error: "Only head can decline" }); return;
  }

  // Hard-delete so the user can re-request later (soft-dismiss would block re-insertion via dedup)
  await db.delete(notificationItemsTable)
    .where(and(eq(notificationItemsTable.id, notifId), eq(notificationItemsTable.userId, userId)));

  res.json({ success: true });
});

export default router;
