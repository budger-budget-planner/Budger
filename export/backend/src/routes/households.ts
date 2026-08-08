import { Router, type IRouter } from "express";
import { db, householdsTable, householdMembersTable, usersTable, transactionsTable, categoriesTable, recurringPaymentsTable, recurringPaymentLogsTable, notificationItemsTable, invitesTable, budgetStretchesTable } from "../db";
import { eq, and, desc, inArray, or, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  CreateHouseholdBody,
  UpdateHouseholdBody,
  RemoveHouseholdMemberParams,
  GetMemberSpendingParams,
} from "../api-zod";
import { sendPushToUser } from "../lib/push-sender";
import { getUnreadNotificationCount } from "../lib/notification-counts";

const router: IRouter = Router();

// Orange is reserved exclusively for the virtual "Household Spendings" member.
// Reds and oranges are intentionally excluded — they visually conflict with
// over-budget (red) and budget-stretch (orange) indicators in the donut chart.
// Palette rotates through four contrast families: green → purple → blue → yellow.
// Each successive slot uses a different shade so adjacent members are never similar.
export const MEMBER_COLORS = [
  "#4ade80", // 1  vivid green
  "#a78bfa", // 2  violet
  "#60a5fa", // 3  cornflower blue
  "#fbbf24", // 4  amber
  "#34d399", // 5  emerald green
  "#e879f9", // 6  fuchsia
  "#38bdf8", // 7  sky blue
  "#facc15", // 8  bright yellow
  "#86efac", // 9  light green
  "#c084fc", // 10 lavender purple
  "#818cf8", // 11 indigo blue
  "#fde047", // 12 pale yellow
];

/**
 * The membership row is the durable source of truth for household identity.
 * users.householdId is retained as a compatibility fallback for legacy rows
 * created before household membership was introduced.
 */
async function getUserHouseholdId(userId: number, database = db): Promise<number | null> {
  const [membership] = await database
    .select({ householdId: householdMembersTable.householdId })
    .from(householdMembersTable)
    .where(eq(householdMembersTable.userId, userId))
    .limit(1);
  if (membership?.householdId != null) return membership.householdId;

  const [user] = await database
    .select({ householdId: usersTable.householdId })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user?.householdId ?? null;
}

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

  const householdId = await getUserHouseholdId(userId);
  if (!householdId) { res.status(404).json({ error: "No household" }); return; }

  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, householdId));
  if (!household) { res.status(404).json({ error: "Not found" }); return; }

  res.json(serializeHousehold(household));
});

router.post("/households", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = CreateHouseholdBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const household = await db.transaction(async (tx) => {
    // Capture the creator's currency as the budget's reference currency.
    const [creator] = await tx.select().from(usersTable).where(eq(usersTable.id, userId));
    const [created] = await tx.insert(householdsTable).values({
      name: parsed.data.name,
      ownerId: userId,
      budget: parsed.data.budget != null ? String(parsed.data.budget) : null,
      budgetCurrency: parsed.data.budget != null ? (creator?.currency ?? "USD") : null,
    }).returning();
    if (!created) throw new Error("Household creation failed");

    await tx.insert(householdMembersTable).values({
      userId,
      householdId: created.id,
      role: "head",
      memberColor: MEMBER_COLORS[0],
    });
    await tx.update(usersTable).set({ householdId: created.id }).where(eq(usersTable.id, userId));
    return created;
  });

  res.status(201).json(serializeHousehold(household));
});

router.patch("/households", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const parsed = UpdateHouseholdBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const householdId = await getUserHouseholdId(userId);
  if (!householdId) { res.status(404).json({ error: "No household" }); return; }

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
    .where(eq(householdsTable.id, householdId))
    .returning();

  if (!household) { res.status(404).json({ error: "Not found" }); return; }

  res.json(serializeHousehold(household));
});

router.get("/households/members", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const householdId = await getUserHouseholdId(userId);
  if (!householdId) { res.json([]); return; }

  const members = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.householdId, householdId));

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

  // Batch-fetch cross-month stretch net amounts for all household members so
  // every viewer — not just the member who created the stretch — sees the orange
  // indicator and the adjusted budget number.
  // Net = Σ(current-month cross_month) − Σ(prev-month cross_month)
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthPrefix = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const allCrossMonthStretches = memberIds.length > 0
    ? await db.select().from(budgetStretchesTable).where(
        and(
          inArray(budgetStretchesTable.userId, memberIds),
          eq(budgetStretchesTable.stretchType, "cross_month"),
          or(
            eq(budgetStretchesTable.month, monthPrefix),
            eq(budgetStretchesTable.month, prevMonthPrefix),
          ),
        )
      )
    : [];

  const stretchNetMap = new Map<number, number>();
  for (const s of allCrossMonthStretches) {
    const isCurrentMonth = s.month === monthPrefix;
    const contribution = isCurrentMonth ? parseFloat(s.amount) : -parseFloat(s.amount);
    stretchNetMap.set(s.userId, (stretchNetMap.get(s.userId) ?? 0) + contribution);
  }

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
      // Net signed stretch adjustment visible to all household members.
      stretchNetAmt: Math.round((stretchNetMap.get(m.userId) ?? 0) * 100) / 100,
    };
  });

  // ── Household Spendings virtual member ──────────────────────────────────
  // The head's household recurring payments are surfaced as a separate synthetic
  // member (userId: -1) so other members can see the household RP budget/spending
  // as a distinct entity. The head's own numbers are adjusted to exclude those amounts.
  const headEntry = enriched.find(m => isHead(m.role));
  if (headEntry) {
    const hhRPs = await db.select().from(recurringPaymentsTable).where(and(
      eq(recurringPaymentsTable.userId, headEntry.userId),
      eq(recurringPaymentsTable.scope, "household"),
    ));

    const householdRPBudget = hhRPs.reduce((s, rp) => s + parseFloat(rp.amount), 0);

    let householdRPSpent = 0;
    if (hhRPs.length > 0) {
      const hhRPIds = hhRPs.map(r => r.id);
      const hhAppliedLogs = await db
        .select({ transactionId: recurringPaymentLogsTable.transactionId })
        .from(recurringPaymentLogsTable)
        .innerJoin(transactionsTable, eq(transactionsTable.id, recurringPaymentLogsTable.transactionId))
        .where(and(
          inArray(recurringPaymentLogsTable.recurringPaymentId, hhRPIds),
          eq(recurringPaymentLogsTable.userId, headEntry.userId),
          eq(recurringPaymentLogsTable.monthKey, monthPrefix),
        ));
      const appliedTxIds = hhAppliedLogs.map(l => l.transactionId).filter(Boolean) as number[];
      if (appliedTxIds.length > 0) {
        const [sumRow] = await db
          .select({ total: sql<string>`coalesce(sum(${transactionsTable.amount}), 0)` })
          .from(transactionsTable)
          .where(inArray(transactionsTable.id, appliedTxIds));
        householdRPSpent = parseFloat(sumRow?.total ?? "0");
      }
    }

    // Subtract household RP amounts from the head's personal numbers
    if (headEntry.totalBudget != null) {
      headEntry.totalBudget = Math.max(0, headEntry.totalBudget - householdRPBudget);
    }
    headEntry.monthlySpent = Math.max(0, headEntry.monthlySpent - householdRPSpent);

    // Push virtual member — always visible, always public
    enriched.push({
      userId: -1,
      householdId: headEntry.householdId,
      role: "household-spendings",
      memberColor: "#f97316", // orange — reserved exclusively for household spendings
      name: "Household Spendings",
      email: "",
      dashboardBlocked: false,
      monthlySpent: Math.round(householdRPSpent * 100) / 100,
      totalBudget: Math.round(householdRPBudget * 100) / 100,
      currency: headEntry.currency,
      joinedAt: new Date().toISOString(),
      stretchNetAmt: 0, // virtual member never stretches
    });
  }

  res.json(enriched);
});

// GET /households/members/household-spendings/spending
// Returns ALL household RP spending for the current month as a breakdown:
// applied ones with their actual total, unapplied ones with total=0 (pending).
// Showing all RPs prevents the confusing "brak kategorii: 0.00" uncategorised
// bucket that appeared when only applied RPs were included but totalBudget
// still covered the full scheduled amount.
// Always accessible to all household members (never privacy-blocked).
// MUST be declared before the parameterised /:userId/spending route.
router.get("/households/members/household-spendings/spending", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const householdId = await getUserHouseholdId(userId);
  if (!householdId) { res.status(403).json({ error: "Not in a household" }); return; }

  const memberships = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.householdId, householdId));
  const headMembership = memberships.find(m => isHead(m.role));
  if (!headMembership) { res.json([]); return; }

  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const hhRPs = await db.select().from(recurringPaymentsTable).where(and(
    eq(recurringPaymentsTable.userId, headMembership.userId),
    eq(recurringPaymentsTable.scope, "household"),
  ));
  if (!hhRPs.length) { res.json([]); return; }

  const hhRPIds = hhRPs.map(r => r.id);
  const appliedLogs = await db.select({
    recurringPaymentId: recurringPaymentLogsTable.recurringPaymentId,
    transactionId: recurringPaymentLogsTable.transactionId,
  })
  .from(recurringPaymentLogsTable)
  .where(and(
    inArray(recurringPaymentLogsTable.recurringPaymentId, hhRPIds),
    eq(recurringPaymentLogsTable.userId, headMembership.userId),
    eq(recurringPaymentLogsTable.monthKey, monthPrefix),
  ));

  const appliedRPIds = new Set(appliedLogs.map(l => l.recurringPaymentId));

  // Return ALL household RPs so the breakdown is complete.
  // Applied ones show their actual amount; unapplied ones show total=0 (pending).
  // This keeps the donut a full circle (sumBudgets == totalBudget, no leftover
  // uncategorised bucket) and lets the user see every scheduled household expense.
  const result = hhRPs.map(rp => ({
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
    _catKey: `rp-${rp.id}`,
  }));

  res.json(result);
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

  // Fetch both users and the viewer's durable household identity in parallel.
  const [[currentUser], [targetUser], currentHouseholdId] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, Number(currentUserId))),
    db.select().from(usersTable).where(eq(usersTable.id, Number(targetUserId))),
    getUserHouseholdId(Number(currentUserId)),
  ]);

  if (!currentHouseholdId) { res.status(403).json({ error: "Not in a household" }); return; }
  const [targetMembership] = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.userId, Number(targetUserId)));
  if (!targetUser || targetMembership?.householdId !== currentHouseholdId) {
    res.status(404).json({ error: "Member not found" }); return;
  }

  // Viewing own data is always allowed — skip the privacy block entirely.
  if (!isSelf) {
    // Fetch both memberships in parallel — independent queries.
    // Look up by userId alone (not householdId) — see earlier comment about
    // drift between users.household_id and household_members rows.
    const [[viewerMembership]] = await Promise.all([
      db.select().from(householdMembersTable).where(eq(householdMembersTable.userId, Number(currentUserId))),
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

  // Previous month prefix — needed to fetch cross_month stretches that were
  // taken last month and therefore reduce this month's effective budgets.
  const [_y, _m] = monthPrefix.split("-").map(Number);
  const prevDate        = new Date(_y, _m - 2, 1);
  const prevMonthPrefix = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  // Fire all data queries in parallel. Filtering is done in SQL so we
  // only transfer this month's rows rather than the member's full history.
  // The 5th query fetches the target's household role to determine whether
  // household-scoped RPs should be excluded from their personal view.
  // The 6th query fetches budget stretches for the target user this month.
  // The 7th query fetches cross_month stretches from last month that reduce
  // this month's effective budget.
  const [txs, categories, memberRPs, validRpLogs, [targetHouseholdMember], monthStretches, prevMonthCrossStretches] = await Promise.all([
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
    db.select({ role: householdMembersTable.role })
      .from(householdMembersTable)
      .where(eq(householdMembersTable.userId, Number(targetUserId))),
    db.select().from(budgetStretchesTable)
      .where(and(
        eq(budgetStretchesTable.userId, Number(targetUserId)),
        eq(budgetStretchesTable.month, monthPrefix),
      )),
    // cross_month stretches from last month that reduce THIS month's budget
    db.select().from(budgetStretchesTable)
      .where(and(
        eq(budgetStretchesTable.userId, Number(targetUserId)),
        eq(budgetStretchesTable.month, prevMonthPrefix),
        eq(budgetStretchesTable.stretchType, "cross_month"),
      )),
  ]);

  // If the target is the head, their household RPs are shown under the virtual
  // "Household Spendings" member — exclude them from the personal spending view.
  const isTargetHead = isHead(targetHouseholdMember?.role ?? "child");
  const householdRpExcludeIds = isTargetHead
    ? new Set(memberRPs.filter(rp => (rp as any).scope === "household").map(rp => rp.id))
    : new Set<number>();

  const catMap = new Map(categories.map(c => [c.id, c]));
  // txs already pre-filtered by SQL — no JS re-filter needed.
  const filtered = txs;

  const appliedRPIds = new Set(validRpLogs.map(l => l.recurringPaymentId));
  // Exclude RP-linked transactions from the regular category grouping so they are
  // only accounted for via the RP rows (prevents double-counting).
  const rpTxIds = new Set(validRpLogs.map(l => l.transactionId).filter(Boolean) as number[]);

  // Only show recurring payments that were actually recorded this month —
  // an unapplied template is not an expense yet and shouldn't appear on the dashboard.
  // For the head user, household-scoped RPs are excluded — they appear under the
  // virtual "Household Spendings" member instead.
  const rpItems = memberRPs
    .filter(rp => appliedRPIds.has(rp.id) && !householdRpExcludeIds.has(rp.id))
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
      _catKey: `rp-${rp.id}`,
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

  // Build per-category stretch map so each result item gets accurate effective
  // budget, isStretched, and stretchAmount (mirrors Categories page frontend logic).
  const stretchByCatId = new Map<number, { toAmt: number; fromAmt: number; stretchType: string }>();
  for (const s of monthStretches) {
    const toId   = s.toCategoryId;
    const fromId = s.fromCategoryId;
    const isCrossMonth = s.stretchType === "cross_month";
    const toEntry = stretchByCatId.get(toId) ?? { toAmt: 0, fromAmt: 0, stretchType: s.stretchType };
    toEntry.toAmt += parseFloat(s.amount);
    stretchByCatId.set(toId, toEntry);
    if (!isCrossMonth && fromId !== toId) {
      const fromEntry = stretchByCatId.get(fromId) ?? { toAmt: 0, fromAmt: 0, stretchType: s.stretchType };
      fromEntry.fromAmt += parseFloat(s.amount);
      stretchByCatId.set(fromId, fromEntry);
    }
  }
  // Previous-month cross_month stretches reduce this month's effective budget.
  // The borrowed amount must be "paid back" from this month's category budget.
  for (const s of prevMonthCrossStretches) {
    const catId = s.toCategoryId; // toCategoryId === fromCategoryId for cross_month
    const entry = stretchByCatId.get(catId) ?? { toAmt: 0, fromAmt: 0, stretchType: "cross_month" };
    entry.fromAmt += parseFloat(s.amount);
    stretchByCatId.set(catId, entry);
  }

  const result = Array.from(groupedFiltered.entries()).map(([key, entry]) => {
    const catId = key === "uncategorized" ? null : parseInt(key);
    const baseBudget = entry.category?.budget ? parseFloat(entry.category.budget) : null;
    const stretch = catId != null ? stretchByCatId.get(catId) : undefined;
    const netStretch = stretch ? stretch.toAmt - stretch.fromAmt : 0;
    // Only apply stretch adjustment when there is a non-zero net effect
    const effectiveBudget = baseBudget != null && stretch && (stretch.toAmt > 0 || stretch.fromAmt > 0)
      ? Math.max(0, baseBudget + netStretch)
      : baseBudget;
    return {
      categoryId: catId,
      categoryName: entry.category?.name ?? "Uncategorized",
      categoryColor: entry.category?.color ?? "#94a3b8",
      categoryIcon: entry.category?.icon ?? "tag",
      budget: effectiveBudget,
      total: Math.round(entry.total * 100) / 100,
      count: entry.count,
      percentage: grandTotalFiltered > 0 ? Math.round((entry.total / grandTotalFiltered) * 10000) / 100 : 0,
      isRecurringPayment: false,
      recurringPaymentId: null as null,
      // isStretched = true only when there is a positive incoming amount this month
      isStretched: stretch != null && stretch.toAmt > 0,
      stretchAmount: stretch && stretch.toAmt > 0 ? netStretch : undefined,
      stretchType: stretch?.stretchType ?? null,
    };
  }).sort((a, b) => b.total - a.total);

  res.json([...result, ...rpItems]);
});

// Update a member's role — head only
router.patch("/households/members/:userId/role", async (req, res): Promise<void> => {
  const currentUserId = (req.session as any)?.userId;
  if (!currentUserId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const targetUserId = parseInt(req.params.userId);
  if (isNaN(targetUserId)) { res.status(400).json({ error: "Invalid userId" }); return; }

  const { role } = req.body;
  // Headship can only change through the request/approval transfer flow.
  // Keeping this endpoint limited to non-head roles also prevents a second
  // head from being created by an older client or a direct API caller.
  if (!role || !["parent", "child"].includes(role)) {
    res.status(400).json({ error: "role must be parent or child; headship requires an approved transfer request" }); return;
  }

  const householdId = await getUserHouseholdId(currentUserId);
  if (!householdId) { res.status(403).json({ error: "Not in a household" }); return; }

  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, currentUserId), eq(householdMembersTable.householdId, householdId)));
  if (!myMembership || !isHead(myMembership.role)) {
    res.status(403).json({ error: "Only the head of the household can change roles" }); return;
  }

  if (targetUserId === currentUserId) {
    res.status(400).json({ error: "Cannot change your own role" }); return;
  }

  const [targetMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, targetUserId), eq(householdMembersTable.householdId, householdId)));
  if (!targetMembership) { res.status(404).json({ error: "Member not found" }); return; }
  if (isHead(targetMembership.role)) {
    res.status(400).json({ error: "Headship requires an approved transfer request" }); return;
  }

  await db.update(householdMembersTable)
    .set({ role })
    .where(and(eq(householdMembersTable.userId, targetUserId), eq(householdMembersTable.householdId, householdId)));

  const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId));

  res.json(serializeMember({ ...targetMembership, role }, targetUser));
});

router.delete("/households/members/:userId", async (req, res): Promise<void> => {
  const currentUserId = (req.session as any)?.userId;
  if (!currentUserId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const params = RemoveHouseholdMemberParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const householdId = await getUserHouseholdId(currentUserId);
  if (!householdId) { res.status(400).json({ error: "No household" }); return; }

  // Only head can remove members
  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, currentUserId), eq(householdMembersTable.householdId, householdId)));
  if (!myMembership || !isHead(myMembership.role)) {
    res.status(403).json({ error: "Only the head of the household can remove members" }); return;
  }
  if (params.data.userId === currentUserId) {
    res.status(400).json({ error: "The head must transfer headship before leaving or being removed" });
    return;
  }

  // Fetch household name to store in alert for the removed user
  const [[household], [removedUser]] = await Promise.all([
    db.select().from(householdsTable).where(eq(householdsTable.id, householdId)),
    db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, params.data.userId)),
  ]);

  await db.delete(householdMembersTable).where(
    and(
      eq(householdMembersTable.userId, params.data.userId),
      eq(householdMembersTable.householdId, householdId)
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
    .where(and(eq(categoriesTable.userId, params.data.userId), eq(categoriesTable.householdId, householdId)));

  // Cancel all invite records (any status) for the removed user's email in this
  // household so stale email links lead to the "revoked" screen rather than
  // ALREADY_DECIDED when they get re-invited later.
  if (removedUser?.email) {
    await db.update(invitesTable)
      .set({ status: "cancelled" })
      .where(and(
        eq(invitesTable.email, removedUser.email),
        eq(invitesTable.householdId, householdId),
      ));
  }

  res.sendStatus(204);
});

router.post("/households/leave", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const householdId = await getUserHouseholdId(userId);
  if (!user || !householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const leavingHouseholdId = householdId;

  // Gather head + household name before removing the member so we can notify.
  const [household] = await db.select().from(householdsTable).where(eq(householdsTable.id, leavingHouseholdId));
  const allMembers = await db.select().from(householdMembersTable).where(eq(householdMembersTable.householdId, leavingHouseholdId));
  const myMembership = allMembers.find(m => m.userId === userId);
  if (myMembership && isHead(myMembership.role)) {
    res.status(409).json({ error: "HEAD_TRANSFER_REQUIRED", message: "Transfer household headship before leaving." });
    return;
  }
  const headMember = allMembers.find(m => isHead(m.role) && m.userId !== userId);

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

  // Notify the household head via NC + push (fire-and-forget; never fails the leave).
  if (headMember) {
    const leaverName = user.name ?? "A member";
    const hhName = household?.name ?? "your household";
    try {
      await db.insert(notificationItemsTable).values({
        userId: headMember.userId,
        type: "member_left",
        titleEn: `${leaverName} left ${hhName}`,
        titlePl: `${leaverName} opuścił(-a) ${hhName}`,
        bodyEn: `${leaverName} has left your household.`,
        bodyPl: `${leaverName} opuścił(-a) Twoje gospodarstwo.`,
      });
    } catch (err) {
      logger.warn({ err }, "households: failed to create leave NC notification for head");
    }
    const badge = await getUnreadNotificationCount(headMember.userId).catch(() => 0);
    sendPushToUser(headMember.userId, {
      title: `${leaverName} left ${hhName}`,
      body: "A member has left your household.",
      url: "/?sheet=household",
      tag: `member-left-${userId}`,
      badgeCount: badge,
    }).catch(() => {});
  }

  res.json({ success: true });
});

router.delete("/households", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const householdId = await getUserHouseholdId(userId);
  if (!householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, householdId)));
  if (!myMembership || !isHead(myMembership.role)) {
    res.status(403).json({ error: "Only the head of the household can delete it" }); return;
  }

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
  const householdId = await getUserHouseholdId(userId);
  if (!user || !householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, householdId)));
  if (!myMembership || isHead(myMembership.role)) {
    res.status(400).json({ error: "Already head or not a member" }); return;
  }

  const members = await db.select().from(householdMembersTable)
    .where(eq(householdMembersTable.householdId, householdId));
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

  const householdId = await getUserHouseholdId(userId);
  if (!householdId) { res.json([]); return; }

  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, householdId)));
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

// POST /households/head-requests/:notifId/approve — head approves; atomically transfers ownership
router.post("/households/head-requests/:notifId/approve", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthenticated" }); return; }

  const notifId = parseInt(req.params.notifId);
  if (isNaN(notifId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const householdId = await getUserHouseholdId(userId);
  if (!householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const requesterId = await db.transaction(async (tx) => {
    // Serialize concurrent approvals/transfers for this household.
    await tx.execute(sql`SELECT id FROM ${householdsTable} WHERE id = ${householdId} FOR UPDATE`);

    const [myMembership] = await tx.select().from(householdMembersTable)
      .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, householdId)));
    if (!myMembership || !isHead(myMembership.role)) {
      throw new Error("ONLY_HEAD");
    }

    const [notif] = await tx.select().from(notificationItemsTable)
      .where(and(
        eq(notificationItemsTable.id, notifId),
        eq(notificationItemsTable.userId, userId),
        eq(notificationItemsTable.type, "head_request"),
        eq(notificationItemsTable.dismissed, false),
      ));
    if (!notif) throw new Error("REQUEST_NOT_FOUND");

    const parsedRequesterId = parseHeadRequesterId(notif.bodyEn);
    if (isNaN(parsedRequesterId) || parsedRequesterId === userId) throw new Error("INVALID_REQUEST");

    const [requesterMembership] = await tx.select().from(householdMembersTable)
      .where(and(eq(householdMembersTable.userId, parsedRequesterId), eq(householdMembersTable.householdId, householdId)));
    if (!requesterMembership) throw new Error("REQUESTER_NOT_FOUND");
    if (isHead(requesterMembership.role)) throw new Error("REQUESTER_ALREADY_HEAD");

    // Demote first so the database invariant remains valid throughout the
    // transfer, then promote the requester and update the owner in one commit.
    await tx.update(householdMembersTable)
      .set({ role: "parent" })
      .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, householdId)));
    await tx.update(householdMembersTable)
      .set({ role: "head" })
      .where(and(eq(householdMembersTable.userId, parsedRequesterId), eq(householdMembersTable.householdId, householdId)));
    await tx.update(householdsTable)
      .set({ ownerId: parsedRequesterId })
      .where(eq(householdsTable.id, householdId));

    // Remove all outstanding requests addressed to the former head.
    await tx.delete(notificationItemsTable)
      .where(and(eq(notificationItemsTable.userId, userId), eq(notificationItemsTable.type, "head_request")));

    await tx.insert(notificationItemsTable).values({
      userId: parsedRequesterId,
      type: "head_transfer_approved",
      titleEn: "You are now Head of Household",
      titlePl: "Jesteś teraz Głową Rodziny",
      bodyEn: "Your request to become Head was approved.",
      bodyPl: "Twoja prośba o zostanie Głową Rodziny została zaakceptowana.",
    });
    return parsedRequesterId;
  }).catch((err: unknown) => {
    if (err instanceof Error && err.message === "ONLY_HEAD") {
      res.status(403).json({ error: "Only head can approve" });
      return null;
    }
    if (err instanceof Error && err.message === "REQUEST_NOT_FOUND") {
      res.status(404).json({ error: "Request not found" });
      return null;
    }
    if (err instanceof Error && err.message === "INVALID_REQUEST") {
      res.status(400).json({ error: "Invalid request data" });
      return null;
    }
    if (err instanceof Error && err.message === "REQUESTER_NOT_FOUND") {
      res.status(404).json({ error: "Requester not in household" });
      return null;
    }
    if (err instanceof Error && err.message === "REQUESTER_ALREADY_HEAD") {
      res.status(409).json({ error: "Requester is already the household head" });
      return null;
    }
    throw err;
  });
  if (requesterId == null) return;

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

  const householdId = await getUserHouseholdId(userId);
  if (!householdId) { res.status(400).json({ error: "Not in a household" }); return; }

  const [myMembership] = await db.select().from(householdMembersTable)
    .where(and(eq(householdMembersTable.userId, userId), eq(householdMembersTable.householdId, householdId)));
  if (!myMembership || !isHead(myMembership.role)) {
    res.status(403).json({ error: "Only head can decline" }); return;
  }

  const requesterId = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM ${householdsTable} WHERE id = ${householdId} FOR UPDATE`);
    const [notif] = await tx.select().from(notificationItemsTable)
      .where(and(
        eq(notificationItemsTable.id, notifId),
        eq(notificationItemsTable.userId, userId),
        eq(notificationItemsTable.type, "head_request"),
        eq(notificationItemsTable.dismissed, false),
      ));
    if (!notif) return null;

    const parsedRequesterId = parseHeadRequesterId(notif.bodyEn);
    if (isNaN(parsedRequesterId)) return null;

    await tx.delete(notificationItemsTable)
      .where(and(eq(notificationItemsTable.id, notifId), eq(notificationItemsTable.userId, userId)));
    await tx.insert(notificationItemsTable).values({
      userId: parsedRequesterId,
      type: "head_transfer_declined",
      titleEn: "Head request declined",
      titlePl: "Odrzucono prośbę o rolę Głowy",
      bodyEn: "Your request to become Head of Household was declined.",
      bodyPl: "Twoja prośba o zostanie Głową Rodziny została odrzucona.",
    });
    return parsedRequesterId;
  });
  if (requesterId == null) { res.status(404).json({ error: "Request not found" }); return; }

  const declinedBadge = await getUnreadNotificationCount(requesterId);
  sendPushToUser(requesterId, {
    title: "Head request declined",
    body: "Your request to become Head of Household was declined.",
    url: "/?sheet=household",
    tag: `head-declined-${requesterId}`,
    badgeCount: declinedBadge,
  }).catch(() => {});

  res.json({ success: true });
});

export default router;
